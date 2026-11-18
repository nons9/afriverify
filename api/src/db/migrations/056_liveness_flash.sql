-- Migration 056: the screen-light (flash) challenge. The server picks a random colour order per
-- liveness attempt and stores it here; the engine is told the colours from THIS column, never from the client.
ALTER TABLE liveness_sessions ADD COLUMN IF NOT EXISTS flash_plan JSONB;
