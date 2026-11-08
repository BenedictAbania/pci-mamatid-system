import { supabase } from '@/lib/data/supabase';
import { workflowAction, type Photo, type Sample } from '@/lib/data/workflow-data';
import { compressImage, INSPECTION_PHOTO_COMPRESSION } from '@/lib/utils/compress-image';
import { detectImageType, PHOTO_SIZE_MESSAGE, validatePhotoSize } from '@/lib/utils/inspection-photo';

export const INSPECTION_PHOTO_BUCKET = 'sample-unit-photos';

/**
 * Compresses a picked photo on the device, uploads it to the sample's private folder and records it.
 * With `distressRecordId` the photo belongs to that distress (one type and severity in this sample unit);
 * without it, it is a general photo of the sample unit. The file is removed again if recording fails.
 */
export async function uploadInspectionPhoto(sample: Sample, uri: string, options: { caption: string; distressRecordId?: string | null }) {
  const bytes = await (await fetch(await compressImage(uri, INSPECTION_PHOTO_COMPRESSION))).arrayBuffer();
  const kind = detectImageType(bytes);
  if (!kind) throw new Error(PHOTO_SIZE_MESSAGE);
  validatePhotoSize(bytes.byteLength);
  const path = `${sample.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${kind.extension}`;
  const { error } = await supabase.storage.from(INSPECTION_PHOTO_BUCKET).upload(path, bytes, { contentType: kind.type, upsert: false });
  if (error) throw new Error(`Photograph upload failed: ${error.message}`);
  try {
    await workflowAction(sample, 'photo', { path, caption: options.caption, ...(options.distressRecordId ? { distress_record_id: options.distressRecordId } : {}) });
  } catch (reason) {
    await supabase.storage.from(INSPECTION_PHOTO_BUCKET).remove([path]);
    throw reason;
  }
}

/** Removes the photo record, then its file. */
export async function removeInspectionPhoto(sample: Sample, photo: Pick<Photo, 'id' | 'photo_path'>) {
  await workflowAction(sample, 'remove_photo', { id: photo.id });
  const { error } = await supabase.storage.from(INSPECTION_PHOTO_BUCKET).remove([photo.photo_path]);
  if (error) throw new Error(`The photograph record was removed, but file cleanup failed: ${error.message}. Refresh to continue.`);
}
