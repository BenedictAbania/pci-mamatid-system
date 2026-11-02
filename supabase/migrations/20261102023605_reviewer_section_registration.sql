-- The Civil Engineer registers and corrects sections as well as branches.
-- Existing SELECT, DELETE, confirmed-layout locks, and approval policies stay
-- unchanged. Restrictive policies close any legacy Admin write allowance.
begin;

create policy lakad_reviewer_section_insert_allow on public.sections
  for insert to authenticated
  with check ((select lakad_private.role()) = 'reviewer');

create policy lakad_reviewer_section_insert_scope on public.sections
  as restrictive for insert to authenticated
  with check ((select lakad_private.role()) = 'reviewer');

create policy lakad_reviewer_section_update_allow on public.sections
  for update to authenticated
  using ((select lakad_private.role()) = 'reviewer')
  with check ((select lakad_private.role()) = 'reviewer');

create policy lakad_reviewer_section_update_scope on public.sections
  as restrictive for update to authenticated
  using ((select lakad_private.role()) = 'reviewer')
  with check ((select lakad_private.role()) = 'reviewer');

commit;
