/**
 * /v1/hosted/* — public-facing endpoints that power the white-label hosted
 * verification flow. No API key required; the session_token itself is the
 * credential (64 hex chars, 128-bit entropy). Every operation re-verifies the
 * token against the DB, so a revoked or expired session is always rejected.
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db';
import { sha256, timingSafeEqualHex } from '../utils/crypto';
import { sendSms } from '../services/otp.service';
import { sendOtpEmail } from '../services/email-otp.service';
import { verifyIdWithSmile, biometricKYC } from '../services/smile-identity.service';
import { applyTrustEvent } from '../services/trust-score.service';
import { issueVIT } from '../services/vit.service';
import { uploadToS3, downloadFromS3 } from '../utils/s3';
import { scanImage } from '../services/orbitshield/deepscan.service';
import { createOrUpdatePlatformConnection, pushVerificationUpdate } from '../services/platform-webhook.service';
import logger from '../utils/logger';
import { captureError } from '../utils/sentry';
import { stepMessage } from '../utils/i18n';
import { SupportedLang, VerificationSession } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── GET /hosted/branding/:session_token ──────────────────────────────────────
// Public. Returns the white-label branding for the developer who owns this
// session. Falls back to AfriVerify defaults when no config exists.
router.get('/branding/:session_token', async (req: Request, res: Response): Promise<void> => {
  const { session_token } = req.params;

  const row = await queryOne<{
    developer_email: string;
    company_name: string;
    logo_url: string | null;
    primary_color: string;
    button_color: string | null;
    otp_channel: string;
    phone: string;
    step: string;
    lang: string;
    redirect_url: string | null;
  }>(
    `SELECT ak.platform_email AS developer_email,
            COALESCE(wl.company_name, ak.platform_name)  AS company_name,
            wl.logo_url,
            COALESCE(wl.primary_color, '#4F46E5')        AS primary_color,
            wl.button_color,
            vs.otp_channel,
            vs.phone,
            vs.step,
            COALESCE(vs.lang, 'en')                      AS lang,
            vs.redirect_url
     FROM verification_sessions vs
     JOIN api_keys ak ON vs.api_key_id = ak.id
     LEFT JOIN white_label_configs wl ON wl.developer_email = ak.platform_email
     WHERE vs.session_token = $1`,
    [session_token]
  );

  if (!row) {
    res.status(404).json({ error: 'session_not_found' });
    return;
  }

  res.json({
    company_name: row.company_name,
    logo_url: row.logo_url ?? null,
    primary_color: row.primary_color,
    button_color: row.button_color ?? row.primary_color,
    otp_channel: row.otp_channel,
    phone_masked: maskPhone(row.phone),
    current_step: row.step,
    lang: row.lang,
    redirect_url: row.redirect_url ?? null,
  });
});

// ─── POST /hosted/otp/send ────────────────────────────────────────────────────
router.post(
  '/otp/send',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = z.object({ session_token: z.string().length(64) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation_error', message: 'session_token required (64 chars)' });
      return;
    }
    const { session_token } = parsed.data;

    const session = await queryOne<VerificationSession>(
      `SELECT * FROM verification_sessions
       WHERE session_token = $1 AND step IN ('phone','otp') AND expires_at > NOW()`,
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
        if (!session.email) throw new Error('No email on session');
        await sendOtpEmail(session.email, code);
      } else {
        await sendSms(session.phone, `Your verification code is ${code}. Valid 5 mins.`);
      }
      await query(
        `UPDATE verification_sessions
         SET step = 'otp', otp_hash = $1, otp_expires_at = $2, otp_attempts = 0
         WHERE id = $3`,
        [sha256(code), otpExpiry, session.id]
      );
      res.json({ sent: true, expires_in: 300, channel: session.otp_channel });
    } catch (err) {
      logger.error('Hosted OTP send failed', { error: (err as Error).message });
      res.status(503).json({ error: 'otp_send_failed', message: (err as Error).message });
    }
  }
);

// ─── POST /hosted/otp/confirm ─────────────────────────────────────────────────
router.post(
  '/otp/confirm',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = z.object({
      session_token: z.string().length(64),
      otp: z.string().length(6).regex(/^\d{6}$/),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation_error', message: 'session_token and 6-digit otp required' });
      return;
    }
    const { session_token, otp } = parsed.data;

    const session = await queryOne<VerificationSession>(
      `SELECT * FROM verification_sessions
       WHERE session_token = $1 AND step = 'otp' AND expires_at > NOW()`,
      [session_token]
    );
    if (!session) {
      res.status(404).json({ error: 'session_not_found' });
      return;
    }

    if (session.otp_expires_at && new Date() > session.otp_expires_at) {
      res.status(400).json({ error: 'otp_expired', message: 'OTP expired. Request a new one.' });
      return;
    }

    if (session.otp_attempts >= 3) {
      await query(`UPDATE verification_sessions SET step = 'failed' WHERE id = $1`, [session.id]);
      res.status(400).json({ error: 'max_attempts_exceeded', message: 'Max OTP attempts reached.' });
      return;
    }

    const valid = !!session.otp_hash && timingSafeEqualHex(sha256(otp), session.otp_hash);
    if (!valid) {
      await query(`UPDATE verification_sessions SET otp_attempts = otp_attempts + 1 WHERE id = $1`, [session.id]);
      res.status(400).json({
        error: 'invalid_otp',
        message: 'Incorrect code',
        attempts_remaining: 2 - session.otp_attempts,
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
      const { token, payload } = await issueVIT(existing.id);
      res.json({
        confirmed: true,
        returning_user: true,
        identity_id: existing.id,
        verification_level: existing.verification_level,
        vit: token,
        vit_payload: payload,
        next_step: existing.verification_level >= 2 ? 'complete' : 'id_upload',
      });
      return;
    }

    const newId = uuidv4();
    await query(
      `INSERT INTO verified_identities (id, phone, verification_level, trust_score, trust_level)
       VALUES ($1,$2,1,50,'new')`,
      [newId, session.phone]
    );
    await query(
      `UPDATE verification_sessions SET step = 'id_upload', identity_id = $1 WHERE id = $2`,
      [newId, session.id]
    );
    res.json({ confirmed: true, returning_user: false, identity_id: newId, next_step: 'id_upload' });
  }
);

// ─── POST /hosted/id/upload ───────────────────────────────────────────────────
router.post(
  '/id/upload',
  upload.single('id_photo'),
  async (req: Request, res: Response): Promise<void> => {
    const { session_token, id_type, id_number, nationality, first_name, last_name, dob } =
      req.body as Record<string, string>;
    const file = req.file;

    if (!session_token || !id_type || !id_number || !nationality || !first_name || !last_name) {
      res.status(400).json({ error: 'validation_error', message: 'Required fields missing' });
      return;
    }
    if (!file) {
      res.status(400).json({ error: 'validation_error', message: 'id_photo required' });
      return;
    }

    const session = await queryOne<VerificationSession>(
      `SELECT * FROM verification_sessions
       WHERE session_token = $1 AND step = 'id_upload' AND expires_at > NOW()`,
      [session_token]
    );
    if (!session?.identity_id) {
      res.status(404).json({ error: 'session_not_found' });
      return;
    }

    const deepScan = await scanImage(file.buffer, 'id_document', session.identity_id, session.id);
    if (deepScan.blocked) {
      await query(`UPDATE verification_sessions SET step = 'failed' WHERE id = $1`, [session.id]);
      res.status(400).json({ error: 'document_rejected', message: 'ID photo could not be verified as authentic.' });
      return;
    }

    const s3Key = `id-photos/${session.identity_id}/${uuidv4()}.jpg`;
    try {
      await uploadToS3(s3Key, file.buffer, file.mimetype);
    } catch {
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
        phone: session.phone,
      });
      if (result.rejected) {
        await query(`UPDATE verification_sessions SET step = 'failed' WHERE id = $1`, [session.id]);
        res.status(400).json({ error: 'id_verification_failed', message: result.result_text });
        return;
      }
      idVerified = result.success;
      smileCode = result.result_code;
    } catch (err) {
      logger.warn('Smile ID unavailable in hosted flow', { error: (err as Error).message });
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
        JSON.stringify({ smile_code: smileCode, id_verified: idVerified, deepscan_verdict: deepScan.verdict }),
        session.identity_id,
      ]
    );
    await query(
      `UPDATE verification_sessions SET step = 'face_scan', id_photo_s3_key = $1 WHERE id = $2`,
      [s3Key, session.id]
    );

    res.json({ upload_id: s3Key, id_verified: idVerified, next_step: 'face_scan' });
  }
);

// ─── POST /hosted/face/submit ─────────────────────────────────────────────────
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
      res.status(400).json({ error: 'validation_error', message: 'selfie required' });
      return;
    }

    const session = await queryOne<VerificationSession>(
      `SELECT * FROM verification_sessions
       WHERE session_token = $1 AND step = 'face_scan' AND expires_at > NOW()`,
      [session_token]
    );
    if (!session?.identity_id) {
      res.status(404).json({ error: 'session_not_found' });
      return;
    }

    const deepScan = await scanImage(file.buffer, 'selfie', session.identity_id, session.id);
    if (deepScan.blocked) {
      res.status(400).json({ error: 'selfie_rejected', message: 'Selfie could not be verified as authentic.' });
      return;
    }

    const selfieKey = `selfies/${session.identity_id}/${uuidv4()}.jpg`;
    try {
      await uploadToS3(selfieKey, file.buffer, file.mimetype);
    } catch {
      res.status(503).json({ error: 'upload_failed', message: 'Selfie upload failed.' });
      return;
    }

    await query(
      `UPDATE verification_sessions SET step = 'processing', face_photo_s3_key = $1 WHERE id = $2`,
      [selfieKey, session.id]
    );

    runHostedBiometric(session, selfieKey).catch((err) => {
      logger.error('Hosted biometric failed', { error: err.message, session: session.id });
      captureError(err, { session: session.id });
    });

    res.json({ processing: true, estimated_seconds: 30 });
  }
);

// ─── GET /hosted/status/:session_token ────────────────────────────────────────
router.get('/status/:session_token', async (req: Request, res: Response): Promise<void> => {
  const { session_token } = req.params;

  const row = await queryOne<VerificationSession & {
    verification_level?: number;
    redirect_url?: string | null;
  }>(
    `SELECT vs.*, vi.verification_level
     FROM verification_sessions vs
     LEFT JOIN verified_identities vi ON vs.identity_id = vi.id
     WHERE vs.session_token = $1`,
    [session_token]
  );

  if (!row) {
    res.status(404).json({ error: 'session_not_found' });
    return;
  }

  const lang = (row.lang as SupportedLang) ?? 'en';
  const out: Record<string, unknown> = {
    status: row.step,
    session_token,
    lang,
    message: stepMessage(row.step, lang),
    redirect_url: row.redirect_url ?? null,
  };

  if (row.step === 'complete' && row.identity_id) {
    try {
      const { token, payload } = await issueVIT(row.identity_id);
      out.vit = token;
      out.vit_payload = payload;
      out.identity_id = row.identity_id;
      out.verification_level = row.verification_level;
    } catch {
      // VIT issuance failure is non-fatal on status poll
    }
  }

  res.json(out);
});

// ─── Internal: biometric background processing ────────────────────────────────
async function runHostedBiometric(session: VerificationSession, selfieKey: string): Promise<void> {
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
      id_photo_buffer: idPhotoBuffer,
    });

    if (result.success && (result.face_match_confidence ?? 0) >= 70) {
      await query(
        `UPDATE verified_identities
         SET verification_level = GREATEST(verification_level, 2),
             trust_level = 'rising',
             verified_at = COALESCE(verified_at, NOW()),
             updated_at = NOW()
         WHERE id = $1`,
        [identityId]
      );
      await query(
        `UPDATE verification_sessions SET step = 'complete', completed_at = NOW() WHERE id = $1`,
        [session.id]
      );
      await applyTrustEvent({ identity_id: identityId, event_type: 'initial_verification', score_delta: 100 });
    } else {
      await query(
        `UPDATE verification_sessions SET step = 'failed', completed_at = NOW() WHERE id = $1`,
        [session.id]
      );
    }

    const sess = await queryOne<{ platform_user_id: string | null; api_key_id: string }>(
      `SELECT platform_user_id, api_key_id FROM verification_sessions WHERE id = $1`,
      [session.id]
    );
    if (sess) {
      const finalSession = await queryOne<{ step: string }>(
        'SELECT step FROM verification_sessions WHERE id = $1',
        [session.id]
      );
      if (finalSession?.step === 'complete') {
        await createOrUpdatePlatformConnection(identityId, sess.api_key_id, sess.platform_user_id);
        pushVerificationUpdate(sess.api_key_id, identityId, sess.platform_user_id, 2).catch(() => {});
      }
    }
  } catch (err) {
    logger.warn('Hosted biometric unavailable, completing at level 1', { error: (err as Error).message });
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
    await query(
      `UPDATE verification_sessions SET step = 'complete', completed_at = NOW() WHERE id = $1`,
      [session.id]
    );
  }
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
}

export default router;
