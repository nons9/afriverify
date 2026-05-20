import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth';
import {
  rateLimitVerifyInitiate,
  rateLimitApiKey
} from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { writeAuditEvent } from '../middleware/audit';
import { sendOTP, verifyOTP } from '../services/otp.service';
import { verifyIdWithSmile, biometricKYC } from '../services/smile-identity.service';
import { applyTrustEvent } from '../services/trust-score.service';
import { issueVIT } from '../services/vit.service';
import { checkBlacklist } from '../services/blacklist.service';
import { query, queryOne } from '../db';
import { sha256, generateSecureToken } from '../utils/crypto';
import { uploadToS3, downloadFromS3 } from '../utils/s3';
import logger from '../utils/logger';
import { VerificationSession } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);
router.use(rateLimitApiKey);

// ─── POST /verify/initiate ───────────────────────────────────────────────────
const initiateSchema = z.object({
  phone: z.string().min(7).max(20).regex(/^\+?[1-9]\d{6,19}$/, 'Invalid phone number'),
  redirect_url: z.string().url().optional()
});

router.post(
  '/initiate',
  rateLimitVerifyInitiate,
  validateBody(initiateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { phone } = req.body as { phone: string };
    const apiKey = req.apiKey!;

    if (apiKey.tier === 'free' && apiKey.verifications_this_month >= apiKey.monthly_limit) {
      res.status(402).json({
        error: 'limit_exceeded',
        message: 'Monthly verification limit reached. Upgrade at https://console.orbitverify.africa/billing'
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

    const sessionToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await query(
      `INSERT INTO verification_sessions
         (session_token, phone, step, api_key_id, ip_address, device_id, expires_at)
       VALUES ($1,$2,'phone',$3,$4,$5,$6)`,
      [
        sessionToken,
        phone,
        apiKey.id,
        req.ip ?? null,
        (req.headers['x-device-id'] as string) ?? null,
        expiresAt
      ]
    );

    await query(
      'UPDATE api_keys SET verifications_this_month = verifications_this_month + 1 WHERE id = $1',
      [apiKey.id]
    );

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

// ─── POST /verify/otp/send ───────────────────────────────────────────────────
router.post(
  '/otp/send',
  validateBody(z.object({ session_token: z.string().length(64) })),
  async (req: Request, res: Response): Promise<void> => {
    const { session_token } = req.body as { session_token: string };

    const session = await queryOne<VerificationSession>(
      `SELECT * FROM verification_sessions
       WHERE session_token = $1 AND step = 'phone' AND expires_at > NOW()`,
      [session_token]
    );

    if (!session) {
      res.status(404).json({ error: 'session_not_found', message: 'Session not found or expired' });
      return;
    }

    try {
      await sendOTP(session.phone);
      const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
      await query(
        `UPDATE verification_sessions SET step = 'otp', otp_expires_at = $1 WHERE id = $2`,
        [otpExpiry, session.id]
      );
      await writeAuditEvent(req, { event_type: 'otp_sent', result: 'passed' });
      res.json({ sent: true, expires_in: 300 });
    } catch (err) {
      res.status(503).json({ error: 'otp_send_failed', message: (err as Error).message });
    }
  }
);

// ─── POST /verify/otp/confirm ────────────────────────────────────────────────
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

    const valid = await verifyOTP(session.phone, otp);

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

    // Returning user?
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

    // New user — create Level-1 identity
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

// ─── POST /verify/id/upload ──────────────────────────────────────────────────
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
        JSON.stringify({ smile_code: smileCode, id_verified: idVerified }),
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
      metadata: { id_type, nationality, smile_code: smileCode }
    });

    res.json({ upload_id: s3Key, id_verified: idVerified, next_step: 'face_scan' });
  }
);

// ─── POST /verify/face/submit ────────────────────────────────────────────────
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
      result: 'pending'
    });

    // Run biometric processing asynchronously — client polls GET /verify/status/:session_token
    runBiometricProcessing(session, selfieKey, req).catch((err) =>
      logger.error('Biometric processing failed', { error: err.message, session: session.id })
    );

    res.json({
      processing: true,
      message: 'Biometric verification in progress. Poll GET /verify/status/{session_token}.',
      estimated_seconds: 30
    });
  }
);

// ─── GET /verify/status/:session_token ──────────────────────────────────────
router.get(
  '/status/:session_token',
  async (req: Request, res: Response): Promise<void> => {
    const { session_token } = req.params;

    const row = await queryOne<
      VerificationSession & {
        verification_level?: number;
        trust_score?: number;
        trust_level?: string;
      }
    >(
      `SELECT vs.*, vi.verification_level, vi.trust_score, vi.trust_level
       FROM verification_sessions vs
       LEFT JOIN verified_identities vi ON vs.identity_id = vi.id
       WHERE vs.session_token = $1`,
      [session_token]
    );

    if (!row) {
      res.status(404).json({ error: 'session_not_found', message: 'Session not found' });
      return;
    }

    const out: Record<string, unknown> = { status: row.step, session_token };

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

// ─── Internal: async biometric processing ────────────────────────────────────
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
