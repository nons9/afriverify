import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { rateLimitApiKey } from '../middleware/rateLimit';
import { validateBody, validateQuery } from '../middleware/validate';
import { writeAuditEvent } from '../middleware/audit';
import { query, queryOne } from '../db';
import { sha256 } from '../utils/crypto';
import { issueVIT } from '../services/vit.service';
import { recordContinuity } from '../services/orbitshield/live-ledger.service';
import { recordFraudSignal, evaluateNetworkRisk } from '../services/orbitshield/fraud-graph.service';
import { addVouch, getVouchStatus, applyFraudPenalties } from '../services/orbitshield/community-vouch.service';
import { addToBlacklist } from '../services/blacklist.service';
import { VerifiedIdentity } from '../types';
import logger from '../utils/logger';

const router = Router();
router.use(authenticate);
router.use(rateLimitApiKey);

// ─── GET /identity/check ─────────────────────────────────────────────────────────────────────────────────────
const checkQuerySchema = z.object({
  phone: z.string().min(7).max(20)
});

router.get(
  '/check',
  requirePermission('check'),
  validateQuery(checkQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    const { phone } = req.query as { phone: string };

    const identity = await queryOne<Pick<
      VerifiedIdentity,
      'id' | 'verification_level' | 'trust_score' | 'trust_level' | 'is_blacklisted' | 'aml_status' | 'is_pep'
    >>(
      `SELECT id, verification_level, trust_score, trust_level, is_blacklisted, aml_status, is_pep
       FROM verified_identities
       WHERE phone = $1`,
      [phone]
    );

    if (!identity) {
      res.json({ verified: false, level: 0, trust_score: null, trust_level: null, flags: [] });
      return;
    }

    const flags: string[] = [];
    if (identity.is_blacklisted) flags.push('blacklisted');
    if (identity.is_pep) flags.push('pep');
    if (identity.aml_status === 'flagged') flags.push('aml_flagged');

    const continuityPromise = recordContinuity({
      identityId: identity.id,
      platformName: req.platform ?? 'unknown',
      ipAddress: req.ip ?? undefined,
      deviceId: (req.headers['x-device-id'] as string) ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined
    }).catch((err) => {
      logger.error('LiveLedger: continuity check failed', { error: err.message });
      return { continuityScore: 100, flags: [] as string[] };
    });

    const networkRiskPromise = evaluateNetworkRisk(
      identity.id,
      (req.headers['x-device-id'] as string) ?? undefined,
      req.ip ?? undefined
    ).catch((err) => {
      logger.error('FraudGraph: evaluation failed', { error: err.message });
      return { networkRiskScore: 0, connectedFraudReports: 0, riskFactors: [] as string[] };
    });

    const [continuity, networkRisk] = await Promise.all([continuityPromise, networkRiskPromise]);

    res.json({
      verified: identity.verification_level >= 1,
      level: identity.verification_level,
      trust_score: identity.trust_score,
      trust_level: identity.trust_level,
      flags,
      orbitshield: {
        continuity_score: continuity.continuityScore,
        continuity_flags: continuity.flags,
        network_risk_score: networkRisk.networkRiskScore,
        network_risk_factors: networkRisk.riskFactors
      }
    });
  }
);

// ─── POST /identity/connect ───────────────────────────────────────────────────────────────────────────────────────
// Connect by identity_id (platform already knows it), or by phone so a platform
// can link a user it only knows by phone number. Phone mode requires a
// consent_reference (the platform's record of the user's consent), which is
// written to the audit trail with the connection.
const connectSchema = z
  .object({
    identity_id: z.string().uuid().optional(),
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'phone must be E.164, e.g. +2348012345678').optional(),
    platform_user_id: z.string().min(1).max(255),
    consent_reference: z.string().min(1).max(255).optional()
  })
  .refine((b) => Boolean(b.identity_id) !== Boolean(b.phone), {
    message: 'Provide exactly one of identity_id or phone'
  })
  .refine((b) => !b.phone || Boolean(b.consent_reference), {
    message: 'consent_reference is required when connecting by phone',
    path: ['consent_reference']
  });

router.post(
  '/connect',
  requirePermission('verify'),
  validateBody(connectSchema),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as z.infer<typeof connectSchema>;
    const { platform_user_id } = body;
    const platform = req.platform!;
    const apiKey = req.apiKey!;

    const identity = body.identity_id
      ? await queryOne<VerifiedIdentity>('SELECT * FROM verified_identities WHERE id = $1', [body.identity_id])
      : await queryOne<VerifiedIdentity>('SELECT * FROM verified_identities WHERE phone = $1', [body.phone]);
    if (!identity) {
      res.status(404).json({ error: 'identity_not_found', message: 'Identity not found' });
      return;
    }
    if (identity.is_blacklisted && identity.blacklist_scope === 'global') {
      res.status(403).json({ error: 'identity_blocked', message: 'This identity is blocked from all platforms' });
      return;
    }
    const identity_id = identity.id;

    await query(
      `INSERT INTO platform_connections
         (identity_id, platform_name, platform_api_key_id, platform_user_id, last_verified)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (identity_id, platform_name)
       DO UPDATE SET platform_user_id = $4, last_verified = NOW(), is_active = true`,
      [identity_id, platform, apiKey.id, platform_user_id]
    );

    await writeAuditEvent(req, {
      event_type: 'platform_connected',
      identity_id,
      result: 'passed',
      metadata: {
        platform,
        platform_user_id,
        connected_by: body.phone ? 'phone' : 'identity_id',
        ...(body.consent_reference ? { consent_reference: body.consent_reference } : {})
      }
    });

    const { token, payload } = await issueVIT(identity_id);

    const networkRisk = await evaluateNetworkRisk(
      identity_id,
      (req.headers['x-device-id'] as string) ?? undefined,
      req.ip ?? undefined
    ).catch(() => ({ networkRiskScore: 0, connectedFraudReports: 0, riskFactors: [] as string[] }));

    res.json({
      connected: true,
      identity_summary: {
        identity_id,
        name: identity.full_name,
        nationality: identity.nationality,
        verification_level: identity.verification_level,
        trust_score: identity.trust_score,
        trust_level: identity.trust_level
      },
      vit: token,
      vit_payload: payload,
      orbitshield: {
        network_risk_score: networkRisk.networkRiskScore,
        network_risk_factors: networkRisk.riskFactors
      }
    });
  }
);

// ─── GET /identity/profile/:identity_id ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/profile/:identity_id',
  requirePermission('check'),
  async (req: Request, res: Response): Promise<void> => {
    const identity_id = req.params.identity_id as string;

    const identity = await queryOne<VerifiedIdentity>(
      `SELECT id, full_name, nationality, verification_level, trust_score, trust_level,
              aml_status, is_pep, verified_at, created_at
       FROM verified_identities WHERE id = $1`,
      [identity_id]
    );
    if (!identity) {
      res.status(404).json({ error: 'identity_not_found', message: 'Identity not found' });
      return;
    }

    const platforms = await query<{ platform_name: string; connected_at: Date }>(
      `SELECT platform_name, connected_at FROM platform_connections
       WHERE identity_id = $1 AND is_active = true ORDER BY connected_at ASC`,
      [identity_id]
    );

    const vouchStatus = await getVouchStatus(identity_id).catch(() => null);

    res.json({
      identity_id,
      name: identity.full_name,
      nationality: identity.nationality,
      verification_level: identity.verification_level,
      trust_score: identity.trust_score,
      trust_level: identity.trust_level,
      aml_clear: identity.aml_status === 'clear' || identity.aml_status === 'not_screened',
      is_pep: identity.is_pep,
      verified_at: identity.verified_at,
      platforms: platforms.map((p) => ({
        name: p.platform_name,
        connected_at: p.connected_at
      })),
      community_vouch: vouchStatus
        ? { active_vouches: vouchStatus.activeVouches, required: vouchStatus.required }
        : null
    });
  }
);

// ─── POST /identity/flag ────────────────────────────────────────────────────────────────────────────────────────────
const flagSchema = z.object({
  identity_id: z.string().uuid(),
  fraud_type: z.enum([
    'fake_identity', 'impersonation', 'deepfake', 'stolen_id',
    'multiple_accounts', 'scam_network', 'financial_fraud', 'other'
  ]),
  evidence_summary: z.string().min(10).max(2000),
  confidence_score: z.number().min(0).max(1)
});

router.post(
  '/flag',
  requirePermission('verify'),
  validateBody(flagSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { identity_id, fraud_type, evidence_summary, confidence_score } =
      req.body as z.infer<typeof flagSchema>;
    const platform = req.platform!;

    const rows = await query<{ id: string }>(
      `INSERT INTO fraud_intelligence_reports
         (reporting_platform, target_type, target_hash, fraud_type,
          evidence_summary, confidence_score)
       VALUES ($1,'identity',$2,$3,$4,$5)
       RETURNING id`,
      [platform, sha256(identity_id), fraud_type, evidence_summary, confidence_score]
    );

    await writeAuditEvent(req, {
      event_type: 'flag_received',
      identity_id,
      result: 'flagged',
      risk_score: confidence_score,
      metadata: { fraud_type, reported_by: platform }
    });

    recordFraudSignal({
      identityId: identity_id,
      deviceId: (req.headers['x-device-id'] as string) ?? undefined,
      ipAddress: req.ip ?? undefined,
      fraudType: fraud_type,
      reportingPlatform: platform
    }).catch((err) => logger.error('FraudGraph: signal write failed', { error: err.message }));

    if (confidence_score >= 0.9) {
      applyFraudPenalties(identity_id, platform).catch((err) =>
        logger.error('CommunityVouch: penalty propagation failed', { error: err.message })
      );

      // A report at this confidence is treated as confirmed fraud (same bar
      // the vouch-penalty propagation above uses). Without this, a platform
      // could flag someone at 100% confidence and that person could still go
      // re-verify - on the same platform or any other - completely
      // unimpeded, since nothing before this ever called addToBlacklist().
      // scope: 'global' means every platform's /verify/initiate blocks them,
      // not just the one that reported it - this is what actually makes the
      // fraud graph a shared, cross-platform signal instead of a purely
      // advisory score each platform has to remember to check itself.
      const identityPhone = await queryOne<{ phone: string }>(
        `SELECT phone FROM verified_identities WHERE id = $1`,
        [identity_id]
      );
      if (identityPhone) {
        addToBlacklist({
          identity_id,
          type: 'phone',
          value: identityPhone.phone,
          reason: `${fraud_type}: ${evidence_summary}`.slice(0, 500),
          scope: 'global',
          reported_by_platform: platform,
          added_by: 'automated:fraud_flag'
        }).catch((err) => logger.error('Blacklist: auto-block from fraud flag failed', { error: err.message }));
      }
    }

    logger.warn('Fraud flag received', { identity_id, fraud_type, platform, confidence_score });

    res.status(201).json({ report_id: rows[0].id, status: 'received' });
  }
);

// ─── POST /identity/vouch ──────────────────────────────────────────────────────────────────────────────────────────
const vouchSchema = z.object({
  voucher_identity_id: z.string().uuid(),
  vouched_identity_id: z.string().uuid(),
  relationship: z.enum(['personal_acquaintance', 'business_partner', 'family', 'community_member']),
  statement: z.string().min(20).max(500)
});

router.post(
  '/vouch',
  requirePermission('verify'),
  validateBody(vouchSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { voucher_identity_id, vouched_identity_id, relationship, statement } =
      req.body as z.infer<typeof vouchSchema>;

    try {
      const result = await addVouch({
        voucherId: voucher_identity_id,
        vouchedId: vouched_identity_id,
        relationship,
        statement,
        platform: req.platform ?? 'unknown'
      });

      await writeAuditEvent(req, {
        event_type: 'vouch_submitted',
        identity_id: vouched_identity_id,
        result: 'passed',
        metadata: {
          voucher: voucher_identity_id,
          relationship,
          upgraded: result.upgraded
        }
      });

      res.status(201).json({
        vouch_id: result.vouch_id,
        upgraded: result.upgraded,
        message: result.upgraded
          ? 'Vouch accepted. The vouched identity has been upgraded to Level 2.'
          : 'Vouch accepted. More vouches may be needed to qualify for an upgrade.'
      });
    } catch (err) {
      const message = (err as Error).message;
      res.status(400).json({ error: 'vouch_failed', message });
    }
  }
);

// ─── GET /identity/vouches/:identity_id ────────────────────────────────────────────────────────────────────────────
router.get(
  '/vouches/:identity_id',
  requirePermission('check'),
  async (req: Request, res: Response): Promise<void> => {
    const identity_id = req.params.identity_id as string;

    const identity = await queryOne<{ id: string }>(
      'SELECT id FROM verified_identities WHERE id = $1',
      [identity_id]
    );
    if (!identity) {
      res.status(404).json({ error: 'identity_not_found', message: 'Identity not found' });
      return;
    }

    const status = await getVouchStatus(identity_id);
    res.json(status);
  }
);

export default router;
