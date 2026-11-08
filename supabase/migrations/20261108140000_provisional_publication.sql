-- Provisional publication switch for the thesis defense (decided 2026-11-08).
-- With lakad_settings.allow_provisional_publication = true, the assigned Civil Engineer may
-- approve and publish PROVISIONAL sample results and publish a provisional section PCI.
-- Every saved output keeps status 'provisional' and its label. To re-lock after
-- engineering validation: update public.lakad_settings set allow_provisional_publication=false;
begin;
alter table public.lakad_settings add column if not exists allow_provisional_publication boolean not null default false;
update public.lakad_settings set allow_provisional_publication=true;

create or replace function lakad_private.provisional_publication_allowed() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select allow_provisional_publication from public.lakad_settings limit 1),false);
$$;
revoke all on function lakad_private.provisional_publication_allowed() from public,anon,authenticated;

-- Patch only the approval checks and the snapshot output list in the installed function versions, so no other
-- workflow rule is copied or changed. Each patch must match exactly once.
do $patch$
declare body text; patched text;
begin
  body:=pg_get_functiondef('public.lakad_inspection_action(uuid,text,jsonb)'::regprocedure);
  if position('provisional_publication_allowed' in body)=0 then
    patched:=replace(body,$$elsif action in ('approve','publish') and exists($$,$$elsif action in ('approve','publish') and not lakad_private.provisional_publication_allowed() and exists($$);
    if patched=body then raise exception 'Approval wrapper check not found; review lakad_inspection_action before applying'; end if;
    execute patched;
  end if;
  body:=pg_get_functiondef('lakad_private.inspection_action_before_revisions(uuid,text,jsonb)'::regprocedure);
  if position('provisional_publication_allowed' in body)=0 then
    patched:=replace(body,$$c.verification = 'verified'$$,$$(c.verification = 'verified' or (lakad_private.provisional_publication_allowed() and c.output_snapshot->>'status' = 'provisional'))$$);
    if patched=body then raise exception 'Verified-calculation check not found; review inspection_action_before_revisions before applying'; end if;
    execute patched;
  end if;
  -- Approved snapshots must keep the provisional status, label and policy notes for readers.
  body:=pg_get_functiondef('lakad_private.report_snapshot(public.inspection_computations)'::regprocedure);
  if position('provisional_notes' in body)=0 then
    patched:=replace(body,$$'allowable_deducts','q','iterations','max_corrected_deduct_value')$$,$$'allowable_deducts','q','iterations','max_corrected_deduct_value','status','label','provisional_notes')$$);
    if patched=body then raise exception 'Report snapshot output list not found; review report_snapshot before applying'; end if;
    execute patched;
  end if;
end $patch$;

-- Publish the latest provisional section calculation once every sample unit in the
-- section has a current, published result. The computed input must still match.
create or replace function public.lakad_publish_section_result(target uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); calc public.provisional_section_calculations; expected jsonb; ids uuid[]; output jsonb; result uuid;
begin
  if lakad_private.role() is distinct from 'reviewer' or not lakad_private.can_read_section(target) then
    raise exception 'Only the Civil Engineer of this section can publish its PCI';
  end if;
  if not lakad_private.provisional_publication_allowed() then
    raise exception 'Section PCI publication requires validated calculations';
  end if;
  perform 1 from public.sections where id=target for update;
  expected:=lakad_private.calculation_context(actor,target,'section');
  if exists(select 1 from public.approved_results a join public.sample_units u on u.id=a.sample_unit_id
    where u.section_id=target and a.is_current and a.published_at is null) then
    raise exception 'Publish every approved sample unit in this section first';
  end if;
  select * into calc from public.provisional_section_calculations where section_id=target order by created_at desc,id desc limit 1;
  if calc.id is null then raise exception 'Compute the section PCI first'; end if;
  if calc.input_snapshot is distinct from expected->'input' then
    raise exception 'Sample results changed since the section PCI was computed; compute it again';
  end if;
  output:=calc.output_snapshot;
  if output->>'status' is distinct from 'provisional' or jsonb_typeof(output->'pci') is distinct from 'number' then
    raise exception 'Only a complete provisional section calculation can be published';
  end if;
  ids:=array(select (jsonb_array_elements_text(output->'sample_computation_ids'))::uuid);
  insert into public.section_results(section_id,edition,reference_id,method,sample_computation_ids,weights,pci,condition,safety,high_severity,affected_area,approved_by)
  select target, output->>'edition', coalesce(output->>'algorithm_version','provisional section'), output->>'method', ids,
    coalesce(output->'weights','{}'::jsonb), (output->>'pci')::numeric, output->>'condition', false,
    (select count(*) from public.approved_results a, jsonb_array_elements(a.report_snapshot->'distresses') d where a.id=any(ids) and d->>'severity'='high'),
    (select coalesce(sum((d->>'quantity')::numeric),0) from public.approved_results a, jsonb_array_elements(a.report_snapshot->'distresses') d where a.id=any(ids) and d->>'unit_of_measure'='m²'),
    actor
  returning id into result;
  return result;
end $$;
revoke all on function public.lakad_publish_section_result(uuid) from public,anon;
grant execute on function public.lakad_publish_section_result(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
