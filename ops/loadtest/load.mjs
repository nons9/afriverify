#!/usr/bin/env node
// Small dependency-free load tester (Node 18+). NEVER point this at production: it creates real work and, for
// the API scenario, real database rows. Run it against a copy of the stack (same Dockerfiles, same Railway
// plan size) and compare numbers there.
//
//   node load.mjs engine  --url http://127.0.0.1:8100 --key SERVICE_KEY --frames ./frames --concurrency 4 --seconds 30
//   node load.mjs api-read --url http://127.0.0.1:3000 --concurrency 20 --seconds 20
//
// engine:   POSTs a 16-frame capture to /v1/liveness/analyze (the heavy path: landmarks, passive checks, flash).
//           ./frames must hold JPEGs of a face (they need not pass: the compute is the same).
// api-read: GETs /health/ready and /v1/plans alternately.
import fs from 'node:fs';
import path from 'node:path';

const [, , scenario, ...rest] = process.argv;
const opt = (name, def) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : def; };
const url = (opt('url', '') || '').replace(/\/$/, '');
const conc = parseInt(opt('concurrency', '4'), 10);
const seconds = parseInt(opt('seconds', '20'), 10);
if (!scenario || !url) { console.error('usage: node load.mjs <engine|api-read> --url <base> [--key K] [--frames DIR] [--concurrency N] [--seconds S]'); process.exit(2); }

const lat = []; let errors = 0; const statuses = {};
let makeRequest;

if (scenario === 'engine') {
  const dir = opt('frames', './frames');
  const files = fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort().slice(0, 16);
  if (files.length < 8) { console.error('need at least 8 JPEGs in --frames'); process.exit(2); }
  const bufs = files.map((f) => fs.readFileSync(path.join(dir, f)));
  const key = opt('key', '');
  const meta = JSON.stringify({ challenges: ['blink', 'smile'], timestamps_ms: bufs.map((_, i) => i * 200) });
  makeRequest = async () => {
    const fd = new FormData();
    fd.append('meta', meta);
    bufs.forEach((b, i) => fd.append('frames', new Blob([b], { type: 'image/jpeg' }), `f${i}.jpg`));
    return fetch(`${url}/v1/liveness/analyze`, { method: 'POST', body: fd, headers: key ? { 'X-Internal-Key': key } : {} });
  };
} else if (scenario === 'api-read') {
  let n = 0;
  makeRequest = () => fetch(`${url}${n++ % 2 ? '/v1/plans' : '/health/ready'}`);
} else { console.error('unknown scenario'); process.exit(2); }

const end = Date.now() + seconds * 1000;
async function worker() {
  while (Date.now() < end) {
    const t = performance.now();
    try {
      const r = await makeRequest();
      await r.arrayBuffer();
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      if (r.status >= 500 || r.status === 429) errors++;
      lat.push(performance.now() - t);
    } catch { errors++; statuses.network = (statuses.network ?? 0) + 1; }
  }
}
const started = Date.now();
await Promise.all(Array.from({ length: conc }, worker));
const secs = (Date.now() - started) / 1000;
lat.sort((a, b) => a - b);
const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))] : NaN).toFixed(0);
console.log(JSON.stringify({
  scenario, concurrency: conc, seconds: Math.round(secs), requests: lat.length, errors,
  requests_per_second: +(lat.length / secs).toFixed(2),
  latency_ms: { p50: +pct(50), p95: +pct(95), p99: +pct(99), max: +(lat[lat.length - 1] ?? NaN).toFixed(0) },
  statuses,
}));
