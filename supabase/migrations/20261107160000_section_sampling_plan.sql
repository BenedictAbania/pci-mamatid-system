-- Reviewer sampling plan from the Road Network section page (ASTM D6433-07, round 1).
--   Option 1 'all'        : every sample unit is inspected (n = N).
--   Option 2 'confidence' : §7.5.2 Eq. 1 with s = 10 and e = 5 PCI points (95% confidence).
--   Option 3 'reduced'    : reduced sampling rate by N (1–5:1, 6–10:2, 11–15:3, 16–40:4, >40: 10% of N).
-- Options 2 and 3 select units by §7.5.3 Eq. 3: interval i = floor(N/n), random start s in 1..i,
-- then s, s+i, s+2i, ... through the section. Encoders are assigned separately.
begin;

alter table public.sections
  add column if not exists sampling_method text,
  add column if not exists sampling_interval integer,
  add column if not exists sampling_start_unit integer;

alter table public.sections drop constraint if exists sections_sampling_method_check;
alter table public.sections add constraint sections_sampling_method_check
  check (sampling_method is null or sampling_method in ('all', 'confidence', 'reduced'));

-- n for one method; mirrors src/lib/d6433-07/sampling-plan.ts.
create or replace function lakad_private.required_sample_units(method text, total integer)
returns integer language sql immutable set search_path = '' as $$
  select case method
    when 'all' then total
    when 'confidence' then case when total = 1 then 1
      else greatest(1, least(total, ceil(total * 100.0 / ((25.0 / 4) * (total - 1) + 100))::integer)) end
    when 'reduced' then case
      when total <= 5 then 1
      when total <= 10 then 2
      when total <= 15 then 3
      when total <= 40 then 4
      else ceil(total * 0.10)::integer end
  end;
$$;

create or replace function lakad_private.confirm_sampling_plan(target uuid, payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sections;
  method text := payload->>'method';
  n integer := (payload->>'total')::integer;
  required integer;
  interval_size integer;
  first_unit integer := nullif(payload->>'first', '')::integer;
  chosen integer[];
begin
  if lakad_private.role() is distinct from 'reviewer' then
    raise exception 'Only a Reviewer can confirm a sampling plan';
  end if;
  select * into s from public.sections where id = target for update;
  if not found or s.area_sqm is null or s.length_meters is null then
    raise exception 'Section area and length are required';
  end if;
  if exists(select 1 from public.sample_units where section_id = target) then
    raise exception 'This section already has a sampling plan';
  end if;
  if method is null or method not in ('all', 'confidence', 'reduced') then
    raise exception 'Choose a sampling option';
  end if;
  if n is null or n < 1 or n > 10000 or s.area_sqm / n not between 135 and 315 then
    raise exception 'Each asphalt sample unit must be 135–315 m² (225 ± 90 m², §2.1.7)';
  end if;
  required := lakad_private.required_sample_units(method, n);
  interval_size := floor(n::numeric / required);
  if method = 'all' then
    first_unit := 1;
  elsif first_unit is null then
    first_unit := floor(random() * interval_size)::integer + 1;
  elsif first_unit not between 1 and interval_size then
    raise exception 'Starting sample unit must be between 1 and the sampling interval %', interval_size;
  end if;
  select array_agg(i order by i) into chosen from generate_series(first_unit, n, interval_size) i;

  update public.sections set
    total_sample_units = n, recommended_sample_units = required,
    sampling_method = method, sampling_interval = interval_size, sampling_start_unit = first_unit,
    homogeneous_confirmed_by = auth.uid(), homogeneous_confirmed_at = now()
  where id = target;

  insert into public.sample_units(
    section_id, unit_number, area_sqm, start_m, end_m,
    sample_type, workflow_state, reviewer_id, created_by
  )
  select target, i, s.area_sqm / n,
    (i - 1) * s.length_meters / n, i * s.length_meters / n,
    'random', 'planned', auth.uid(), auth.uid()
  from unnest(chosen) i;

  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'sampling_confirmed', target,
            jsonb_build_object('method', method, 'total', n, 'required', required,
                               'interval', interval_size, 'first', first_unit, 'selected', chosen));
end $$;

create or replace function lakad_private.add_additional_sample_unit(target uuid, payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.sections;
  unit integer := (payload->>'unit')::integer;
  first_m numeric := (payload->>'start_m')::numeric;
  last_m numeric := (payload->>'end_m')::numeric;
  reason text := nullif(btrim(payload->>'reason'), '');
  note text := nullif(btrim(payload->>'note'), '');
  inspector uuid;
begin
  if lakad_private.role() is distinct from 'reviewer' then
    raise exception 'Only a Reviewer can add an additional sample unit';
  end if;
  select * into s from public.sections where id = target for update;
  if not found or s.homogeneous_confirmed_by is null then
    raise exception 'Confirm the sampling plan first';
  end if;
  if s.sampling_method is distinct from 'confidence' and s.sampling_method is distinct from 'reduced' then
    raise exception 'Additional sample units apply only to Options 2 and 3; Option 1 already inspects every unit';
  end if;
  if unit is null or unit not between 1 and s.total_sample_units then
    raise exception 'Sample unit number must be between 1 and %', s.total_sample_units;
  end if;
  if exists(select 1 from public.sample_units where section_id = target and unit_number = unit) then
    raise exception 'U% is already selected for inspection', unit;
  end if;
  if first_m is null or last_m is null or last_m <= first_m
     or first_m < (unit - 1) * s.length_meters / s.total_sample_units - 0.001
     or last_m > unit * s.length_meters / s.total_sample_units + 0.001 then
    raise exception 'Starts at and Ends at must stay inside U% (% – % m)', unit,
      round((unit - 1) * s.length_meters / s.total_sample_units, 2), round(unit * s.length_meters / s.total_sample_units, 2);
  end if;
  if s.width_meters is null or (last_m - first_m) * s.width_meters not between 135 and 315 then
    raise exception 'Additional unit area must be 135–315 m² (§2.1.7)';
  end if;
  if reason is null then
    raise exception 'A reason is required for an additional sample unit';
  end if;
  -- Follow the section's current encoder, if one is assigned.
  select assigned_to into inspector from public.sample_units
    where section_id = target and assigned_to is not null order by unit_number limit 1;
  insert into public.sample_units(
    section_id, unit_number, area_sqm, start_m, end_m,
    sample_type, workflow_state, assigned_to, reviewer_id, created_by, inspection_notes
  ) values (
    target, unit, (last_m - first_m) * s.width_meters, first_m, last_m,
    'additional', 'planned', inspector, auth.uid(), auth.uid(),
    concat_ws(E'\n', 'Reason: ' || reason, 'Note: ' || note)
  );
  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'additional_sample', target, payload);
end $$;

create or replace function lakad_private.assign_section_encoder(target uuid, payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inspector uuid := (payload->>'inspector')::uuid;
  changed integer;
begin
  if lakad_private.role() is distinct from 'reviewer' then
    raise exception 'Only a Reviewer can assign an encoder';
  end if;
  if not exists(select 1 from public.profiles where id = inspector and role = 'encoder' and is_active) then
    raise exception 'Select an active encoder';
  end if;
  update public.sample_units set assigned_to = inspector
    where section_id = target and workflow_state = 'planned';
  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'No planned sample units to assign; confirm the sampling plan first';
  end if;
  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'encoder_assigned', target, jsonb_build_object('inspector', inspector, 'units', changed));
end $$;

create or replace function public.lakad_confirm_sampling_plan(target uuid, payload jsonb)
returns void language sql security definer set search_path = '' as $$
  select lakad_private.confirm_sampling_plan(target, payload);
$$;

create or replace function public.lakad_add_additional_sample_unit(target uuid, payload jsonb)
returns void language sql security definer set search_path = '' as $$
  select lakad_private.add_additional_sample_unit(target, payload);
$$;

create or replace function public.lakad_assign_section_encoder(target uuid, payload jsonb)
returns void language sql security definer set search_path = '' as $$
  select lakad_private.assign_section_encoder(target, payload);
$$;

revoke all on function
  lakad_private.required_sample_units(text, integer),
  lakad_private.confirm_sampling_plan(uuid, jsonb),
  lakad_private.add_additional_sample_unit(uuid, jsonb),
  lakad_private.assign_section_encoder(uuid, jsonb)
from public, anon, authenticated;

revoke all on function
  public.lakad_confirm_sampling_plan(uuid, jsonb),
  public.lakad_add_additional_sample_unit(uuid, jsonb),
  public.lakad_assign_section_encoder(uuid, jsonb)
from public, anon;

grant execute on function
  public.lakad_confirm_sampling_plan(uuid, jsonb),
  public.lakad_add_additional_sample_unit(uuid, jsonb),
  public.lakad_assign_section_encoder(uuid, jsonb)
to authenticated;

commit;
