/**
 * Public, machine-readable API contract: GET /v1/openapi.yaml and /v1/openapi.json.
 * Integrators and tools (Postman, code generators, API gateways) look for this first.
 */
import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { parse } from 'yaml';

const router = Router();
let cache: { yaml: string; json: string; etag: string } | null = null;

function load() {
  if (cache) return cache;
  const yaml = readFileSync(path.join(__dirname, '..', '..', 'openapi.yaml'), 'utf8');
  const json = JSON.stringify(parse(yaml));
  cache = { yaml, json, etag: `"${createHash('sha256').update(yaml).digest('hex').slice(0, 16)}"` };
  return cache;
}

function send(kind: 'yaml' | 'json') {
  return (req: Request, res: Response): void => {
    const c = load();
    res.setHeader('ETag', c.etag);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');           // public, read-only documentation
    if (req.headers['if-none-match'] === c.etag) { res.status(304).end(); return; }
    res.type(kind === 'yaml' ? 'application/yaml; charset=utf-8' : 'application/json; charset=utf-8').send(kind === 'yaml' ? c.yaml : c.json);
  };
}

router.get('/openapi.yaml', send('yaml'));
router.get('/openapi.json', send('json'));

export default router;
