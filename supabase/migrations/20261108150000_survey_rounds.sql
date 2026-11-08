-- Survey rounds for ASTM D6433-07 (decided 2026-11-08).
-- Round 1 is the confirmed sampling plan stored on public.sections. Each later round re-inspects
-- the same section after every unit of the previous round is published:
--   Option 1 'all'        : every sample unit (§7.5.1).
--   Option 2 'confidence' : §7.5.2 Eq. 1 with e = 5 and s measured from the previous round's random
--                           sample-unit PCIs by §7.5.2.1 Eq. 2 (sample standard deviation).
--   Option 3 'reduced'    : the §7.6 example table, as in round 1.
-- Units are picked by §7.5.3 Eq. 3 (interval i = floor(N/n), random start 1..i).
-- Sample units, section calculations and section results are scoped to their round, so a
-- section PCI always averages one round and earlier rounds stay as history.
begin;

alter table public.sample_units add column if not exists survey_round integer not null default 1;
alter table public.sample_units drop constraint if exists sample_units_section_id_unit_number_key;
drop index if exists public.sample_units_section_id_unit_number_key;
create unique index if not exists sample_units_section_round_unit_key
  on public.sample_units(section_id, survey_round, unit_number);

alter table public.section_results add column if not exists survey_round integer not null default 1;

-- Plans for round 2 and later. Round 1 stays on public.sections.
create table if not exists public.section_survey_rounds(
  section_id uuid not null references public.sections(id) on delete cascade,
  round_number integer not null check (round_number >= 2),
  sampling_method text not null check (sampling_method in ('all', 'confidence', 'reduced')),
  total_sample_units integer not null check (total_sample_units >= 1),
  required_sample_units integer not null check (required_sample_units >= 1),
  sampling_interval integer not null check (sampling_interval >= 1),
  sampling_start_unit integer not null check (sampling_start_unit >= 1),
  standard_deviation numeric,
  previous_sample_count integer not null,
  confirmed_by uuid not null references public.profiles(id),
  confirmed_at timestamptz not null default now(),
  primary key (section_id, round_number)
);
alter table public.section_survey_rounds enable row level security;
revoke all on table public.section_survey_rounds from public, anon, authenticated;

create or replace function lakad_private.current_survey_round(target uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select max(round_number) from public.section_survey_rounds where section_id = target), 1);
$$;

-- §7.5.2.1 Eq. 2 over the random sample units of one round that have current approved results.
-- stddev_samp is sqrt(Σ(PCIi − PCIs)² / (n − 1)); it is null for fewer than two units.
create or replace function lakad_private.round_pci_stats(target uuid, round integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('count', count(*), 'mean', avg(pci), 'deviation', stddev_samp(pci))
  from (
    select (a.report_snapshot->'output'->>'pci')::numeric as pci
    from public.sample_units u
    join public.approved_results a on a.sample_unit_id = u.id and a.is_current
    where u.section_id = target and u.survey_round = round and u.sample_type = 'random'
  ) x;
$$;

-- n for one method with a measured standard deviation (Option 2); other options ignore s.
create or replace function lakad_private.required_sample_units_with(method text, total integer, deviation numeric)
returns integer language sql immutable set search_path = '' as $$
  select case when method = 'confidence' then
      case when total = 1 then 1
      else greatest(1, least(total, ceil(total * power(deviation, 2) / ((25.0 / 4) * (total - 1) + power(deviation, 2)))::integer)) end
    else lakad_private.required_sample_units(method, total) end;
$$;

-- Units of the current round and how many have a current published result.
create or replace function lakad_private.round_progress(target uuid, round integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('units', count(*), 'published', count(*) filter (where exists(
    select 1 from public.approved_results a where a.sample_unit_id = u.id and a.is_current and a.published_at is not null)))
  from public.sample_units u where u.section_id = target and u.survey_round = round;
$$;

-- Section results carry the round they average.
create or replace function lakad_private.section_result_round() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.survey_round := lakad_private.current_survey_round(new.section_id);
  return new;
end $$;
drop trigger if exists section_results_round on public.section_results;
create trigger section_results_round before insert on public.section_results
  for each row execute function lakad_private.section_result_round();

-- A section result is valid while it holds every current approved result of its own round.
create or replace function lakad_private.valid_section_result(target uuid, viewer boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.section_results sr join public.profiles p on p.id = sr.approved_by
    where sr.id = target and p.role = 'reviewer' and cardinality(sr.sample_computation_ids) > 0
      and cardinality(sr.sample_computation_ids) = (select count(distinct cid) from unnest(sr.sample_computation_ids) cid)
      and not exists(select 1 from public.approved_results current_result join public.sample_units u on u.id = current_result.sample_unit_id
        where current_result.is_current and u.section_id = sr.section_id and u.survey_round = sr.survey_round
          and not current_result.id = any(sr.sample_computation_ids))
      and not exists(select 1 from unnest(sr.sample_computation_ids) cid
        left join public.approved_results a on a.id = cid left join public.sample_units s on s.id = a.sample_unit_id
        where a.id is null or not a.is_current or s.section_id <> sr.section_id or s.survey_round <> sr.survey_round
          or (viewer and a.published_at is null)));
$$;

-- Section calculation input: only the units of the current round.
create or replace function lakad_private.calculation_context(actor uuid, target uuid, kind text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r text; s public.sample_units; c public.inspection_computations; sec public.sections; result jsonb; n integer; cur integer;
begin
  select role::text into r from public.profiles where id=actor and is_active;
  if r is null or r='viewer' then raise exception 'Active staff required'; end if;
  if kind='sample' then
    select * into s from public.sample_units where id=target;
    if s.id is null or (r='encoder' and s.assigned_to is distinct from actor) or (r='reviewer' and s.reviewer_id is distinct from actor) then raise exception 'Inspection outside your assignment'; end if;
    if s.workflow_state<>'submitted' then raise exception 'Submit the current inspection revision before calculation'; end if;
    select * into c from public.inspection_computations where id=s.computation_id and input_revision=s.input_revision and verification='pending';
    if c.id is null then raise exception 'Current pending computation required'; end if;
    return jsonb_build_object('kind','sample','id',c.id,'revision',s.input_revision,'version',s.action_version,'edition',c.edition,'input',c.input_snapshot);
  elsif kind='section' then
    if r not in ('reviewer','admin') then raise exception 'Reviewer or administrator required for section calculation'; end if;
    select * into sec from public.sections where id=target and homogeneous_confirmed_by is not null;
    if sec.id is null then raise exception 'Confirmed section plan required'; end if;
    cur:=lakad_private.current_survey_round(target);
    select count(*) into n from public.sample_units where section_id=target and survey_round=cur;
    if n>10000 then raise exception 'Section exceeds the complete-cohort bound'; end if;
    if exists(select 1 from public.sample_units u left join public.approved_results a on a.sample_unit_id=u.id and a.is_current where u.section_id=target and u.survey_round=cur and a.id is null) then raise exception 'Complete selected cohort must have current approved calculations, including additional samples'; end if;
    select jsonb_build_object('kind','section','id',sec.id,'input',jsonb_build_object(
      'area_sqm',sec.area_sqm,'total_sample_units',sec.total_sample_units,
      'required_random_ids',coalesce((select jsonb_agg(id order by id) from public.sample_units where section_id=target and survey_round=cur and sample_type='random'),'[]'::jsonb),
      'samples',coalesce((select jsonb_agg(jsonb_build_object('id',a.sample_unit_id,'computation_id',a.id,
        'area_sqm',a.report_snapshot->'sample'->'area_sqm','pci',a.report_snapshot->'output'->'pci',
        'sample_type',a.report_snapshot->'sample'->'sample_type','edition',a.report_snapshot->'edition','is_current',true,'approved',true) order by a.sample_unit_id)
        from public.approved_results a join public.sample_units u on u.id=a.sample_unit_id where u.section_id=target and u.survey_round=cur and a.is_current),'[]'::jsonb))) into result;
    return result;
  end if;
  raise exception 'Unknown calculation kind';
end $$;

-- Additional sample units join the current round and follow that round's method.
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
  cur integer;
  method text;
begin
  if lakad_private.role() is distinct from 'reviewer' then
    raise exception 'Only a Reviewer can add an additional sample unit';
  end if;
  select * into s from public.sections where id = target for update;
  if not found or s.homogeneous_confirmed_by is null then
    raise exception 'Confirm the sampling plan first';
  end if;
  cur := lakad_private.current_survey_round(target);
  method := case when cur = 1 then s.sampling_method
    else (select sampling_method from public.section_survey_rounds where section_id = target and round_number = cur) end;
  if method is distinct from 'confidence' and method is distinct from 'reduced' then
    raise exception 'Additional sample units apply only to Options 2 and 3; Option 1 already inspects every unit';
  end if;
  if unit is null or unit not between 1 and s.total_sample_units then
    raise exception 'Sample unit number must be between 1 and %', s.total_sample_units;
  end if;
  if exists(select 1 from public.sample_units where section_id = target and survey_round = cur and unit_number = unit) then
    raise exception 'SU% is already selected for inspection', unit;
  end if;
  if first_m is null or last_m is null or last_m <= first_m
     or first_m < (unit - 1) * s.length_meters / s.total_sample_units - 0.001
     or last_m > unit * s.length_meters / s.total_sample_units + 0.001 then
    raise exception 'Starts at and Ends at must stay inside SU% (% – % m)', unit,
      round((unit - 1) * s.length_meters / s.total_sample_units, 2), round(unit * s.length_meters / s.total_sample_units, 2);
  end if;
  if s.width_meters is null or (last_m - first_m) * s.width_meters not between 135 and 315 then
    raise exception 'Additional unit area must be 135–315 m² (§2.1.7)';
  end if;
  if reason is null then
    raise exception 'A reason is required for an additional sample unit';
  end if;
  -- Follow the round's current encoder, if one is assigned.
  select assigned_to into inspector from public.sample_units
    where section_id = target and survey_round = cur and assigned_to is not null order by unit_number limit 1;
  insert into public.sample_units(
    section_id, unit_number, area_sqm, start_m, end_m,
    sample_type, workflow_state, assigned_to, reviewer_id, created_by, inspection_notes, survey_round
  ) values (
    target, unit, (last_m - first_m) * s.width_meters, first_m, last_m,
    'additional', 'planned', inspector, auth.uid(), auth.uid(),
    concat_ws(E'\n', 'Reason: ' || reason, 'Note: ' || note), cur
  );
  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'additional_sample', target, payload || jsonb_build_object('round', cur));
end $$;

-- Plan the next round once every unit of the current round is published.
-- payload: { method: 'all'|'confidence'|'reduced', first?: integer }
create or replace function lakad_private.start_survey_round(target uuid, payload jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  s public.sections;
  method text := payload->>'method';
  first_unit integer := nullif(payload->>'first', '')::integer;
  cur integer; next_round integer; n integer; required integer; interval_size integer;
  progress jsonb; stats jsonb; deviation numeric; chosen integer[];
begin
  if lakad_private.role() is distinct from 'reviewer' or not lakad_private.can_read_section(target) then
    raise exception 'Only the Civil Engineer of this section can plan its next survey round';
  end if;
  select * into s from public.sections where id = target for update;
  if s.id is null or s.homogeneous_confirmed_by is null or s.total_sample_units is null or s.length_meters is null then
    raise exception 'Confirm the round-1 sampling plan first';
  end if;
  cur := lakad_private.current_survey_round(target);
  progress := lakad_private.round_progress(target, cur);
  if (progress->>'units')::integer = 0 or (progress->>'published')::integer < (progress->>'units')::integer then
    raise exception 'Publish every sample unit of round % first (% of % published)', cur, progress->>'published', progress->>'units';
  end if;
  if method is null or method not in ('all', 'confidence', 'reduced') then
    raise exception 'Choose a sampling option';
  end if;
  n := s.total_sample_units;
  stats := lakad_private.round_pci_stats(target, cur);
  deviation := (stats->>'deviation')::numeric;
  if method = 'confidence' and deviation is null then
    raise exception 'Option 2 needs the PCI of at least two random sample units from round % to measure s (§7.5.2.1 Eq. 2)', cur;
  end if;
  required := lakad_private.required_sample_units_with(method, n, deviation);
  interval_size := floor(n::numeric / required);
  if method = 'all' then
    first_unit := 1;
  elsif first_unit is null then
    first_unit := floor(random() * interval_size)::integer + 1;
  elsif first_unit not between 1 and interval_size then
    raise exception 'Starting sample unit must be between 1 and the sampling interval %', interval_size;
  end if;
  select array_agg(i order by i) into chosen from generate_series(first_unit, n, interval_size) i;
  next_round := cur + 1;

  insert into public.section_survey_rounds(section_id, round_number, sampling_method, total_sample_units, required_sample_units,
    sampling_interval, sampling_start_unit, standard_deviation, previous_sample_count, confirmed_by)
  values (target, next_round, method, n, required, interval_size, first_unit,
    case when method = 'confidence' then deviation end, (stats->>'count')::integer, auth.uid());

  insert into public.sample_units(
    section_id, unit_number, area_sqm, start_m, end_m,
    sample_type, workflow_state, reviewer_id, created_by, survey_round
  )
  select target, i, s.area_sqm / n,
    (i - 1) * s.length_meters / n, i * s.length_meters / n,
    'random', 'planned', auth.uid(), auth.uid(), next_round
  from unnest(chosen) i;

  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'survey_round_started', target,
            jsonb_build_object('round', next_round, 'method', method, 'total', n, 'required', required,
                               'interval', interval_size, 'first', first_unit, 'deviation', deviation, 'selected', chosen));
  return next_round;
end $$;

-- What the Road Network section page needs for its Round 2 tab.
create or replace function public.lakad_survey_rounds(target uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r text := lakad_private.role(); cur integer; progress jsonb; stats jsonb;
begin
  if r is null or r not in ('reviewer', 'admin') or not lakad_private.can_read_section(target) then
    raise exception 'Only the Civil Engineer of this section can view its survey rounds';
  end if;
  cur := lakad_private.current_survey_round(target);
  progress := lakad_private.round_progress(target, cur);
  stats := lakad_private.round_pci_stats(target, cur);
  return jsonb_build_object(
    'current_round', cur,
    'units', (progress->>'units')::integer,
    'published', (progress->>'published')::integer,
    'ready', (progress->>'units')::integer > 0 and (progress->>'published')::integer = (progress->>'units')::integer,
    'random_count', (stats->>'count')::integer,
    'mean', stats->'mean',
    'deviation', stats->'deviation',
    'rounds', coalesce((select jsonb_agg(jsonb_build_object(
        'round', x.round_number, 'method', x.sampling_method, 'total', x.total_sample_units, 'required', x.required_sample_units,
        'interval', x.sampling_interval, 'first', x.sampling_start_unit, 'deviation', x.standard_deviation,
        'previous_count', x.previous_sample_count, 'confirmed_at', x.confirmed_at) order by x.round_number)
      from public.section_survey_rounds x where x.section_id = target), '[]'::jsonb));
end $$;

create or replace function public.lakad_start_survey_round(target uuid, payload jsonb) returns integer
language sql security definer set search_path = '' as $$
  select lakad_private.start_survey_round(target, payload);
$$;

-- Section PCI publication: the unpublished check covers only the current round.
do $patch$
declare body text; patched text;
begin
  body := pg_get_functiondef('public.lakad_publish_section_result(uuid)'::regprocedure);
  if position('survey_round' in body) = 0 then
    patched := replace(body, $$where u.section_id=target and a.is_current and a.published_at is null$$,
      $$where u.section_id=target and u.survey_round=lakad_private.current_survey_round(target) and a.is_current and a.published_at is null$$);
    if patched = body then raise exception 'Section publication check not found; review lakad_publish_section_result before applying'; end if;
    execute patched;
  end if;
end $patch$;

revoke all on function
  lakad_private.current_survey_round(uuid),
  lakad_private.round_pci_stats(uuid, integer),
  lakad_private.required_sample_units_with(text, integer, numeric),
  lakad_private.round_progress(uuid, integer),
  lakad_private.section_result_round(),
  lakad_private.start_survey_round(uuid, jsonb)
from public, anon, authenticated;
revoke all on function public.lakad_survey_rounds(uuid), public.lakad_start_survey_round(uuid, jsonb) from public, anon;
grant execute on function public.lakad_survey_rounds(uuid), public.lakad_start_survey_round(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
