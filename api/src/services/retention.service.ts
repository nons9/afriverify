import { query } from '../db';
import { deleteFromS3 } from '../utils/s3';
import logger from '../utils/logger';
import { purgeLivenessEvidence } from './liveness.service';
import { purgeExpiredEvalFrames } from './liveness-eval.service';
import { runOncePerInterval } from '../utils/job-lock';

const RETENTION_DAYS = parseInt(process.env.SESSION_MEDIA_RETENTION_DAYS ?? '30', 10);
// Extra liveness frames + capture video are short-lived evidence: kept only long enough for
// review/disputes. (The single best frame follows the session-media policy above.)
const LIVENESS_EVIDENCE_DAYS = parseInt(process.env.LIVENESS_EVIDENCE_RETENTION_DAYS ?? '30', 10);
// ID photos and selfies from COMPLETED verifications are kept for disputes and the customer's records, then deleted.
// The verification record, hashed identifiers and audit trail are separate and are kept longer (see the privacy notice).
export const COMPLETED_MEDIA_DAYS = parseInt(process.env.COMPLETED_MEDIA_RETENTION_DAYS ?? '365', 10);
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface StaleSession {
  id: string;
  id_photo_s3_key: string | null;
  face_photo_s3_key: string | null;
}

// Deletes ID photos/selfies for verification attempts that never completed:
// a failed session, or one abandoned before the user finished. There is no
// ongoing purpose for AfriVerify to keep that biometric image once the
// attempt is over, so data-minimization rules (NDPA, GDPR) call for
// clearing it after a short window rather than by default forever.
// Completed verifications are untouched here: KYC regulators generally
// require the underlying evidence to stay retrievable for years after a
// successful verification, which is a separate, longer-lived policy.
async function purgeStaleSessionMedia(): Promise<void> {
  const rows = await query<StaleSession>(
    `SELECT id, id_photo_s3_key, face_photo_s3_key
     FROM verification_sessions
     WHERE step != 'complete'
       AND created_at < NOW() - ($1 || ' days')::interval
       AND (id_photo_s3_key IS NOT NULL OR face_photo_s3_key IS NOT NULL)
     LIMIT 500`,
    [RETENTION_DAYS]
  );

  for (const row of rows) {
    for (const key of [row.id_photo_s3_key, row.face_photo_s3_key]) {
      if (!key) continue;
      try {
        await deleteFromS3(key);
      } catch (err) {
        logger.error('Retention purge: failed to delete object', { key, error: (err as Error).message });
      }
    }
    await query(
      `UPDATE verification_sessions SET id_photo_s3_key = NULL, face_photo_s3_key = NULL WHERE id = $1`,
      [row.id]
    );
  }

  if (rows.length > 0) {
    logger.info('Retention purge cleared stale session media', {
      count: rows.length,
      retentionDays: RETENTION_DAYS
    });
  }
}

/** Deletes ID photos and selfies of completed verifications once they are `days` old. Returns how many sessions were cleared. */
export async function purgeCompletedSessionMedia(days: number = COMPLETED_MEDIA_DAYS): Promise<number> {
  const rows = await query<StaleSession>(
    `SELECT id, id_photo_s3_key, face_photo_s3_key
     FROM verification_sessions
     WHERE step = 'complete'
       AND completed_at IS NOT NULL
       AND completed_at < NOW() - ($1 || ' days')::interval
       AND (id_photo_s3_key IS NOT NULL OR face_photo_s3_key IS NOT NULL)
     LIMIT 500`,
    [days]
  );
  let cleared = 0;
  for (const row of rows) {
    let allDeleted = true;
    for (const key of [row.id_photo_s3_key, row.face_photo_s3_key]) {
      if (!key) continue;
      try {
        await deleteFromS3(key);
      } catch (err) {
        allDeleted = false;
        logger.error('Retention purge: failed to delete completed-session object', { key, error: (err as Error).message });
      }
    }
    // Only forget the keys once the objects are really gone, so a failed delete is retried tomorrow.
    if (allDeleted) {
      await query(`UPDATE verification_sessions SET id_photo_s3_key = NULL, face_photo_s3_key = NULL WHERE id = $1`, [row.id]);
      cleared++;
    }
  }
  if (cleared > 0) logger.info('Retention purge cleared completed-session media', { count: cleared, retentionDays: days });
  return cleared;
}

export function startRetentionPurge(): void {
  setInterval(() => {
    runOncePerInterval('retention-purge', CHECK_INTERVAL_MS, async () => {
      await purgeStaleSessionMedia().catch((err) =>
        logger.error('Retention purge errored', { error: (err as Error).message })
      );
      await purgeCompletedSessionMedia().catch((err) =>
        logger.error('Completed-session media purge errored', { error: (err as Error).message })
      );
      await purgeLivenessEvidence(LIVENESS_EVIDENCE_DAYS).catch((err) =>
        logger.error('Liveness evidence purge errored', { error: (err as Error).message })
      );
      await purgeExpiredEvalFrames().catch((err) =>
        logger.error('Evaluation frame purge errored', { error: (err as Error).message })
      );
    }).catch((err) => logger.error('Retention job errored', { error: (err as Error).message }));
  }, CHECK_INTERVAL_MS);
  logger.info('Retention purge scheduled', { retentionDays: RETENTION_DAYS, completedMediaDays: COMPLETED_MEDIA_DAYS, intervalHours: 24 });
}
