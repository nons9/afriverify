import { query } from '../db';
import { deleteFromS3 } from '../utils/s3';
import logger from '../utils/logger';

const RETENTION_DAYS = parseInt(process.env.SESSION_MEDIA_RETENTION_DAYS ?? '30', 10);
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

export function startRetentionPurge(): void {
  setInterval(() => {
    purgeStaleSessionMedia().catch((err) =>
      logger.error('Retention purge errored', { error: (err as Error).message })
    );
  }, CHECK_INTERVAL_MS);
  logger.info('Retention purge scheduled', { retentionDays: RETENTION_DAYS, intervalHours: 24 });
}
