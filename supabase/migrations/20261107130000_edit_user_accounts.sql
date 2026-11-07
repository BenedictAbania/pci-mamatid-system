-- Edit User form: administrators update an account's name, office, job title and role.
-- 1. lakad_accounts_page also returns office and job_title so the form opens prefilled.
--    The return type changes, so the function is dropped and recreated with the same checks and grants.
-- 2. lakad_update_account saves the edit. Administrators only, never their own account, audited.
begin;

drop function if exists public.lakad_accounts_page(uuid, integer);

create function public.lakad_accounts_page(page_after uuid default null, page_size integer default 50)
returns table(id uuid, full_name text, email text, role public.user_role, is_active boolean,
              created_at timestamptz, updated_at timestamptz, last_sign_in_at timestamptz,
              office text, job_title text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if lakad_private.role() is distinct from 'admin' then raise exception 'Administrator required'; end if;
  return query select p.id, p.full_name, u.email::text, p.role, p.is_active, p.created_at, p.updated_at,
                      u.last_sign_in_at, p.office, p.job_title
    from public.profiles p join auth.users u on u.id = p.id
    where page_after is null or p.id > page_after
    order by p.id limit greatest(1, least(coalesce(page_size, 50), 100));
end $$;

revoke all on function public.lakad_accounts_page(uuid, integer) from public, anon;
grant execute on function public.lakad_accounts_page(uuid, integer) to authenticated, service_role;

create or replace function public.lakad_update_account(
  target uuid, new_full_name text, new_office text, new_job_title text, new_role public.user_role
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  previous public.profiles;
  clean_name text := btrim(coalesce(new_full_name, ''));
  clean_office text := btrim(coalesce(new_office, ''));
  clean_title text := btrim(coalesce(new_job_title, ''));
begin
  if lakad_private.role() is distinct from 'admin' then raise exception 'Administrator required'; end if;
  if target = auth.uid() then raise exception 'Cannot change your own access'; end if;
  if clean_name = '' or char_length(clean_name) > 150 then raise exception 'Full name required (150 characters or fewer)'; end if;
  if clean_office = '' or char_length(clean_office) > 150 then raise exception 'Office or department required'; end if;
  if clean_title = '' or char_length(clean_title) > 150 then raise exception 'Position or job title required'; end if;
  if new_role is null then raise exception 'Role required'; end if;

  select * into previous from public.profiles where id = target for update;
  if not found then raise exception 'Account not found'; end if;

  update public.profiles
    set full_name = clean_name, office = clean_office, job_title = clean_title, role = new_role, updated_at = now()
    where id = target;

  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'account_edited', target, jsonb_build_object(
      'role', new_role, 'previous_role', previous.role,
      'full_name', clean_name, 'office', clean_office, 'job_title', clean_title));
end $$;

revoke all on function public.lakad_update_account(uuid, text, text, text, public.user_role) from public, anon;
grant execute on function public.lakad_update_account(uuid, text, text, text, public.user_role) to authenticated;

notify pgrst, 'reload schema';
commit;
