import { Router, Request, Response } from 'express';
import { resolveApiKeyByServiceCode, callbackSecretMatches, handleCheckStatus, handleVerify } from '../services/ussd.service';
import logger from '../utils/logger';
import { claimCooldown } from '../utils/metrics';
import { withinLimit } from '../utils/windowed-limit';

const router = Router();

// A USSD aggregator's callback has no way to carry a Bearer token - the
// short code dialed (serviceCode) is how this resolves back to a platform's
// api_key instead. In production this endpoint should also be restricted to
// the configured aggregator's IP range at the network/proxy level; nothing
// in this codebase currently does that, since it depends on which telco
// aggregator ends up in front of it.
//
// Body shape matches Africa's Talking's USSD callback contract
// (sessionId, serviceCode, phoneNumber, text) - the same aggregator already
// used for SMS in otp.service.ts. Other aggregators (Termii, etc.) that
// speak a different shape would need a small adapter here, not a rewrite.
/**
 * A USSD session proves that the person holds the SIM ONLY IF the request really comes from the carrier's
 * aggregator. This endpoint is public and the aggregator cannot sign its callbacks, so without a secret anyone who
 * knows a short code could POST any phone number and have it marked verified (no code is involved), burn a
 * customer's quota, trigger their webhook, or read whether any number is verified.
 *
 * Each API key therefore has its OWN secret (shown once, stored only as a hash), carried in the callback URL the
 * customer registers with their aggregator:
 *     https://<api>/v1/ussd/callback?key=<secret>      (or the header X-USSD-Secret)
 * Per key, so one customer's secret cannot be used against another customer's short code. A key without a secret,
 * an unknown short code and a wrong secret all get the same refusal: failing closed, and revealing nothing.
 */
function providedSecret(req: Request): string {
  return String(req.query.key ?? req.header('x-ussd-secret') ?? '');
}

async function refuse(res: Response, reason: string): Promise<void> {
  if (await claimCooldown('ussd-unauthorized', 60)) logger.warn(`USSD callback refused: ${reason}`);
  res.status(401).send('END Unauthorized.');
}

router.post('/callback', async (req: Request, res: Response): Promise<void> => {
  res.set('Content-Type', 'text/plain');

  const { serviceCode, phoneNumber, text } = req.body as {
    sessionId?: string;
    serviceCode?: string;
    phoneNumber?: string;
    text?: string;
  };

  if (!serviceCode || !phoneNumber) {
    res.send('END Invalid request.');
    return;
  }

  const apiKey = await resolveApiKeyByServiceCode(serviceCode);
  if (!apiKey) { await refuse(res, 'unknown service code'); return; }
  if (!apiKey.ussd_callback_secret_hash) { await refuse(res, `key ${apiKey.id} has no callback secret yet: its owner must generate one in the dashboard and update the URL at the aggregator`); return; }
  if (!callbackSecretMatches(apiKey.ussd_callback_secret_hash, providedSecret(req))) { await refuse(res, `wrong or missing secret for key ${apiKey.id} (forged request, or the aggregator URL is out of date)`); return; }

  // after authentication (so a stranger can never use up someone else's allowance), even a genuine aggregator should not be able to drive unlimited work for one number
  if (!(await withinLimit('ussd:phone', phoneNumber, 30, 3600))) {
    res.send('END Too many requests for this number. Please try again later.');
    return;
  }

  const input = (text ?? '').trim();

  try {
    if (input === '') {
      res.send('CON Welcome to AfriVerify\n1. Verify my phone number\n2. Check my verification status');
      return;
    }
    if (input === '1') {
      res.send(await handleVerify(phoneNumber, apiKey));
      return;
    }
    if (input === '2') {
      res.send(await handleCheckStatus(phoneNumber));
      return;
    }
    res.send('END Invalid option.');
  } catch (err) {
    logger.error('USSD callback failed', { error: (err as Error).message, serviceCode });
    res.send('END Something went wrong. Please try again.');
  }
});

export default router;
