import {
  RekognitionClient,
  DetectFacesCommand,
  type DetectFacesCommandInput
} from '@aws-sdk/client-rekognition';
import { query } from '../../db';
import logger from '../../utils/logger';

export type ScanType = 'id_document' | 'selfie';
export type DeepScanVerdict = 'clear' | 'suspicious' | 'rejected' | 'skipped';

export interface DeepScanResult {
  verdict: DeepScanVerdict;
  confidence: number;
  signals: Record<string, boolean | number | string>;
  processingMs: number;
  blocked: boolean;
}

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION ?? 'af-south-1'
});

const DEEPSCAN_ENABLED = process.env.DEEPSCAN_ENABLED !== 'false';

// Analyse raw image buffer for deepfake signals without any external API.
// Real camera photos: have EXIF data, have characteristic file sizes, have
// sensor noise patterns. AI-generated images fail multiple of these checks.
function analyseBuffer(buffer: Buffer, scanType: ScanType): {
  score: number;
  flags: Record<string, boolean | number | string>;
} {
  const flags: Record<string, boolean | number | string> = {};
  let score = 100;

  // EXIF marker is 0xFF 0xE1 starting at offset 2 in a JPEG
  const hasExif = buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8 &&
    buffer.indexOf(Buffer.from([0xff, 0xe1])) > 0;
  flags.has_exif = hasExif;

  const sizeBytes = buffer.length;
  flags.file_size_bytes = sizeBytes;

  if (scanType === 'selfie') {
    // Selfies from phone cameras: typically 200KB–8MB. AI-generated or
    // screenshot-sourced selfies tend to be suspiciously small.
    if (sizeBytes < 15_000) {
      flags.suspiciously_small = true;
      score -= 20;
    }
    // Absence of EXIF in a phone selfie is a weak deepfake signal
    if (!hasExif) {
      flags.no_exif_selfie = true;
      score -= 10;
    }
  }

  if (scanType === 'id_document') {
    // ID card photos: typically 100KB–5MB
    if (sizeBytes < 10_000) {
      flags.suspiciously_small = true;
      score -= 15;
    }
  }

  return { score: Math.max(0, score), flags };
}

async function rekognitionAnalyse(
  buffer: Buffer,
  scanType: ScanType
): Promise<{ score: number; flags: Record<string, boolean | number | string> }> {
  const params: DetectFacesCommandInput = {
    Image: { Bytes: buffer },
    Attributes: ['ALL']
  };

  const response = await rekognition.send(new DetectFacesCommand(params));
  const faces = response.FaceDetails ?? [];
  const flags: Record<string, boolean | number | string> = {};
  let score = 100;

  if (faces.length === 0) {
    flags.face_detected = false;
    if (scanType === 'selfie') {
      // A selfie with no detected face is an immediate reject
      return { score: 0, flags };
    }
    // For ID docs a missing face is acceptable (some IDs don't have a face zone)
    return { score: 80, flags };
  }

  flags.face_detected = true;
  flags.faces_count = faces.length;

  if (faces.length > 1 && scanType === 'selfie') {
    flags.multiple_faces = true;
    score -= 30;
  }

  const face = faces[0];
  flags.face_confidence = face.Confidence ?? 0;

  const quality = face.Quality;
  if (quality) {
    flags.sharpness = quality.Sharpness ?? 0;
    flags.brightness = quality.Brightness ?? 0;

    // Very low sharpness in a selfie is characteristic of a printed-photo
    // replay attack or a low-resolution screen capture
    if (scanType === 'selfie' && (quality.Sharpness ?? 100) < 20) {
      flags.low_sharpness = true;
      score -= 25;
    }
    if ((quality.Brightness ?? 50) < 10) {
      flags.very_dark = true;
      score -= 15;
    }
  }

  // Sunglasses in a selfie prevents liveness assessment
  const sunglasses = face.Sunglasses;
  if (scanType === 'selfie' && sunglasses?.Value === true && (sunglasses.Confidence ?? 0) > 80) {
    flags.sunglasses = true;
    score -= 40;
  }

  // Eyes closed = failed passive liveness
  const eyesOpen = face.EyesOpen;
  if (scanType === 'selfie' && eyesOpen?.Value === false && (eyesOpen.Confidence ?? 0) > 85) {
    flags.eyes_closed = true;
    score -= 20;
  }

  return { score: Math.max(0, score), flags };
}

export async function scanImage(
  buffer: Buffer,
  scanType: ScanType,
  identityId?: string,
  sessionId?: string
): Promise<DeepScanResult> {
  const startMs = Date.now();

  if (!DEEPSCAN_ENABLED) {
    return { verdict: 'skipped', confidence: 100, signals: { disabled: true }, processingMs: 0, blocked: false };
  }

  // Layer 1 — internal buffer heuristics (always runs, zero external cost)
  const bufferResult = analyseBuffer(buffer, scanType);
  let combinedScore = bufferResult.score;
  const signals: Record<string, boolean | number | string> = { ...bufferResult.flags };
  let provider = 'internal';

  // Layer 2 — AWS Rekognition (runs when configured)
  if (process.env.AWS_ACCESS_KEY_ID) {
    try {
      const rekResult = await rekognitionAnalyse(buffer, scanType);
      // Rekognition score carries 70% weight; buffer heuristics carry 30%
      combinedScore = Math.round(rekResult.score * 0.7 + bufferResult.score * 0.3);
      Object.assign(signals, rekResult.flags);
      provider = 'aws_rekognition';
    } catch (err) {
      logger.warn('DeepScan: Rekognition unavailable, using internal heuristics only', {
        error: (err as Error).message
      });
      signals.rekognition_error = true;
    }
  }

  combinedScore = Math.max(0, Math.min(100, combinedScore));

  let verdict: DeepScanVerdict;
  if (combinedScore >= 70) verdict = 'clear';
  else if (combinedScore >= 40) verdict = 'suspicious';
  else verdict = 'rejected';

  const processingMs = Date.now() - startMs;

  // Persist — fire and forget, never block the verification flow
  query(
    `INSERT INTO deepscan_results
       (identity_id, session_id, scan_type, verdict, confidence, signals, provider, processing_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      identityId ?? null,
      sessionId ?? null,
      scanType,
      verdict,
      combinedScore,
      JSON.stringify(signals),
      provider,
      processingMs
    ]
  ).catch((err) => logger.error('DeepScan: failed to persist result', { error: err.message }));

  logger.info('DeepScan complete', { scan_type: scanType, verdict, confidence: combinedScore, processingMs });

  return {
    verdict,
    confidence: combinedScore,
    signals,
    processingMs,
    blocked: verdict === 'rejected'
  };
}

export async function getDeepScanHistory(
  identityId: string,
  limit = 20
): Promise<Record<string, unknown>[]> {
  return query(
    `SELECT scan_type, verdict, confidence, signals, provider, processing_ms, created_at
     FROM deepscan_results
     WHERE identity_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [identityId, limit]
  );
}
