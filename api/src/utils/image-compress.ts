import sharp from 'sharp';
import logger from './logger';

/**
 * Makes a stored photo smaller without hurting what is done with it later (face match, ID reading, review).
 *  - the long edge is limited to MAX_EDGE pixels (never enlarged); phone photos are 3000-4000
 *  - re-encoded as JPEG at quality 85 (visually the same for faces and printed text)
 *  - rotated upright, and EXIF data (including GPS location and device details) is removed
 * It only ever makes things smaller: if the result is not smaller, or anything goes wrong, the original is kept.
 * Photos already under SKIP_BELOW bytes (such as liveness frames) are left alone.
 */
export const MAX_EDGE = 2000;
export const QUALITY = 85;
export const SKIP_BELOW = 200 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export const isCompressible = (contentType: string) => IMAGE_TYPES.has(contentType.toLowerCase());

export async function compressImage(body: Buffer, contentType: string): Promise<{ body: Buffer; contentType: string; saved: number }> {
  const original = { body, contentType, saved: 0 };
  if (!isCompressible(contentType) || body.length < SKIP_BELOW) return original;
  try {
    const out = await sharp(body, { failOn: 'error' })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
    if (out.length >= body.length) return original;
    return { body: out, contentType: 'image/jpeg', saved: body.length - out.length };
  } catch (err) {
    logger.warn('Image compression skipped, storing the original', { error: (err as Error).message });
    return original;
  }
}
