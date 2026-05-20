// Phase 2: BullMQ worker for trust score event processing.
// In Phase 1 trust events are written synchronously inline.

import logger from '../utils/logger';

export function startTrustUpdateWorker(): void {
  logger.info('Trust update worker: stub (Phase 2 will wire BullMQ here)');
}
