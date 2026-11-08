import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest side in pixels and JPEG quality (0–1) for one kind of upload. */
export type CompressionPreset = { maxSize: number; quality: number };

/** Inspection evidence: enough detail to read cracks and patches, a fraction of a camera original. */
export const INSPECTION_PHOTO_COMPRESSION: CompressionPreset = { maxSize: 1600, quality: 0.72 };
/** Profile pictures are shown small, so they are kept small. */
export const PROFILE_PHOTO_COMPRESSION: CompressionPreset = { maxSize: 512, quality: 0.8 };

/**
 * Shrinks a picked photo on the device before upload: scales the longest side down to
 * `maxSize` (never up) and re-encodes it as JPEG. Returns the URI of the compressed copy.
 * If the device cannot process the image, the original URI is returned so the upload still
 * works; the size limits are checked on the bytes that are actually uploaded.
 */
export async function compressImage(uri: string, preset: CompressionPreset) {
  try {
    const original = await ImageManipulator.manipulate(uri).renderAsync();
    const longest = Math.max(original.width, original.height);
    const image = longest > preset.maxSize
      ? await ImageManipulator.manipulate(uri)
        .resize(original.width >= original.height ? { width: preset.maxSize, height: null } : { width: null, height: preset.maxSize })
        .renderAsync()
      : original;
    const saved = await image.saveAsync({ compress: preset.quality, format: SaveFormat.JPEG });
    return saved.uri;
  } catch {
    return uri;
  }
}
