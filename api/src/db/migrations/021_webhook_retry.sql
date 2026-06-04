-- Add correlation_id to group all retry attempts for a single webhook event,
-- and is_final_attempt to quickly identify whether retries are exhausted.
-- APPEND-ONLY table — only adding columns, no data mutations.

ALTER TABLE platform_webhook_deliveries
  ADD COLUMN IF NOT EXISTS correlation_id   UUID,
  ADD COLUMN IF NOT EXISTS is_final_attempt BOOLEAN NOT NULL DEFAULT false;

-- Index for querying all attempts belonging to one delivery event
CREATE INDEX IF NOT EXISTS idx_pwd_correlation
  ON platform_webhook_deliveries(correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Index for finding failed final attempts that may need manual inspection
CREATE INDEX IF NOT EXISTS idx_pwd_failed_final
  ON platform_webhook_deliveries(api_key_id, delivered_at DESC)
  WHERE success = false AND is_final_attempt = true;
