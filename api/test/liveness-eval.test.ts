import test from 'node:test';
import assert from 'node:assert/strict';
import * as s3 from '../src/utils/s3';
import * as db from '../src/db';
import {
  wilson, rate, skinGroup, computeMetrics, computeCoverage, toCsv, storeCaptureFrames, purgeExpiredEvalFrames, withdrawParticipant, MetricRow,
} from '../src/services/liveness-eval.service';

const near = (a: number, b: number, tol = 0.002) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('wilson interval matches known values', () => {
  const zero = wilson(0, 30)!;                    // 0 errors in 30 trials: upper bound ~11.4% (the "rule of three" says ~10%)
  near(zero.low, 0); near(zero.high, 0.1135, 0.003);
  const half = wilson(5, 10)!;                    // textbook: 0.237 .. 0.763
  near(half.low, 0.2366, 0.003); near(half.high, 0.7634, 0.003);
  const all = wilson(30, 30)!; near(all.high, 1); near(all.low, 0.8865, 0.003);
  assert.equal(wilson(0, 0), null);
});

test('more data tightens the interval', () => {
  const small = wilson(0, 30)!, big = wilson(0, 300)!;
  assert.ok(big.high < small.high / 5);
});

test('rate handles an empty sample without NaN', () => {
  const r = rate(0, 0);
  assert.equal(r.rate, null); assert.equal(r.low, null);
});

test('skin groups follow the Monk scale', () => {
  assert.equal(skinGroup(1), 'light'); assert.equal(skinGroup(3), 'light');
  assert.equal(skinGroup(4), 'medium'); assert.equal(skinGroup(6), 'medium');
  assert.equal(skinGroup(7), 'dark'); assert.equal(skinGroup(10), 'dark');
  assert.equal(skinGroup(null), 'unknown');
});

const g = (verdict: MetricRow['verdict'], skin = 5, lighting = 'indoor_bright', flash: string | null = 'pass'): MetricRow =>
  ({ label: 'genuine', attack_type: null, verdict, lighting, skin_tone: skin, flash_verdict: flash });
const a = (type: string, verdict: MetricRow['verdict'], lighting = 'indoor_bright', flash: string | null = 'fail'): MetricRow =>
  ({ label: 'attack', attack_type: type, verdict, lighting, skin_tone: 5, flash_verdict: flash });

test('APCER counts only automatic passes; review and fail both defend', () => {
  const m = computeMetrics([a('screen_video', 'pass'), a('screen_video', 'review'), a('screen_video', 'fail'), a('screen_video', 'fail')]);
  assert.equal(m.apcer.overall.k, 1); assert.equal(m.apcer.overall.n, 4);
  assert.equal(m.apcer.by_attack_type.screen_video.rate, 0.25);
});

test('BPCER strict counts review+fail, hard counts only fail', () => {
  const m = computeMetrics([g('pass'), g('pass'), g('review'), g('fail')]);
  assert.equal(m.bpcer.strict.k, 2); assert.equal(m.bpcer.hard.k, 1); assert.equal(m.bpcer.strict.n, 4);
});

test('the worst attack type is named', () => {
  const m = computeMetrics([a('print_photo', 'fail'), a('screen_video', 'pass'), a('screen_video', 'fail'), a('mask', 'review')]);
  assert.equal(m.apcer.worst_attack_type, 'screen_video');
});

test('small samples are called out, never presented as proof', () => {
  const m = computeMetrics([g('pass'), a('screen_video', 'fail')]);
  assert.equal(m.adequacy.ok, false);
  assert.ok(m.adequacy.notes.some((n) => n.includes('genuine captures')));
  assert.ok(m.adequacy.notes.some((n) => n.includes('screen_video')));
  assert.ok(m.adequacy.notes.some((n) => n.includes('skin group')));
});

test('no attacks yet is stated plainly', () => {
  assert.ok(computeMetrics([g('pass')]).adequacy.notes.some((n) => n.includes('unmeasured')));
});

test('a fairness gap between skin groups is flagged once both groups have enough data', () => {
  const rows: MetricRow[] = [];
  for (let i = 0; i < 40; i++) rows.push(g(i < 38 ? 'pass' : 'review', 2));       // light: 5% stopped
  for (let i = 0; i < 40; i++) rows.push(g(i < 28 ? 'pass' : 'review', 9));       // dark: 30% stopped
  const m = computeMetrics(rows);
  assert.ok(m.adequacy.notes.some((n) => n.includes('Darker skin tones are stopped')), JSON.stringify(m.adequacy.notes));
  near(m.by_skin_group.dark.bpcer_strict.rate!, 0.3, 1e-9);
});

test('no fairness claim from tiny groups', () => {
  const m = computeMetrics([g('pass', 2), g('review', 9)]);
  assert.ok(!m.adequacy.notes.some((n) => n.includes('Darker skin tones are stopped')));
});

test('Lite and Standard are measured separately so Lite cannot hide behind Standard', () => {
  const l = (v: MetricRow['verdict']): MetricRow => ({ ...g(v), capture_profile: 'lite' });
  const la = (v: MetricRow['verdict']): MetricRow => ({ ...a('screen_video', v), capture_profile: 'lite' });
  const m = computeMetrics([g('pass'), g('pass'), l('pass'), l('review'), a('screen_video', 'fail'), la('pass'), la('fail')]);
  assert.equal(m.by_profile.standard.genuine, 2); assert.equal(m.by_profile.lite.genuine, 2);
  assert.equal(m.by_profile.standard.apcer.k, 0); assert.equal(m.by_profile.lite.apcer.k, 1, 'the lite breach is visible');
  assert.equal(m.by_profile.lite.bpcer_strict.k, 1);
  assert.equal(computeMetrics([g('pass')]).by_profile.standard.genuine, 1, 'rows without a profile count as standard');
});

test('flash verdicts are tallied separately for genuine and attacks', () => {
  const m = computeMetrics([g('pass', 5, 'indoor_bright', 'pass'), g('review', 5, 'outdoor_sun', 'inconclusive'), a('screen_video', 'fail', 'indoor_bright', 'fail')]);
  assert.deepEqual(m.flash.genuine, { pass: 1, inconclusive: 1 });
  assert.deepEqual(m.flash.attacks, { fail: 1 });
  assert.equal(m.by_lighting.outdoor_sun.bpcer_strict.k, 1);
});

test('CSV quotes fields and neutralises spreadsheet formulas', () => {
  const csv = toCsv(['a', 'b'], [['x,y', '=HYPERLINK("http://evil")'], ['say "hi"', null], ['+1', 5]]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[1], `"x,y",'=HYPERLINK("http://evil")`.replace(`'=HYPERLINK("http://evil")`, `"'=HYPERLINK(""http://evil"")"`));
  assert.equal(lines[2], '"say ""hi""",');
  assert.equal(lines[3], "'+1,5");
});

// ─── storage behaviour with an in-memory stand-in for object storage and the database ───────────────

test('frames are stored under the study, encrypted by the shared uploader, in bounded batches', async () => {
  const uploaded: string[] = [];
  (s3 as any).uploadToS3 = async (key: string) => { uploaded.push(key); };
  const keys = await storeCaptureFrames('study-1', 'cap-1', Array.from({ length: 20 }, () => Buffer.from('x')));
  assert.equal(keys.length, 20);
  assert.equal(keys[0], 'eval/study-1/cap-1/000.jpg');
  assert.deepEqual(uploaded.sort(), keys.sort());
});

test('retention purge deletes images but keeps the measurements, and retries on failure', async () => {
  const deleted: string[] = []; const updates: string[] = [];
  let failNext = false;
  (s3 as any).deleteFromS3 = async (k: string) => { if (failNext) throw new Error('boom'); deleted.push(k); };
  (db as any).query = async (sql: string, params: unknown[]) => {
    if (sql.includes('SELECT id, frame_s3_keys')) return [{ id: 'c1', frame_s3_keys: ['k1', 'k2'] }, { id: 'c2', frame_s3_keys: ['k3'] }];
    if (sql.includes("SET frame_s3_keys = '[]'")) updates.push(String(params[0]));
    return [];
  };
  assert.equal(await purgeExpiredEvalFrames(), 2);
  assert.deepEqual(deleted, ['k1', 'k2', 'k3']); assert.deepEqual(updates, ['c1', 'c2']);
  deleted.length = 0; updates.length = 0; failNext = true;
  await purgeExpiredEvalFrames();
  assert.deepEqual(updates, [], 'a failed delete must not be recorded as purged');
});

test('withdrawal deletes images and measurements, and never claims success if a file survives', async () => {
  const ran: string[] = [];
  (db as any).query = async (sql: string) => {
    if (sql.includes('SELECT id, frame_s3_keys')) return [{ id: 'c1', frame_s3_keys: ['a', 'b'] }];
    ran.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
    return [];
  };
  (s3 as any).deleteFromS3 = async () => undefined;
  assert.deepEqual(await withdrawParticipant('p1'), { captures: 1, filesDeleted: true });
  assert.ok(ran.some((r) => r.startsWith('DELETE FROM liveness_eval_captures')));
  assert.ok(ran.some((r) => r.startsWith('UPDATE liveness_eval_participants')));

  ran.length = 0;
  (s3 as any).deleteFromS3 = async () => { throw new Error('storage down'); };
  assert.deepEqual(await withdrawParticipant('p1'), { captures: 1, filesDeleted: false });
  assert.equal(ran.length, 0, 'nothing may be deleted or marked withdrawn when files remain');
});

test('coverage: empty study asks for everything and is not complete', () => {
  const c = computeCoverage([]);
  assert.equal(c.complete, false);
  assert.equal(c.genuine.total.have, 0);
  assert.ok(c.next_up.length > 0 && c.next_up.length <= 6);
});

test('coverage: counts skin groups, lightings and devices, and suggests the biggest gap first', () => {
  const rows: MetricRow[] = [];
  for (let i = 0; i < 40; i++) rows.push({ label: 'genuine', verdict: 'pass', lighting: 'indoor_bright', skin_tone: 2, device: 'Pixel 7' } as MetricRow);
  for (let i = 0; i < 3; i++) rows.push({ label: 'genuine', verdict: 'pass', lighting: 'outdoor', skin_tone: 9, device: 'Tecno Spark' } as MetricRow);
  for (let i = 0; i < 31; i++) rows.push({ label: 'attack', attack_type: 'print_photo', verdict: 'fail', lighting: 'indoor_bright', skin_tone: 2, device: i % 2 ? 'A' : 'B' } as MetricRow);
  const c = computeCoverage(rows);
  assert.equal(c.genuine.by_skin_group.light.have, 40);
  assert.equal(c.genuine.by_skin_group.dark.have, 3);
  assert.equal(c.genuine.devices.have, 2);
  assert.equal(c.attacks.print_photo.count.have, 31);
  assert.equal(c.attacks.print_photo.lightings.have, 1);
  assert.equal(c.complete, false);
  assert.ok(c.next_up.every((n, i, a) => i === 0 || a[i - 1].shortfall >= n.shortfall));
});
