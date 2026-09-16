import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { randomInt } from 'crypto';
import { authenticate, requirePermission } from '../middleware/auth';
import {
  rateLimitVerifyInitiate,
  rateLimitApiKey
} from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { writeAuditEvent } from '../middleware/audit';
import { sendSms } from '../services/otp.service';
import { sendOtpEmail } from '../services/email-otp.service';
import { verifyIdWithSmile, biometricKYC } from '../services/smile-identity.service';
import { applyTrustEvent } from '../services/trust-score.service';
import { issueVIT } from '../services/vit.service';
import { checkBlacklist } from '../services/blacklist.service';
import { recordUsage } from '../services/billing.service';
import { scanImage } from '../services/orbitshield/deepscan.service';
import { evaluateNetworkRisk } from '../services/orbitshield/fraud-graph.service';
import { query, queryOne } from '../db';
import { sha256, generateSecureToken, timingSafeEqualHex } from '../utils/crypto';
import { uploadToS3, downloadFromS3 } from '../utils/s3';
import logger from '../utils/logger';
import { captureError } from '../utils/sentry';
import { VerificationSession } from '../types';
import {
  pushVerificationUpdate,
  createOrUpdatePlatformConnection,
} from '../services/platform-webhook.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Device gets 70% weight and IP-subnet 30% inside evaluateNetworkRisk's own
// scoring, and the subnet check already requires 3+ reports before it counts
// at all - so a score this high means a real, corroborated link to fraud,
// not a single coincidental IP match.
const NETWORK_RISK_BLOCK_THRESHOLD = 70;

router.use(authenticate);
router.use(rateLimitApiKey);
router.use(requirePermission('verify'));

// ─── POST /verify/initiate ────────────────────────────────────────────────────────────────────────────────
const initiateSchema = z
  .object({
    phone: z.string().min(7).max(20).regex(/^\+?[1-9]\d{6,19}$/, 'Invalid phone number'),
    email: z.string().email().max(255).optional(),
    // Which channel the OTP code itself goes to. Phone stays required
    // either way (see migration 030) - this only picks where the code is
    // delivered, not whether phone ownership is what's ultimately verified.
    otp_channel: z.enum(['sms', 'email']).optional().default('sms'),
    platform_user_id: z.string().max(255).optional(),
    redirect_url: z.string().url().optional(),
    flow_id: z.string().uuid().optional(),
  })
  .refine((data) => data.otp_channel !== 'email' || !!data.email, {
    message: 'email is required when otp_channel is "email"',
    path: ['email']
  });

router.post(
  '/initiate',
  rateLimitVerifyInitiate,
  validateBody(initiateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { phone, email, otp_channel, platform_user_id, flow_id } = req.body as {
      phone: string;
      email?: string;
      otp_channel: 'sms' | 'email';
      platform_user_id?: string;
      flow_id?: string;
    };
    const apiKey = req.apiKey!;

    if (apiKey.tier === 'free' && apiKey.verifications_this_month >= apiKey.monthly_limit) {
      res.status(402).json({
        error: 'limit_exceeded',
        message: 'Monthly verification limit reached. Upgrade at https://afriverify.sankofaapp.com/dashboard/usage'
      });
      return;
    }

    const bl = await checkBlacklist({ phone });
    if (bl.blacklisted && bl.scope === 'global') {
      await writeAuditEvent(req, {
        event_type: 'registration_attempt',
        result: 'failed',
        metadata: { reason: 'globally_blacklisted' }
      });
      res.status(403).json({ error: 'identity_blocked', message: 'This number is not eligible for verification.' });
      return;
    }

    // This phone hasn't been matched to an identity yet, so there's no
    // identity node to check - but the device/IP the request is coming from
    // might already be linked to fraud reported against a DIFFERENT identity
    // on a DIFFERENT platform (see fraud-graph.service.ts). Catching that
    // here, before a session even exists, is what makes the fraud graph a
    // shared cross-platform signal instead of something each platform only
    // ever gets to check after the fact.
    const deviceId = (req.headers['x-device-id'] as string) ?? undefined;
    const networkRisk = await evaluateNetworkRisk(undefined, deviceId, req.ip ?? undefined);
    if (networkRisk.networkRiskScore >= NETWORK_RISK_BLOCK_THRESHOLD) {
      await writeAuditEvent(req, {
        event_type: 'network_risk_blocked',
        result: 'failed',
        risk_score: networkRisk.networkRiskScore,
        metadata: { risk_factors: networkRisk.riskFactors, connected_fraud_reports: networkRisk.connectedFraudReports }
      });
      res.status(403).json({ error: 'identity_blocked', message: 'This number is not eligible for verification.' });
      return;
    }

    // Validate flow if provided — must belong to this developer's account.
    let resolvedFlowId: string | null = null;
    if (flow_id) {
      const flow = await queryOne<{ id: string }>(
        `SELECT id FROM verification_flows WHERE id = $1 AND developer_email = $2 AND is_active = true`,
        [flow_id, apiKey.platform_email]
      );
      if (!flow) {
        res.status(400).json({ error: 'invalid_flow', message: 'Flow not found or does not belong to this API key.' });
        return;
      }
      resolvedFlowId = flow.id;
    }

    const sessionToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await query(
      `INSERT INTO verification_sessions
         (session_token, phone, email, otp_channel, step, api_key_id, ip_address, device_id, expires_at, platform_user_id, flow_id)
       VALUES ($1,$2,$3,$4,'phone',$5,$6,$7,$8,$9,$10)`,
      [
        sessionToken,
        phone,
        email ?? null,
        otp_channel,
        apiKey.id,
        req.ip ?? null,
        (req.headers['x-device-id'] as string) ?? null,
        expiresAt,
        platform_user_id ?? null,
        resolvedFlowId,
      ]
    );

    await query(
      'UPDATE api_keys SET verifications_this_month = verifications_this_month + 1 WHERE id = $1',
      [apiKey.id]
    );
    await recordUsage(apiKey.id, 'level1');

    await writeAuditEvent(req, {
      event_type: 'registration_attempt',
      result: 'pending',
      metadata: { phone_prefix: phone.substring(0, 4) }
    });

    res.status(201).json({
      session_token: sessionToken,
      expires_at: expiresAt.toISOString(),
      next_step: 'otp'
    });
  }
);

// ─── POST /verify/otp/send ────────────────────────────────────────────────────────────────────────────
router.post(
  '/otp/send',
  validateBody(z.object({ session_token: z.string().length(64) })),
  async (req: Request, res: Response): Promise<void> => {
    const { session_token } = req.body as { session_token: string };

    const session = await queryOne<VerificationSession>(
      `SELECT * FROM verification_sessions
       WHERE session_token = $1 AND step IN ('phone', 'otp') AND expires_at > NOW()`,
      [session_token]
    );

    if (!session) {
      res.status(404).json({ error: 'session_not_found', message: 'Session not found or expired' });
      return;
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    try {
      if (session.otp_channel === 'email') {
        if (!session.email) throw new Error('No email on this session');
        await sendOtpEmail(session.email, code);
      } else {
        await sendSms(session.phone, `Your AfriVerify code is ${code}. Valid 5 mins. Do not share.`);
      }
      await query(
        `UPDATE verification_sessions
         SET step = 'otp', otp_hash = $1, otp_expires_at = $2, otp_attempts = 0
         WHERE id = $3`,
        [sha256(code), otpExpiry, session.id]
      );
      await writeAuditEvent(req, { event_type: 'otp_sent', result: 'passed' });
      res.json({ sent: true, expires_in: 300, channel: session.otp_channel });
    } catch (err) {
      const message = (err as Error).message;
      logger.error(`OTP send failed: ${message}`, { session: session.id });
      await writeAuditEvent(req, {
        event_type: 'otp_sent',
        result: 'failed',
        metadata: { reason: message }
      });
      res.status(503).json({ error: 'otp_send_failed', message });
    }
  }
);

// ─── POST /verify/otp/confirm ────────────────────────────────────────────────────────────────────────────────
const otpConfirmSchema = z.object({
  session_token: z.string().length(64),
  otp: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits')
});

router.post(
  '/otp/confirm',
  validateBody(otpConfirmSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { session_token, otp } = req.body as { session_token: string; otp: string };

    const session = await queryOne<VerificationSession>(
      `SELECT * FROM verification_sessions
       WHERE session_token = $1 AND step = 'otp' AND expires_at > NOW()`,
      [session_token]
    );

    if (!session) {
      res.status(404).json({ error: 'session_not_found', message: 'Session not found or expired' });
      return;
    }

    if (session.otp_expires_at && new Date() > session.otp_expires_at) {
      res.status(400).json({ error: 'otp_expired', message: 'OTP expired. Request a new one.' });
      return;
    }

    if (session.otp_attempts >= 3) {
      await query(`UPDATE verification_sessions SET step = 'failed' WHERE id = $1`, [session.id]);
      res.status(400).json({
        error: 'max_attempts_exceeded',
        message: 'Max OTP attempts reached. Start a new verification.'
      });
      return;
    }

    const valid = !!session.otp_hash && timingSafeEqualHex(sha256(otp), session.otp_hash);

    if (!valid) {
      await query(
        `UPDATE verification_sessions SET otp_attempts = otp_attempts + 1 WHERE id = $1`,
        [session.id]
      );
      await writeAuditEvent(req, { event_type: 'otp_verified', result: 'failed' });
      res.status(400).json({
        error: 'invalid_otp',
        message: 'Incorrect OTP',
        attempts_remaining: 2 - session.otp_attempts
      });
      return;
    }

    const existing = await queryOne<{ id: string; verification_level: number }>(
      'SELECT id, verification_level FROM verified_identities WHERE phone = $1',
      [session.phone]
    );

    if (existing) {
      await query(
        `UPDATE verification_sessions SET step = 'complete', identity_id = $1 WHERE id = $2`,
        [existing.id, session.id]
      );
      await writeAuditEvent(req, {
        event_type: 'otp_verified',
        identity_id: existing.id,
        result: 'passed'
      });
      const { token, payload } = await issueVIT(existing.id);
      res.json({
        confirmed: true,
        returning_user: true,
        identity_id: existing.id,
        verification_level: existing.verification_level,
        vit: token,
        vit_payload: payload,
        next_step: existing.verification_level >= 2 ? 'complete' : 'id_upload'
      });
      return;
    }

    const newId = uuidv4();
    await query(
      `INSERT INTO verified_identities
         (id, phone, verification_level, trust_score, trust_level)
       VALUES ($1,$2,1,50,'new')`,
      [newId, session.phone]
    );
    await query(
      `UPDATE verification_sessions SET step = 'id_upload', identity_id = $1 WHERE id = $2`,
      [newId, session.id]
    );
    await writeAuditEvent(req, {
      event_type: 'otp_verified',
      identity_id: newId,
      result: 'passed'
    });

    res.json({ confirmed: true, returning_user: false, identity_id: newId, next_step: 'id_upload' });
  }
);

// ─── POST /verify/id/upload ─────────────────────────────────────────────────────────────────────────────────
router.post(
  '/id/upload',
  upload.single('id_photo'),
  async (req: Request, res: Response): Promise<void> => {
    const { session_token, id_type, id_number, nationality, first_name, last_name, dob } =
      req.body as Record<string, string>;
    const file = req.file;

    if (!session_token || !id_type || !id_number || !nationality || !first_name || !last_name) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Required: session_token, id_type, id_number, nationality, first_name, last_name'
      });
      return;
    }
    if (!file) {
      res.status(400).json({ error: 'validation_error', message: 'id_photo file is required' });
      return;
    }

    const session = await queryOne<VerificationSession>(
      `SELECT * FROM verification_sessions
       WHERE session_token = $1 AND step = 'id_upload' AND expires_at > NOW()`,
      [session_token]
    );
    if (!session?.identity_id) {
      res.status(404).json({ error: 'session_not_found', message: 'Session not found or wrong step' });
      return;
    }

    // ─── OrbitShield Layer 1: DeepScan document pre-screen ──────────────────────────────────
    // Runs BEFORE Smile Identity. Catches AI-generated documents, screenshots
    // of someone else's ID on a screen, and images too small to be authentic.
    // Rejected documents never reach the external Smile API, saving cost.
    const deepScan = await scanImage(
      file.buffer,
      'id_document',
      session.identity_id,
      session.id
    );

    if (deepScan.blocked) {
      await writeAuditEvent(req, {
        event_type: 'id_rejected',
        identity_id: session.identity_id,
        result: 'failed',
        metadata: {
          reason: 'deepscan_rejected',
          deepscan_confidence: deepScan.confidence,
          deepscan_signals: deepScan.signals
        }
      });
      await query(`UPDATE verification_sessions SET step = 'failed' WHERE id = $1`, [session.id]);
      res.status(400).json({
        error: 'document_rejected',
        message:
          'The submitted ID photo could not be verified as authentic. ' +
          'Please use a clear, well-lit photo of your original government-issued ID.',
        code: 'deepscan_rejected'
      });
      return;
    }

    if (deepScan.verdict === 'suspicious') {
      logger.warn('DeepScan: document flagged suspicious, proceeding with manual review flag', {
        identity: session.identity_id,
        confidence: deepScan.confidence,
        signals: deepScan.signals
      });
    }
    // ─────────────────────────────────────────────────────────────────────────────────

    const s3Key = `id-photos/${session.identity_id}/${uuidv4()}.jpg`;
    try {
      await uploadToS3(s3Key, file.buffer, file.mimetype);
    } catch (err) {
      logger.error('S3 upload failed', { error: (err as Error).message });
      res.status(503).json({ error: 'upload_failed', message: 'Photo upload failed. Try again.' });
      return;
    }

    const idHash = sha256(id_number);
    let idVerified = false;
    let smileCode = 'skipped';

    try {
      const result = await verifyIdWithSmile({
        id_type: id_type.toUpperCase(),
        id_number,
        country: nationality.toUpperCase().substring(0, 2),
        first_name,
        last_name,
        dob,
        phone: session.phone
      });

      if (result.rejected) {
        await writeAuditEvent(req, {
          event_type: 'id_rejected',
          identity_id: session.identity_id,
          result: 'failed',
          metadata: { code: result.result_code, text: result.result_text }
        });
        await query(`UPDATE verification_sessions SET step = 'failed' WHERE id = $1`, [session.id]);
        res.status(400).json({
          error: 'id_verification_failed',
          message: 'Government ID could not be verified',
          reason: result.result_text
        });
        return;
      }

      idVerified = result.success;
      smileCode = result.result_code;
    } catch (err) {
      logger.warn('Smile ID unavailable, continuing', { error: (err as Error).message });
    }

    await query(
      `UPDATE verified_identities
       SET full_name = $1, nationality = $2, id_type = $3, id_number_hash = $4,
           metadata = metadata || $5::jsonb, updated_at = NOW()
       WHERE id = $6`,
      [
        `${first_name} ${last_name}`,
        nationality,
        id_type,
        idHash,
        JSON.stringify({
          smile_code: smileCode,
          id_verified: idVerified,
          deepscan_verdict: deepScan.verdict,
          deepscan_confidence: deepScan.confidence
        }),
        session.identity_id
      ]
    );
    await query(
      `UPDATE verification_sessions SET step = 'face_scan', id_photo_s3_key = $1 WHERE id = $2`,
      [s3Key, session.id]
    );
    await writeAuditEvent(req, {
      event_type: idVerified ? 'id_verified' : 'id_submitted',
      identity_id: session.identity_id,
      result: idVerified ? 'passed' : 'pending',
      metadata: { id_type, nationality, smile_code: smileCode, deepscan_verdict: deepScan.verdict }
    });

    res.json({ upload_id: s3Key, id_verified: idVerified, next_step: 'face_scan' });
  }
);

// ─── POST /verify/face/submit ─────────────────────────────────────────────────────────────────────────────────
router.post(
  '/face/submit',
  upload.single('selfie'),
  async (req: Request, res: Response): Promise<void> => {
    const { session_token } = req.body as { session_token: string };
    const file = req.file;

    if (!session_token) {
      res.status(400).json({ error: 'validation_error', message: 'session_token required' });
      return;
    }
    if (!file) {
      res.status(400).json({ error: 'validation_error', message: 'selfie file required' });
      return;
    }

    const session = await queryOne<VerificationSession>(
      `SELECT * FROM verification_sessions
       WHERE session_token = $1 AND step = 'face_scan' AND expires_at > NOW()`,
      [session_token]
    );
    if (!session?.identity_id) {
      res.status(404).json({ error: 'session_not_found', message: 'Session not found or wrong step' });
      return;
    }

    // ─── OrbitShield Layer 1: DeepScan selfie pre-screen ────────────────────────────────────
    // Runs BEFORE S3 upload and before biometric processing.
    // Catches AI-generated faces (GAN/diffusion output), screen replay attacks
    // (phone held up to another screen), and photos-of-photos.
    const deepScan = await scanImage(
      file.buffer,
      'selfie',
      session.identity_id,
      session.id
    );

    if (deepScan.blocked) {
      await writeAuditEvent(req, {
        event_type: 'face_submitted',
        identity_id: session.identity_id,
        result: 'failed',
        metadata: {
          reason: 'deepscan_rejected',
          deepscan_confidence: deepScan.confidence,
          deepscan_signals: deepScan.signals
        }
      });
      res.status(400).json({
        error: 'selfie_rejected',
        message:
          'The submitted selfie could not be verified as authentic. ' +
          'Please take a clear, well-lit selfie directly with your camera. ' +
          'Do not use a photo of a photo or a screen capture.',
        code: 'deepscan_rejected'
      });
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────────────

    const selfieKey = `selfies/${session.identity_id}/${uuidv4()}.jpg`;
    try {
      await uploadToS3(selfieKey, file.buffer, file.mimetype);
    } catch (err) {
      res.status(503).json({ error: 'upload_failed', message: 'Selfie upload failed.' });
      return;
    }

    await query(
      `UPDATE verification_sessions SET step = 'processing', face_photo_s3_key = $1 WHERE id = $2`,
      [selfieKey, session.id]
    );
    await writeAuditEvent(req, {
      event_type: 'face_submitted',
      identity_id: session.identity_id,
      result: 'pending',
      metadata: { deepscan_verdict: deepScan.verdict }
    });

    runBiometricProcessing(session, selfieKey, req).catch((err) => {
      logger.error('Biometric processing failed', { error: err.message, session: session.id });
      captureError(err, { session: session.id, stage: 'biometric_processing' });
    });

    res.json({
      processing: true,
      message: 'Biometric verification in progress. Poll GET /verify/status/{session_token}.',
      estimated_seconds: 30
    });
  }
);

// ─── GET /verify/status/:session_token ───────────────────────────────────────────────────────────────────────────
router.get(
  '/status/:session_token',
  async (req: Request, res: Response): Promise<void> => {
    const { session_token } = req.params;

    const row = await queryOne<
      VerificationSession & {
        verification_level?: number;
        trust_score?: number;
        trust_level?: string;
        flow_required_steps?: string[];
        flow_optional_steps?: string[];
        flow_allowed_id_types?: string[];
        flow_allowed_countries?: string[] | null;
        flow_min_verification_level?: number;
        flow_success_url?: string | null;
        flow_failure_url?: string | null;
        flow_brand_name?: string | null;
        flow_brand_color?: string | null;
        flow_welcome_message?: string | null;
      }
    >(
      `SELECT vs.*, vi.verification_level, vi.trust_score, vi.trust_level,
              vf.required_steps    AS flow_required_steps,
              vf.optional_steps    AS flow_optional_steps,
              vf.allowed_id_types  AS flow_allowed_id_types,
              vf.allowed_countries AS flow_allowed_countries,
              vf.min_verification_level AS flow_min_verification_level,
              vf.success_url       AS flow_success_url,
              vf.failure_url       AS flow_failure_url,
              vf.brand_name        AS flow_brand_name,
              vf.brand_color       AS flow_brand_color,
              vf.welcome_message   AS flow_welcome_message
       FROM verification_sessions vs
       LEFT JOIN verified_identities vi ON vs.identity_id = vi.id
       LEFT JOIN verification_flows  vf ON vs.flow_id = vf.id
       WHERE vs.session_token = $1`,
      [session_token]
    );

    if (!row) {
      res.status(404).json({ error: 'session_not_found', message: 'Session not found' });
      return;
    }

    const out: Record<string, unknown> = { status: row.step, session_token };

    if (row.flow_id) {
      out.flow_config = {
        required_steps:         row.flow_required_steps         ?? null,
        optional_steps:         row.flow_optional_steps         ?? null,
        allowed_id_types:       row.flow_allowed_id_types       ?? null,
        allowed_countries:      row.flow_allowed_countries      ?? null,
        min_verification_level: row.flow_min_verification_level ?? null,
        success_url:            row.flow_success_url            ?? null,
        failure_url:            row.flow_failure_url            ?? null,
        brand_name:             row.flow_brand_name             ?? null,
        brand_color:            row.flow_brand_color            ?? null,
        welcome_message:        row.flow_welcome_message        ?? null,
      };
    }

    if (row.step === 'complete' && row.identity_id) {
      try {
        const { token, payload } = await issueVIT(row.identity_id);
        out.vit = token;
        out.vit_payload = payload;
        out.identity_id = row.identity_id;
        out.verification_level = row.verification_level;
      } catch (err) {
        logger.error('VIT issuance failed on status check', { error: (err as Error).message });
      }
    }

    if (row.step === 'failed') {
      const latest = await queryOne<{ metadata: Record<string, unknown> }>(
        `SELECT metadata FROM verification_events
         WHERE identity_id = $1 AND result = 'failed'
         ORDER BY created_at DESC LIMIT 1`,
        [row.identity_id]
      );
      out.rejection_reason = latest?.metadata?.reason ?? 'Verification could not be completed';
    }

    res.json(out);
  }
);

// ─── Internal: async biometric processing ────────────────────────────────────────────────────────────────────────
async function runBiometricProcessing(
  session: VerificationSession,
  selfieKey: string,
  req: Request
): Promise<void> {
  const identityId = session.identity_id!;

  try {
    const identity = await queryOne<{ nationality: string; id_type: string }>(
      'SELECT nationality, id_type FROM verified_identities WHERE id = $1',
      [identityId]
    );

    const selfieBuffer = await downloadFromS3(selfieKey);
    const idPhotoBuffer = session.id_photo_s3_key
      ? await downloadFromS3(session.id_photo_s3_key)
      : undefined;

    const result = await biometricKYC({
      country: (identity?.nationality ?? 'NG').toUpperCase().substring(0, 2),
      id_type: (identity?.id_type ?? 'NIN').toUpperCase(),
      partner_user_id: identityId,
      selfie_buffer: selfieBuffer,
      id_photo_buffer: idPhotoBuffer
    });

    if (result.success && (result.face_match_confidence ?? 0) >= 70) {
      await completeLevel2(session.id, identityId, result.face_match_confidence ?? 90, req);
    } else {
      await failSession(
        session.id,
        identityId,
        'Face match failed. Please retry with better lighting.',
        req
      );
    }
  } catch (err) {
    logger.warn('Biometric service unavailable, falling back to Level 1', {
      error: (err as Error).message
    });
    await completeLevel1(session.id, identityId, req);
  }
}

async function completeLevel1(sessionId: string, identityId: string, req: Request): Promise<void> {
  await query(
    `UPDATE verified_identities
     SET verification_level = GREATEST(verification_level, 1),
         trust_score = GREATEST(trust_score, 50),
         trust_level = 'new',
         verified_at = COALESCE(verified_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [identityId]
  );
  await query(`UPDATE verification_sessions SET step = 'complete' WHERE id = $1`, [sessionId]);
  await writeAuditEvent(req, {
    event_type: 'liveness_passed',
    identity_id: identityId,
    result: 'passed',
    metadata: { level: 1 }
  });

  const sess = await queryOne<{ platform_user_id: string | null; api_key_id: string }>(
    `SELECT platform_user_id, api_key_id FROM verification_sessions WHERE id = $1`,
    [sessionId]
  );
  if (sess) {
    await createOrUpdatePlatformConnection(identityId, sess.api_key_id, sess.platform_user_id);
    pushVerificationUpdate(sess.api_key_id, identityId, sess.platform_user_id, 1).catch(() => {});
  }
}

async function completeLevel2(
  sessionId: string,
  identityId: string,
  confidence: number,
  req: Request
): Promise<void> {
  await query(
    `UPDATE verified_identities
     SET verification_level = GREATEST(verification_level, 2),
         trust_level = 'rising',
         verified_at = COALESCE(verified_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [identityId]
  );
  await query(`UPDATE verification_sessions SET step = 'complete' WHERE id = $1`, [sessionId]);
  await applyTrustEvent({
    identity_id: identityId,
    event_type: 'initial_verification',
    score_delta: 100
  });
  await writeAuditEvent(req, {
    event_type: 'liveness_passed',
    identity_id: identityId,
    result: 'passed',
    metadata: { level: 2, confidence }
  });

  const sess = await queryOne<{ platform_user_id: string | null; api_key_id: string }>(
    `SELECT platform_user_id, api_key_id FROM verification_sessions WHERE id = $1`,
    [sessionId]
  );
  if (sess) {
    await createOrUpdatePlatformConnection(identityId, sess.api_key_id, sess.platform_user_id);
    pushVerificationUpdate(sess.api_key_id, identityId, sess.platform_user_id, 2).catch(() => {});
  }
}

async function failSession(
  sessionId: string,
  identityId: string,
  reason: string,
  req: Request
): Promise<void> {
  await query(`UPDATE verification_sessions SET step = 'failed' WHERE id = $1`, [sessionId]);
  await writeAuditEvent(req, {
    event_type: 'liveness_failed',
    identity_id: identityId,
    result: 'failed',
    metadata: { reason }
  });
}

export default router;
