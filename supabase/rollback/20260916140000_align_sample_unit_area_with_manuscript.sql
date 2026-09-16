-- Manual data-preserving rollback for the manuscript sample-unit range alignment.
-- Restores only the previous 135–315 m² validation; no records are deleted.
begin;

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

commit;
