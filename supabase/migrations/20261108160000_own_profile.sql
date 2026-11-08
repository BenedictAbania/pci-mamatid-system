-- My Profile (decided 2026-11-08): every signed-in user may edit their own name, office,
-- job title and profile photo. Role, active status and email stay with the administrator.
-- Photos live in the private 'profile-photos' bucket under <user id>/<file>. They are readable
-- by the owner and by the roles that can already read profiles (admin, reviewer).
begin;

alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles drop constraint if exists profiles_avatar_path_owner;
alter table public.profiles add constraint profiles_avatar_path_owner
  check (avatar_path is null or (char_length(avatar_path) <= 200 and split_part(avatar_path, '/', 1) = id::text));
comment on column public.profiles.avatar_path is 'Profile photo in storage bucket profile-photos, named <user id>/<file>.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists lakad_profile_photo_read on storage.objects;
drop policy if exists lakad_profile_photo_insert on storage.objects;
drop policy if exists lakad_profile_photo_delete on storage.objects;
create policy lakad_profile_photo_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (split_part(name, '/', 1) = (select auth.uid())::text
         or (select lakad_private.role()) in ('admin', 'reviewer'))
  );
create policy lakad_profile_photo_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-photos' and split_part(name, '/', 1) = (select auth.uid())::text);
-- The photo in use cannot be deleted; replace it first, then delete the old file.
create policy lakad_profile_photo_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and not exists(select 1 from public.profiles p where p.avatar_path = name)
  );

create or replace function public.lakad_update_own_profile(
  new_full_name text, new_office text, new_job_title text, new_avatar_path text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  clean_name text := btrim(coalesce(new_full_name, ''));
  clean_office text := btrim(coalesce(new_office, ''));
  clean_title text := btrim(coalesce(new_job_title, ''));
  clean_avatar text := nullif(btrim(coalesce(new_avatar_path, '')), '');
begin
  if me is null or lakad_private.role() is null then raise exception 'Active account required'; end if;
  if clean_name = '' or char_length(clean_name) > 150 then raise exception 'Full name required (150 characters or fewer)'; end if;
  if char_length(clean_office) > 150 then raise exception 'Office or department must be 150 characters or fewer'; end if;
  if char_length(clean_title) > 150 then raise exception 'Position or job title must be 150 characters or fewer'; end if;
  if clean_avatar is not null then
    if clean_avatar !~ ('^' || me::text || '/[A-Za-z0-9._-]{1,120}\.(jpg|jpeg|png|webp)$') then
      raise exception 'Profile photo must be a JPEG, PNG or WebP file in your own folder';
    end if;
    if not exists(select 1 from storage.objects where bucket_id = 'profile-photos' and name = clean_avatar) then
      raise exception 'Upload the profile photo before saving';
    end if;
  end if;

  update public.profiles
    set full_name = clean_name, office = clean_office, job_title = clean_title, avatar_path = clean_avatar, updated_at = now()
    where id = me;

  insert into public.lakad_audit(actor_id, action, target_id, detail)
    values (me, 'profile_self_edited', me, jsonb_build_object(
      'full_name', clean_name, 'office', clean_office, 'job_title', clean_title, 'photo', clean_avatar is not null));
end $$;

revoke all on function public.lakad_update_own_profile(text, text, text, text) from public, anon;
grant execute on function public.lakad_update_own_profile(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
