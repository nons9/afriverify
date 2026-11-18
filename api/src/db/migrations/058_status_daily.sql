-- Migration 058: daily self-measured availability for the public status page.
-- One row per UTC day. checks_* count the API's own once-a-minute readiness checks; requests/errors_5xx come
-- from the per-minute request counters. A day with few checks shows low "coverage": we never present a gap
-- as if it were uptime. (An outage of the API process itself cannot record itself, which is why an external
-- monitor is still recommended alongside this.)
CREATE TABLE IF NOT EXISTS status_daily (
  day          DATE        PRIMARY KEY,
  checks_total INTEGER     NOT NULL DEFAULT 0,
  checks_ok    INTEGER     NOT NULL DEFAULT 0,
  requests     BIGINT      NOT NULL DEFAULT 0,
  errors_5xx   BIGINT      NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (checks_ok <= checks_total)
);
