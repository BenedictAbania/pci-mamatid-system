-- ===========================================================================
-- LAKAD Authenticated Workflow Migration (Corrected)
-- ===========================================================================
-- Purpose:  Extend the existing LAKAD schema with a role-based inspection
--           workflow, RLS policies, and administrative RPCs.
-- Edition:  ASTM D6433-07 (asphalt only)
-- Safety:   Wrapped in a single transaction — all-or-nothing.
--           Column additions use EXCEPTION handlers so partial re-runs do
--           not fail on duplicate_column.
-- Apply:    Paste into the Supabase SQL Editor and click Run.
--           Then run:  NOTIFY pgrst, 'reload schema';
-- Rollback: See supabase/rollback/20260916_authenticated_workflow.sql
-- ===========================================================================

begin;

-- ===========================
-- 0. Prerequisites
-- ===========================
-- Ensure required enums exist.  If the database already has them (likely),
-- the EXCEPTION handler silently skips creation.

do $$ begin
  create type public.user_role as enum ('admin','reviewer','encoder','viewer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.distress_severity as enum ('low','medium','high');
exception when duplicate_object then null;
end $$;

-- Private schema for security-definer helper functions.
create schema if not exists lakad_private;
revoke all on schema lakad_private from public, anon;
grant usage on schema lakad_private to authenticated;


-- ===========================
-- 1. Alter existing tables
-- ===========================
-- Each ADD COLUMN is wrapped so a partial prior run does not block a retry.

-- profiles -----------------------------------------------------------------
do $$ begin
  alter table public.profiles add column is_active boolean not null default true;
exception when duplicate_column then null;
end $$;

-- branches -----------------------------------------------------------------
do $$ begin
  alter table public.branches add column location text;
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.branches add column administrative_status text not null default 'active';
  alter table public.branches add constraint branches_administrative_status_check
    check (administrative_status in ('active','inactive','archived'));
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.branches add column updated_by uuid references public.profiles(id);
exception when duplicate_column then null;
end $$;

-- sections -----------------------------------------------------------------
do $$ begin
  alter table public.sections add column start_description text;
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sections add column end_description text;
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sections add column pavement_type text not null default 'asphalt';
  alter table public.sections add constraint sections_pavement_type_check
    check (pavement_type = 'asphalt');
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sections add column homogeneous_confirmed_by uuid references public.profiles(id);
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sections add column homogeneous_confirmed_at timestamptz;
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sections add column latitude double precision;
  alter table public.sections add constraint sections_latitude_check
    check (latitude between -90 and 90);
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sections add column longitude double precision;
  alter table public.sections add constraint sections_longitude_check
    check (longitude between -180 and 180);
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sections add column updated_by uuid references public.profiles(id);
exception when duplicate_column then null;
end $$;

-- sample_units -------------------------------------------------------------
do $$ begin
  alter table public.sample_units add column workflow_state text not null default 'draft';
  alter table public.sample_units add constraint sample_units_workflow_state_check
    check (workflow_state in ('planned','draft','submitted','returned','approved','published'));
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sample_units add column assigned_to uuid references public.profiles(id);
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sample_units add column reviewer_id uuid references public.profiles(id);
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sample_units add column start_m numeric;
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sample_units add column end_m numeric;
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sample_units add column inspection_notes text;
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sample_units add column no_distress_confirmed boolean not null default false;
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sample_units add column input_revision integer not null default 1;
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sample_units add column created_by uuid references public.profiles(id);
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.sample_units add column updated_by uuid references public.profiles(id);
exception when duplicate_column then null;
end $$;

-- Preserve original status values into the new workflow_state column.
-- Safe even if status is text or an enum — the cast handles both.
update public.sample_units
  set workflow_state = case
    when status::text = 'rejected' then 'returned'
    when status::text = 'approved' then 'submitted'
    else status::text
  end,
  assigned_to = surveyed_by
where workflow_state = 'draft';  -- Only touch rows not already migrated.

-- distress_types -----------------------------------------------------------
-- FIX: original migration omitted these columns that functions and frontend
-- depend on.
do $$ begin
  alter table public.distress_types add column severity_required boolean not null default true;
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.distress_types add column allowed_severities public.distress_severity[]
    not null default '{low,medium,high}'::public.distress_severity[];
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.distress_types add column updated_at timestamptz not null default now();
exception when duplicate_column then null;
end $$;
-- Unit constraint (idempotent via IF NOT EXISTS pattern).
do $$ begin
  alter table public.distress_types add constraint lakad_distress_unit
    check (default_unit_of_measure is null or default_unit_of_measure in ('m²','m','No.'));
exception when duplicate_object then null;
end $$;

-- distress_records ---------------------------------------------------------
-- FIX: original migration wrote to these columns in inspection_action() but
-- never created them.
do $$ begin
  alter table public.distress_records add column created_by uuid references public.profiles(id);
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.distress_records add column measurement_details jsonb;
exception when duplicate_column then null;
end $$;
do $$ begin
  alter table public.distress_records add column updated_at timestamptz not null default now();
exception when duplicate_column then null;
end $$;

-- distress_photos ----------------------------------------------------------
-- FIX: original migration wrote uploaded_by in inspection_action() but never
-- created the column.
do $$ begin
  alter table public.distress_photos add column uploaded_by uuid references public.profiles(id);
exception when duplicate_column then null;
end $$;


-- ===========================
-- 2. Create new tables
-- ===========================

create table if not exists public.lakad_settings (
  id boolean primary key default true check(id),
  active_edition text not null default 'ASTM D6433-07',
  priority_safety boolean not null default true,
  priority_area boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.lakad_settings(id) values (true) on conflict do nothing;

create table if not exists public.inspection_computations (
  id uuid primary key default gen_random_uuid(),
  sample_unit_id uuid not null references public.sample_units(id),
  input_revision integer not null,
  edition text not null,
  verification text not null default 'pending'
    check (verification in ('pending','verified')),
  reference_id text,
  algorithm_version text,
  input_snapshot jsonb not null,
  output_snapshot jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (verification <> 'verified' or (
    reference_id is not null and algorithm_version is not null and output_snapshot is not null
  ))
);

-- sample_units.computation_id depends on inspection_computations existing.
do $$ begin
  alter table public.sample_units add column computation_id uuid
    references public.inspection_computations(id);
exception when duplicate_column then null;
end $$;

create table if not exists public.inspection_history (
  id uuid primary key default gen_random_uuid(),
  sample_unit_id uuid not null references public.sample_units(id),
  actor_id uuid not null references public.profiles(id),
  action text not null,
  comments text,
  revision integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.lakad_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  target_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.section_results (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id),
  edition text not null,
  reference_id text not null,
  method text not null,
  sample_computation_ids uuid[] not null,
  weights jsonb not null,
  pci numeric not null check (pci between 0 and 100),
  condition text not null,
  safety boolean not null default false,
  high_severity integer not null default 0,
  affected_area numeric not null default 0,
  approved_by uuid not null references public.profiles(id),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);


-- ===========================
-- 3. Indexes
-- ===========================

create index if not exists sample_units_assigned_idx
  on public.sample_units(assigned_to, workflow_state);
create index if not exists sample_units_reviewer_idx
  on public.sample_units(reviewer_id, workflow_state);
create index if not exists sample_units_section_workflow_idx
  on public.sample_units(section_id, workflow_state);
create index if not exists inspection_history_sample_idx
  on public.inspection_history(sample_unit_id, created_at);
create index if not exists inspection_computations_sample_idx
  on public.inspection_computations(sample_unit_id, input_revision);
create index if not exists section_results_section_idx
  on public.section_results(section_id, created_at);


-- ===========================
-- 4. Security helper functions (lakad_private)
-- ===========================
-- All use SECURITY DEFINER + set search_path='' to prevent search-path
-- attacks.  The public wrappers below are the only entry points.

create or replace function lakad_private.role()
returns text language sql stable security definer set search_path='' as $$
  select role::text from public.profiles
  where id = (select auth.uid()) and is_active;
$$;

create or replace function lakad_private.can_read_sample(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.sample_units s where s.id = target and (
      lakad_private.role() = 'admin'
      or (lakad_private.role() = 'reviewer' and s.reviewer_id = (select auth.uid()))
      or (lakad_private.role() = 'encoder'  and s.assigned_to  = (select auth.uid()))
      or (lakad_private.role() = 'viewer'   and s.workflow_state in ('approved','published')
          and exists(select 1 from public.inspection_computations c
                     where c.id = s.computation_id and c.verification = 'verified'))
    )
  );
$$;

create or replace function lakad_private.can_edit_sample(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.sample_units s
    where s.id = target
      and lakad_private.role() = 'encoder'
      and s.assigned_to = (select auth.uid())
      and s.workflow_state in ('draft','returned')
  );
$$;

create or replace function lakad_private.can_read_section(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select lakad_private.role() in ('admin','reviewer')
    or (lakad_private.role() = 'encoder'
        and exists(select 1 from public.sample_units
                   where section_id = target and assigned_to = (select auth.uid())))
    or (lakad_private.role() = 'viewer'
        and exists(select 1 from public.section_results where section_id = target));
$$;


-- ===========================
-- 5. RLS policies
-- ===========================
-- Restrictive policies AND with any pre-existing permissive policies.
-- They never widen access beyond what the role helpers allow.

-- Drop-if-exists wrapper for policies (Postgres has no CREATE POLICY IF NOT EXISTS).
do $$ declare
  pol record;
begin
  -- Clean up any leftover lakad policies from a partial prior run.
  for pol in
    select policyname, tablename, schemaname
    from pg_policies
    where policyname like 'lakad_%'
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- Row-scoped SELECT on existing tables.
create policy lakad_scope on public.sample_units
  as restrictive for select to authenticated
  using (lakad_private.can_read_sample(id));

create policy lakad_scope on public.sections
  as restrictive for select to authenticated
  using (lakad_private.can_read_section(id));

create policy lakad_scope on public.branches
  as restrictive for select to authenticated
  using (
    (select lakad_private.role()) in ('admin','reviewer')
    or exists(select 1 from public.sections s
              where s.branch_id = branches.id
                and lakad_private.can_read_section(s.id))
  );

create policy lakad_scope on public.distress_records
  as restrictive for select to authenticated
  using (lakad_private.can_read_sample(sample_unit_id));

create policy lakad_scope on public.distress_photos
  as restrictive for select to authenticated
  using (lakad_private.can_read_sample(sample_unit_id));

create policy lakad_scope on public.profiles
  as restrictive for select to authenticated
  using (
    id = (select auth.uid())
    or (select lakad_private.role()) in ('admin','reviewer')
  );

-- Reference tables: read-only scoping.
create policy lakad_reference on public.deduct_value_points
  as restrictive for select to authenticated
  using ((select lakad_private.role()) = 'admin');

create policy lakad_reference on public.distress_types
  as restrictive for select to authenticated
  using ((select lakad_private.role()) is not null);

-- Ensure RLS is explicitly enabled on all tables
do $$ declare t text; begin
  foreach t in array array['sample_units','sections','branches','distress_records','distress_photos','profiles','distress_types','deduct_value_points'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Block direct browser INSERT/UPDATE/DELETE on inspection-related tables.
-- All writes go through checked RPCs.
do $$ declare t text; begin
  foreach t in array array['sample_units','distress_records','distress_photos','profiles'] loop
    execute format(
      'create policy lakad_no_direct_insert on public.%I as restrictive for insert to authenticated with check(false)', t);
    execute format(
      'create policy lakad_no_direct_update on public.%I as restrictive for update to authenticated using(false) with check(false)', t);
    execute format(
      'create policy lakad_no_direct_delete on public.%I as restrictive for delete to authenticated using(false)', t);
    -- Explicit minimum Data API grant (writes are disabled, but explicit SELECT is given)
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  -- Road inventory: any active role may read/write branches and sections.
  foreach t in array array['branches','sections'] loop
    execute format(
      'create policy lakad_active_write on public.%I as restrictive for all to authenticated using((select lakad_private.role()) is not null) with check((select lakad_private.role()) is not null)', t);
    -- Explicit minimum Data API grants for these (they allow writes)
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  -- Reference catalog: admin-only write.
  foreach t in array array['distress_types','deduct_value_points'] loop
    execute format(
      'create policy lakad_active_write on public.%I as restrictive for all to authenticated using((select lakad_private.role())=''admin'') with check((select lakad_private.role())=''admin'')', t);
    -- Explicit minimum Data API grants for these
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- New tables: enable RLS, restrict to SELECT only (writes via RPCs).
do $$ declare t text; begin
  foreach t in array array['lakad_settings','inspection_computations','inspection_history','lakad_audit','section_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

create policy lakad_read on public.lakad_settings
  for select to authenticated
  using ((select lakad_private.role()) is not null);

create policy lakad_read on public.inspection_computations
  for select to authenticated
  using (lakad_private.can_read_sample(sample_unit_id));

create policy lakad_read on public.inspection_history
  for select to authenticated
  using (lakad_private.can_read_sample(sample_unit_id));

create policy lakad_read on public.lakad_audit
  for select to authenticated
  using ((select lakad_private.role()) = 'admin');

create policy lakad_read on public.section_results
  for select to authenticated
  using (lakad_private.can_read_section(section_id));


-- ===========================
-- 6. Inventory guard trigger
-- ===========================
-- Prevents destructive changes to sections/branches that have inspection data.

create or replace function lakad_private.guard_inventory()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then
    raise exception 'Authenticated inventory operation required';
  end if;

  if tg_op = 'DELETE' then
    if tg_table_name = 'sections'
       and exists(select 1 from public.sample_units where section_id = old.id) then
      raise exception 'Section has sample units; archive it instead';
    end if;
    if tg_table_name = 'branches'
       and exists(select 1 from public.sections where branch_id = old.id) then
      raise exception 'Road has sections; archive it instead';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
    if tg_table_name = 'sections'
       and exists(select 1 from public.sample_units where section_id = old.id)
       and (to_jsonb(new) - array['notes','description','updated_at','updated_by'])
           is distinct from
           (to_jsonb(old) - array['notes','description','updated_at','updated_by']) then
      raise exception 'Confirmed inspection boundaries are immutable; create a new section revision';
    end if;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

-- Drop existing triggers before recreating (idempotent).
drop trigger if exists lakad_inventory_guard on public.sections;
drop trigger if exists lakad_inventory_guard on public.branches;

create trigger lakad_inventory_guard
  before insert or update or delete on public.sections
  for each row execute function lakad_private.guard_inventory();

create trigger lakad_inventory_guard
  before insert or update or delete on public.branches
  for each row execute function lakad_private.guard_inventory();


-- ===========================
-- 7. Inspection workflow state machine
-- ===========================

create or replace function lakad_private.inspection_action(
  target uuid, action text, payload jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  s public.sample_units;
  d public.distress_types;
  actor uuid := auth.uid();
  r text := lakad_private.role();
  qty numeric;
  sev public.distress_severity;
  loc numeric;
  cid uuid;
  result_id uuid;
  comments text := nullif(btrim(payload->>'comments'), '');
begin
  if actor is null or r is null then
    raise exception 'Active authenticated account required';
  end if;

  select * into s from public.sample_units where id = target for update;
  if not found or not lakad_private.can_read_sample(target) then
    raise exception 'Inspection unavailable or outside your assignment';
  end if;

  -- === Inspector actions ===
  if action in ('start','save','distress','remove_distress','photo','remove_photo','submit') then
    if r <> 'encoder' or s.assigned_to <> actor then
      raise exception 'Only the assigned inspector may edit or submit';
    end if;

    if action = 'start' then
      if s.workflow_state <> 'planned' then
        raise exception 'Only a planned unit can be started';
      end if;
      update public.sample_units
        set workflow_state = 'draft', surveyed_by = actor, surveyed_at = now(), updated_by = actor
        where id = target;

    else
      if s.workflow_state not in ('draft','returned') then
        raise exception 'Submitted and approved inspections are read-only';
      end if;
      if payload ? 'revision'
         and (payload->>'revision')::integer <> s.input_revision then
        raise exception 'Inspection changed; refresh before saving';
      end if;

      if action = 'save' then
        if (nullif(payload->>'latitude','') is null)
           <> (nullif(payload->>'longitude','') is null) then
          raise exception 'Supply both coordinates or neither';
        end if;
        if coalesce((payload->>'no_distress_confirmed')::boolean, false)
           and exists(select 1 from public.distress_records where sample_unit_id = target) then
          raise exception 'Cannot confirm no distress while measurements exist';
        end if;
        if nullif(payload->>'surveyed_at','') is null then
          raise exception 'Inspection date required';
        end if;
        if (payload->>'surveyed_at')::date > current_date then
          raise exception 'Inspection date cannot be in the future';
        end if;
        update public.sample_units set
          inspection_notes = payload->>'notes',
          surveyed_at = (payload->>'surveyed_at')::date,
          latitude = nullif(payload->>'latitude','')::double precision,
          longitude = nullif(payload->>'longitude','')::double precision,
          no_distress_confirmed = coalesce((payload->>'no_distress_confirmed')::boolean, false)
        where id = target;

      elsif action = 'distress' then
        select * into d from public.distress_types
          where id = (payload->>'distress_type_id')::uuid and is_active;
        if not found or d.default_unit_of_measure is null then
          raise exception 'Active distress with configured unit required';
        end if;

        qty := (payload->>'quantity')::numeric;
        sev := nullif(payload->>'severity','')::public.distress_severity;
        loc := nullif(payload->>'location_m','')::numeric;

        if qty is null or qty <= 0 or qty::text in ('NaN','Infinity','-Infinity') then
          raise exception 'Quantity must be positive and finite';
        end if;
        if (d.severity_required and sev is null)
           or (not d.severity_required and sev is not null)
           or (sev is not null and not sev = any(d.allowed_severities)) then
          raise exception 'Invalid severity';
        end if;
        if d.default_unit_of_measure in ('m²','m2','sqm')
           and qty + coalesce((
             select sum(quantity) from public.distress_records
             where sample_unit_id = target and distress_type_id = d.id
               and (nullif(payload->>'id','') is null or id <> (payload->>'id')::uuid)
           ), 0) > s.area_sqm then
          raise exception 'Measured area exceeds sample boundary';
        end if;
        if d.default_unit_of_measure in ('No.','count') and qty <> trunc(qty) then
          raise exception 'Count must be a whole number';
        end if;
        if loc is not null and (loc < 0 or s.start_m is null or s.end_m is null
           or loc > s.end_m - s.start_m) then
          raise exception 'Location outside sample boundary';
        end if;

        result_id := nullif(payload->>'id','')::uuid;
        if exists(
          select 1 from public.distress_records
          where sample_unit_id = target and distress_type_id = d.id
            and severity is not distinct from sev
            and (result_id is null or id <> result_id)
        ) then
          raise exception 'Duplicate distress/severity; edit existing measurement';
        end if;

        if result_id is null then
          insert into public.distress_records(
            sample_unit_id, distress_type_id, severity, quantity,
            unit_of_measure, notes, created_by, measurement_details
          ) values (
            target, d.id, sev, qty, d.default_unit_of_measure,
            payload->>'notes', actor,
            jsonb_build_object('location_m', loc)
          ) returning id into result_id;
        else
          update public.distress_records set
            distress_type_id = d.id, severity = sev, quantity = qty,
            unit_of_measure = d.default_unit_of_measure,
            notes = payload->>'notes',
            measurement_details = jsonb_build_object('location_m', loc),
            updated_at = now()
          where id = result_id and sample_unit_id = target;
          if not found then raise exception 'Distress record not found'; end if;
        end if;
        update public.sample_units set no_distress_confirmed = false where id = target;

      elsif action = 'remove_distress' then
        delete from public.distress_records
          where id = (payload->>'id')::uuid and sample_unit_id = target;
        if not found then raise exception 'Distress record not found'; end if;

      elsif action = 'photo' then
        if split_part(payload->>'path','/',1) <> target::text
           or not exists(select 1 from storage.objects
                         where bucket_id = 'sample-unit-photos'
                           and name = payload->>'path') then
          raise exception 'Upload photograph to this sample first';
        end if;
        insert into public.distress_photos(sample_unit_id, photo_path, caption, uploaded_by)
          values (target, payload->>'path', payload->>'caption', actor);

      elsif action = 'remove_photo' then
        delete from public.distress_photos
          where id = (payload->>'id')::uuid and sample_unit_id = target;

      elsif action = 'submit' then
        if s.area_sqm is null or s.surveyed_at is null or s.reviewer_id is null then
          raise exception 'Area, inspection date and assigned reviewer are required';
        end if;
        if not s.no_distress_confirmed
           and not exists(select 1 from public.distress_records where sample_unit_id = target) then
          raise exception 'Add distresses or explicitly confirm no distress';
        end if;
        insert into public.inspection_computations(
          sample_unit_id, input_revision, edition, input_snapshot, created_by
        )
        select target, s.input_revision, active_edition,
          jsonb_build_object(
            'sample', to_jsonb(s),
            'distresses', coalesce(
              (select jsonb_agg(to_jsonb(x)) from public.distress_records x
               where sample_unit_id = target), '[]'::jsonb),
            'photos', coalesce(
              (select jsonb_agg(to_jsonb(p)) from public.distress_photos p
               where sample_unit_id = target), '[]'::jsonb)
          ), actor
        from public.lakad_settings
        returning id into cid;
        update public.sample_units
          set workflow_state = 'submitted', status = 'submitted',
              submitted_at = now(), computation_id = cid
          where id = target;
      end if;

      -- Bump revision for non-submit edits so stale clients detect changes.
      if action <> 'submit' then
        update public.sample_units
          set input_revision = input_revision + 1, computation_id = null
          where id = target;
      end if;
    end if;

  -- === Reviewer actions ===
  elsif action in ('return','approve','publish') then
    if r <> 'reviewer' or s.reviewer_id <> actor
       or s.surveyed_by = actor or s.assigned_to = actor then
      raise exception 'Only an independent assigned engineer may review';
    end if;

    if action = 'return' then
      if s.workflow_state <> 'submitted' or comments is null then
        raise exception 'Return requires a submitted inspection and review comments';
      end if;
      update public.sample_units
        set workflow_state = 'returned', status = 'rejected',
            review_notes = comments, reviewed_by = actor, reviewed_at = now()
        where id = target;

    else  -- approve or publish
      if (action = 'approve' and s.workflow_state <> 'submitted')
         or (action = 'publish' and s.workflow_state <> 'approved') then
        raise exception 'Invalid review transition';
      end if;
      if not exists(
        select 1 from public.inspection_computations c
        where c.id = s.computation_id and c.sample_unit_id = s.id
          and c.input_revision = s.input_revision and c.verification = 'verified'
      ) then
        raise exception 'Preliminary — ASTM reference data pending verification. Official approval/publication blocked.';
      end if;
      if not exists(
        select 1 from public.inspection_computations c
        where c.id = s.computation_id
          and jsonb_typeof(c.output_snapshot->'pci') = 'number'
          and (c.output_snapshot->>'pci')::numeric between 0 and 100
          and nullif(c.output_snapshot->>'condition','') is not null
          and jsonb_typeof(c.output_snapshot->'iterations') = 'array'
      ) then
        raise exception 'Verified calculation output is incomplete';
      end if;
      update public.sample_units
        set workflow_state = case action when 'approve' then 'approved' else 'published' end,
            status = 'approved', reviewed_by = actor, reviewed_at = now(),
            review_notes = comments,
            pci_score = (c.output_snapshot->>'pci')::numeric,
            condition_label = c.output_snapshot->>'condition',
            total_deduct_value = (c.output_snapshot->>'total_deduct_value')::numeric,
            corrected_deduct_value = (c.output_snapshot->>'max_corrected_deduct_value')::numeric,
            pci_computed_at = c.created_at
      from public.inspection_computations c
      where sample_units.id = target and c.id = s.computation_id;
    end if;

  else
    raise exception 'Unknown inspection action';
  end if;

  -- Common post-action bookkeeping.
  update public.sample_units set updated_by = actor, updated_at = now() where id = target;
  insert into public.inspection_history(sample_unit_id, actor_id, action, comments, revision)
    select target, actor, action, comments, input_revision
    from public.sample_units where id = target;
  return coalesce(result_id, target);
end $$;

create or replace function public.lakad_inspection_action(
  target uuid, action text, payload jsonb default '{}'::jsonb
) returns uuid
language sql security definer set search_path='' as $$
  select lakad_private.inspection_action(target, action, payload);
$$;


-- ===========================
-- 8. Account management
-- ===========================

create or replace function lakad_private.manage_account(
  target uuid, new_role public.user_role, active boolean
) returns void language plpgsql security definer set search_path='' as $$
begin
  if lakad_private.role() is distinct from 'admin' then
    raise exception 'Administrator required';
  end if;
  if target = auth.uid() then
    raise exception 'Cannot change your own access';
  end if;
  if active is null or new_role is null then
    raise exception 'Role and account status required';
  end if;
  update public.profiles set role = new_role, is_active = active, updated_at = now()
    where id = target;
  if not found then raise exception 'Account not found'; end if;
  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'account_updated', target,
            jsonb_build_object('role', new_role, 'is_active', active));
end $$;

create or replace function public.lakad_manage_account(
  target uuid, new_role public.user_role, active boolean
) returns void
language sql security definer set search_path='' as $$
  select lakad_private.manage_account(target, new_role, active);
$$;

create or replace function lakad_private.accounts()
returns table(
  id uuid, full_name text, email text, role public.user_role,
  is_active boolean, created_at timestamptz, updated_at timestamptz
) language plpgsql stable security definer set search_path='' as $$
begin
  if lakad_private.role() is distinct from 'admin' then
    raise exception 'Administrator required';
  end if;
  return query
    select p.id, p.full_name, u.email::text, p.role, p.is_active, p.created_at, p.updated_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.full_name;
end $$;

create or replace function public.lakad_accounts()
returns table(
  id uuid, full_name text, email text, role public.user_role,
  is_active boolean, created_at timestamptz, updated_at timestamptz
) language sql security definer set search_path='' as $$
  select * from lakad_private.accounts();
$$;


-- ===========================
-- 9. Storage bucket
-- ===========================
-- FIX: original migration only ran UPDATE, which silently does nothing if
-- the bucket doesn't exist.  Use INSERT ... ON CONFLICT for safety.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sample-unit-photos', 'sample-unit-photos', false,
  5242880, array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy lakad_photo_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'sample-unit-photos'
    and exists(select 1 from public.sample_units s
               where s.id::text = split_part(name,'/',1)
                 and lakad_private.can_read_sample(s.id))
  );

create policy lakad_photo_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sample-unit-photos'
    and exists(select 1 from public.sample_units s
               where s.id::text = split_part(name,'/',1)
                 and lakad_private.can_edit_sample(s.id))
  );

create policy lakad_photo_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'sample-unit-photos'
    and exists(select 1 from public.sample_units s
               where s.id::text = split_part(name,'/',1)
                 and lakad_private.can_edit_sample(s.id))
    and not exists(select 1 from public.distress_photos p
                   where p.photo_path = name)
  );


-- ===========================
-- 10. Sampling plan RPCs
-- ===========================

create or replace function lakad_private.plan_samples(target uuid, payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  s public.sections;
  n integer := (payload->>'total')::integer;
  required integer := (payload->>'required')::integer;
  inspector uuid := (payload->>'inspector')::uuid;
  reviewer uuid := (payload->>'reviewer')::uuid;
  chosen integer[];
begin
  if lakad_private.role() is distinct from 'reviewer' then
    raise exception 'A civil engineer must confirm homogeneous boundaries and the sampling plan';
  end if;
  select * into s from public.sections where id = target for update;
  if not found or s.area_sqm is null or s.length_meters is null then
    raise exception 'Section area and length required';
  end if;
  if n is null or required is null or n < 1 or n > 10000 or required < 1 or required > n then
    raise exception 'Invalid total or required sample count';
  end if;
  if s.area_sqm / n not between 135 and 315 then
    raise exception 'Adjust sample layout: each asphalt unit must be approximately 135–315 m²';
  end if;
  if nullif(btrim(payload->>'start'),'') is null
     or nullif(btrim(payload->>'end'),'') is null
     or nullif(btrim(payload->>'rationale'),'') is null then
    raise exception 'Boundary descriptions and engineer sampling rationale required';
  end if;
  if exists(select 1 from public.sample_units where section_id = target) then
    raise exception 'Plan already has sample units; create a new section revision';
  end if;
  if not exists(select 1 from public.profiles
                where id = inspector and role = 'encoder' and is_active)
     or not exists(select 1 from public.profiles
                   where id = reviewer and role = 'reviewer' and is_active) then
    raise exception 'Select an active inspector and engineer';
  end if;
  select array_agg(i) into chosen
    from (select i from generate_series(1, n) i order by random() limit required) x;
  update public.sections set
    total_sample_units = n, recommended_sample_units = required,
    start_description = payload->>'start', end_description = payload->>'end',
    homogeneous_confirmed_by = auth.uid(), homogeneous_confirmed_at = now(),
    notes = concat_ws(E'\n', notes, 'Sampling rationale: ' || (payload->>'rationale'))
  where id = target;
  insert into public.sample_units(
    section_id, unit_number, area_sqm, start_m, end_m,
    sample_type, workflow_state, assigned_to, reviewer_id, created_by
  )
  select target, i, s.area_sqm / n,
    (i - 1) * s.length_meters / n, i * s.length_meters / n,
    'random', 'planned', inspector, reviewer, auth.uid()
  from unnest(chosen) i;
  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'sampling_confirmed', target,
            jsonb_build_object('total', n, 'required', required,
                               'selected', chosen, 'rationale', payload->>'rationale'));
end $$;

create or replace function public.lakad_plan_samples(target uuid, payload jsonb)
returns void language sql security definer set search_path='' as $$
  select lakad_private.plan_samples(target, payload);
$$;

create or replace function lakad_private.additional_sample(target uuid, payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  s public.sections;
  first_m numeric := (payload->>'start_m')::numeric;
  last_m numeric := (payload->>'end_m')::numeric;
  unit integer := (payload->>'unit')::integer;
begin
  if lakad_private.role() is distinct from 'reviewer' then
    raise exception 'Engineer required';
  end if;
  select * into s from public.sections where id = target for update;
  if not found or s.homogeneous_confirmed_by is null then
    raise exception 'Confirm section plan first';
  end if;
  if first_m is null or last_m is null or first_m < 0 or last_m <= first_m
     or last_m > s.length_meters
     or unit not between 1 and s.total_sample_units then
    raise exception 'Check additional sample identifier and boundaries';
  end if;
  if s.width_meters is null
     or (last_m - first_m) * s.width_meters not between 135 and 315 then
    raise exception 'Additional unit area must be 135–315 m²';
  end if;
  if not exists(select 1 from public.profiles
                where id = (payload->>'inspector')::uuid
                  and role = 'encoder' and is_active) then
    raise exception 'Active inspector required';
  end if;
  if nullif(btrim(payload->>'rationale'),'') is null then
    raise exception 'Additional sample justification required';
  end if;
  insert into public.sample_units(
    section_id, unit_number, area_sqm, start_m, end_m,
    sample_type, workflow_state, assigned_to, reviewer_id, created_by, inspection_notes
  ) values (
    target, unit, (last_m - first_m) * s.width_meters,
    first_m, last_m, 'additional', 'planned',
    (payload->>'inspector')::uuid, auth.uid(), auth.uid(),
    payload->>'rationale'
  );
  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'additional_sample', target, payload);
end $$;

create or replace function public.lakad_additional_sample(target uuid, payload jsonb)
returns void language sql security definer set search_path='' as $$
  select lakad_private.additional_sample(target, payload);
$$;


-- ===========================
-- 11. Settings RPC
-- ===========================

create or replace function lakad_private.save_settings(payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if lakad_private.role() is distinct from 'admin' then
    raise exception 'Administrator required';
  end if;
  if nullif(btrim(payload->>'edition'),'') is null then
    raise exception 'Edition required';
  end if;
  update public.lakad_settings set
    active_edition = payload->>'edition',
    priority_safety = (payload->>'priority_safety')::boolean,
    priority_area = (payload->>'priority_area')::boolean,
    updated_by = auth.uid(), updated_at = now();
  insert into public.lakad_audit(actor_id, action, detail)
    values (auth.uid(), 'settings_updated', payload);
end $$;

create or replace function public.lakad_save_settings(payload jsonb)
returns void language sql security definer set search_path='' as $$
  select lakad_private.save_settings(payload);
$$;


-- ===========================
-- 12. Distress reference catalog RPC
-- ===========================

create or replace function lakad_private.save_distress_type(target uuid, payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  changed uuid;
  severity_req boolean := coalesce((payload->>'severity_required')::boolean, true);
  allowed public.distress_severity[];
begin
  if lakad_private.role() is distinct from 'admin' then
    raise exception 'Administrator required';
  end if;
  if nullif(btrim(payload->>'code'),'') is null
     or nullif(btrim(payload->>'name'),'') is null then
    raise exception 'Code and distress name are required';
  end if;
  if payload->>'default_unit_of_measure' not in ('m²','m','No.') then
    raise exception 'Select a supported measurement unit';
  end if;
  if exists(
    select 1 from jsonb_array_elements_text(
      coalesce(payload->'allowed_severities','[]'::jsonb)
    ) value where value not in ('low','medium','high')
  ) then
    raise exception 'Unsupported severity';
  end if;

  select coalesce(array_agg(value::public.distress_severity),
                  '{}'::public.distress_severity[])
  into allowed
  from jsonb_array_elements_text(
    coalesce(payload->'allowed_severities','[]'::jsonb)
  ) value;

  if severity_req and cardinality(allowed) = 0 then
    raise exception 'Select at least one allowed severity';
  end if;
  if not severity_req then
    allowed := '{}'::public.distress_severity[];
  end if;

  if target is null then
    insert into public.distress_types(
      code, name, description, default_unit_of_measure,
      is_active, severity_required, allowed_severities
    ) values (
      upper(btrim(payload->>'code')), btrim(payload->>'name'),
      nullif(btrim(payload->>'description'),''),
      payload->>'default_unit_of_measure',
      coalesce((payload->>'is_active')::boolean, true),
      severity_req, allowed
    ) returning id into changed;
  else
    update public.distress_types set
      code = upper(btrim(payload->>'code')),
      name = btrim(payload->>'name'),
      description = nullif(btrim(payload->>'description'),''),
      default_unit_of_measure = payload->>'default_unit_of_measure',
      is_active = coalesce((payload->>'is_active')::boolean, is_active),
      severity_required = severity_req,
      allowed_severities = allowed,
      updated_at = now()
    where id = target returning id into changed;
    if changed is null then raise exception 'Distress type not found'; end if;
  end if;

  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'distress_reference_saved', changed,
            jsonb_build_object('code', upper(btrim(payload->>'code')),
                               'active', coalesce((payload->>'is_active')::boolean, true)));
  return changed;
end $$;

create or replace function public.lakad_save_distress_type(target uuid, payload jsonb)
returns uuid language sql security definer set search_path='' as $$
  select lakad_private.save_distress_type(target, payload);
$$;


-- ===========================
-- 13. Grants
-- ===========================

-- Public API RPCs: only authenticated users.
revoke all on function
  public.lakad_plan_samples(uuid, jsonb),
  public.lakad_additional_sample(uuid, jsonb),
  public.lakad_save_settings(jsonb),
  public.lakad_save_distress_type(uuid, jsonb)
from public, anon;

grant execute on function
  public.lakad_plan_samples(uuid, jsonb),
  public.lakad_additional_sample(uuid, jsonb),
  public.lakad_save_settings(jsonb),
  public.lakad_save_distress_type(uuid, jsonb)
to authenticated;

-- Private functions: revoke everything, then grant only the read helpers
-- that RLS policies call directly.
revoke all on all functions in schema lakad_private from public, anon, authenticated;
grant execute on function
  lakad_private.role(),
  lakad_private.can_read_sample(uuid),
  lakad_private.can_edit_sample(uuid),
  lakad_private.can_read_section(uuid)
to authenticated;

revoke all on function
  public.lakad_inspection_action(uuid, text, jsonb),
  public.lakad_manage_account(uuid, public.user_role, boolean),
  public.lakad_accounts()
from public, anon;

grant execute on function
  public.lakad_inspection_action(uuid, text, jsonb),
  public.lakad_manage_account(uuid, public.user_role, boolean),
  public.lakad_accounts()
to authenticated;


commit;

