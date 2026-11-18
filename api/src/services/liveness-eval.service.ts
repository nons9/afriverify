/**
 * Liveness evaluation program: the statistics (pure, unit-tested) and the storage helpers.
 *
 * Terms (ISO/IEC 30107-3):
 *   APCER  attack presentation classification error rate: attacks that were wrongly ACCEPTED as live.
 *          We count only an automatic "pass" as accepted: "review" and "fail" both stop an attack.
 *   BPCER  bona fide presentation classification error rate: real people wrongly stopped.
 *          strict = not auto-passed (review or fail, costs a human review); hard = rejected outright.
 * Small samples make a point estimate meaningless, so every rate carries a 95% Wilson interval, and the
 * report says plainly when the sample is too small to support a claim.
 */
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db';
import { uploadToS3, deleteFromS3 } from '../utils/s3';
import logger from '../utils/logger';

export const ATTACK_TYPES = ['print_photo', 'screen_photo', 'screen_video', 'screen_live_video', 'mask', 'other'] as const;
export const LIGHTING = ['indoor_bright', 'indoor_dim', 'outdoor_shade', 'outdoor_sun'] as const;
export type AttackType = (typeof ATTACK_TYPES)[number];
export type Lighting = (typeof LIGHTING)[number];
export const EVAL_CONSENT_VERSION = '2026-11-eval-v1';

// Minimum samples before the numbers support a claim (industry test labs use far more; these are the floor
// at which a 95% interval on a 0% observed error stops being absurdly wide).
export const MIN_GENUINE = 100;
export const MIN_ATTACKS_PER_TYPE = 30;

export interface Rate { k: number; n: number; rate: number | null; low: number | null; high: number | null }

/** 95% Wilson score interval: honest at small n and at 0 or n successes, unlike the normal approximation. */
export function wilson(k: number, n: number, z = 1.959964): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export function rate(k: number, n: number): Rate {
  const ci = wilson(k, n);
  return { k, n, rate: n > 0 ? k / n : null, low: ci?.low ?? null, high: ci?.high ?? null };
}

export type SkinGroup = 'light' | 'medium' | 'dark' | 'unknown';
/** Monk Skin Tone scale: 1-3 light, 4-6 medium, 7-10 dark. */
export function skinGroup(tone: number | null | undefined): SkinGroup {
  if (tone == null) return 'unknown';
  if (tone <= 3) return 'light';
  if (tone <= 6) return 'medium';
  return 'dark';
}

export interface MetricRow {
  label: 'genuine' | 'attack';
  attack_type: string | null;
  verdict: 'pass' | 'review' | 'fail';
  lighting: string;
  skin_tone: number | null;
  flash_verdict: string | null;
}

export interface Metrics {
  totals: { genuine: number; attacks: number };
  bpcer: { strict: Rate; hard: Rate };
  apcer: { overall: Rate; by_attack_type: Record<string, Rate>; worst_attack_type: string | null };
  by_skin_group: Record<string, { genuine: number; bpcer_strict: Rate; bpcer_hard: Rate }>;
  by_lighting: Record<string, { genuine: number; attacks: number; bpcer_strict: Rate; apcer: Rate }>;
  flash: { genuine: Record<string, number>; attacks: Record<string, number> };
  adequacy: { ok: boolean; notes: string[] };
}

export function computeMetrics(rows: MetricRow[]): Metrics {
  const genuine = rows.filter((r) => r.label === 'genuine');
  const attacks = rows.filter((r) => r.label === 'attack');
  const notPassed = (r: MetricRow) => r.verdict !== 'pass';
  const accepted = (r: MetricRow) => r.verdict === 'pass';

  const byType: Record<string, Rate> = {};
  for (const t of new Set(attacks.map((a) => a.attack_type ?? 'other'))) {
    const grp = attacks.filter((a) => (a.attack_type ?? 'other') === t);
    byType[t] = rate(grp.filter(accepted).length, grp.length);
  }
  let worst: string | null = null;
  for (const [t, r] of Object.entries(byType)) {
    if (worst === null || (r.rate ?? 0) > (byType[worst].rate ?? 0)) worst = t;
  }

  const bySkin: Metrics['by_skin_group'] = {};
  for (const g of new Set(genuine.map((r) => skinGroup(r.skin_tone)))) {
    const grp = genuine.filter((r) => skinGroup(r.skin_tone) === g);
    bySkin[g] = { genuine: grp.length, bpcer_strict: rate(grp.filter(notPassed).length, grp.length), bpcer_hard: rate(grp.filter((r) => r.verdict === 'fail').length, grp.length) };
  }

  const byLight: Metrics['by_lighting'] = {};
  for (const l of new Set(rows.map((r) => r.lighting))) {
    const g = genuine.filter((r) => r.lighting === l);
    const a = attacks.filter((r) => r.lighting === l);
    byLight[l] = { genuine: g.length, attacks: a.length, bpcer_strict: rate(g.filter(notPassed).length, g.length), apcer: rate(a.filter(accepted).length, a.length) };
  }

  const count = (rs: MetricRow[]) => rs.reduce<Record<string, number>>((m, r) => { const k = r.flash_verdict ?? 'none'; m[k] = (m[k] ?? 0) + 1; return m; }, {});

  const notes: string[] = [];
  if (genuine.length < MIN_GENUINE) notes.push(`Only ${genuine.length} genuine captures: collect at least ${MIN_GENUINE} before quoting a false-reject rate.`);
  for (const [t, r] of Object.entries(byType)) {
    if (r.n < MIN_ATTACKS_PER_TYPE) notes.push(`Only ${r.n} "${t}" attacks: collect at least ${MIN_ATTACKS_PER_TYPE} per attack type.`);
  }
  if (attacks.length === 0) notes.push('No attack captures yet: the false-accept rate is unmeasured.');
  const groups = ['light', 'medium', 'dark'].filter((g) => (bySkin[g]?.genuine ?? 0) < 30);
  if (groups.length) notes.push(`Fewer than 30 genuine captures in skin group(s): ${groups.join(', ')}. Fairness cannot be judged yet.`);
  const darkVsLight = bySkin.dark && bySkin.light && bySkin.dark.bpcer_strict.rate !== null && bySkin.light.bpcer_strict.rate !== null
    ? (bySkin.dark.bpcer_strict.rate - bySkin.light.bpcer_strict.rate) : null;
  if (darkVsLight !== null && darkVsLight > 0.1 && bySkin.dark.genuine >= 30 && bySkin.light.genuine >= 30) {
    notes.push(`Darker skin tones are stopped ${(darkVsLight * 100).toFixed(0)} points more often than lighter ones: investigate before launch.`);
  }

  return {
    totals: { genuine: genuine.length, attacks: attacks.length },
    bpcer: { strict: rate(genuine.filter(notPassed).length, genuine.length), hard: rate(genuine.filter((r) => r.verdict === 'fail').length, genuine.length) },
    apcer: { overall: rate(attacks.filter(accepted).length, attacks.length), by_attack_type: byType, worst_attack_type: worst },
    by_skin_group: bySkin,
    by_lighting: byLight,
    flash: { genuine: count(genuine), attacks: count(attacks) },
    adequacy: { ok: notes.length === 0, notes },
  };
}

/** CSV with proper quoting. Contains NO personal data: participant code, labels and measurements only. */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;        // spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

// ─── Storage ────────────────────────────────────────────────────────────────

export async function storeCaptureFrames(studyId: string, captureId: string, frames: Buffer[]): Promise<string[]> {
  const keys: string[] = [];
  const jobs = frames.map((buf, i) => ({ key: `eval/${studyId}/${captureId}/${String(i).padStart(3, '0')}.jpg`, buf }));
  for (let i = 0; i < jobs.length; i += 8) {      // bounded concurrency; each object is encrypted by uploadToS3
    await Promise.all(jobs.slice(i, i + 8).map((j) => uploadToS3(j.key, j.buf, 'image/jpeg')));
  }
  for (const j of jobs) keys.push(j.key);
  return keys;
}

async function deleteKeys(keys: string[]): Promise<boolean> {
  let ok = true;
  for (const k of keys) {
    try { await deleteFromS3(k); } catch (err) { ok = false; logger.error('Eval purge: delete failed', { key: k, error: (err as Error).message }); }
  }
  return ok;
}

/** Retention: frames past their study's retention window. Rows (the measurements) stay; only the images go. */
export async function purgeExpiredEvalFrames(): Promise<number> {
  const rows = await query<{ id: string; frame_s3_keys: string[] }>(
    `SELECT id, frame_s3_keys FROM liveness_eval_captures WHERE purged_at IS NULL AND purge_after < NOW() LIMIT 200`
  );
  for (const r of rows) {
    if (await deleteKeys(r.frame_s3_keys ?? [])) {
      await query(`UPDATE liveness_eval_captures SET frame_s3_keys = '[]', purged_at = NOW() WHERE id = $1`, [r.id]);
    }
  }
  return rows.length;
}

/** Withdrawal: delete the participant's images AND their measurements. The participant row stays as a code only. */
export async function withdrawParticipant(participantId: string): Promise<{ captures: number; filesDeleted: boolean }> {
  const caps = await query<{ id: string; frame_s3_keys: string[] }>(
    `SELECT id, frame_s3_keys FROM liveness_eval_captures WHERE participant_id = $1`, [participantId]
  );
  const ok = await deleteKeys(caps.flatMap((c) => c.frame_s3_keys ?? []));
  if (!ok) return { captures: caps.length, filesDeleted: false };   // keep the rows so the purge can retry; do not claim deletion
  await query(`DELETE FROM liveness_eval_captures WHERE participant_id = $1`, [participantId]);
  await query(`UPDATE liveness_eval_participants SET withdrawn_at = NOW(), age_band = NULL, gender = NULL, skin_tone = NULL, country = NULL WHERE id = $1`, [participantId]);
  return { captures: caps.length, filesDeleted: true };
}

export const newCaptureId = () => uuidv4();
