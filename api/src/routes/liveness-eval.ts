/**
 * /v1/developer/liveness-eval/* - the evaluation program (dashboard session auth).
 * An operator runs consented capture sessions with real people and known attacks. Every capture carries a
 * ground-truth label set by the operator (never by the participant), so error rates can be measured.
 * Participants are pseudonymous: no name, phone or email is ever stored.
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import redis from '../redis';
import { sessionAuth } from '../middleware/sessionAuth';
import { validateBody } from '../middleware/validate';
import { query, queryOne } from '../db';
import {
  engineAnalyze, EngineCaptureError, generateChallenges, livenessEnabled, flashEnabled, generateFlashPlan, buildFlashMeta,
  livenessMetaSchema, ChallengeType, FlashPlan, MAX_FRAMES, MAX_FRAME_BYTES,
} from '../services/liveness.service';
import {
  ATTACK_TYPES, LIGHTING, EVAL_CONSENT_VERSION, computeMetrics, toCsv, storeCaptureFrames, withdrawParticipant, newCaptureId, MetricRow,
} from '../services/liveness-eval.service';
import { incrMetric } from '../utils/metrics';
import logger from '../utils/logger';

const router = Router();
router.use(sessionAuth);

const frameUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FRAME_BYTES, files: MAX_FRAMES } });
const RUN_TTL_SECONDS = 600;
const HOURLY_LIMIT = parseInt(process.env.LIVENESS_EVAL_PER_HOUR ?? '300', 10);

async function underLimit(email: string): Promise<boolean> {
  try {
    const key = `liveness-eval:rate:${email}:${Math.floor(Date.now() / 3_600_000)}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 3700);
    return n <= HOURLY_LIMIT;
  } catch {
    return false;       // fail closed
  }
}

interface StudyRow { id: string; name: string; purpose: string; retention_days: number; status: string; created_at: string }

async function ownStudy(id: string, email: string): Promise<StudyRow | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  return queryOne<StudyRow>(
    `SELECT id, name, purpose, retention_days, status, created_at FROM liveness_eval_studies WHERE id = $1 AND developer_email = $2`,
    [id, email]
  );
}

// ─── Studies ────────────────────────────────────────────────────────────────

const studySchema = z.object({
  name: z.string().trim().min(3).max(120),
  purpose: z.string().trim().min(10).max(1000),
  retention_days: z.number().int().min(7).max(730).default(180),
});

router.post('/studies', validateBody(studySchema), async (req: Request, res: Response): Promise<void> => {
  const d = req.body as z.infer<typeof studySchema>;
  const rows = await query<{ id: string }>(
    `INSERT INTO liveness_eval_studies (developer_email, name, purpose, retention_days) VALUES ($1,$2,$3,$4) RETURNING id`,
    [req.developer!.email, d.name, d.purpose, d.retention_days]
  );
  res.status(201).json({ id: rows[0].id, consent_version: EVAL_CONSENT_VERSION });
});

router.get('/studies', async (req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT s.id, s.name, s.purpose, s.retention_days, s.status, s.created_at,
            (SELECT COUNT(*)::int FROM liveness_eval_participants p WHERE p.study_id = s.id AND p.withdrawn_at IS NULL) AS participants,
            (SELECT COUNT(*)::int FROM liveness_eval_captures c WHERE c.study_id = s.id AND c.label = 'genuine') AS genuine,
            (SELECT COUNT(*)::int FROM liveness_eval_captures c WHERE c.study_id = s.id AND c.label = 'attack') AS attacks
     FROM liveness_eval_studies s WHERE s.developer_email = $1 ORDER BY s.created_at DESC LIMIT 100`,
    [req.developer!.email]
  );
  res.json({ studies: rows });
});

router.get('/studies/:id', async (req: Request, res: Response): Promise<void> => {
  const study = await ownStudy(String(req.params.id), req.developer!.email);
  if (!study) { res.status(404).json({ error: 'not_found', message: 'Study not found' }); return; }
  const participants = await query(
    `SELECT p.id, p.code, p.age_band, p.gender, p.skin_tone, p.country, p.consent_at, p.withdrawn_at,
            (SELECT COUNT(*)::int FROM liveness_eval_captures c WHERE c.participant_id = p.id) AS captures
     FROM liveness_eval_participants p WHERE p.study_id = $1 ORDER BY p.code`,
    [study.id]
  );
  res.json({ ...study, consent_version: EVAL_CONSENT_VERSION, participants, attack_types: ATTACK_TYPES, lighting: LIGHTING });
});

router.patch('/studies/:id', validateBody(z.object({ status: z.enum(['open', 'closed']) })), async (req: Request, res: Response): Promise<void> => {
  const study = await ownStudy(String(req.params.id), req.developer!.email);
  if (!study) { res.status(404).json({ error: 'not_found', message: 'Study not found' }); return; }
  await query(`UPDATE liveness_eval_studies SET status = $2 WHERE id = $1`, [study.id, req.body.status]);
  res.json({ id: study.id, status: req.body.status });
});

// ─── Participants (pseudonymous, consent recorded) ───────────────────────────

const participantSchema = z.object({
  age_band: z.enum(['18-24', '25-34', '35-44', '45-54', '55+']).optional(),
  gender: z.enum(['female', 'male', 'other', 'undisclosed']).optional(),
  skin_tone: z.number().int().min(1).max(10).optional(),
  country: z.string().length(2).toUpperCase().optional(),
  // The operator confirms they explained purpose, what is captured, retention and the right to withdraw, and got consent.
  consent_confirmed: z.literal(true, { errorMap: () => ({ message: 'You must confirm informed consent was obtained before adding a participant' }) }),
});

router.post('/studies/:id/participants', validateBody(participantSchema), async (req: Request, res: Response): Promise<void> => {
  const study = await ownStudy(String(req.params.id), req.developer!.email);
  if (!study) { res.status(404).json({ error: 'not_found', message: 'Study not found' }); return; }
  if (study.status !== 'open') { res.status(409).json({ error: 'study_closed', message: 'This study is closed.' }); return; }
  const d = req.body as z.infer<typeof participantSchema>;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const rows = await query<{ id: string; code: string }>(
        `INSERT INTO liveness_eval_participants (study_id, code, age_band, gender, skin_tone, country, consent_version, consent_confirmed_by)
         VALUES ($1, 'P-' || LPAD(((SELECT COUNT(*) FROM liveness_eval_participants WHERE study_id = $1) + 1)::text, 4, '0'), $2,$3,$4,$5,$6,$7)
         RETURNING id, code`,
        [study.id, d.age_band ?? null, d.gender ?? null, d.skin_tone ?? null, d.country ?? null, EVAL_CONSENT_VERSION, req.developer!.email]
      );
      res.status(201).json(rows[0]);
      return;
    } catch (err) {
      if ((err as { code?: string }).code !== '23505') throw err;     // unique violation: two operators added at once, retry
    }
  }
  res.status(503).json({ error: 'try_again', message: 'Could not allocate a participant code. Please retry.' });
});

router.post('/participants/:id/withdraw', async (req: Request, res: Response): Promise<void> => {
  const p = await queryOne<{ id: string }>(
    `SELECT p.id FROM liveness_eval_participants p JOIN liveness_eval_studies s ON s.id = p.study_id
     WHERE p.id = $1 AND s.developer_email = $2`,
    [String(req.params.id), req.developer!.email]
  );
  if (!p || !z.string().uuid().safeParse(p.id).success) { res.status(404).json({ error: 'not_found', message: 'Participant not found' }); return; }
  const out = await withdrawParticipant(p.id);
  if (!out.filesDeleted) {
    res.status(503).json({ error: 'deletion_incomplete', message: 'Some images could not be deleted yet. Nothing was marked deleted; please retry.' });
    return;
  }
  res.json({ withdrawn: true, captures_deleted: out.captures });
});

// ─── Capture runs ───────────────────────────────────────────────────────────

const runSchema = z.object({
  study_id: z.string().uuid(),
  participant_id: z.string().uuid(),
  label: z.enum(['genuine', 'attack']),
  attack_type: z.enum(ATTACK_TYPES).optional(),
  lighting: z.enum(LIGHTING),
  device: z.string().trim().max(80).optional(),
  store_frames: z.boolean().default(true),
}).refine((d) => (d.label === 'attack') === !!d.attack_type, { message: 'attack_type is required for attacks and must be empty for genuine captures', path: ['attack_type'] });

router.post('/runs/start', validateBody(runSchema), async (req: Request, res: Response): Promise<void> => {
  if (!livenessEnabled()) { res.status(501).json({ error: 'liveness_unavailable', message: 'Live face scanning is not enabled on this deployment.' }); return; }
  const d = req.body as z.infer<typeof runSchema>;
  const study = await ownStudy(d.study_id, req.developer!.email);
  if (!study) { res.status(404).json({ error: 'not_found', message: 'Study not found' }); return; }
  if (study.status !== 'open') { res.status(409).json({ error: 'study_closed', message: 'This study is closed.' }); return; }
  const part = await queryOne<{ id: string }>(
    `SELECT id FROM liveness_eval_participants WHERE id = $1 AND study_id = $2 AND withdrawn_at IS NULL`, [d.participant_id, study.id]
  );
  if (!part) { res.status(404).json({ error: 'not_found', message: 'Participant not found or withdrawn' }); return; }
  if (!(await underLimit(req.developer!.email))) { res.status(429).json({ error: 'rate_limited', message: 'Evaluation capture limit reached for this hour.' }); return; }

  const id = randomUUID();
  const challenges = generateChallenges();
  const flash = flashEnabled() ? generateFlashPlan() : null;
  await redis.set(`liveness-eval:run:${id}`, JSON.stringify({ email: req.developer!.email, run: d, challenges, flash }), 'EX', RUN_TTL_SECONDS);
  res.json({
    liveness_id: id, challenges, flash, attempt: 1, max_attempts: 1, expires_in_seconds: RUN_TTL_SECONDS,
    capture: { min_frames: 8, max_frames: MAX_FRAMES, min_seconds: 3, max_seconds: 60, target_fps: 8 },
    evaluation: true,
  });
});

router.post('/runs/complete', frameUpload.array('frames', MAX_FRAMES), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { liveness_id?: string; meta?: string };
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  let meta: z.infer<typeof livenessMetaSchema>;
  try { meta = livenessMetaSchema.parse(JSON.parse(body.meta ?? '')); } catch {
    res.status(400).json({ error: 'validation_error', message: 'meta must be JSON with timestamps_ms[]' }); return;
  }
  if (!z.string().uuid().safeParse(body.liveness_id).success || files.length === 0 || files.length !== meta.timestamps_ms.length) {
    res.status(400).json({ error: 'validation_error', message: 'liveness_id, frames and one timestamp per frame are required' }); return;
  }
  const raw = await redis.getdel(`liveness-eval:run:${body.liveness_id}`);       // single use
  const issued = raw ? (JSON.parse(raw) as { email: string; run: z.infer<typeof runSchema>; challenges: ChallengeType[]; flash: FlashPlan | null }) : null;
  if (!issued || issued.email !== req.developer!.email) {
    res.status(404).json({ error: 'challenge_not_found', message: 'Run is unknown, already used, or expired.' }); return;
  }
  const { run } = issued;
  const study = await ownStudy(run.study_id, req.developer!.email);
  if (!study || study.status !== 'open') { res.status(409).json({ error: 'study_closed', message: 'This study is closed.' }); return; }
  const stillThere = await queryOne<{ id: string }>(
    `SELECT id FROM liveness_eval_participants WHERE id = $1 AND study_id = $2 AND withdrawn_at IS NULL`, [run.participant_id, study.id]
  );
  if (!stillThere) { res.status(409).json({ error: 'participant_withdrawn', message: 'This participant withdrew; nothing was stored.' }); return; }

  try {
    const frames = files.map((f) => f.buffer);
    const r = await engineAnalyze(frames, issued.challenges, meta.timestamps_ms, meta.windows, buildFlashMeta(issued.flash, meta.flash));
    if (r.flash) void incrMetric(`liveness_flash_${r.flash.verdict}`);

    const captureId = newCaptureId();
    const keys = run.store_frames ? await storeCaptureFrames(study.id, captureId, frames) : [];
    const passed = r.challenges.filter((c) => c.passed).length;
    await query(
      `INSERT INTO liveness_eval_captures
         (id, study_id, participant_id, label, attack_type, lighting, device, verdict, liveness_score, passive_score,
          challenges_passed, challenges_total, flash_verdict, flash_correlation, flash_p_value, flash_effect, flash_bg_ratio,
          flags, reasons, engine_version, frame_count, frame_s3_keys, created_by, purge_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23, NOW() + ($24 || ' days')::interval)`,
      [
        captureId, study.id, run.participant_id, run.label, run.attack_type ?? null, run.lighting, run.device ?? null,
        r.verdict, r.liveness_score, r.passive.score, passed, r.challenges.length,
        r.flash?.verdict ?? null, r.flash?.correlation ?? null, r.flash?.p_value ?? null, r.flash?.effect ?? null, r.flash?.bg_ratio ?? null,
        JSON.stringify(r.passive.flags ?? []), JSON.stringify(r.reasons ?? []), 'own-v1', frames.length, JSON.stringify(keys),
        req.developer!.email, String(study.retention_days),
      ]
    );

    const outcome = run.label === 'attack'
      ? (r.verdict === 'pass' ? 'BREACH' : 'defended')
      : (r.verdict === 'pass' ? 'accepted' : r.verdict === 'review' ? 'stopped_for_review' : 'rejected');
    if (outcome === 'BREACH') logger.warn('Evaluation: an attack was accepted as live', { study: study.id, attack: run.attack_type, capture: captureId });
    res.json({
      demo: true, stored: true, capture_id: captureId,
      ground_truth: { label: run.label, attack_type: run.attack_type ?? null }, outcome,
      verdict: r.verdict, score: r.liveness_score,
      challenges: r.challenges.map((c) => ({ type: c.type, passed: c.passed })),
      reasons: r.reasons,
      passive: { score: r.passive.score, flags: r.passive.flags, signals: r.passive.signals },
      flash: r.flash ?? null, frame_stats: r.frame_stats, processing_ms: r.processing_ms,
    });
  } catch (err) {
    if (err instanceof EngineCaptureError) { res.status(422).json({ error: 'invalid_capture', message: err.detail }); return; }
    void incrMetric('liveness_engine_error');
    logger.error('Evaluation capture failed', { error: (err as Error).message });
    res.status(503).json({ error: 'capture_failed', message: 'Could not analyse or store the capture. Nothing was recorded; please run it again.' });
  }
});

// ─── Results ────────────────────────────────────────────────────────────────

async function metricRows(studyId: string): Promise<MetricRow[]> {
  return query<MetricRow>(
    `SELECT c.label, c.attack_type, c.verdict, c.lighting, p.skin_tone, c.flash_verdict
     FROM liveness_eval_captures c JOIN liveness_eval_participants p ON p.id = c.participant_id
     WHERE c.study_id = $1`,
    [studyId]
  );
}

router.get('/studies/:id/metrics', async (req: Request, res: Response): Promise<void> => {
  const study = await ownStudy(String(req.params.id), req.developer!.email);
  if (!study) { res.status(404).json({ error: 'not_found', message: 'Study not found' }); return; }
  const recent = await query(
    `SELECT c.id, p.code AS participant, c.label, c.attack_type, c.lighting, c.device, c.verdict, c.liveness_score, c.flash_verdict, c.created_at
     FROM liveness_eval_captures c JOIN liveness_eval_participants p ON p.id = c.participant_id
     WHERE c.study_id = $1 ORDER BY c.created_at DESC LIMIT 25`,
    [study.id]
  );
  res.json({ study: { id: study.id, name: study.name }, metrics: computeMetrics(await metricRows(study.id)), recent });
});

router.get('/studies/:id/export.csv', async (req: Request, res: Response): Promise<void> => {
  const study = await ownStudy(String(req.params.id), req.developer!.email);
  if (!study) { res.status(404).json({ error: 'not_found', message: 'Study not found' }); return; }
  const rows = await query<Record<string, string | number | null>>(
    `SELECT c.id, p.code, p.age_band, p.gender, p.skin_tone, p.country, c.label, c.attack_type, c.lighting, c.device, c.verdict,
            c.liveness_score, c.passive_score, c.challenges_passed, c.challenges_total, c.flash_verdict, c.flash_correlation,
            c.flash_p_value, c.flash_effect, c.flash_bg_ratio, c.flags::text AS flags, c.engine_version, c.created_at
     FROM liveness_eval_captures c JOIN liveness_eval_participants p ON p.id = c.participant_id
     WHERE c.study_id = $1 ORDER BY c.created_at`,
    [study.id]
  );
  const header = ['capture_id', 'participant', 'age_band', 'gender', 'skin_tone', 'country', 'label', 'attack_type', 'lighting', 'device', 'verdict',
    'liveness_score', 'passive_score', 'challenges_passed', 'challenges_total', 'flash_verdict', 'flash_correlation', 'flash_p_value',
    'flash_effect', 'flash_bg_ratio', 'flags', 'engine_version', 'created_at'];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="liveness-eval-${study.id.slice(0, 8)}.csv"`);
  res.send(toCsv(header, rows.map((r) => Object.values(r).map((v) => ((v as unknown) instanceof Date ? (v as unknown as Date).toISOString() : v) as string | number | null))));
});

export default router;
