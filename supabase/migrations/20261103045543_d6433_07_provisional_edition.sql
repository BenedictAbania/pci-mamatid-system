-- D6433-07 asphalt edition transition. Review and rehearse before hosted application.
-- Preserves D6433-24 descriptors, submitted snapshots and computation history.
-- No ASTM graph ordinates, PDF content or approval promotion are included.
begin;

alter table public.distress_types drop constraint distress_types_astm_edition_check;
alter table public.distress_types add constraint distress_types_astm_edition_check
  check (astm_edition in ('ASTM D6433-24', 'ASTM D6433-07'));
alter table public.lakad_settings drop constraint current_edition_fixed;
update public.lakad_settings set active_edition='ASTM D6433-07';
alter table public.lakad_settings alter column active_edition set default 'ASTM D6433-07';
alter table public.lakad_settings add constraint current_edition_fixed check(active_edition='ASTM D6433-07');

-- Existing canonical mappings are immutable; introduce distinct D07 IDs.
drop trigger guard_astm_catalog on public.distress_types;
insert into public.distress_types(code,name,default_unit_of_measure,severity_required,allowed_severities,astm_code,astm_edition,description) values
('D07-01','Alligator Cracking','m²',true,'{low,medium,high}'::public.distress_severity[],1,'ASTM D6433-07','X1.5.2; Fig. X3.1 (SI); reference data pending'),
('D07-02','Bleeding','m²',true,'{low,medium,high}'::public.distress_severity[],2,'ASTM D6433-07','X1.6.2; Fig. X3.2 (SI); reference data pending'),
('D07-03','Block Cracking','m²',true,'{low,medium,high}'::public.distress_severity[],3,'ASTM D6433-07','X1.7.2; Fig. X3.3 (SI); reference data pending'),
('D07-04','Bumps and Sags','m',true,'{low,medium,high}'::public.distress_severity[],4,'ASTM D6433-07','X1.8.3; Fig. X3.5 (SI); reference data pending'),
('D07-05','Corrugation','m²',true,'{low,medium,high}'::public.distress_severity[],5,'ASTM D6433-07','X1.9.2; Fig. X3.6 (SI); reference data pending'),
('D07-06','Depression','m²',true,'{low,medium,high}'::public.distress_severity[],6,'ASTM D6433-07','X1.10.2; Fig. X3.7 (SI); reference data pending'),
('D07-07','Edge Cracking','m',true,'{low,medium,high}'::public.distress_severity[],7,'ASTM D6433-07','X1.11.2; Fig. X3.9 (SI); reference data pending'),
('D07-08','Joint Reflection Cracking','m',true,'{low,medium,high}'::public.distress_severity[],8,'ASTM D6433-07','X1.12.2; Fig. X3.11 (SI); reference data pending'),
('D07-09','Lane/Shoulder Drop-Off','m',true,'{low,medium,high}'::public.distress_severity[],9,'ASTM D6433-07','X1.13.2; Fig. X3.13 (SI); reference data pending'),
('D07-10','Longitudinal and Transverse Cracking','m',true,'{low,medium,high}'::public.distress_severity[],10,'ASTM D6433-07','X1.14.3; Fig. X3.15 (SI); reference data pending'),
('D07-11','Patching and Utility Cut Patching','m²',true,'{low,medium,high}'::public.distress_severity[],11,'ASTM D6433-07','X1.15.2; Fig. X3.16 (SI); reference data pending'),
('D07-12','Polished Aggregate','m²',false,'{}'::public.distress_severity[],12,'ASTM D6433-07','X1.16.2; Fig. X3.17 (SI); reference data pending'),
('D07-13','Potholes','No.',true,'{low,medium,high}'::public.distress_severity[],13,'ASTM D6433-07','X1.17.1–X1.17.2; Table X1.1; Fig. X3.19 (SI); reference data pending'),
('D07-14','Railroad Crossing','m²',true,'{low,medium,high}'::public.distress_severity[],14,'ASTM D6433-07','X1.18.2; Fig. X3.20 (SI); reference data pending'),
('D07-15','Rutting','m²',true,'{low,medium,high}'::public.distress_severity[],15,'ASTM D6433-07','X1.19.2; Fig. X3.21 (SI); reference data pending'),
('D07-16','Shoving','m²',true,'{low,medium,high}'::public.distress_severity[],16,'ASTM D6433-07','X1.20.4; Fig. X3.22 (SI); reference data pending'),
('D07-17','Slippage Cracking','m²',true,'{low,medium,high}'::public.distress_severity[],17,'ASTM D6433-07','X1.21.2; Fig. X3.23 (SI); reference data pending'),
('D07-18','Swell','m²',true,'{low,medium,high}'::public.distress_severity[],18,'ASTM D6433-07','X1.22.2; Fig. X3.24 (SI); reference data pending'),
('D07-19','Weathering and Raveling','m²',true,'{low,medium,high}'::public.distress_severity[],19,'ASTM D6433-07','X1.23.1–X1.23.2; Fig. X3.25; reference data pending');
create trigger guard_astm_catalog before insert or update on public.distress_types
for each row execute function lakad_private.guard_astm_catalog();
update public.distress_types set is_active=false where astm_edition='ASTM D6433-24';

-- New submissions must use the new edition's 19-type catalog. Prior snapshots stay frozen.
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
      where d.sample_unit_id=target and t.astm_edition is distinct from 'ASTM D6433-07') then
      raise exception 'Legacy/unmapped distress needs a new D6433-07 measurement; no automatic catalog conversion';
    end if;
  elsif action in ('approve','publish') and exists(select 1 from public.inspection_computations c where c.id=s.computation_id
    and (c.output_snapshot->>'status'='provisional' or (c.edition in ('ASTM D6433-24','ASTM D6433-07') and
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

-- Service-only immutable calculation write retains the compare-and-swap guard.
create or replace function public.lakad_record_provisional_calculation(actor uuid,context jsonb,output jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.sample_units; c public.inspection_computations; expected jsonb; result uuid; section_target uuid;
begin
  if jsonb_typeof(output->'pci') is distinct from 'number' or (output->>'pci')::numeric not between 0 and 100
    or output->>'status' is distinct from 'provisional' or output->>'edition' is distinct from 'ASTM D6433-07' then raise exception 'Only complete provisional D6433-07 output accepted'; end if;
  if context->>'kind'='sample' then
    select * into c from public.inspection_computations where id=(context->>'id')::uuid;
    select * into s from public.sample_units where id=c.sample_unit_id for update;
    select * into c from public.inspection_computations where id=c.id for update;
    expected:=lakad_private.calculation_context(actor,s.id,'sample');
    if c.edition is distinct from 'ASTM D6433-07' then raise exception 'Only current D6433-07 input can be calculated'; end if;
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

notify pgrst,'reload schema';
commit;
