/** Matches the private sample-unit-photos bucket contract. */
export const PHOTO_MAX_BYTES = 5_242_880;
export const PHOTO_SIZE_MESSAGE = 'Choose a JPEG, PNG or WebP photograph up to 5 MiB (5,242,880 bytes).';

export function validatePhotoSize(size: number): void {
  if (!Number.isInteger(size) || size <= 0 || size > PHOTO_MAX_BYTES) {
    throw new Error(PHOTO_SIZE_MESSAGE);
  }
}

/** JPEG, PNG or WebP from the file's first bytes; null for anything else. */
export function detectImageType(bytes: ArrayBuffer) {
  const head = new Uint8Array(bytes.slice(0, 12));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { type: 'image/jpeg', extension: 'jpg' };
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return { type: 'image/png', extension: 'png' };
  if (String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'WEBP') return { type: 'image/webp', extension: 'webp' };
  return null;
}
