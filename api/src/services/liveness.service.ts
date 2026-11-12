/**
 * Live face scanning orchestration (own liveness engine, v1).
 *
 *   startLiveness()     -> server picks a random challenge sequence for this attempt
 *   completeLiveness()  -> receives the captured frames, asks the engine for a
 *                          liveness verdict + 1:1 face match vs the ID photo,
 *                          stores encrypted evidence, and decides the outcome.
 *
 * The engine (liveness-service/) is a separate stateless Python service. The
 * existing vendors (Smile Identity / Dojah / Onfido) are left untouched and are
 * only used here as a fallback for borderline ("review") outcomes.
 */
import axios from 'axios';
import FormData from 'form-data';
import { randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db';
import { uploadToS3, downloadFromS3, deleteFromS3 } from '../utils/s3';
import { biometricKYC as biometricKYCWithProvider } from './identity-provider.service';
import { applyTrustEvent } from './trust-score.service';
import { createOrUpdatePlatformConnection, pushVerificationUpdate } from './platform-webhook.service';
import logger from '../utils/logger';
import { VerificationSession } from '../types';

export type ChallengeType = 'turn_left' | 'turn_right' | 'blink' | 'smile';
export const CONSENT_VERSION = '2026-11-v1';
const ENGINE_VERSION = 'own-v1';
const CHALLENGE_TTL_MS = 3 * 60 * 1000;

export const MAX_ATTEMPTS = parseInt(process.env.LIVENESS_MAX_ATTEMPTS ?? '3', 10);
export const MAX_FRAMES = 120;
export const MAX_FRAME_BYTES = 1_500_000;
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;

// ─── Config ──────────────────────────────────────────────────────────────────

export function livenessEnabled(): boolean {
  return !!process.env.LIVENESS_ENGINE_URL;
}

export function livenessRequiredGlobally(): boolean {
  return livenessEnabled() && process.env.LIVENESS_REQUIRED === 'true';
}

export function isLivenessRequired(session: { liveness_required?: boolean }): boolean {
  return livenessEnabled() && (!!session.liveness_required || livenessRequiredGlobally());
}

// ─── Challenge generation ────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Always: one head turn (random direction) + one blink + one smile, in random
 * order. A still photo, a looped video or a deepfake that cannot respond live
 * cannot satisfy an unpredictable expression + pose sequence.
 */
export function generateChallenges(): ChallengeType[] {
  const turn: ChallengeType = randomInt(0, 2) === 0 ? 'turn_left' : 'turn_right';
  return shuffle<ChallengeType>([turn, 'blink', 'smile']);
}

// ─── Engine client ───────────────────────────────────────────────────────────

export interface EngineLivenessResult {
  verdict: 'pass' | 'review' | 'fail';
  liveness_score: number;
  challenges: { type: string; passed: boolean; frame_index: number | null; detail: string }[];
  passive: { score: number; signals: Record<string, number>; flags: string[] };
  reasons: string[];
  best_frame_index: number | null;
  frame_stats: Record<string, number>;
  processing_ms: number;
}

export interface EngineMatchResult {
  verdict: 'match' | 'review' | 'no_match' | 'unable';
  similarity?: number;
  confidence: number;
  selfie_face_found?: boolean;
  id_face_found?: boolean;
}

export class EngineCaptureError extends Error {
  constructor(public readonly detail: string) {
    super(detail);
  }
}

function engineHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-Internal-Key': process.env.LIVENESS_SERVICE_KEY ?? '', ...extra };
}

export async function engineAnalyze(
  frames: Buffer[],
  challenges: ChallengeType[],
  timestampsMs: number[],
  windows?: { start_ms: number; end_ms: number }[]
): Promise<EngineLivenessResult> {
  const form = new FormData();
  form.append('meta', JSON.stringify({ challenges, timestamps_ms: timestampsMs, windows }));
  frames.forEach((buf, i) => form.append('frames', buf, { filename: `f${i}.jpg`, contentType: 'image/jpeg' }));
  try {
    const { data } = await axios.post<EngineLivenessResult>(
      `${process.env.LIVENESS_ENGINE_URL}/v1/liveness/analyze`,
      form,
      {
        headers: engineHeaders(form.getHeaders()),
        timeout: 30_000,
        maxBodyLength: Infinity,
        maxContentLength: 5 * 1024 * 1024,
      }
    );
    return data;
  } catch (err) {
    const e = err as { response?: { status: number; data?: { detail?: { message?: string } } } };
    if (e.response?.status === 422) {
      throw new EngineCaptureError(e.response.data?.detail?.message ?? 'invalid capture');
    }
    throw err;
  }
}

export async function engineMatch(selfie: Buffer, idPhoto: Buffer): Promise<EngineMatchResult> {
  const form = new FormData();
  form.append('selfie', selfie, { filename: 'selfie.jpg', contentType: 'image/jpeg' });
  form.append('id_photo', idPhoto, { filename: 'id.jpg', contentType: 'image/jpeg' });
  const { data } = await axios.post<EngineMatchResult>(
    `${process.env.LIVENESS_ENGINE_URL}/v1/face/match`,
    form,
    { headers: engineHeaders(form.getHeaders()), timeout: 30_000, maxContentLength: 1024 * 1024 }
  );
  return data;
}

// ─── Decision logic (pure, unit-tested) ──────────────────────────────────────

export type Decision = 'approved' | 'rejected' | 'needs_second_opinion';

/**
 * - liveness fail                      -> rejected (user may retry while attempts remain)
 * - liveness pass  + match            -> approved
 * - match no_match                     -> rejected
 * - anything borderline/unable         -> needs_second_opinion (vendor, else manual review)
 * - no ID photo to compare against     -> liveness-only approval is NOT enough for level 2
 */
export function decide(
  liveness: Pick<EngineLivenessResult, 'verdict'>,
  match: Pick<EngineMatchResult, 'verdict'> | null
): Decision {
  if (liveness.verdict === 'fail') return 'rejected';
  if (!match) return 'needs_second_opinion';
  if (match.verdict === 'no_match') return 'rejected';
  if (liveness.verdict === 'pass' && match.verdict === 'match') return 'approved';
  return 'needs_second_opinion';
}

// ─── Persistence helpers ─────────────────────────────────────────────────────

export interface LivenessRow {
  id: string;
  session_id: string;
  identity_id: string | null;
  attempt: number;
  challenges: ChallengeType[];
  status: string;
  expires_at: Date;
}

export async function startLiveness(
  session: VerificationSession,
  consent: boolean
): Promise<
  | { ok: true; liveness_id: string; challenges: ChallengeType[]; attempt: number; max_attempts: number; expires_in_seconds: number; capture: Record<string, number> }
  | { ok: false; status: number; error: string; message: string }
> {
  if (!consent) {
    return { ok: false, status: 400, error: 'consent_required', message: 'Consent to biometric capture is required.' };
  }
  const prior = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM liveness_sessions WHERE session_id = $1`,
    [session.id]
  );
  const attempt = parseInt(prior?.n ?? '0', 10) + 1;
  if (attempt > MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: 'too_many_attempts', message: 'Maximum liveness attempts reached.' };
  }

  // an unfinished earlier challenge is dead the moment a new one is issued
  await query(
    `UPDATE liveness_sessions SET status = 'expired' WHERE session_id = $1 AND status = 'issued'`,
    [session.id]
  );

  const challenges = generateChallenges();
  const rows = await query<{ id: string }>(
    `INSERT INTO liveness_sessions
       (session_id, identity_id, attempt, challenges, expires_at, consent_at, consent_version, engine_version)
     VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7) RETURNING id`,
    [
      session.id, session.identity_id, attempt, JSON.stringify(challenges),
      new Date(Date.now() + CHALLENGE_TTL_MS), CONSENT_VERSION, ENGINE_VERSION,
    ]
  );
  return {
    ok: true,
    liveness_id: rows[0].id,
    challenges,
    attempt,
    max_attempts: MAX_ATTEMPTS,
    expires_in_seconds: CHALLENGE_TTL_MS / 1000,
    capture: { min_frames: 8, max_frames: MAX_FRAMES, min_seconds: 3, max_seconds: 60, target_fps: 8 },
  };
}

export interface CompleteInput {
  session: VerificationSession;
  livenessId: string;
  frames: Buffer[];
  timestampsMs: number[];
  windows?: { start_ms: number; end_ms: number }[];
}

export type CompleteOutcome =
  | { kind: 'bad_request'; status: number; error: string; message: string }
  | {
      kind: 'result';
      decision: 'approved' | 'rejected' | 'retry' | 'manual_review' | 'processing';
      liveness: { verdict: string; score: number; reasons: string[]; challenges: { type: string; passed: boolean }[] };
      attempts_remaining: number;
    };

export async function completeLiveness(input: CompleteInput): Promise<CompleteOutcome> {
  const { session } = input;

  // Single-use claim: only an unexpired 'issued' challenge for THIS session can be completed.
  const claimed = await query<LivenessRow>(
    `UPDATE liveness_sessions SET completed_at = NOW()
     WHERE id = $1 AND session_id = $2 AND status = 'issued' AND expires_at > NOW() AND completed_at IS NULL
     RETURNING id, session_id, identity_id, attempt, challenges, status, expires_at`,
    [input.livenessId, session.id]
  );
  if (claimed.length === 0) {
    return { kind: 'bad_request', status: 404, error: 'challenge_not_found', message: 'Liveness challenge is unknown, already used, or expired.' };
  }
  const row = claimed[0];
  const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - row.attempt);

  let live: EngineLivenessResult;
  try {
    live = await engineAnalyze(input.frames, row.challenges, input.timestampsMs, input.windows);
  } catch (err) {
    if (err instanceof EngineCaptureError) {
      await query(`UPDATE liveness_sessions SET status = 'failed', verdict = 'fail', reasons = $2, decision = 'rejected' WHERE id = $1`,
        [row.id, JSON.stringify(['invalid_capture'])]);
      return { kind: 'bad_request', status: 422, error: 'invalid_capture', message: err.detail };
    }
    // engine down/unreachable: release the claim so the user can retry; do NOT fail open
    await query(`UPDATE liveness_sessions SET status = 'expired', completed_at = NULL WHERE id = $1`, [row.id]);
    throw err;
  }

  // ── evidence (encrypted application-side by uploadToS3) ──
  const identityId = session.identity_id ?? 'unknown';
  const base = `liveness/${identityId}/${row.id}`;
  const bestIdx = live.best_frame_index;
  const frameKeys: string[] = [];
  let bestKey: string | null = null;
  try {
    const jobs: { key: string; buf: Buffer }[] = input.frames.map((buf, i) => {
      if (i === bestIdx) {
        bestKey = `selfies/${identityId}/${uuidv4()}.jpg`;
        return { key: bestKey, buf };
      }
      const k = `${base}/${String(i).padStart(2, '0')}.jpg`;
      frameKeys.push(k);
      return { key: k, buf };
    });
    // bounded concurrency: up to 120 encrypted PUTs, 8 at a time
    for (let i = 0; i < jobs.length; i += 8) {
      await Promise.all(jobs.slice(i, i + 8).map((j) => uploadToS3(j.key, j.buf, 'image/jpeg')));
    }
  } catch (err) {
    logger.error('Liveness evidence upload failed', { liveness: row.id, error: (err as Error).message });
    await query(`UPDATE liveness_sessions SET status = 'expired', completed_at = NULL WHERE id = $1`, [row.id]);
    throw err;
  }

  // ── face match vs ID photo (only meaningful if liveness didn't already fail) ──
  let match: EngineMatchResult | null = null;
  if (live.verdict !== 'fail' && bestKey && session.id_photo_s3_key) {
    try {
      match = await engineMatch(input.frames[bestIdx!], await downloadFromS3(session.id_photo_s3_key));
    } catch (err) {
      logger.warn('Face match engine call failed; treating as unable', { error: (err as Error).message });
      match = { verdict: 'unable', confidence: 0 };
    }
  }

  let decision = decide(live, match);
  let finalDecision: string = decision;

  if (decision === 'needs_second_opinion') {
    // 1) existing vendor as a safety net, 2) manual review queue
    const vendor = await tryVendorFallback(session, input.frames[bestIdx!] ?? input.frames[0]);
    if (vendor === 'approved') { decision = 'approved'; finalDecision = 'vendor_fallback'; }
    else if (vendor === 'rejected') { decision = 'rejected'; finalDecision = 'vendor_fallback'; }
    else { finalDecision = 'manual_review'; }
  }

  const status = live.verdict === 'pass' ? 'passed' : live.verdict === 'review' ? 'review' : 'failed';
  await query(
    `UPDATE liveness_sessions
     SET status = $2, verdict = $3, liveness_score = $4, reasons = $5, engine_result = $6,
         face_match_verdict = $7, face_match_score = $8, decision = $9,
         best_frame_s3_key = $10, frame_s3_keys = $11
     WHERE id = $1`,
    [
      row.id, status, live.verdict, live.liveness_score, JSON.stringify(live.reasons),
      JSON.stringify({ challenges: live.challenges, passive: live.passive, frame_stats: live.frame_stats }),
      match?.verdict ?? null, match?.confidence ?? null, finalDecision,
      bestKey, JSON.stringify(frameKeys),
    ]
  );

  const summary = {
    verdict: live.verdict,
    score: live.liveness_score,
    reasons: live.reasons,
    challenges: live.challenges.map((c) => ({ type: c.type, passed: c.passed })),
  };

  if (decision === 'approved') {
    await query(
      `UPDATE verification_sessions SET face_photo_s3_key = $1, liveness_passed_at = NOW() WHERE id = $2`,
      [bestKey, session.id]
    );
    await finalizeApproved(session);
    return { kind: 'result', decision: 'approved', liveness: summary, attempts_remaining: attemptsRemaining };
  }

  if (finalDecision === 'manual_review') {
    await query(`UPDATE verification_sessions SET face_photo_s3_key = $1, step = 'processing' WHERE id = $2`, [bestKey, session.id]);
    await openReviewCase(session, row.id, live, match);
    return { kind: 'result', decision: 'manual_review', liveness: summary, attempts_remaining: attemptsRemaining };
  }

  // rejected
  if (attemptsRemaining > 0) {
    return { kind: 'result', decision: 'retry', liveness: summary, attempts_remaining: attemptsRemaining };
  }
  await query(`UPDATE verification_sessions SET step = 'failed', completed_at = NOW() WHERE id = $1`, [session.id]);
  return { kind: 'result', decision: 'rejected', liveness: summary, attempts_remaining: 0 };
}

/** Optional screen-recording of the capture (webm), uploaded after /complete so frame and video limits stay separate. */
export async function attachLivenessVideo(
  session: VerificationSession,
  livenessId: string,
  video: Buffer
): Promise<'attached' | 'not_found' | 'already_attached'> {
  const row = await queryOne<{ id: string; identity_id: string | null; video_s3_key: string | null }>(
    `SELECT id, identity_id, video_s3_key FROM liveness_sessions
     WHERE id = $1 AND session_id = $2 AND completed_at IS NOT NULL
       AND completed_at > NOW() - INTERVAL '10 minutes' AND evidence_purged_at IS NULL`,
    [livenessId, session.id]
  );
  if (!row) return 'not_found';
  if (row.video_s3_key) return 'already_attached';
  const key = `liveness/${row.identity_id ?? 'unknown'}/${row.id}/capture.webm`;
  await uploadToS3(key, video, 'video/webm');
  await query(`UPDATE liveness_sessions SET video_s3_key = $2 WHERE id = $1 AND video_s3_key IS NULL`, [row.id, key]);
  return 'attached';
}

// ─── Outcomes ────────────────────────────────────────────────────────────────

async function tryVendorFallback(
  session: VerificationSession,
  bestFrame: Buffer
): Promise<'approved' | 'rejected' | 'unavailable'> {
  if (process.env.LIVENESS_VENDOR_FALLBACK === 'false' || !session.identity_id) return 'unavailable';
  try {
    const identity = await queryOne<{ nationality: string; id_type: string }>(
      'SELECT nationality, id_type FROM verified_identities WHERE id = $1',
      [session.identity_id]
    );
    const idPhoto = session.id_photo_s3_key ? await downloadFromS3(session.id_photo_s3_key) : undefined;
    const r = await biometricKYCWithProvider({
      country: (identity?.nationality ?? 'NG').toUpperCase().substring(0, 2),
      id_type: (identity?.id_type ?? 'NIN').toUpperCase(),
      partner_user_id: session.identity_id,
      selfie_buffer: bestFrame,
      id_photo_buffer: idPhoto,
    });
    if (r.pending) return 'unavailable'; // async vendor result: leave for manual review
    return r.success && (r.face_match_confidence ?? 0) >= 70 && r.liveness_passed !== false ? 'approved' : 'rejected';
  } catch (err) {
    logger.warn('Vendor fallback unavailable', { error: (err as Error).message });
    return 'unavailable';
  }
}

async function finalizeApproved(session: VerificationSession): Promise<void> {
  const identityId = session.identity_id!;
  await query(
    `UPDATE verified_identities
     SET verification_level = GREATEST(verification_level, 2), trust_level = 'rising',
         verified_at = COALESCE(verified_at, NOW()), updated_at = NOW()
     WHERE id = $1`,
    [identityId]
  );
  await query(`UPDATE verification_sessions SET step = 'complete', completed_at = NOW() WHERE id = $1`, [session.id]);
  await applyTrustEvent({ identity_id: identityId, event_type: 'initial_verification', score_delta: 100 });
  const sess = await queryOne<{ platform_user_id: string | null; api_key_id: string }>(
    'SELECT platform_user_id, api_key_id FROM verification_sessions WHERE id = $1',
    [session.id]
  );
  if (sess) {
    await createOrUpdatePlatformConnection(identityId, sess.api_key_id, sess.platform_user_id);
    pushVerificationUpdate(sess.api_key_id, identityId, sess.platform_user_id, 2).catch(() => {});
  }
}

async function openReviewCase(
  session: VerificationSession,
  livenessId: string,
  live: EngineLivenessResult,
  match: EngineMatchResult | null
): Promise<void> {
  try {
    const owner = await queryOne<{ platform_email: string }>(
      'SELECT platform_email FROM api_keys WHERE id = $1',
      [session.api_key_id]
    );
    if (!owner) return;
    await query(
      `INSERT INTO review_cases (identity_id, session_id, api_key_id, developer_email, reason, priority, metadata)
       VALUES ($1,$2,$3,$4,$5,'medium',$6)`,
      [
        session.identity_id, session.id, session.api_key_id, owner.platform_email,
        'Borderline live face scan - needs human review',
        JSON.stringify({
          liveness_session_id: livenessId,
          liveness_verdict: live.verdict, liveness_score: live.liveness_score,
          passive_flags: live.passive.flags, face_match: match?.verdict ?? 'no_id_photo',
        }),
      ]
    );
  } catch (err) {
    logger.error('Failed to open review case', { error: (err as Error).message });
  }
}

// ─── Evidence retention ──────────────────────────────────────────────────────

/** Deletes extra frames + video of liveness captures older than the retention window. */
export async function purgeLivenessEvidence(retentionDays: number): Promise<number> {
  const rows = await query<{ id: string; frame_s3_keys: string[]; video_s3_key: string | null }>(
    `SELECT id, frame_s3_keys, video_s3_key FROM liveness_sessions
     WHERE evidence_purged_at IS NULL AND completed_at IS NOT NULL
       AND completed_at < NOW() - ($1 || ' days')::interval
     LIMIT 200`,
    [retentionDays]
  );
  for (const r of rows) {
    const keys = [...(r.frame_s3_keys ?? []), ...(r.video_s3_key ? [r.video_s3_key] : [])];
    let ok = true;
    for (const k of keys) {
      try { await deleteFromS3(k); } catch (err) {
        ok = false;
        logger.error('Liveness purge: delete failed', { key: k, error: (err as Error).message });
      }
    }
    if (ok) {
      await query(
        `UPDATE liveness_sessions SET frame_s3_keys = '[]', video_s3_key = NULL, evidence_purged_at = NOW() WHERE id = $1`,
        [r.id]
      );
    }
  }
  return rows.length;
}
