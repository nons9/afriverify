import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sessionAuth } from '../middleware/sessionAuth';
import { validateBody } from '../middleware/validate';
import { queryOne } from '../db';
import { verifyPassword } from '../services/password';
import {
  getStatus, beginSetup, confirmSetup, disable, replaceRecoveryCodes,
  verifyLoginCode, verifyAuthenticatorCode, notifyOwner, isLocked,
} from '../services/mfa.service';

const router = Router();
router.use(sessionAuth);

const codeSchema = z.object({ code: z.string().min(6).max(32) });
const disableSchema = z.object({ password: z.string().min(1).max(128), code: z.string().min(6).max(32) });

function refuse(res: Response, reason: 'locked' | 'invalid' | 'no_setup'): void {
  if (reason === 'locked') res.status(429).json({ error: 'mfa_locked', message: 'Too many wrong codes. Try again in 15 minutes.' });
  else if (reason === 'no_setup') res.status(409).json({ error: 'no_setup', message: 'Start setup first.' });
  else res.status(401).json({ error: 'invalid_code', message: 'That code is not right. Check the 6 digits in your authenticator app.' });
}

// GET /v1/auth/mfa/status
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  res.json(await getStatus(req.developer!.id));
});

// POST /v1/auth/mfa/setup : returns the secret ONCE, with the address an authenticator app can scan
router.post('/setup', async (req: Request, res: Response): Promise<void> => {
  const out = await beginSetup(req.developer!.id, req.developer!.email);
  if (out === 'already_enabled') {
    res.status(409).json({ error: 'already_enabled', message: 'Two-step verification is already on. Turn it off first to set it up again.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json(out);
});

// POST /v1/auth/mfa/enable : proves the app works, then turns it on and returns the recovery codes ONCE
router.post('/enable', validateBody(codeSchema), async (req: Request, res: Response): Promise<void> => {
  const out = await confirmSetup(req.developer!.id, (req.body as z.infer<typeof codeSchema>).code);
  if (!out.ok) { refuse(res, out.reason); return; }
  void notifyOwner(req.developer!.email, 'enabled');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ enabled: true, recovery_codes: out.recovery_codes });
});

// POST /v1/auth/mfa/disable : needs the password AND a current code, so a stolen session alone cannot switch it off
router.post('/disable', validateBody(disableSchema), async (req: Request, res: Response): Promise<void> => {
  const { password, code } = req.body as z.infer<typeof disableSchema>;
  const id = req.developer!.id;
  const status = await getStatus(id);
  if (!status.enabled) { res.status(409).json({ error: 'not_enabled', message: 'Two-step verification is not on.' }); return; }
  if (await isLocked(id)) { refuse(res, 'locked'); return; }
  const row = await queryOne<{ password_hash: string }>('SELECT password_hash FROM developers WHERE id = $1', [id]);
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid credentials' });
    return;
  }
  const result = await verifyLoginCode(id, code);
  if (!result.ok) { refuse(res, result.reason); return; }
  await disable(id);
  void notifyOwner(req.developer!.email, 'disabled');
  res.json({ enabled: false });
});

// POST /v1/auth/mfa/recovery-codes : replaces the set; needs a current authenticator code
router.post('/recovery-codes', validateBody(codeSchema), async (req: Request, res: Response): Promise<void> => {
  const id = req.developer!.id;
  const status = await getStatus(id);
  if (!status.enabled) { res.status(409).json({ error: 'not_enabled', message: 'Two-step verification is not on.' }); return; }
  const check = await verifyAuthenticatorCode(id, (req.body as z.infer<typeof codeSchema>).code);
  if (!check.ok) { refuse(res, check.reason); return; }
  const codes = await replaceRecoveryCodes(id);
  void notifyOwner(req.developer!.email, 'recovery_codes_replaced');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ recovery_codes: codes });
});

export default router;
