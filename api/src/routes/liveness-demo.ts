/**
 * /v1/developer/liveness-demo/*  -  "Live Scan Lab" for the dashboard.
 *
 * Lets a signed-in developer try the live face scan (and see exactly why it passes or fails) without sending an
 * SMS or uploading an ID. Privacy by design: NOTHING is stored. No frames or video go to storage, no database rows
 * are written, no verification session exists. Frames go to the engine and the verdict comes straight back.
 * Challenges are single-use, expire in 3 minutes, live only in Redis, and are bound to the developer who asked.
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import redis from '../redis';
import { sessionAuth } from '../middleware/sessionAuth';
import {
  engineAnalyze, EngineCaptureError, generateChallenges, livenessEnabled, ChallengeType,
  MAX_FRAMES, MAX_FRAME_BYTES,
  flashEnabled, generateFlashPlan, buildFlashMeta, livenessMetaSchema, FlashPlan,
} from '../services/liveness.service';
import { incrMetric } from '../utils/metrics';
import logger from '../utils/logger';

const router = Router();
router.use(sessionAuth);

const frameUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FRAME_BYTES, files: MAX_FRAMES } });
const CHALLENGE_TTL_SECONDS = 180;
const HOURLY_LIMIT = parseInt(process.env.LIVENESS_DEMO_PER_HOUR ?? '30', 10);

/** Fixed-window per-developer limit shared by all replicas. Fails closed if Redis is unavailable. */
async function underLimit(email: string): Promise<boolean> {
  try {
    const key = `liveness-demo:rate:${email}:${Math.floor(Date.now() / 3_600_000)}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 3700);
    return n <= HOURLY_LIMIT;
  } catch {
    return false;
  }
}

router.post('/start', async (req: Request, res: Response): Promise<void> => {
  if (!livenessEnabled()) {
    res.status(501).json({ error: 'liveness_unavailable', message: 'Live face scanning is not enabled on this deployment.' });
    return;
  }
  if (req.body?.consent !== true) {
    res.status(400).json({ error: 'consent_required', message: 'Consent to biometric capture is required.' });
    return;
  }
  if (!(await underLimit(req.developer!.email))) {
    res.status(429).json({ error: 'rate_limited', message: `Demo limit reached (${HOURLY_LIMIT} scans per hour). Try again later.` });
    return;
  }
  const id = randomUUID();
  const challenges = generateChallenges();
  const flash = flashEnabled() ? generateFlashPlan() : null;
  await redis.set(`liveness-demo:challenge:${id}`, JSON.stringify({ email: req.developer!.email, challenges, flash }), 'EX', CHALLENGE_TTL_SECONDS);
  res.json({
    liveness_id: id,
    challenges,
    flash,
    attempt: 1,
    max_attempts: HOURLY_LIMIT,
    expires_in_seconds: CHALLENGE_TTL_SECONDS,
    capture: { min_frames: 8, max_frames: MAX_FRAMES, min_seconds: 3, max_seconds: 60, target_fps: 8 },
    demo: true,
  });
});

router.post('/complete', frameUpload.array('frames', MAX_FRAMES), async (req: Request, res: Response): Promise<void> => {
  if (!livenessEnabled()) {
    res.status(501).json({ error: 'liveness_unavailable', message: 'Live face scanning is not enabled on this deployment.' });
    return;
  }
  const body = req.body as { liveness_id?: string; meta?: string };
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  let meta: z.infer<typeof livenessMetaSchema>;
  try {
    meta = livenessMetaSchema.parse(JSON.parse(body.meta ?? ''));
  } catch {
    res.status(400).json({ error: 'validation_error', message: 'meta must be JSON with timestamps_ms[] (and optional windows[])' });
    return;
  }
  if (!z.string().uuid().safeParse(body.liveness_id).success || files.length === 0 || files.length !== meta.timestamps_ms.length) {
    res.status(400).json({ error: 'validation_error', message: 'liveness_id and one timestamp per frame are required' });
    return;
  }

  // single use: read-and-delete in one step, then check it was issued to THIS developer
  const raw = await redis.getdel(`liveness-demo:challenge:${body.liveness_id}`);
  const issued = raw ? (JSON.parse(raw) as { email: string; challenges: ChallengeType[]; flash: FlashPlan | null }) : null;
  if (!issued || issued.email !== req.developer!.email) {
    res.status(404).json({ error: 'challenge_not_found', message: 'Challenge is unknown, already used, or expired.' });
    return;
  }

  try {
    const r = await engineAnalyze(files.map((f) => f.buffer), issued.challenges, meta.timestamps_ms, meta.windows, buildFlashMeta(issued.flash, meta.flash), meta.profile, meta.camera);
    res.json({
      demo: true,
      stored: false,
      verdict: r.verdict,
      score: r.liveness_score,
      challenges: r.challenges.map((c) => ({ type: c.type, passed: c.passed })),
      reasons: r.reasons,
      passive: { score: r.passive.score, flags: r.passive.flags, signals: r.passive.signals },
      flash: r.flash ?? null,
      capture_profile: r.capture_profile ?? meta.profile ?? 'standard',
      frame_stats: r.frame_stats,
      processing_ms: r.processing_ms,
    });
  } catch (err) {
    if (err instanceof EngineCaptureError) {
      res.status(422).json({ error: 'invalid_capture', message: err.detail });
      return;
    }
    void incrMetric('liveness_engine_error');
    logger.error('Liveness demo failed', { error: (err as Error).message });
    res.status(503).json({ error: 'liveness_unavailable', message: 'Could not analyse the scan right now. Please try again.' });
  }
});

export default router;
