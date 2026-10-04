-- REVIEW ONLY: apply all four migrations to a disposable project first.
-- No ASTM chart ordinates, images or PDF are embedded. All new outputs stay provisional.
begin;
alter table public.distress_types add column astm_code integer check(astm_code between 1 and 20);
alter table public.distress_types add column astm_edition text check(astm_edition='ASTM D6433-24');
alter table public.distress_types add constraint astm_mapping_pair check((astm_code is null)=(astm_edition is null));
create unique index distress_types_astm_mapping on public.distress_types(astm_edition,astm_code) where astm_code is not null;
alter table public.sample_units add column orientation_note text;
alter table public.sample_units add column field_rules_confirmed boolean not null default false;
-- Existing records and calculations retain their original edition/catalog.
update public.lakad_settings set active_edition='ASTM D6433-24';
alter table public.lakad_settings alter column active_edition set default 'ASTM D6433-24';
alter table public.lakad_settings add constraint current_edition_fixed check(active_edition='ASTM D6433-24');
insert into public.distress_types(code,name,default_unit_of_measure,severity_required,allowed_severities,astm_code,astm_edition,description) values
('D24-01','D6433-24 / Alligator Cracking','m²',true,'{low,medium,high}'::public.distress_severity[],1,'ASTM D6433-24','X1.5.2; Fig. X3.1 (SI); provisional reference, not curve data'),
('D24-02','D6433-24 / Bleeding','m²',true,'{low,medium,high}'::public.distress_severity[],2,'ASTM D6433-24','X1.6.2; Fig. X3.2 (SI); provisional reference, not curve data'),
('D24-03','D6433-24 / Block Cracking','m²',true,'{low,medium,high}'::public.distress_severity[],3,'ASTM D6433-24','X1.7.2; Fig. X3.3 (SI); provisional reference, not curve data'),
('D24-04','D6433-24 / Bumps and Sags','m',true,'{low,medium,high}'::public.distress_severity[],4,'ASTM D6433-24','X1.8.3; Fig. X3.5 (SI); provisional reference, not curve data'),
('D24-05','D6433-24 / Corrugation','m²',true,'{low,medium,high}'::public.distress_severity[],5,'ASTM D6433-24','X1.9.2; Fig. X3.6 (SI); provisional reference, not curve data'),
('D24-06','D6433-24 / Depression','m²',true,'{low,medium,high}'::public.distress_severity[],6,'ASTM D6433-24','X1.10.2; Fig. X3.7 (SI); provisional reference, not curve data'),
('D24-07','D6433-24 / Edge Cracking','m',true,'{low,medium,high}'::public.distress_severity[],7,'ASTM D6433-24','X1.11.2; Fig. X3.9 (SI); provisional reference, not curve data'),
('D24-08','D6433-24 / Joint Reflection Cracking','m',true,'{low,medium,high}'::public.distress_severity[],8,'ASTM D6433-24','X1.12.2; Fig. X3.11 (SI); provisional reference, not curve data'),
('D24-09','D6433-24 / Lane/Shoulder Drop-Off','m',true,'{low,medium,high}'::public.distress_severity[],9,'ASTM D6433-24','X1.13.2; Fig. X3.13 (SI); provisional reference, not curve data'),
('D24-10','D6433-24 / Longitudinal and Transverse Cracking','m',true,'{low,medium,high}'::public.distress_severity[],10,'ASTM D6433-24','X1.14.3; Fig. X3.15 (SI); provisional reference, not curve data'),
('D24-11','D6433-24 / Patching and Utility Cut Patching','m²',true,'{low,medium,high}'::public.distress_severity[],11,'ASTM D6433-24','X1.15.2; Fig. X3.16 (SI); provisional reference, not curve data'),
('D24-12','D6433-24 / Polished Aggregate','m²',false,'{}'::public.distress_severity[],12,'ASTM D6433-24','X1.16.2; Fig. X3.17 (SI); provisional reference, not curve data'),
('D24-13','D6433-24 / Potholes','No.',true,'{low,medium,high}'::public.distress_severity[],13,'ASTM D6433-24','X1.17.1–X1.17.2; Table X1.1; Fig. X3.19 (SI); provisional reference, not curve data'),
('D24-14','D6433-24 / Railroad Crossing','m²',true,'{low,medium,high}'::public.distress_severity[],14,'ASTM D6433-24','X1.18.2; Fig. X3.20 (SI); provisional reference, not curve data'),
('D24-15','D6433-24 / Rutting','m²',true,'{low,medium,high}'::public.distress_severity[],15,'ASTM D6433-24','X1.19.2; Fig. X3.21 (SI); provisional reference, not curve data'),
('D24-16','D6433-24 / Shoving','m²',true,'{low,medium,high}'::public.distress_severity[],16,'ASTM D6433-24','X1.20.4; Fig. X3.22 (SI); provisional reference, not curve data'),
('D24-17','D6433-24 / Slippage Cracking','m²',true,'{low,medium,high}'::public.distress_severity[],17,'ASTM D6433-24','X1.21.2; Fig. X3.23 (SI); provisional reference, not curve data'),
('D24-18','D6433-24 / Swell','m²',true,'{low,medium,high}'::public.distress_severity[],18,'ASTM D6433-24','X1.22.2; Fig. X3.24 (SI); provisional reference, not curve data'),
('D24-19','D6433-24 / Raveling — Dense Mix Asphalt','m²',true,'{medium,high}'::public.distress_severity[],19,'ASTM D6433-24','X1.23.1–X1.23.2; Fig. X3.25 (SI); provisional reference, not curve data'),
('D24-20','D6433-24 / Weathering (Surface Wear) — Dense Mix Asphalt','m²',true,'{low,medium,high}'::public.distress_severity[],20,'ASTM D6433-24','X1.24.1–X1.24.2; Fig. X3.26 (SI); provisional reference, not curve data');


-- §7.3 homogeneous boundaries: a confirmed layout cannot change underneath results.
create function lakad_private.lock_section_layout() returns trigger language plpgsql set search_path='' as $$
begin
  if old.homogeneous_confirmed_by is not null and
    row(new.area_sqm,new.length_meters,new.width_meters,new.total_sample_units,new.recommended_sample_units,
      new.start_description,new.end_description,new.homogeneous_confirmed_by,new.homogeneous_confirmed_at) is distinct from
    row(old.area_sqm,old.length_meters,old.width_meters,old.total_sample_units,old.recommended_sample_units,
      old.start_description,old.end_description,old.homogeneous_confirmed_by,old.homogeneous_confirmed_at) then
    raise exception 'Confirmed section layout is locked; create an engineer-controlled section revision';
  end if;
  return new;
end $$;
create trigger lock_section_layout before update on public.sections for each row execute function lakad_private.lock_section_layout();

-- Canonical SI units and severity sets cannot be edited into a different rule.
create function lakad_private.guard_astm_catalog() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.astm_code is not null then raise exception 'Canonical ASTM descriptors may only be introduced by a reviewed migration'; end if;
    return new;
  end if;
  if old.astm_code is not null and (new.astm_code is distinct from old.astm_code or new.astm_edition is distinct from old.astm_edition
    or new.default_unit_of_measure is distinct from old.default_unit_of_measure or new.allowed_severities is distinct from old.allowed_severities
    or new.severity_required is distinct from old.severity_required or new.code is distinct from old.code) then
    raise exception 'D6433-24 canonical mapping, units and severities are immutable; create a new reviewed migration';
  end if;
  if old.astm_code is null and new.astm_code is not null then raise exception 'Legacy descriptors require a new mapped record, not relabeling'; end if;
  return new;
end $$;
create trigger guard_astm_catalog before insert or update on public.distress_types for each row execute function lakad_private.guard_astm_catalog();

-- X1.17.1.2 area/0.5 m² equivalent holes may be fractional.
create function lakad_private.check_potholes(qty numeric,sev public.distress_severity,details jsonb,area numeric) returns void
language plpgsql set search_path='' as $$
declare h jsonb; count numeric; hole_area numeric; total_area numeric:=0; diameter numeric; depth numeric;
begin
  if details is null or details='null'::jsonb then
    if qty<>trunc(qty) then raise exception 'Fractional potholes require measured area evidence (X1.17.1.2)'; end if;
    return;
  end if;
  if jsonb_typeof(details->'small_count') is distinct from 'number' or jsonb_typeof(details->'large_holes') is distinct from 'array'
    or jsonb_array_length(details->'large_holes')>500 then raise exception 'Invalid pothole evidence'; end if;
  count:=(details->>'small_count')::numeric;
  if count<0 or count<>trunc(count) then raise exception 'Small pothole count must be a nonnegative integer'; end if;
  for h in select value from jsonb_array_elements(details->'large_holes') loop
    if jsonb_typeof(h->'diameter_mm') is distinct from 'number' or jsonb_typeof(h->'depth_mm') is distinct from 'number'
      or jsonb_typeof(h->'area_sqm') is distinct from 'number' then raise exception 'Numeric pothole dimensions required'; end if;
    diameter:=(h->>'diameter_mm')::numeric; depth:=(h->>'depth_mm')::numeric; hole_area:=(h->>'area_sqm')::numeric;
    if diameter<=750 or depth<=0 or hole_area<=0 then raise exception 'Check >750 mm pothole dimensions (X1.17.1.2)'; end if;
    if sev is distinct from (case when depth<=25 then 'medium' else 'high' end)::public.distress_severity then raise exception 'Large pothole severity disagrees with X1.17.1.2'; end if;
    total_area:=total_area+hole_area;count:=count+hole_area/0.5;
  end loop;
  if total_area>area or abs(qty-count)>0.00000001 then raise exception 'Pothole area/count evidence mismatch'; end if;
end $$;

create or replace function public.lakad_inspection_action(target uuid,action text,payload jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.sample_units; result uuid;
begin
  select * into s from public.sample_units where id=target for update;
  if s.id is null or not lakad_private.can_read_sample(target) then raise exception 'Inspection unavailable or outside your assignment'; end if;
  if action='save' then
    if jsonb_typeof(payload->'area_sqm') is distinct from 'number' or (payload->>'area_sqm')::numeric not between 135 and 315 then raise exception 'Measured AC area must be 135–315 m² (§2.1.7)'; end if;
  elsif action='submit' then
    if s.area_sqm is null or s.area_sqm not between 135 and 315 or s.area_sqm::text='NaN'
      or nullif(btrim(s.orientation_note),'') is null or not s.field_rules_confirmed then
      raise exception 'Measured area, orientation/sketch description and field-rule confirmation required (§§2.1.7,8.2; X1.1)';
    end if;
    if exists(select 1 from public.distress_records d join public.distress_types t on t.id=d.distress_type_id
      where d.sample_unit_id=target and t.astm_edition is distinct from 'ASTM D6433-24') then
      raise exception 'Legacy/unmapped distress needs a new D6433-24 measurement; no automatic catalog conversion';
    end if;
  elsif action in ('approve','publish') and exists(select 1 from public.inspection_computations c where c.id=s.computation_id
    and (c.output_snapshot->>'status'='provisional' or (c.edition='ASTM D6433-24' and
      (c.output_snapshot->>'status' is distinct from 'validated' or nullif(c.output_snapshot->>'engineering_validation_id','') is null)))) then
    raise exception 'Civil-engineering validation required; provisional calculations cannot be approved or published';
  end if;
  result:=lakad_private.inspection_action(target,action,payload);
  if action='save' then
    if exists(select 1 from public.distress_records d where d.sample_unit_id=target and d.unit_of_measure='m²'
      group by d.distress_type_id having sum(d.quantity)>(payload->>'area_sqm')::numeric) then raise exception 'Measurements exceed the measured sample area'; end if;
    update public.sample_units set area_sqm=(payload->>'area_sqm')::numeric,orientation_note=payload->>'orientation_note',
      field_rules_confirmed=coalesce((payload->>'field_rules_confirmed')::boolean,false) where id=target;
  end if;
  return result;
end $$;

create table public.provisional_section_calculations (
  id uuid primary key default gen_random_uuid(), section_id uuid not null references public.sections(id),
  input_snapshot jsonb not null, output_snapshot jsonb not null, created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),check(output_snapshot->>'status'='provisional')
);
create index provisional_section_calculations_page on public.provisional_section_calculations(section_id,created_at desc,id);
alter table public.provisional_section_calculations enable row level security;
revoke all on public.provisional_section_calculations from public,anon,authenticated;
grant select on public.provisional_section_calculations to authenticated;
create policy provisional_section_staff on public.provisional_section_calculations for select to authenticated using(
  (select lakad_private.role()) in ('reviewer','admin') and lakad_private.can_read_section(section_id));
create function lakad_private.freeze_provisional_section() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Saved provisional section inputs/outputs are immutable; calculate a new snapshot'; end $$;
create trigger freeze_provisional_section before update or delete on public.provisional_section_calculations
for each row execute function lakad_private.freeze_provisional_section();

create function lakad_private.calculation_context(actor uuid,target uuid,kind text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text; s public.sample_units; c public.inspection_computations; sec public.sections; result jsonb; n integer;
begin
  select role::text into r from public.profiles where id=actor and is_active;
  if r is null or r='viewer' then raise exception 'Active staff required'; end if;
  if kind='sample' then
    select * into s from public.sample_units where id=target;
    if s.id is null or (r='encoder' and s.assigned_to is distinct from actor) or (r='reviewer' and s.reviewer_id is distinct from actor) then raise exception 'Inspection outside your assignment'; end if;
    if s.workflow_state<>'submitted' then raise exception 'Submit the current inspection revision before calculation'; end if;
    select * into c from public.inspection_computations where id=s.computation_id and input_revision=s.input_revision and verification='pending';
    if c.id is null then raise exception 'Current pending computation required'; end if;
    return jsonb_build_object('kind','sample','id',c.id,'revision',s.input_revision,'version',s.action_version,'edition',c.edition,'input',c.input_snapshot);
  elsif kind='section' then
    if r not in ('reviewer','admin') then raise exception 'Reviewer or administrator required for section calculation'; end if;
    select * into sec from public.sections where id=target and homogeneous_confirmed_by is not null;
    if sec.id is null then raise exception 'Confirmed section plan required'; end if;
    select count(*) into n from public.sample_units where section_id=target;
    if n>10000 then raise exception 'Section exceeds the complete-cohort bound'; end if;
    if exists(select 1 from public.sample_units u left join public.approved_results a on a.sample_unit_id=u.id and a.is_current where u.section_id=target and a.id is null) then raise exception 'Complete selected cohort must have current approved calculations, including additional samples'; end if;
    select jsonb_build_object('kind','section','id',sec.id,'input',jsonb_build_object(
      'area_sqm',sec.area_sqm,'total_sample_units',sec.total_sample_units,
      'required_random_ids',coalesce((select jsonb_agg(id order by id) from public.sample_units where section_id=target and sample_type='random'),'[]'::jsonb),
      'samples',coalesce((select jsonb_agg(jsonb_build_object('id',a.sample_unit_id,'computation_id',a.id,
        'area_sqm',a.report_snapshot->'sample'->'area_sqm','pci',a.report_snapshot->'output'->'pci',
        'sample_type',a.report_snapshot->'sample'->'sample_type','edition',a.report_snapshot->'edition','is_current',true,'approved',true) order by a.sample_unit_id)
        from public.approved_results a join public.sample_units u on u.id=a.sample_unit_id where u.section_id=target and a.is_current),'[]'::jsonb))) into result;
    return result;
  end if;
  raise exception 'Unknown calculation kind';
end $$;
create function public.lakad_calculation_context(target uuid,kind text) returns jsonb
language sql stable security definer set search_path='' as $$
  select lakad_private.calculation_context(auth.uid(),target,kind);
$$;

-- A service-only compare-and-swap write; no frontend can submit calculation output.
create function public.lakad_record_provisional_calculation(actor uuid,context jsonb,output jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.sample_units; c public.inspection_computations; expected jsonb; result uuid; section_target uuid;
begin
  if jsonb_typeof(output->'pci') is distinct from 'number' or (output->>'pci')::numeric not between 0 and 100
    or output->>'status' is distinct from 'provisional' or output->>'edition' is distinct from 'ASTM D6433-24' then raise exception 'Only complete provisional D6433-24 output accepted'; end if;
  if context->>'kind'='sample' then
    select * into c from public.inspection_computations where id=(context->>'id')::uuid;
    select * into s from public.sample_units where id=c.sample_unit_id for update;
    select * into c from public.inspection_computations where id=c.id for update;
    expected:=lakad_private.calculation_context(actor,s.id,'sample');
    if expected is distinct from context then raise exception 'Inspection changed during calculation; refresh and calculate again'; end if;
    update public.inspection_computations set output_snapshot=output,reference_id=output->>'reference_id',
      algorithm_version=output->>'algorithm_version',verification='pending' where id=c.id;
    update public.sample_units set action_version=action_version+1 where id=s.id;
    return c.id;
  elsif context->>'kind'='section' then
    section_target:=(context->>'id')::uuid;
    perform 1 from public.sections where id=section_target for update;
    perform 1 from public.sample_units where sample_units.section_id=section_target order by id for update;
    expected:=lakad_private.calculation_context(actor,section_target,'section');
    if expected is distinct from context then raise exception 'Section approved cohort changed during calculation; calculate again'; end if;
    insert into public.provisional_section_calculations(section_id,input_snapshot,output_snapshot,created_by)
      values(section_target,context->'input',output,actor) returning id into result;
    return result;
  end if;
  raise exception 'Unknown calculation kind';
end $$;
revoke all on function public.lakad_record_provisional_calculation(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.lakad_record_provisional_calculation(uuid,jsonb,jsonb) to service_role;
revoke all on function public.lakad_calculation_context(uuid,text) from public,anon;
grant execute on function public.lakad_calculation_context(uuid,text) to authenticated;
create policy licensed_reference_private on storage.objects as restrictive for all to authenticated
  using(bucket_id<>'pci-reference-data') with check(bucket_id<>'pci-reference-data');

-- Preserve existing edit/review checks while retaining new pothole evidence.
create or replace function lakad_private.inspection_action_before_revisions(
  target uuid, action text, payload jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  s public.sample_units;
  d public.distress_types;
  actor uuid := auth.uid();
  r text := lakad_private.role();
  qty numeric;
  sev public.distress_severity;
  loc numeric;
  cid uuid;
  result_id uuid;
  comments text := nullif(btrim(payload->>'comments'), '');
begin
  if actor is null or r is null then
    raise exception 'Active authenticated account required';
  end if;

  select * into s from public.sample_units where id = target for update;
  if not found or not lakad_private.can_read_sample(target) then
    raise exception 'Inspection unavailable or outside your assignment';
  end if;

  -- === Inspector actions ===
  if action in ('start','save','distress','remove_distress','photo','remove_photo','submit') then
    if r <> 'encoder' or s.assigned_to <> actor then
      raise exception 'Only the assigned inspector may edit or submit';
    end if;

    if action = 'start' then
      if s.workflow_state <> 'planned' then
        raise exception 'Only a planned unit can be started';
      end if;
      update public.sample_units
        set workflow_state = 'draft', surveyed_by = actor, surveyed_at = now(), updated_by = actor
        where id = target;

    else
      if s.workflow_state not in ('draft','returned') then
        raise exception 'Submitted and approved inspections are read-only';
      end if;
      if payload ? 'revision'
         and (payload->>'revision')::integer <> s.input_revision then
        raise exception 'Inspection changed; refresh before saving';
      end if;

      if action = 'save' then
        if (nullif(payload->>'latitude','') is null)
           <> (nullif(payload->>'longitude','') is null) then
          raise exception 'Supply both coordinates or neither';
        end if;
        if coalesce((payload->>'no_distress_confirmed')::boolean, false)
           and exists(select 1 from public.distress_records where sample_unit_id = target) then
          raise exception 'Cannot confirm no distress while measurements exist';
        end if;
        if nullif(payload->>'surveyed_at','') is null then
          raise exception 'Inspection date required';
        end if;
        if (payload->>'surveyed_at')::date > current_date then
          raise exception 'Inspection date cannot be in the future';
        end if;
        update public.sample_units set
          inspection_notes = payload->>'notes',
          surveyed_at = (payload->>'surveyed_at')::date,
          latitude = nullif(payload->>'latitude','')::double precision,
          longitude = nullif(payload->>'longitude','')::double precision,
          no_distress_confirmed = coalesce((payload->>'no_distress_confirmed')::boolean, false)
        where id = target;

      elsif action = 'distress' then
        select * into d from public.distress_types
          where id = (payload->>'distress_type_id')::uuid and is_active;
        if not found or d.default_unit_of_measure is null then
          raise exception 'Active distress with configured unit required';
        end if;

        qty := (payload->>'quantity')::numeric;
        sev := nullif(payload->>'severity','')::public.distress_severity;
        loc := nullif(payload->>'location_m','')::numeric;

        if qty is null or qty <= 0 or qty::text in ('NaN','Infinity','-Infinity') then
          raise exception 'Quantity must be positive and finite';
        end if;
        if (d.severity_required and sev is null)
           or (not d.severity_required and sev is not null)
           or (sev is not null and not sev = any(d.allowed_severities)) then
          raise exception 'Invalid severity';
        end if;
        if d.default_unit_of_measure in ('m²','m2','sqm')
           and qty + coalesce((
             select sum(quantity) from public.distress_records
             where sample_unit_id = target and distress_type_id = d.id
               and (nullif(payload->>'id','') is null or id <> (payload->>'id')::uuid)
           ), 0) > s.area_sqm then
          raise exception 'Measured area exceeds sample boundary';
        end if;
        if d.default_unit_of_measure in ('No.','count') and qty <> trunc(qty) and coalesce(d.astm_code,0)<>13 then
          raise exception 'Count must be a whole number';
        end if;
        if d.astm_code=13 then perform lakad_private.check_potholes(qty,sev,payload->'potholes',s.area_sqm); end if;
        if loc is not null and (loc < 0 or s.start_m is null or s.end_m is null
           or loc > s.end_m - s.start_m) then
          raise exception 'Location outside sample boundary';
        end if;

        result_id := nullif(payload->>'id','')::uuid;
        if exists(
          select 1 from public.distress_records
          where sample_unit_id = target and distress_type_id = d.id
            and severity is not distinct from sev
            and (result_id is null or id <> result_id)
        ) then
          raise exception 'Duplicate distress/severity; edit existing measurement';
        end if;

        if result_id is null then
          insert into public.distress_records(
            sample_unit_id, distress_type_id, severity, quantity,
            unit_of_measure, notes, created_by, measurement_details
          ) values (
            target, d.id, sev, qty, d.default_unit_of_measure,
            payload->>'notes', actor,
            jsonb_build_object('location_m', loc,'potholes',payload->'potholes')
          ) returning id into result_id;
        else
          update public.distress_records set
            distress_type_id = d.id, severity = sev, quantity = qty,
            unit_of_measure = d.default_unit_of_measure,
            notes = payload->>'notes',
            measurement_details = jsonb_build_object('location_m', loc,'potholes',payload->'potholes'),
            updated_at = now()
          where id = result_id and sample_unit_id = target;
          if not found then raise exception 'Distress record not found'; end if;
        end if;
        update public.sample_units set no_distress_confirmed = false where id = target;

      elsif action = 'remove_distress' then
        delete from public.distress_records
          where id = (payload->>'id')::uuid and sample_unit_id = target;
        if not found then raise exception 'Distress record not found'; end if;

      elsif action = 'photo' then
        if split_part(payload->>'path','/',1) <> target::text
           or not exists(select 1 from storage.objects
                         where bucket_id = 'sample-unit-photos'
                           and name = payload->>'path') then
          raise exception 'Upload photograph to this sample first';
        end if;
        insert into public.distress_photos(sample_unit_id, photo_path, caption, uploaded_by)
          values (target, payload->>'path', payload->>'caption', actor);

      elsif action = 'remove_photo' then
        delete from public.distress_photos
          where id = (payload->>'id')::uuid and sample_unit_id = target;

      elsif action = 'submit' then
        if s.area_sqm is null or s.surveyed_at is null or s.reviewer_id is null then
          raise exception 'Area, inspection date and assigned reviewer are required';
        end if;
        if not s.no_distress_confirmed
           and not exists(select 1 from public.distress_records where sample_unit_id = target) then
          raise exception 'Add distresses or explicitly confirm no distress';
        end if;
        insert into public.inspection_computations(
          sample_unit_id, input_revision, edition, input_snapshot, created_by
        )
        select target, s.input_revision, active_edition,
          jsonb_build_object(
            'sample', to_jsonb(s),
            'distresses', coalesce(
              (select jsonb_agg(to_jsonb(x)) from public.distress_records x
               where sample_unit_id = target), '[]'::jsonb),
            'photos', coalesce(
              (select jsonb_agg(to_jsonb(p)) from public.distress_photos p
               where sample_unit_id = target), '[]'::jsonb)
          ), actor
        from public.lakad_settings
        returning id into cid;
        update public.sample_units
          set workflow_state = 'submitted', status = 'submitted',
              submitted_at = now(), computation_id = cid
          where id = target;
      end if;

      -- Bump revision for non-submit edits so stale clients detect changes.
      if action <> 'submit' then
        update public.sample_units
          set input_revision = input_revision + 1, computation_id = null
          where id = target;
      end if;
    end if;

  -- === Reviewer actions ===
  elsif action in ('return','approve','publish') then
    if r <> 'reviewer' or s.reviewer_id <> actor
       or s.surveyed_by = actor or s.assigned_to = actor then
      raise exception 'Only an independent assigned engineer may review';
    end if;

    if action = 'return' then
      if s.workflow_state <> 'submitted' or comments is null then
        raise exception 'Return requires a submitted inspection and review comments';
      end if;
      update public.sample_units
        set workflow_state = 'returned', status = 'rejected',
            review_notes = comments, reviewed_by = actor, reviewed_at = now()
        where id = target;

    else  -- approve or publish
      if (action = 'approve' and s.workflow_state <> 'submitted')
         or (action = 'publish' and s.workflow_state <> 'approved') then
        raise exception 'Invalid review transition';
      end if;
      if not exists(
        select 1 from public.inspection_computations c
        where c.id = s.computation_id and c.sample_unit_id = s.id
          and c.input_revision = s.input_revision and c.verification = 'verified'
      ) then
        raise exception 'Preliminary — ASTM reference data pending verification. Official approval/publication blocked.';
      end if;
      if not exists(
        select 1 from public.inspection_computations c
        where c.id = s.computation_id
          and jsonb_typeof(c.output_snapshot->'pci') = 'number'
          and (c.output_snapshot->>'pci')::numeric between 0 and 100
          and nullif(c.output_snapshot->>'condition','') is not null
          and jsonb_typeof(c.output_snapshot->'iterations') = 'array'
      ) then
        raise exception 'Verified calculation output is incomplete';
      end if;
      update public.sample_units
        set workflow_state = case action when 'approve' then 'approved' else 'published' end,
            status = 'approved', reviewed_by = actor, reviewed_at = now(),
            review_notes = comments,
            pci_score = (c.output_snapshot->>'pci')::numeric,
            condition_label = c.output_snapshot->>'condition',
            total_deduct_value = (c.output_snapshot->>'total_deduct_value')::numeric,
            corrected_deduct_value = (c.output_snapshot->>'max_corrected_deduct_value')::numeric,
            pci_computed_at = c.created_at
      from public.inspection_computations c
      where sample_units.id = target and c.id = s.computation_id;
    end if;

  else
    raise exception 'Unknown inspection action';
  end if;

  -- Common post-action bookkeeping.
  update public.sample_units set updated_by = actor, updated_at = now() where id = target;
  insert into public.inspection_history(sample_unit_id, actor_id, action, comments, revision)
    select target, actor, action, comments, input_revision
    from public.sample_units where id = target;
  return coalesce(result_id, target);
end $$;

create or replace function lakad_private.capture_report_context() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.input_snapshot:=new.input_snapshot||jsonb_build_object('report_context',(
    select jsonb_build_object('surveyor_name',(select full_name from public.profiles where id=(new.input_snapshot->'sample'->>'surveyed_by')::uuid),'road',jsonb_build_object('section_id',s.id,'section_name',s.name,
      'branch_id',b.id,'branch_name',b.name,'length_meters',s.length_meters,'width_meters',s.width_meters,
      'area_sqm',s.area_sqm,'start_description',s.start_description,'end_description',s.end_description),
      'distress_catalog',coalesce((select jsonb_object_agg(t.id::text,jsonb_build_object('astm_code',t.astm_code,'astm_edition',t.astm_edition,'unit',t.default_unit_of_measure)) from public.distress_types t where t.id in(select (d->>'distress_type_id')::uuid from jsonb_array_elements(new.input_snapshot->'distresses') d)),'{}'::jsonb),
      'distress_names',coalesce((select jsonb_object_agg(t.id::text,t.name) from public.distress_types t
        where t.id in (select (d->>'distress_type_id')::uuid from jsonb_array_elements(new.input_snapshot->'distresses') d)),'{}'::jsonb))
    from public.sample_units u join public.sections s on s.id=u.section_id join public.branches b on b.id=s.branch_id
    where u.id=new.sample_unit_id));
  return new;
end $$;

create or replace function lakad_private.plan_samples(target uuid, payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  s public.sections;
  n integer := (payload->>'total')::integer;
  required integer := (payload->>'required')::integer;
  inspector uuid := (payload->>'inspector')::uuid;
  reviewer uuid := (payload->>'reviewer')::uuid;
  chosen integer[];
  interval_size integer;
  first_unit integer;
begin
  if lakad_private.role() is distinct from 'reviewer' then
    raise exception 'A civil engineer must confirm homogeneous boundaries and the sampling plan';
  end if;
  select * into s from public.sections where id = target for update;
  if not found or s.area_sqm is null or s.length_meters is null then
    raise exception 'Section area and length required';
  end if;
  if n is null or required is null or n < 1 or n > 10000 or required < 1 or required > n then
    raise exception 'Invalid total or required sample count';
  end if;
  if s.area_sqm / n not between 135 and 315 then
    raise exception 'Adjust sample layout: each asphalt unit must be approximately 135–315 m² (§2.1.7)';
  end if;
  if nullif(btrim(payload->>'start'),'') is null
     or nullif(btrim(payload->>'end'),'') is null
     or nullif(btrim(payload->>'rationale'),'') is null then
    raise exception 'Boundary descriptions and engineer sampling rationale required';
  end if;
  if exists(select 1 from public.sample_units where section_id = target) then
    raise exception 'Plan already has sample units; create a new section revision';
  end if;
  if not exists(select 1 from public.profiles
                where id = inspector and role = 'encoder' and is_active)
     or not exists(select 1 from public.profiles
                   where id = reviewer and role = 'reviewer' and is_active) then
    raise exception 'Select an active inspector and engineer';
  end if;
  -- §7.5.3 Eq. 3: random first unit in 1..floor(N/n), then each interval.
  interval_size:=floor(n::numeric/required);
  first_unit:=floor(random()*interval_size)::integer+1;
  select array_agg(i order by i) into chosen from generate_series(first_unit,n,interval_size) i;
  update public.sections set
    total_sample_units = n, recommended_sample_units = required,
    start_description = payload->>'start', end_description = payload->>'end',
    homogeneous_confirmed_by = auth.uid(), homogeneous_confirmed_at = now(),
    notes = concat_ws(E'\n', notes, 'Sampling rationale: ' || (payload->>'rationale'))
  where id = target;
  insert into public.sample_units(
    section_id, unit_number, area_sqm, start_m, end_m,
    sample_type, workflow_state, assigned_to, reviewer_id, created_by
  )
  select target, i, s.area_sqm / n,
    (i - 1) * s.length_meters / n, i * s.length_meters / n,
    'random', 'planned', inspector, reviewer, auth.uid()
  from unnest(chosen) i;
  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'sampling_confirmed', target,
            jsonb_build_object('total', n, 'required', required,
                               'selected', chosen, 'interval',interval_size,'first',first_unit, 'rationale', payload->>'rationale'));
end $$;

create or replace function lakad_private.additional_sample(target uuid, payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  s public.sections;
  first_m numeric := (payload->>'start_m')::numeric;
  last_m numeric := (payload->>'end_m')::numeric;
  unit integer := (payload->>'unit')::integer;
begin
  if lakad_private.role() is distinct from 'reviewer' then
    raise exception 'Engineer required';
  end if;
  select * into s from public.sections where id = target for update;
  if not found or s.homogeneous_confirmed_by is null then
    raise exception 'Confirm section plan first';
  end if;
  if first_m is null or last_m is null or first_m < 0 or last_m <= first_m
     or last_m > s.length_meters
     or unit not between 1 and s.total_sample_units then
    raise exception 'Check additional sample identifier and boundaries';
  end if;
  if first_m<(unit-1)*s.length_meters/s.total_sample_units or last_m>unit*s.length_meters/s.total_sample_units then
    raise exception 'Additional sample boundaries must remain inside the identified unselected unit';
  end if;
  if s.width_meters is null
     or (last_m - first_m) * s.width_meters not between 135 and 315 then
    raise exception 'Additional unit area must be 135–315 m² (§2.1.7)';
  end if;
  if not exists(select 1 from public.profiles
                where id = (payload->>'inspector')::uuid
                  and role = 'encoder' and is_active) then
    raise exception 'Active inspector required';
  end if;
  if nullif(btrim(payload->>'rationale'),'') is null then
    raise exception 'Additional sample justification required';
  end if;
  insert into public.sample_units(
    section_id, unit_number, area_sqm, start_m, end_m,
    sample_type, workflow_state, assigned_to, reviewer_id, created_by, inspection_notes
  ) values (
    target, unit, (last_m - first_m) * s.width_meters,
    first_m, last_m, 'additional', 'planned',
    (payload->>'inspector')::uuid, auth.uid(), auth.uid(),
    payload->>'rationale'
  );
  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'additional_sample', target, payload);
end $$;



-- §2.1.1: an unusual RANDOM unit must become additional AND receive a replacement.
-- Approved/submitted revisions stay locked. An Encoder must open a correction
-- (or a Reviewer return) before classification can change in the new draft.
create function public.lakad_replace_unusual_random(target uuid,revision integer,version integer,reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.sample_units; sec public.sections; replacement integer; result uuid;
begin
  if lakad_private.role() is distinct from 'reviewer' or nullif(btrim(reason),'') is null then raise exception 'Reviewer and unusual-condition reason required'; end if;
  select section_id into result from public.sample_units where id=target;
  select * into sec from public.sections where id=result for update;
  select * into s from public.sample_units where id=target for update;
  if s.id is null or s.reviewer_id is distinct from auth.uid() or s.sample_type<>'random'
    or s.workflow_state not in ('planned','draft','returned') then raise exception 'Only an editable, unsubmitted assigned random revision may be reclassified'; end if;
  if s.input_revision is distinct from revision or s.action_version is distinct from version then raise exception 'Inspection changed; refresh before reclassification'; end if;
  select i into replacement from generate_series(1,sec.total_sample_units) i
    where not exists(select 1 from public.sample_units u where u.section_id=sec.id and u.unit_number=i) order by random() limit 1;
  if replacement is null then raise exception 'Complete census has no additional units (§2.1.1)'; end if;
  update public.sample_units set sample_type='additional',input_revision=input_revision+1,action_version=action_version+1,
    computation_id=null where id=target;
  insert into public.sample_units(section_id,unit_number,area_sqm,start_m,end_m,sample_type,workflow_state,assigned_to,reviewer_id,created_by)
    values(sec.id,replacement,sec.area_sqm/sec.total_sample_units,(replacement-1)*sec.length_meters/sec.total_sample_units,
      replacement*sec.length_meters/sec.total_sample_units,'random','planned',s.assigned_to,s.reviewer_id,auth.uid()) returning id into result;
  insert into public.inspection_history(sample_unit_id,actor_id,action,comments,revision)
    values(target,auth.uid(),'reclassify_additional',reason,s.input_revision+1);
  insert into public.lakad_audit(actor_id,action,target_id,detail) values(auth.uid(),'random_replaced',target,
    jsonb_build_object('replacement',result,'reason',reason));
  return result;
end $$;
revoke all on function public.lakad_replace_unusual_random(uuid,integer,integer,text) from public,anon;
grant execute on function public.lakad_replace_unusual_random(uuid,integer,integer,text) to authenticated;
revoke all on all functions in schema lakad_private from public,anon,authenticated;
grant execute on function lakad_private.role(),lakad_private.can_read_sample(uuid),lakad_private.can_read_section(uuid),
  lakad_private.can_edit_sample(uuid),lakad_private.valid_section_result(uuid,boolean),lakad_private.approved_photo(text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
