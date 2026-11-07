-- Fields captured by the reviewer's "Add branch" form.
-- Road Name maps to the existing branches.name and Location to branches.location.
begin;

alter table public.branches
  add column if not exists branch_code text,
  add column if not exists classification text,
  add column if not exists length_meters numeric,
  add column if not exists start_description text,
  add column if not exists end_description text,
  add column if not exists notes text;

alter table public.branches drop constraint if exists branches_branch_code_length_check;
alter table public.branches add constraint branches_branch_code_length_check
  check (branch_code is null or char_length(btrim(branch_code)) between 1 and 40);

alter table public.branches drop constraint if exists branches_length_meters_check;
alter table public.branches add constraint branches_length_meters_check
  check (length_meters is null or length_meters > 0);

-- Branch IDs are unique regardless of letter case.
create unique index if not exists branches_branch_code_key
  on public.branches (lower(btrim(branch_code)))
  where branch_code is not null;

commit;
