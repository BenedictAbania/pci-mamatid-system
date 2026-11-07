-- Add User form: record each person's office/department and position/job title.
-- Existing accounts get empty strings; the admin-invite Edge Function fills both for new accounts.
-- Profiles keep their no-direct-write policies; only the service role (Edge Function) writes these.
begin;

alter table public.profiles
  add column if not exists office text not null default '',
  add column if not exists job_title text not null default '';

alter table public.profiles drop constraint if exists profiles_office_length;
alter table public.profiles drop constraint if exists profiles_job_title_length;
alter table public.profiles
  add constraint profiles_office_length check (char_length(office) <= 150),
  add constraint profiles_job_title_length check (char_length(job_title) <= 150);

comment on column public.profiles.office is 'Office or department, chosen on the Add User form.';
comment on column public.profiles.job_title is 'Position or job title, entered on the Add User form.';

notify pgrst, 'reload schema';
commit;
