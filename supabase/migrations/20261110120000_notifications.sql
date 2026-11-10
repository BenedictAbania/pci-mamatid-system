-- In-app notifications.
-- Database triggers write them, so every path that assigns, submits, returns, approves or
-- publishes is covered without the app having to remember. Nobody is notified of their own action.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('assigned','review_assigned','submitted','returned','approved','published','correction','section_published')),
  title text not null,
  body text not null,
  sample_unit_id uuid references public.sample_units(id) on delete cascade,
  section_id uuid references public.sections(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_created on public.notifications(recipient_id, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_own_read on public.notifications
  for select to authenticated using (recipient_id = (select auth.uid()));
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

-- Marks the caller's notifications read: the listed ones, or all of them when ids is null.
create or replace function public.lakad_mark_notifications_read(ids uuid[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  update public.notifications set read_at = now()
    where recipient_id = auth.uid() and read_at is null and (ids is null or id = any(ids));
  get diagnostics changed = row_count;
  return changed;
end $$;
revoke execute on function public.lakad_mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.lakad_mark_notifications_read(uuid[]) to authenticated;

-- One notification per person and section, however many units changed in the statement.
-- changes: [{id, section_id, unit, encoder, reviewer}], where encoder/reviewer are set only when newly assigned.
create or replace function lakad_private.queue_assignment_notifications(changes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  with c as (
    select (e->>'id')::uuid as id, (e->>'section_id')::uuid as section_id, (e->>'unit')::integer as unit,
      (e->>'encoder')::uuid as encoder, (e->>'reviewer')::uuid as reviewer
    from jsonb_array_elements(changes) e
  ), encoder_groups as (
    select c.encoder as recipient, c.section_id, s.name as section_name, count(*) as n,
      string_agg('SU-' || lpad(c.unit::text, 3, '0'), ', ' order by c.unit) as units,
      (array_agg(c.id order by c.unit))[1] as first_id
    from c join public.sections s on s.id = c.section_id
    where c.encoder is not null and c.encoder is distinct from actor
    group by c.encoder, c.section_id, s.name
  ), reviewer_groups as (
    select c.reviewer as recipient, c.section_id, s.name as section_name, count(*) as n,
      string_agg('SU-' || lpad(c.unit::text, 3, '0'), ', ' order by c.unit) as units,
      (array_agg(c.id order by c.unit))[1] as first_id
    from c join public.sections s on s.id = c.section_id
    where c.reviewer is not null and c.reviewer is distinct from actor
    group by c.reviewer, c.section_id, s.name
  )
  insert into public.notifications(recipient_id, actor_id, kind, title, body, section_id, sample_unit_id)
  select recipient, actor, 'assigned', 'New inspection assignment',
    format('You have been assigned to inspect %s in %s: %s.', case when n = 1 then '1 sample unit' else n || ' sample units' end, section_name, units),
    section_id, case when n = 1 then first_id end
  from encoder_groups
  union all
  select recipient, actor, 'review_assigned', 'New review assignment',
    format('You are the reviewing engineer for %s in %s: %s.', case when n = 1 then '1 sample unit' else n || ' sample units' end, section_name, units),
    section_id, case when n = 1 then first_id end
  from reviewer_groups;
end $$;

create or replace function lakad_private.notify_assignments_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform lakad_private.queue_assignment_notifications(coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'section_id', n.section_id, 'unit', n.unit_number, 'encoder', n.assigned_to, 'reviewer', n.reviewer_id))
    from new_rows n where n.assigned_to is not null or n.reviewer_id is not null), '[]'::jsonb));
  return null;
end $$;

create or replace function lakad_private.notify_assignments_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform lakad_private.queue_assignment_notifications(coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'section_id', n.section_id, 'unit', n.unit_number,
      'encoder', case when n.assigned_to is distinct from o.assigned_to then n.assigned_to end,
      'reviewer', case when n.reviewer_id is distinct from o.reviewer_id then n.reviewer_id end))
    from new_rows n join old_rows o on o.id = n.id
    where (n.assigned_to is distinct from o.assigned_to and n.assigned_to is not null)
       or (n.reviewer_id is distinct from o.reviewer_id and n.reviewer_id is not null)), '[]'::jsonb));
  return null;
end $$;

create or replace trigger notify_assignments_insert after insert on public.sample_units
  referencing new table as new_rows for each statement execute function lakad_private.notify_assignments_insert();
create or replace trigger notify_assignments_update after update on public.sample_units
  referencing old table as old_rows new table as new_rows for each statement execute function lakad_private.notify_assignments_update();

-- Workflow actions recorded in inspection_history.
create or replace function lakad_private.notify_inspection_action()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s public.sample_units;
  section_name text;
  who text;
  label text;
  note text := nullif(btrim(coalesce(new.comments, '')), '');
  recipient uuid;
  k text; t text; b text;
begin
  if new.action not in ('submit', 'return', 'approve', 'publish', 'correct') then return null; end if;
  select * into s from public.sample_units where id = new.sample_unit_id;
  if not found then return null; end if;
  select name into section_name from public.sections where id = s.section_id;
  select full_name into who from public.profiles where id = new.actor_id;
  label := 'SU-' || lpad(s.unit_number::text, 3, '0') || ' in ' || coalesce(section_name, 'its section');
  if new.action = 'submit' then
    recipient := s.reviewer_id; k := 'submitted'; t := 'Inspection submitted for review';
    b := format('%s submitted %s for your review.', coalesce(who, 'The encoder'), label);
  elsif new.action = 'return' then
    recipient := s.assigned_to; k := 'returned'; t := 'Inspection returned for correction';
    b := format('%s returned %s for correction.', coalesce(who, 'The reviewer'), label)
      || case when note is not null then format(' Comment: "%s"', note) else '' end;
  elsif new.action = 'approve' then
    recipient := s.assigned_to; k := 'approved'; t := 'Inspection approved';
    b := format('%s approved %s.', coalesce(who, 'The reviewer'), label)
      || case when s.pci_score is not null then format(' PCI %s (%s).', to_char(s.pci_score, 'FM990.00'), coalesce(s.condition_label, '')) else '' end;
  elsif new.action = 'publish' then
    recipient := s.assigned_to; k := 'published'; t := 'Result published';
    b := format('The result for %s was published.', label);
  else
    recipient := s.reviewer_id; k := 'correction'; t := 'Correction started';
    b := format('%s started a correction of %s.', coalesce(who, 'The encoder'), label)
      || case when note is not null then format(' Reason: "%s"', note) else '' end;
  end if;
  if recipient is null or recipient = new.actor_id then return null; end if;
  insert into public.notifications(recipient_id, actor_id, kind, title, body, sample_unit_id, section_id)
    values (recipient, new.actor_id, k, t, b, s.id, s.section_id);
  return null;
end $$;

create or replace trigger notify_inspection_action after insert on public.inspection_history
  for each row execute function lakad_private.notify_inspection_action();

-- A published section PCI goes to the encoders who inspected that round.
create or replace function lakad_private.notify_section_published()
returns trigger language plpgsql security definer set search_path = '' as $$
declare section_name text;
begin
  select name into section_name from public.sections where id = new.section_id;
  insert into public.notifications(recipient_id, actor_id, kind, title, body, section_id)
  select distinct u.assigned_to, new.approved_by, 'section_published', 'Section PCI published',
    format('The section PCI for %s was published: %s (%s).', coalesce(section_name, 'a section'), to_char(new.pci, 'FM990.00'), new.condition),
    new.section_id
  from public.sample_units u
  where u.section_id = new.section_id and u.survey_round is not distinct from new.survey_round
    and u.assigned_to is not null and u.assigned_to is distinct from new.approved_by;
  return null;
end $$;

create or replace trigger notify_section_published after insert on public.section_results
  for each row execute function lakad_private.notify_section_published();

-- Live updates for the bell; Realtime still applies the select policy above.
alter publication supabase_realtime add table public.notifications;
