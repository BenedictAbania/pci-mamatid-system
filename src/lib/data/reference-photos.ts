import { supabase } from '@/lib/data/supabase';
import { compressImage, type CompressionPreset } from '@/lib/utils/compress-image';
import { detectImageType } from '@/lib/utils/inspection-photo';

/**
 * Reference photos shown in Reference Data > Distress Types (View criteria and the editor).
 *
 * All photos live in the private 'astm-figures' bucket (admin read only, signed links):
 * - The ASTM D6433-07 Appendix X1 photos stay at d6433-07/severity/<code>-<level>.jpg (or <code>.jpg for a
 *   single photo). They are never overwritten, so "Restore ASTM photo" always works.
 * - Photos an administrator uploads go to custom/<folder>/<slot>-<timestamp>.jpg.
 * distress_types.severity_photos records the changes per slot: a custom path, or null when the photo was
 * removed. A slot that is not listed shows the ASTM photo (supabase/migrations/20261109090000_editable_reference_photos.sql).
 */
export const REFERENCE_PHOTO_BUCKET = 'astm-figures';
/** Shown at about 200 px and enlarged up to about 800 px. */
export const REFERENCE_PHOTO_COMPRESSION: CompressionPreset = { maxSize: 1000, quality: 0.72 };
/** The bucket's own file limit. */
export const REFERENCE_PHOTO_MAX_BYTES = 1024 * 1024;
export const REFERENCE_PHOTO_MESSAGE = 'Choose a JPEG or PNG photo. After compression it must be 1 MB or smaller.';

export type PhotoLevel = 'low' | 'medium' | 'high';
export type PhotoSlotKey = PhotoLevel | 'single';
/** Saved per-slot changes: a custom path, or null for "no photo". Missing slot = ASTM photo. */
export type SeverityPhotos = Partial<Record<PhotoSlotKey, string | null>>;
export type PhotoSlot = { key: PhotoSlotKey; level: PhotoLevel | null; label: string; astmPath: string | null };
type TypeLike = { astm_edition?: string | null; astm_code?: number | null; severity_photos?: SeverityPhotos | null };

const LEVEL_NAMES: Record<PhotoLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' };
/** Codes whose Appendix X1 shows one photo for the whole distress, not one per severity. */
const SINGLE_PHOTO: Record<number, string> = { 12: 'No severity levels', 18: 'Severity is rated by ride quality' };
/** Appendix X1 has no example photo for Joint Reflection Cracking. */
const NO_ASTM_PHOTO = new Set([8]);

/** The photo slots of a distress type: one per allowed severity, or one for the whole distress. */
export function photoSlots(type: TypeLike, levels: readonly PhotoLevel[]): PhotoSlot[] {
  const astm = type.astm_edition === 'ASTM D6433-07' && type.astm_code != null && !NO_ASTM_PHOTO.has(type.astm_code) ? String(type.astm_code).padStart(2, '0') : null;
  const singleLabel = type.astm_code != null ? SINGLE_PHOTO[type.astm_code] : undefined;
  if (singleLabel || !levels.length) {
    return [{ key: 'single', level: null, label: singleLabel ?? 'Reference photo', astmPath: astm && singleLabel ? `d6433-07/severity/${astm}.jpg` : null }];
  }
  return levels.map((level) => ({ key: level, level, label: LEVEL_NAMES[level], astmPath: astm ? `d6433-07/severity/${astm}-${level}.jpg` : null }));
}

/** The file a slot shows now: the administrator's photo, nothing (removed), or the ASTM photo. */
export function slotPath(slot: PhotoSlot, photos: SeverityPhotos | null | undefined): string | null {
  if (photos && Object.prototype.hasOwnProperty.call(photos, slot.key)) return photos[slot.key] ?? null;
  return slot.astmPath;
}

/** Compresses a picked photo and uploads it as a new file; returns its storage path. */
export async function uploadReferencePhoto(uri: string, folder: string, slot: PhotoSlotKey) {
  const bytes = await (await fetch(await compressImage(uri, REFERENCE_PHOTO_COMPRESSION))).arrayBuffer();
  const kind = detectImageType(bytes);
  if (!kind || (kind.type !== 'image/jpeg' && kind.type !== 'image/png') || bytes.byteLength > REFERENCE_PHOTO_MAX_BYTES) throw new Error(REFERENCE_PHOTO_MESSAGE);
  const path = `custom/${folder}/${slot}-${Date.now()}.${kind.extension}`;
  const { error } = await supabase.storage.from(REFERENCE_PHOTO_BUCKET).upload(path, bytes, { contentType: kind.type, upsert: false });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return path;
}

/** Deletes administrator-uploaded files. ASTM photos are never deleted. A failed cleanup only leaves an unused file. */
export async function removeReferencePhotos(paths: (string | null | undefined)[]) {
  const custom = paths.filter((path): path is string => !!path && path.startsWith('custom/'));
  if (custom.length) await supabase.storage.from(REFERENCE_PHOTO_BUCKET).remove(custom);
}

/** A random folder name in UUID form (the server checks the path shape). */
export function newPhotoFolder() {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
