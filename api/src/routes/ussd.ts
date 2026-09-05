import { Router, Request, Response } from 'express';
import { resolveApiKeyByServiceCode, handleCheckStatus, handleVerify } from '../services/ussd.service';
import logger from '../utils/logger';

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
  if (!apiKey) {
    logger.warn('USSD callback for unregistered service code', { serviceCode });
    res.send('END This service is not configured.');
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
