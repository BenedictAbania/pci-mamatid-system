-- Assign Encoder: all planned units or only the units the reviewer ticks,
-- and each encoder's current workload for the picker.
begin;

-- payload: { inspector: uuid, units?: integer[] }  (units omitted or null = every planned unit)
create or replace function lakad_private.assign_section_encoder(target uuid, payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
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

-- Open assignments per active encoder (units not yet approved or published).
create or replace function lakad_private.encoder_workload()
returns table(encoder_id uuid, sections integer, units integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if lakad_private.role() is distinct from 'reviewer' and lakad_private.role() is distinct from 'admin' then
    raise exception 'Only a Reviewer can view encoder workload';
  end if;
  return query
    select p.id,
      count(distinct u.section_id)::integer,
      count(u.id)::integer
    from public.profiles p
    left join public.sample_units u
      on u.assigned_to = p.id and u.workflow_state not in ('approved', 'published')
    where p.role = 'encoder' and p.is_active
    group by p.id;
end $$;

create or replace function public.lakad_encoder_workload()
returns table(encoder_id uuid, sections integer, units integer)
language sql stable security definer set search_path = '' as $$
  select * from lakad_private.encoder_workload();
$$;

revoke all on function lakad_private.encoder_workload() from public, anon, authenticated;
revoke all on function lakad_private.assign_section_encoder(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.lakad_encoder_workload() from public, anon;
grant execute on function public.lakad_encoder_workload() to authenticated;

commit;
