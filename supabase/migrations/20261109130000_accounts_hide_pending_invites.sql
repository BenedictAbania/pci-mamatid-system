-- Pending invitations stay out of the account directory (decided 2026-11-09).
-- Add User creates the auth user and profile right away (admin-invite), but the invitee's email is
-- confirmed only when they open the invitation link. Until then the account is a pending invitation:
--   1. lakad_accounts_page lists confirmed accounts only (same function, one extra filter).
--   2. lakad_pending_invites lists the pending ones, so an administrator can resend or cancel them.
--   3. lakad_account_counts gives the dashboard totals for confirmed accounts only.
--   4. lakad_assignable_encoders lists active, confirmed encoders for Assign Encoder.
--   5. assign_section_encoder refuses an encoder who has not accepted the invitation yet.

create or replace function lakad_private.account_confirmed(account uuid)
returns boolean language sql stable security definer set search_path to ''
as $$ select exists(select 1 from auth.users where id = account and email_confirmed_at is not null) $$;
revoke all on function lakad_private.account_confirmed(uuid) from public, anon;

-- 1. Directory: confirmed accounts only.
create or replace function public.lakad_accounts_page(page_after uuid default null, page_size integer default 50)
returns table(id uuid, full_name text, email text, role public.user_role, is_active boolean, created_at timestamptz,
              updated_at timestamptz, last_sign_in_at timestamptz, office text, job_title text)
language plpgsql stable security definer set search_path to ''
as $$
begin
  if lakad_private.role() is distinct from 'admin' then raise exception 'Administrator required'; end if;
  return query select p.id, p.full_name, u.email::text, p.role, p.is_active, p.created_at, p.updated_at,
                      u.last_sign_in_at, p.office, p.job_title
    from public.profiles p join auth.users u on u.id = p.id
    where (page_after is null or p.id > page_after)
      and u.email_confirmed_at is not null
    order by p.id limit greatest(1, least(coalesce(page_size, 50), 100));
end $$;

-- 2. Pending invitations, newest first.
create or replace function public.lakad_pending_invites()
returns table(id uuid, full_name text, email text, role public.user_role, office text, job_title text, invited_at timestamptz)
language plpgsql stable security definer set search_path to ''
as $$
begin
  if lakad_private.role() is distinct from 'admin' then raise exception 'Administrator required'; end if;
  return query select p.id, p.full_name, u.email::text, p.role, p.office, p.job_title, coalesce(u.invited_at, u.created_at)
    from public.profiles p join auth.users u on u.id = p.id
    where u.email_confirmed_at is null
    order by coalesce(u.invited_at, u.created_at) desc limit 100;
end $$;
revoke all on function public.lakad_pending_invites() from public, anon;
grant execute on function public.lakad_pending_invites() to authenticated, service_role;

-- 3. Dashboard totals for confirmed accounts.
create or replace function public.lakad_account_counts()
returns jsonb language plpgsql stable security definer set search_path to ''
as $$
declare result jsonb;
begin
  if lakad_private.role() is distinct from 'admin' then raise exception 'Administrator required'; end if;
  select jsonb_build_object(
    'accounts', count(*),
    'active', count(*) filter (where p.is_active),
    'roles', jsonb_build_object(
      'admin', count(*) filter (where p.is_active and p.role = 'admin'),
      'reviewer', count(*) filter (where p.is_active and p.role = 'reviewer'),
      'encoder', count(*) filter (where p.is_active and p.role = 'encoder'),
      'viewer', count(*) filter (where p.is_active and p.role = 'viewer')))
  into result
  from public.profiles p join auth.users u on u.id = p.id
  where u.email_confirmed_at is not null;
  return result;
end $$;
revoke all on function public.lakad_account_counts() from public, anon;
grant execute on function public.lakad_account_counts() to authenticated, service_role;

-- 4. Encoders a Reviewer may assign: active and invitation accepted.
create or replace function public.lakad_assignable_encoders()
returns table(id uuid) language plpgsql stable security definer set search_path to ''
as $$
begin
  if coalesce(lakad_private.role(), '') not in ('reviewer', 'admin') then raise exception 'Reviewer required'; end if;
  return query select p.id from public.profiles p join auth.users u on u.id = p.id
    where p.role = 'encoder' and p.is_active and u.email_confirmed_at is not null;
end $$;
revoke all on function public.lakad_assignable_encoders() from public, anon;
grant execute on function public.lakad_assignable_encoders() to authenticated, service_role;

-- 5. Assignment: same function as before, plus the accepted-invitation check.
create or replace function lakad_private.assign_section_encoder(target uuid, payload jsonb)
returns void language plpgsql security definer set search_path to ''
as $$
declare
  inspector uuid := (payload->>'inspector')::uuid;
  chosen integer[];
  blocked integer[];
  changed integer;
begin
  if lakad_private.role() is distinct from 'reviewer' then
    raise exception 'Only a Reviewer can assign an encoder';
  end if;
  if not exists(select 1 from public.profiles where id = inspector and role = 'encoder' and is_active) then
    raise exception 'Select an active encoder';
  end if;
  if not lakad_private.account_confirmed(inspector) then
    raise exception 'This encoder has not accepted the invitation yet';
  end if;
  if jsonb_typeof(payload->'units') = 'array' then
    select coalesce(array_agg(distinct value::integer), '{}') into chosen from jsonb_array_elements_text(payload->'units');
    if cardinality(chosen) = 0 then
      raise exception 'Choose at least one sample unit';
    end if;
    select array_agg(u order by u) into blocked from unnest(chosen) u
      where not exists(select 1 from public.sample_units
                       where section_id = target and unit_number = u and workflow_state = 'planned');
    if blocked is not null then
      raise exception 'These units are not planned in this section or have already started: U%', array_to_string(blocked, ', U');
    end if;
  end if;
  update public.sample_units set assigned_to = inspector
    where section_id = target and workflow_state = 'planned'
      and (chosen is null or unit_number = any(chosen));
  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'No planned sample units to assign; confirm the sampling plan first';
  end if;
  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'encoder_assigned', target,
            jsonb_build_object('inspector', inspector, 'units', changed, 'unit_numbers', chosen));
end $$;
