-- ASTM D6433-07 deduct-curve figures for the admin Reference Data page (decided 2026-11-08).
-- The figures come from the licensed standard, so they stay out of the app bundle and git:
-- they live in the private 'astm-figures' bucket as d6433-07/X3_01.png … X3_26.png and only
-- administrators may read them (through short-lived signed links). Uploads use the service role.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('astm-figures', 'astm-figures', false, 1048576, array['image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/png'];

drop policy if exists lakad_astm_figure_read on storage.objects;
create policy lakad_astm_figure_read on storage.objects
  for select to authenticated
  using (bucket_id = 'astm-figures' and (select lakad_private.role()) = 'admin');

commit;
