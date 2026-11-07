-- User Accounts screen: expose each account's last sign-in time (auth.users.last_sign_in_at).
-- The return type changes, so the function is dropped and recreated with the same
-- administrator check, search_path, paging limits and grants.
begin;

drop function if exists public.lakad_accounts_page(uuid, integer);

create function public.lakad_accounts_page(page_after uuid default null, page_size integer default 50)
returns table(id uuid, full_name text, email text, role public.user_role, is_active boolean,
              created_at timestamptz, updated_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if lakad_private.role() is distinct from 'admin' then raise exception 'Administrator required'; end if;
  return query select p.id, p.full_name, u.email::text, p.role, p.is_active, p.created_at, p.updated_at, u.last_sign_in_at
    from public.profiles p join auth.users u on u.id = p.id
    where page_after is null or p.id > page_after
    order by p.id limit greatest(1, least(coalesce(page_size, 50), 100));
end $$;

revoke all on function public.lakad_accounts_page(uuid, integer) from public, anon;
grant execute on function public.lakad_accounts_page(uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
