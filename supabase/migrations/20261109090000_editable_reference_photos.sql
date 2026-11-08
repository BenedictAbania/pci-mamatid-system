-- Reference Data: administrators can change the reference photo of each severity level.
-- * distress_types.severity_photos: per slot (low, medium, high, or single for a one-photo distress),
--   the path of an administrator-uploaded photo, or null for "no photo". A slot that is not listed
--   shows the ASTM D6433-07 Appendix X1 photo at d6433-07/severity/..., which is never overwritten,
--   so restoring the ASTM photo only removes the slot from this object.
-- * Administrators may upload, replace and delete files under custom/ in the private 'astm-figures'
--   bucket. The ASTM curve figures and photos stay read-only.
-- * The save function validates the paths and records photo changes in the History audit detail.

alter table public.distress_types
  add column if not exists severity_photos jsonb not null default '{}'::jsonb;

alter table public.distress_types drop constraint if exists distress_types_severity_photos_shape;
alter table public.distress_types add constraint distress_types_severity_photos_shape check (
  jsonb_typeof(severity_photos) = 'object'
  and not (severity_photos - array['low','medium','high','single']) <> '{}'::jsonb
);

comment on column public.distress_types.severity_photos is
  'Reference photo per slot: custom/... path uploaded by an administrator, or null for none. Missing slot = ASTM photo.';

drop policy if exists lakad_reference_photo_insert on storage.objects;
create policy lakad_reference_photo_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'astm-figures' and name like 'custom/%' and (select lakad_private.role()) = 'admin');

drop policy if exists lakad_reference_photo_update on storage.objects;
create policy lakad_reference_photo_update on storage.objects
  for update to authenticated
  using (bucket_id = 'astm-figures' and name like 'custom/%' and (select lakad_private.role()) = 'admin')
  with check (bucket_id = 'astm-figures' and name like 'custom/%' and (select lakad_private.role()) = 'admin');

drop policy if exists lakad_reference_photo_delete on storage.objects;
create policy lakad_reference_photo_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'astm-figures' and name like 'custom/%' and (select lakad_private.role()) = 'admin');

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
  photos jsonb := '{}'::jsonb;
  slot text;
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

  -- Reference photos: per slot, an administrator-uploaded file under custom/ or null (no photo).
  -- A slot that is left out keeps showing the ASTM photo.
  if payload ? 'severity_photos' then
    if jsonb_typeof(payload->'severity_photos') is distinct from 'object' then
      raise exception 'Reference photos must be an object';
    end if;
    for slot in select jsonb_object_keys(payload->'severity_photos') loop
      if slot not in ('low','medium','high','single') then
        raise exception 'Unknown reference photo slot';
      end if;
      if jsonb_typeof(payload->'severity_photos'->slot) <> 'null'
         and coalesce(payload->'severity_photos'->>slot, '') !~ ('^custom/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' || slot || '-[0-9]{10,16}\.(jpg|png)$') then
        raise exception 'Invalid reference photo file';
      end if;
      photos := photos || jsonb_build_object(slot, payload->'severity_photos'->slot);
    end loop;
  end if;

  if target is null then
    insert into public.distress_types(
      code, name, description, default_unit_of_measure,
      is_active, severity_required, allowed_severities, severity_descriptions, severity_photos
    ) values (
      upper(btrim(payload->>'code')), btrim(payload->>'name'),
      nullif(btrim(payload->>'description'),''),
      payload->>'default_unit_of_measure',
      coalesce((payload->>'is_active')::boolean, true),
      severity_req, allowed, descriptions, photos
    ) returning id into changed;
  else
    select jsonb_build_object('code', code, 'name', name, 'description', description,
             'default_unit_of_measure', default_unit_of_measure, 'is_active', is_active,
             'severity_required', severity_required, 'allowed_severities', to_jsonb(allowed_severities),
             'severity_descriptions', severity_descriptions, 'severity_photos', severity_photos)
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
      -- Older clients send no photos: keep the saved choices.
      severity_photos = case when payload ? 'severity_photos' then photos else severity_photos end,
      updated_at = now()
    where id = target returning id into changed;
    if changed is null then raise exception 'Distress type not found'; end if;
  end if;

  select jsonb_build_object('code', code, 'name', name, 'description', description,
           'default_unit_of_measure', default_unit_of_measure, 'is_active', is_active,
           'severity_required', severity_required, 'allowed_severities', to_jsonb(allowed_severities),
           'severity_descriptions', severity_descriptions, 'severity_photos', severity_photos)
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
