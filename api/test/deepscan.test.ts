process.env.AWS_ACCESS_KEY_ID ??= 'x'; process.env.AWS_SECRET_ACCESS_KEY ??= 'x'; process.env.S3_BUCKET_NAME ??= 'x';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../src/db';
import { scanImage, rekognitionEnabled } from '../src/services/orbitshield/deepscan.service';

// A storage key in the environment must NOT switch on the paid image service by itself.
test('the paid cloud layer is off unless DEEPSCAN_REKOGNITION=true', async () => {
  delete process.env.DEEPSCAN_REKOGNITION;
  assert.equal(rekognitionEnabled(), false);
  process.env.DEEPSCAN_REKOGNITION = 'false'; assert.equal(rekognitionEnabled(), false);
  process.env.DEEPSCAN_REKOGNITION = 'TRUE'; assert.equal(rekognitionEnabled(), false, 'only the exact word true counts');
  process.env.DEEPSCAN_REKOGNITION = 'true'; assert.equal(rekognitionEnabled(), true);
  delete process.env.DEEPSCAN_REKOGNITION;
});

test('with an AWS key present but the layer off, a scan uses only the free internal checks and makes no cloud call', async () => {
  delete process.env.DEEPSCAN_REKOGNITION;
  process.env.AWS_ACCESS_KEY_ID = 'AKIA-FAKE-FOR-TEST';
  // if the cloud call were attempted it would fail and the result would carry rekognition_error
  const jpegLike = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.alloc(60_000, 7)]);
  const r = await scanImage(jpegLike, 'selfie');
  assert.equal(r.signals.rekognition_error, undefined, 'the cloud service was not called');
  assert.equal(r.signals.face_detected, undefined, 'no cloud face analysis happened');
  assert.ok(['clear', 'suspicious', 'rejected'].includes(r.verdict));
});

test.after(async () => { try { await (db as any).default.end(); } catch { /* ignore */ } });
