/**
 * Sandbox utilities — only accessible with sandbox-environment API keys.
 * Provides test credentials and state-reset tooling for integration testing.
 *
 * Base path: /v1/sandbox
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { query } from '../db';
import logger from '../utils/logger';

const router = Router();

router.use(authenticate);

// Enforce sandbox-only access on every route in this router.
router.use((req: Request, res: Response, next) => {
  if (req.apiKey?.environment !== 'sandbox') {
    res.status(403).json({
      error: 'sandbox_only',
      message: 'This endpoint is only available with a sandbox API key.',
    });
    return;
  }
  next();
});

// ─── Test credentials ────────────────────────────────────────────────────────
//
// These document IDs are intercepted before any real identity provider is
// called.  Pass them in POST /v1/verify/* flows to trigger deterministic
// sandbox outcomes without consuming real KYC credits.

export const SANDBOX_CREDENTIALS: Record<
  string,
  { documentType: string; documentId: string; outcome: string; description: string }[]
> = {
  NG: [
    { documentType: 'NIN',  documentId: 'TEST_NG_PASS_001', outcome: 'pass',        description: 'Valid NIN — verification succeeds, trust score 0.85' },
    { documentType: 'NIN',  documentId: 'TEST_NG_FAIL_001', outcome: 'fail',         description: 'Invalid NIN — verification fails with name mismatch' },
    { documentType: 'NIN',  documentId: 'TEST_NG_AML_001',  outcome: 'aml_flagged',  description: 'AML-flagged identity — VIT issued with aml_flagged flag' },
    { documentType: 'NIN',  documentId: 'TEST_NG_BL_001',   outcome: 'blacklisted',  description: 'Blacklisted identity — VIT issued with blacklisted flag' },
  ],
  GH: [
    { documentType: 'GHANA_CARD', documentId: 'TEST_GH_PASS_001', outcome: 'pass', description: 'Valid Ghana Card — verification succeeds' },
    { documentType: 'GHANA_CARD', documentId: 'TEST_GH_FAIL_001', outcome: 'fail', description: 'Invalid Ghana Card — document not found' },
  ],
  KE: [
    { documentType: 'NATIONAL_ID', documentId: 'TEST_KE_PASS_001', outcome: 'pass', description: 'Valid Kenya ID — verification succeeds' },
    { documentType: 'NATIONAL_ID', documentId: 'TEST_KE_FAIL_001', outcome: 'fail', description: 'Invalid Kenya ID — not found in IPRS' },
  ],
  ZA: [
    { documentType: 'SA_ID', documentId: 'TEST_ZA_PASS_001', outcome: 'pass', description: 'Valid SA ID — verification succeeds' },
  ],
  GLOBAL: [
    { documentType: 'PASSPORT', documentId: 'TEST_PASS_PASS_001', outcome: 'pass', description: 'Valid passport — verification succeeds (all countries)' },
    { documentType: 'PASSPORT', documentId: 'TEST_PASS_FAIL_001', outcome: 'fail', description: 'Invalid passport — verification fails' },
  ],
};

/**
 * GET /v1/sandbox/credentials
 *
 * Returns the full table of test document IDs, grouped by country.
 * Each entry documents the outcome it triggers in the sandbox.
 */
router.get('/credentials', (_req: Request, res: Response): void => {
  res.json({
    credentials: SANDBOX_CREDENTIALS,
    note: 'Use these document IDs in POST /v1/verify/initiate flows. Real identity providers are never called for these test IDs.',
  });
});

/**
 * POST /v1/sandbox/reset
 *
 * Wipes the sandbox identity state for a given platform_user_id so the
 * full verification flow can be re-run from scratch.
 *
 * Deletes:
 *   - platform_connections row for this platform + user
 *   - verified_identities row if no other active platform connections exist
 *
 * Body: { platform_user_id: string }
 */
router.post('/reset', async (req: Request, res: Response): Promise<void> => {
  const { platform_user_id } = req.body as { platform_user_id?: string };
  const apiKey = req.apiKey!;

  if (!platform_user_id || typeof platform_user_id !== 'string') {
    res.status(400).json({ error: 'validation_error', message: 'platform_user_id is required' });
    return;
  }

  try {
    // Find the connection for this sandbox platform user
    const conn = await query<{ identity_id: string }>(
      `SELECT identity_id FROM platform_connections
       WHERE platform_name = $1 AND platform_user_id = $2`,
      [apiKey.platform_name, platform_user_id]
    );

    if (conn.length === 0) {
      res.json({ reset: false, reason: 'no_state_found' });
      return;
    }

    const identityId = conn[0].identity_id;

    // Remove the platform connection
    await query(
      `DELETE FROM platform_connections
       WHERE platform_name = $1 AND platform_user_id = $2`,
      [apiKey.platform_name, platform_user_id]
    );

    // Check whether any other platforms still reference this identity
    const remaining = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM platform_connections
       WHERE identity_id = $1 AND is_active = true`,
      [identityId]
    );

    const shouldDeleteIdentity = parseInt(remaining[0]?.count ?? '0') === 0;

    if (shouldDeleteIdentity) {
      await query(`DELETE FROM verified_identities WHERE id = $1`, [identityId]);
    }

    logger.info('Sandbox state reset', {
      platform: apiKey.platform_name,
      platform_user_id,
      identity_deleted: shouldDeleteIdentity,
    });

    res.json({
      reset: true,
      platform_user_id,
      identity_deleted: shouldDeleteIdentity,
    });
  } catch (err) {
    logger.error('Sandbox reset error', { error: (err as Error).message });
    res.status(500).json({ error: 'internal_error', message: 'Reset failed' });
  }
});

/**
 * GET /v1/sandbox/state/:platformUserId
 *
 * Returns the current sandbox state for a platform user — useful for
 * assertions in integration tests.
 */
router.get('/state/:platformUserId', async (req: Request, res: Response): Promise<void> => {
  const { platformUserId } = req.params;
  const apiKey = req.apiKey!;

  try {
    const rows = await query<{
      identity_id: string;
      verification_level: number;
      trust_score: number;
      is_blacklisted: boolean;
      aml_status: string;
      platform_user_id: string;
      is_active: boolean;
    }>(
      `SELECT vi.id AS identity_id, vi.verification_level, vi.trust_score,
              vi.is_blacklisted, vi.aml_status, pc.platform_user_id, pc.is_active
       FROM platform_connections pc
       JOIN verified_identities vi ON vi.id = pc.identity_id
       WHERE pc.platform_name = $1 AND pc.platform_user_id = $2`,
      [apiKey.platform_name, platformUserId]
    );

    if (rows.length === 0) {
      res.json({ exists: false });
      return;
    }

    res.json({ exists: true, state: rows[0] });
  } catch (err) {
    logger.error('Sandbox state lookup error', { error: (err as Error).message });
    res.status(500).json({ error: 'internal_error', message: 'State lookup failed' });
  }
});

export default router;
