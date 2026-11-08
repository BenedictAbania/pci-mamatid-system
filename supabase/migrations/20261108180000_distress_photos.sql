-- Photos per distress (decided 2026-11-08). distress_photos.distress_record_id already exists
-- (on delete set null); the inspection 'photo' action now fills it, and approved report snapshots
-- keep it so reports can show each photo under its distress. Photos without it stay "general".
begin;
do $patch$
declare body text; patched text;
begin
  body := pg_get_functiondef('lakad_private.inspection_action_before_revisions(uuid,text,jsonb)'::regprocedure);
  if position('distress_record_id' in body) = 0 then
    -- Whitespace-insensitive: pasting into the SQL Editor can change line breaks and indentation.
    patched := regexp_replace(body,
      $re$insert\s+into\s+public\.distress_photos\s*\(\s*sample_unit_id,\s*photo_path,\s*caption,\s*uploaded_by\s*\)\s+values\s*\(\s*target,\s*payload->>'path',\s*payload->>'caption',\s*actor\s*\);$re$,
      $$if nullif(payload->>'distress_record_id', '') is not null and not exists(
             select 1 from public.distress_records
             where id = (payload->>'distress_record_id')::uuid and sample_unit_id = target) then
          raise exception 'Distress record not found in this sample unit';
        end if;
        insert into public.distress_photos(sample_unit_id, photo_path, caption, uploaded_by, distress_record_id)
          values (target, payload->>'path', payload->>'caption', actor, nullif(payload->>'distress_record_id', '')::uuid);$$);
    if patched = body then raise exception 'Photo insert not found; review inspection_action_before_revisions before applying'; end if;
    execute patched;
  end if;

  body := pg_get_functiondef('lakad_private.report_snapshot(public.inspection_computations)'::regprocedure);
  if position('distress_record_id' in body) = 0 then
    patched := regexp_replace(body, $re$'caption',\s*p->'caption'\s*\)$re$, $$'caption',p->'caption','distress_record_id',p->'distress_record_id')$$);
    if patched = body then raise exception 'Report snapshot photo list not found; review report_snapshot before applying'; end if;
    execute patched;
  end if;
end $patch$;
notify pgrst, 'reload schema';
commit;
