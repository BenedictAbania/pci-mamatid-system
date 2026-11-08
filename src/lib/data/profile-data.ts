import { supabase } from '@/lib/data/supabase';
import { compressImage, PROFILE_PHOTO_COMPRESSION } from '@/lib/utils/compress-image';
import { detectImageType } from '@/lib/utils/inspection-photo';

/** Private bucket for profile photos, named <user id>/<file> (supabase/migrations/20261108160000_own_profile.sql). */
export const PROFILE_PHOTO_BUCKET = 'profile-photos';
export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_PHOTO_MESSAGE = 'Choose a JPEG, PNG or WebP photo up to 2 MB.';
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Changes the signed-in person's password. The current password is confirmed first by signing in
 * again with it, so an unattended open session cannot be used to take over the account.
 */
export async function changeOwnPassword(email: string, currentPassword: string, newPassword: string) {
  const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (checkError) {
    throw new Error(checkError.message.toLowerCase().includes('invalid login credentials') ? 'Your current password is incorrect.' : checkError.message);
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

const signed = new Map<string, { url: string; expires: number }>();

/** Short-lived link to a profile photo; reused until shortly before it expires. */
export async function profilePhotoUrl(path: string) {
  const cached = signed.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(PROFILE_PHOTO_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'The profile photo could not be loaded.');
  signed.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}


export type OwnProfileChanges = {
  userId: string;
  fullName: string;
  office: string;
  jobTitle: string;
  /** The photo saved now, if any. */
  currentPath: string | null;
  /** A newly chosen local photo, 'remove' to clear it, or null to keep the current one. */
  photo: { uri: string } | 'remove' | null;
};

/** Uploads a new photo when chosen, saves the profile, then deletes the replaced photo file. */
export async function saveOwnProfile(changes: OwnProfileChanges) {
  let nextPath = changes.photo === 'remove' ? null : changes.currentPath;
  let uploaded: string | null = null;
  if (changes.photo && changes.photo !== 'remove') {
    // Shrink on the device first; the 2 MB limit applies to the compressed bytes.
    const bytes = await (await fetch(await compressImage(changes.photo.uri, PROFILE_PHOTO_COMPRESSION))).arrayBuffer();
    const kind = detectImageType(bytes);
    if (!kind || bytes.byteLength > PROFILE_PHOTO_MAX_BYTES) throw new Error(PROFILE_PHOTO_MESSAGE);
    uploaded = `${changes.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${kind.extension}`;
    const { error } = await supabase.storage.from(PROFILE_PHOTO_BUCKET).upload(uploaded, bytes, { contentType: kind.type, upsert: false });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
    nextPath = uploaded;
  }
  const { error } = await supabase.rpc('lakad_update_own_profile', {
    new_full_name: changes.fullName, new_office: changes.office, new_job_title: changes.jobTitle, new_avatar_path: nextPath,
  });
  if (error) {
    if (uploaded) await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([uploaded]);
    throw new Error(error.message);
  }
  // The old file is no longer in use; a failed cleanup leaves only an unused file behind.
  if (changes.currentPath && changes.currentPath !== nextPath) await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([changes.currentPath]);
}
