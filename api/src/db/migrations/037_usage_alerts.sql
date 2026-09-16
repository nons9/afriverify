-- Track when each subscription's 80% usage alert email was sent so we don't
-- spam on every daily cron run. Reset to NULL when a new billing period starts.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS usage_alert_80_sent_at TIMESTAMPTZ;

-- Index for the alert cron query (active subs that haven't been alerted yet).
CREATE INDEX IF NOT EXISTS idx_subscriptions_alert ON subscriptions (status, usage_alert_80_sent_at)
WHERE status = 'active';
