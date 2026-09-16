import logger from '../utils/logger';
import { runAmlRescreenBatch } from '../services/aml-rescreen.service';
import { captureError } from '../utils/sentry';

export function startAmlRescreenWorker(): void {
  const intervalHours = parseInt(process.env.AML_RESCREEN_INTERVAL_HOURS ?? '24', 10);
  const intervalMs = intervalHours * 60 * 60 * 1000;

  logger.info('AML re-screen worker started', { intervalHours });

  setInterval(async () => {
    logger.info('AML re-screen batch triggered');
    try {
      await runAmlRescreenBatch();
    } catch (err) {
      logger.error('AML re-screen batch error', { error: (err as Error).message });
      captureError(err as Error, { job: 'aml_rescreen_batch' });
    }
  }, intervalMs);
}
