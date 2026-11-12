import logger from '../utils/logger';
import { runAmlRescreenBatch } from '../services/aml-rescreen.service';
import { captureError } from '../utils/sentry';
import { runOncePerInterval } from '../utils/job-lock';

export function startAmlRescreenWorker(): void {
  const intervalHours = parseInt(process.env.AML_RESCREEN_INTERVAL_HOURS ?? '24', 10);
  const intervalMs = intervalHours * 60 * 60 * 1000;

  logger.info('AML re-screen worker started', { intervalHours });

  setInterval(async () => {
    try {
      const ran = await runOncePerInterval('aml-rescreen', intervalMs, async () => {
        logger.info('AML re-screen batch triggered');
        await runAmlRescreenBatch();
      });
      if (!ran) return;
    } catch (err) {
      logger.error('AML re-screen batch error', { error: (err as Error).message });
      captureError(err as Error, { job: 'aml_rescreen_batch' });
    }
  }, intervalMs);
}
