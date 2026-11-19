import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { randomBytes } from 'crypto';
import { compressImage, MAX_EDGE } from '../src/utils/image-compress';

// A noisy picture, so it does not compress to nothing on its own.
async function photo(w: number, h: number, format: 'jpeg' | 'png' = 'jpeg') {
  const raw = randomBytes(w * h * 3);
  const img = sharp(raw, { raw: { width: w, height: h, channels: 3 } });
  return format === 'jpeg' ? img.jpeg({ quality: 98 }).withMetadata({ exif: { IFD0: { Make: 'TestPhone' } } }).toBuffer() : img.png().toBuffer();
}

test('a large phone photo is shrunk to the size limit, much smaller, and stays a valid JPEG', async () => {
  const big = await photo(3000, 4000);
  const r = await compressImage(big, 'image/jpeg');
  assert.ok(r.body.length < big.length / 2, `${big.length} -> ${r.body.length}`);
  const m = await sharp(r.body).metadata();
  assert.equal(Math.max(m.width!, m.height!), MAX_EDGE);
  assert.equal(m.format, 'jpeg');
  assert.equal(r.contentType, 'image/jpeg');
  assert.equal(m.exif, undefined, 'device details and location are removed');
  assert.equal(r.saved, big.length - r.body.length);
});

test('a PNG becomes a smaller JPEG and the content type follows', async () => {
  const png = await photo(1500, 1500, 'png');
  const r = await compressImage(png, 'image/png');
  assert.equal(r.contentType, 'image/jpeg');
  assert.ok(r.body.length < png.length);
});

test('small files, non-images and broken images are returned untouched', async () => {
  const small = await photo(200, 200);
  assert.equal((await compressImage(small, 'image/jpeg')).body, small);
  const video = Buffer.alloc(500_000, 1);
  assert.equal((await compressImage(video, 'video/webm')).body, video);
  const junk = Buffer.alloc(300_000, 7);
  const r = await compressImage(junk, 'image/jpeg');
  assert.equal(r.body, junk); assert.equal(r.saved, 0);
});

test('it never makes a file bigger', async () => {
  const already = await sharp(await photo(1200, 1200)).jpeg({ quality: 20 }).toBuffer();
  const r = await compressImage(already.length >= 200 * 1024 ? already : Buffer.concat([already, Buffer.alloc(200 * 1024)]), 'image/jpeg');
  assert.ok(r.body.length <= already.length + 200 * 1024);
});
