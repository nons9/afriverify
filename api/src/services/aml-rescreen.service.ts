import { query, queryOne } from '../db';
import { screenName } from './screening.service';
import { pushAmlUpdate } from './platform-webhook.service';
import logger from '../utils/logger';
import { captureError } from '../utils/sentry';

export async function screenIdentity(identityId: string): Promise<void> {
  const identity = await queryOne<{ id: string; full_name: string; aml_status: string }>(
    `SELECT id, full_name, aml_status FROM verified_identities WHERE id = $1`,
    [identityId]
  );

  if (!identity?.full_name) return;

  const previousStatus = identity.aml_status;
  const result = await screenName(identity.full_name, 'person');
  if (!result) return;

  await query(
    `INSERT INTO aml_screenings
       (identity_id, screening_type, result, match_details, screened_by, screened_at)
     VALUES ($1, 'sanctions', $2, $3, 'automated', NOW())`,
    [identityId, result.result, result.matchDetails ? JSON.stringify(result.matchDetails) : null]
  );

  await query(
    `UPDATE verified_identities
     SET aml_status = $1, last_screened_at = NOW()
     WHERE id = $2`,
    [result.result, identityId]
  );

  if (result.result !== previousStatus) {
    logger.info('AML status changed', { identityId, previousStatus, newStatus: result.result });
    await pushAmlUpdate(identityId, result.result, previousStatus);
  }
}

export async function runAmlRescreenBatch(): Promise<void> {
  const rescreenDays = parseInt(process.env.AML_RESCREEN_DAYS ?? '30', 10);

  const identities = await query<{ id: string }>(
    `SELECT id FROM verified_identities
     WHERE full_name IS NOT NULL AND full_name != ''
       AND (
         (aml_status = 'not_screened' AND created_at < NOW() - INTERVAL '1 day')
         OR
         (last_screened_at IS NOT NULL AND last_screened_at < NOW() - make_interval(days => $1))
       )
     ORDER BY last_screened_at ASC NULLS FIRST
     LIMIT 100`,
    [rescreenDays]
  );

  logger.info('AML re-screen batch started', { count: identities.length, rescreenDays });

  for (const { id } of identities) {
    try {
      await screenIdentity(id);
    } catch (err) {
      logger.error('AML re-screen failed for identity', {
        identityId: id,
        error: (err as Error).message,
      });
      captureError(err as Error, { identityId: id, job: 'aml_rescreen' });
    }
  }

  logger.info('AML re-screen batch complete', { processed: identities.length });
}
