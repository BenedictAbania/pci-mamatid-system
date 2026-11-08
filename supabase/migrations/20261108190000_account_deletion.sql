-- Account deletion support for the admin-account Edge Function.
-- An account can be deleted only when no row anywhere still points to its profile.
-- Every foreign key to public.profiles is counted, whatever its ON DELETE rule, so a
-- deletion never clears an author, assignment or audit trail. Accounts with records
-- are deactivated instead (or their work is reassigned first).

create or replace function public.lakad_account_references(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ref record;
  found bigint;
  result jsonb := '{}'::jsonb;
begin
  for ref in
    select c.conrelid::regclass::text as table_name, a.attname as column_name
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and c.conrelid <> 'public.profiles'::regclass
  loop
    execute format('select count(*) from %s where %I = $1', ref.table_name, ref.column_name) into found using target;
    if found > 0 then
      result := result || jsonb_build_object(ref.table_name, coalesce((result ->> ref.table_name)::bigint, 0) + found);
    end if;
  end loop;
  return result;
end;
$$;

comment on function public.lakad_account_references(uuid) is
  'Rows that reference a profile, by table. Empty object = the account can be deleted. Service role only (admin-account Edge Function).';

revoke all on function public.lakad_account_references(uuid) from public, anon, authenticated;
grant execute on function public.lakad_account_references(uuid) to service_role;
