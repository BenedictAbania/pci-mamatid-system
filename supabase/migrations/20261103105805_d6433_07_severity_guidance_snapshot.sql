-- Capture the provisional cue shown to the Encoder with each D6433-07
-- distress measurement. No ASTM wording, curve data, approval, or publication
-- change is introduced. Existing D6433-24 rows and snapshots are untouched.
begin;

create or replace function public.lakad_inspection_action(target uuid, action text, payload jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  s public.sample_units;
  d public.distress_types;
  result uuid;
  cue jsonb;
  cue_text text;
  cue_source text;
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
      cue:=payload->'severity_guidance';
      cue_text:=btrim(cue->>'text');
      cue_source:=btrim(cue->>'source');
      if jsonb_typeof(cue) is distinct from 'object'
        or cue->>'version' is distinct from 'D07-X1-draft-2026-11-03'
        or cue->>'status' is distinct from 'provisional'
        or cue->>'severity' is distinct from nullif(payload->>'severity','')
        or nullif(cue_text,'') is null or length(cue_text)>600
        or nullif(cue_source,'') is null or length(cue_source)>100 then
        raise exception 'Current provisional severity guidance must accompany the D6433-07 measurement';
      end if;
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
        'version','D07-X1-draft-2026-11-03',
        'status','provisional',
        'severity',payload->'severity',
        'text',cue_text,
        'source',cue_source))
      where id=result and sample_unit_id=target;
    if not found then raise exception 'Saved measurement not found for guidance snapshot'; end if;
  end if;
  return result;
end $$;

notify pgrst,'reload schema';
commit;
