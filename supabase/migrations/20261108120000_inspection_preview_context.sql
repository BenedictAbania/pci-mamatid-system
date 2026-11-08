-- Finish inspection: the assigned inspector previews the provisional PCI of the
-- current draft before submitting the report. calculate-pci computes the preview
-- from this context and saves nothing; submission and recorded calculations are unchanged.
begin;
create or replace function lakad_private.preview_context(actor uuid, target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text; s public.sample_units;
begin
  select role::text into r from public.profiles where id=actor and is_active;
  if r is distinct from 'encoder' then raise exception 'Only the assigned inspector can preview this inspection'; end if;
  select * into s from public.sample_units where id=target;
  if s.id is null or s.assigned_to is distinct from actor then raise exception 'Inspection outside your assignment'; end if;
  if s.workflow_state not in ('draft','returned') then raise exception 'Only a draft or returned inspection can be previewed'; end if;
  return jsonb_build_object('kind','preview','id',s.id,'revision',s.input_revision,
    'edition',(select active_edition from public.lakad_settings limit 1),
    'input',jsonb_build_object(
      'sample',to_jsonb(s),
      'distresses',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.distress_records x where x.sample_unit_id=target),'[]'::jsonb),
      'report_context',jsonb_build_object('distress_catalog',coalesce((
        select jsonb_object_agg(t.id::text,jsonb_build_object('astm_code',t.astm_code,'astm_edition',t.astm_edition,'unit',t.default_unit_of_measure))
        from public.distress_types t where t.id in (select x.distress_type_id from public.distress_records x where x.sample_unit_id=target)),'{}'::jsonb))));
end $$;
revoke all on function lakad_private.preview_context(uuid,uuid) from public,anon,authenticated;

create or replace function public.lakad_preview_context(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select lakad_private.preview_context(auth.uid(),target);
$$;
revoke all on function public.lakad_preview_context(uuid) from public,anon;
grant execute on function public.lakad_preview_context(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
