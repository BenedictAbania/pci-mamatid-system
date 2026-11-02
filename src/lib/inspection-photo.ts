/** Matches the private sample-unit-photos bucket contract. */
export const PHOTO_MAX_BYTES = 5_242_880;
export const PHOTO_SIZE_MESSAGE = 'Choose a JPEG, PNG or WebP photograph up to 5 MiB (5,242,880 bytes).';

export function validatePhotoSize(size: number): void {
  if (!Number.isInteger(size) || size <= 0 || size > PHOTO_MAX_BYTES) {
    throw new Error(PHOTO_SIZE_MESSAGE);
  }
}
