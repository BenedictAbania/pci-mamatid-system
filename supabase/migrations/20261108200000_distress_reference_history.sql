-- Reference Data: editable severity descriptions, and a History that records what each save changed.
-- 1. distress_types.severity_descriptions holds the administrator's wording for each severity
--    level ({"low": "...", "medium": "...", "high": "..."}). Empty object = use the built-in
--    provisional D6433-07 field cue. Text is limited to 600 characters, the same limit the
--    measurement snapshot (severity_guidance.text) accepts.
-- 2. Saving a distress type also records its values before and after in the audit detail,
--    so the History tab can list each changed field. detail.code and detail.active stay for
--    older readers.

alter table public.distress_types
  add column if not exists severity_descriptions jsonb not null default '{}'::jsonb;

alter table public.distress_types drop constraint if exists distress_types_severity_descriptions_shape;
alter table public.distress_types add constraint distress_types_severity_descriptions_shape check (
  jsonb_typeof(severity_descriptions) = 'object'
  and not (severity_descriptions - array['low','medium','high']) <> '{}'::jsonb
);

comment on column public.distress_types.severity_descriptions is
  'Administrator wording per severity level; overrides the built-in provisional D6433-07 cue. Max 600 characters each.';

create or replace function lakad_private.save_distress_type(target uuid, payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  changed uuid;
  severity_req boolean := coalesce((payload->>'severity_required')::boolean, true);
  allowed public.distress_severity[];
  before_row jsonb;
  after_row jsonb;
  descriptions jsonb := '{}'::jsonb;
  level text;
  wording text;
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

  -- Severity descriptions: only for allowed levels; blank means "use the built-in cue".
  if payload ? 'severity_descriptions' and jsonb_typeof(payload->'severity_descriptions') is distinct from 'object' then
    raise exception 'Severity descriptions must be an object';
  end if;
  foreach level in array array['low','medium','high'] loop
    wording := nullif(btrim(payload->'severity_descriptions'->>level), '');
    if wording is not null then
      if not (level::public.distress_severity = any (allowed)) then
        raise exception 'A description was given for a severity level this type does not use';
      end if;
      if length(wording) > 600 then
        raise exception 'Each severity description must be 600 characters or fewer';
      end if;
      descriptions := descriptions || jsonb_build_object(level, wording);
    end if;
  end loop;

  if target is null then
    insert into public.distress_types(
      code, name, description, default_unit_of_measure,
      is_active, severity_required, allowed_severities, severity_descriptions
    ) values (
      upper(btrim(payload->>'code')), btrim(payload->>'name'),
      nullif(btrim(payload->>'description'),''),
      payload->>'default_unit_of_measure',
      coalesce((payload->>'is_active')::boolean, true),
      severity_req, allowed, descriptions
    ) returning id into changed;
  else
    select jsonb_build_object('code', code, 'name', name, 'description', description,
             'default_unit_of_measure', default_unit_of_measure, 'is_active', is_active,
             'severity_required', severity_required, 'allowed_severities', to_jsonb(allowed_severities),
             'severity_descriptions', severity_descriptions)
      into before_row
      from public.distress_types where id = target;
    update public.distress_types set
      code = upper(btrim(payload->>'code')),
      name = btrim(payload->>'name'),
      description = nullif(btrim(payload->>'description'),''),
      default_unit_of_measure = payload->>'default_unit_of_measure',
      is_active = coalesce((payload->>'is_active')::boolean, is_active),
      severity_required = severity_req,
      allowed_severities = allowed,
      -- Older clients send no descriptions: keep the saved ones (minus levels no longer allowed).
      severity_descriptions = case when payload ? 'severity_descriptions' then descriptions
        else (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
              from jsonb_each(severity_descriptions) where key::public.distress_severity = any (allowed)) end,
      updated_at = now()
    where id = target returning id into changed;
    if changed is null then raise exception 'Distress type not found'; end if;
  end if;

  select jsonb_build_object('code', code, 'name', name, 'description', description,
           'default_unit_of_measure', default_unit_of_measure, 'is_active', is_active,
           'severity_required', severity_required, 'allowed_severities', to_jsonb(allowed_severities),
           'severity_descriptions', severity_descriptions)
    into after_row
    from public.distress_types where id = changed;

  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (auth.uid(), 'distress_reference_saved', changed,
            jsonb_build_object('code', after_row->>'code',
                               'active', (after_row->>'is_active')::boolean,
                               'name', after_row->>'name',
                               'created', target is null,
                               'before', before_row,
                               'after', after_row));
  return changed;
end $function$;
