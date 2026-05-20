// Phase 2: BullMQ worker for async verification processing.
// In Phase 1 the verification route handles processing inline.
// This stub is ready for the queue wiring in the next phase.

import logger from '../utils/logger';

export function startVerificationWorker(): void {
  logger.info('Verification worker: stub (Phase 2 will wire BullMQ here)');
}
