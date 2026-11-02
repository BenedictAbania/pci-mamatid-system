-- The civil engineer registers and corrects road branches. Section write
-- policies, branch DELETE, and all SELECT scopes are deliberately unchanged.
-- Restrictive policies also constrain any pre-existing permissive policies.
begin;

create policy lakad_reviewer_branch_insert_allow on public.branches
  for insert to authenticated
  with check ((select lakad_private.role()) = 'reviewer');

create policy lakad_reviewer_branch_insert_scope on public.branches
  as restrictive for insert to authenticated
  with check ((select lakad_private.role()) = 'reviewer');

create policy lakad_reviewer_branch_update_allow on public.branches
  for update to authenticated
  using ((select lakad_private.role()) = 'reviewer')
  with check ((select lakad_private.role()) = 'reviewer');

create policy lakad_reviewer_branch_update_scope on public.branches
  as restrictive for update to authenticated
  using ((select lakad_private.role()) = 'reviewer')
  with check ((select lakad_private.role()) = 'reviewer');

commit;
