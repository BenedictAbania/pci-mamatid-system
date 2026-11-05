-- D6433-07 provisional Inspector evidence. Existing columns and D6433-24 rows
-- remain unchanged. Q is recomputed in the database before the saved action.
begin;

create or replace function lakad_private.d07_measured_parts(parts jsonb, unit text, sev public.distress_severity)
returns jsonb language plpgsql set search_path='' as $$
declare
  part jsonb; mode text; n numeric; a numeric; b numeric; depth numeric;
  total numeric:=0; small_count numeric:=0; large_holes jsonb:='[]'::jsonb;
  expected public.distress_severity; column_no integer; row_no integer;
begin
  if jsonb_typeof(parts) is distinct from 'array' or jsonb_array_length(parts) not between 1 and 100 then
    raise exception 'Add between 1 and 100 measured parts';
  end if;
  for part in select value from jsonb_array_elements(parts) loop
    if jsonb_typeof(part) is distinct from 'object' then raise exception 'Invalid measured part'; end if;
    mode:=part->>'mode';
    if unit='m²' and mode='rectangle' then
      if jsonb_typeof(part->'length_m') is distinct from 'number' or jsonb_typeof(part->'width_m') is distinct from 'number' then raise exception 'Rectangle requires numeric length and width'; end if;
      a:=(part->>'length_m')::numeric; b:=(part->>'width_m')::numeric;
      if a<=0 or b<=0 or a::text='NaN' or b::text='NaN' then raise exception 'Rectangle dimensions must be positive'; end if;
      total:=total+a*b;
    elsif unit='m²' and mode='irregular' then
      if jsonb_typeof(part->'area_sqm') is distinct from 'number' then raise exception 'Irregular shape requires measured area'; end if;
      a:=(part->>'area_sqm')::numeric;
      if a<=0 or a::text='NaN' then raise exception 'Measured area must be positive'; end if;
      total:=total+a;
    elsif unit='m' and mode='length' then
      if jsonb_typeof(part->'length_m') is distinct from 'number' then raise exception 'Affected length must be numeric'; end if;
      a:=(part->>'length_m')::numeric;
      if a<=0 or a::text='NaN' then raise exception 'Affected length must be positive'; end if;
      total:=total+a;
    elsif unit='No.' and mode='small_pothole' then
      if jsonb_typeof(part->'count') is distinct from 'number' or jsonb_typeof(part->'diameter_mm') is distinct from 'number' or jsonb_typeof(part->'depth_mm') is distinct from 'number' then raise exception 'Small pothole needs count, diameter and depth'; end if;
      n:=(part->>'count')::numeric; a:=(part->>'diameter_mm')::numeric; depth:=(part->>'depth_mm')::numeric;
      if n<=0 or n<>trunc(n) or n::text='NaN' or a::text='NaN' or depth::text='NaN' then raise exception 'Small pothole count and dimensions are invalid'; end if;
      if a<100 or a>=750 or a in (200,450) or depth<13 then raise exception 'Small pothole outside unambiguous draft table range'; end if;
      column_no:=case when a<200 then 1 when a<450 then 2 else 3 end;
      row_no:=case when depth<=25 then 1 when depth<=50 then 2 else 3 end;
      expected:=case when row_no=1 then (case when column_no=3 then 'medium' else 'low' end)
        when row_no=2 then (case when column_no=1 then 'low' when column_no=2 then 'medium' else 'high' end)
        else (case when column_no=3 then 'high' else 'medium' end) end::public.distress_severity;
      if sev is distinct from expected then raise exception 'Small pothole dimensions disagree with selected provisional severity'; end if;
      small_count:=small_count+n; total:=total+n;
    elsif unit='No.' and mode='large_pothole' then
      if jsonb_typeof(part->'diameter_mm') is distinct from 'number' or jsonb_typeof(part->'depth_mm') is distinct from 'number' or jsonb_typeof(part->'area_sqm') is distinct from 'number' then raise exception 'Large pothole needs diameter, depth and measured area'; end if;
      a:=(part->>'diameter_mm')::numeric; depth:=(part->>'depth_mm')::numeric; b:=(part->>'area_sqm')::numeric;
      if a<=750 or depth<=0 or b<=0 or a::text='NaN' or depth::text='NaN' or b::text='NaN' then raise exception 'Large pothole dimensions are invalid'; end if;
      if sev is distinct from (case when depth<=25 then 'medium' else 'high' end)::public.distress_severity then raise exception 'Large pothole depth disagrees with selected provisional severity'; end if;
      total:=total+b/0.5;
      large_holes:=large_holes || jsonb_build_array(jsonb_build_object('diameter_mm',a,'depth_mm',depth,'area_sqm',b));
    else raise exception 'Measured part does not match the catalog unit';
    end if;
  end loop;
  if total<=0 or total::text='NaN' then raise exception 'Total measured quantity is invalid'; end if;
  return jsonb_build_object('quantity',total,'potholes',case when unit='No.' then jsonb_build_object('small_count',small_count,'large_holes',large_holes) else null end);
end $$;

create or replace function public.lakad_inspection_action(target uuid, action text, payload jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  s public.sample_units; d public.distress_types; result uuid;
  cue jsonb; cue_text text; cue_source text; measured jsonb;
  evidence jsonb; metric text;
begin
  select * into s from public.sample_units where id=target for update;
  if s.id is null or not lakad_private.can_read_sample(target) then
    raise exception 'Inspection unavailable or outside your assignment';
  end if;
  if action='save' then
    if jsonb_typeof(payload->'area_sqm') is distinct from 'number'
      or (payload->>'area_sqm')::numeric not between 135 and 315 then
      raise exception 'Measured AC area must be 135–315 m² (§2.1.7)';
    end if;
  elsif action='submit' then
    if s.area_sqm is null or s.area_sqm not between 135 and 315 or s.area_sqm::text='NaN'
      or nullif(btrim(s.orientation_note),'') is null or not s.field_rules_confirmed then
      raise exception 'Measured area, orientation/sketch description and field-rule confirmation required (§§2.1.7,8.2; X1.1)';
    end if;
    if exists(select 1 from public.distress_records r join public.distress_types t on t.id=r.distress_type_id
      where r.sample_unit_id=target and t.astm_edition is distinct from 'ASTM D6433-07') then
      raise exception 'Legacy/unmapped distress needs a new D6433-07 measurement; no automatic catalog conversion';
    end if;
  elsif action='distress' then
    select * into d from public.distress_types where id=(payload->>'distress_type_id')::uuid;
    if d.astm_edition='ASTM D6433-07' then
      cue:=payload->'severity_guidance'; cue_text:=btrim(cue->>'text'); cue_source:=btrim(cue->>'source');
      if jsonb_typeof(cue) is distinct from 'object'
        or cue->>'version' is distinct from 'D07-X1-draft-2026-11-03'
        or cue->>'status' is distinct from 'provisional'
        or cue->>'severity' is distinct from nullif(payload->>'severity','')
        or nullif(cue_text,'') is null or length(cue_text)>600
        or nullif(cue_source,'') is null or length(cue_source)>100 then
        raise exception 'Current provisional severity guidance must accompany the D6433-07 measurement';
      end if;
      evidence:=payload->'severity_evidence';
      if evidence is not null and evidence<>'null'::jsonb then
        metric:=case d.astm_code when 6 then 'maximum_depression_depth_mm' when 9 then 'lane_shoulder_height_mm' when 15 then 'mean_rut_depth_mm' when 17 then 'mean_slippage_crack_width_mm' end;
        if metric is null or jsonb_typeof(evidence) is distinct from 'object' or evidence->>'metric' is distinct from metric
          or jsonb_typeof(evidence->'value_mm') is distinct from 'number' or (evidence->>'value_mm')::numeric<=0
          or (evidence->>'value_mm')::numeric::text='NaN' then
          raise exception 'Invalid separate severity measurement';
        end if;
      end if;
      measured:=lakad_private.d07_measured_parts(payload->'measurement_parts',d.default_unit_of_measure,nullif(payload->>'severity','')::public.distress_severity);
      payload:=payload || jsonb_build_object('quantity',measured->'quantity','potholes',measured->'potholes');
    end if;
  elsif action in ('approve','publish') and exists(
    select 1 from public.inspection_computations c where c.id=s.computation_id
      and (c.output_snapshot->>'status'='provisional' or
        (c.edition in ('ASTM D6433-24','ASTM D6433-07') and
          (c.output_snapshot->>'status' is distinct from 'validated'
            or nullif(c.output_snapshot->>'engineering_validation_id','') is null)))
  ) then
    raise exception 'Civil-engineering validation required; provisional calculations cannot be approved or published';
  end if;
  result:=lakad_private.inspection_action(target,action,payload);
  if action='save' then
    if exists(select 1 from public.distress_records r where r.sample_unit_id=target and r.unit_of_measure='m²'
      group by r.distress_type_id having sum(r.quantity)>(payload->>'area_sqm')::numeric) then
      raise exception 'Measurements exceed the measured sample area';
    end if;
    update public.sample_units set area_sqm=(payload->>'area_sqm')::numeric,
      orientation_note=payload->>'orientation_note',
      field_rules_confirmed=coalesce((payload->>'field_rules_confirmed')::boolean,false)
      where id=target;
  elsif action='distress' and d.astm_edition='ASTM D6433-07' then
    update public.distress_records set measurement_details=coalesce(measurement_details,'{}'::jsonb)
      || jsonb_build_object('severity_guidance',jsonb_build_object(
        'version','D07-X1-draft-2026-11-03','status','provisional',
        'severity',payload->'severity','text',cue_text,'source',cue_source),
        'measurement_parts',payload->'measurement_parts',
        'severity_evidence',evidence)
      where id=result and sample_unit_id=target;
    if not found then raise exception 'Saved measurement not found for evidence snapshot'; end if;
  end if;
  return result;
end $$;

notify pgrst,'reload schema';
commit;
