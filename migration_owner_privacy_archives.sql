-- Adds private owner dashboard archive/log support.
-- Run this once on the live D1 database. If an ALTER TABLE line says
-- duplicate column name, that line has already been applied and can be ignored.

ALTER TABLE appointments ADD COLUMN hidden_from_owner INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN archived_at TEXT;
ALTER TABLE appointments ADD COLUMN archive_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_appointments_hidden_from_owner
ON appointments (hidden_from_owner);

CREATE TABLE IF NOT EXISTS owner_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT DEFAULT '',
  title TEXT NOT NULL,
  details TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_owner_logs_created_at
ON owner_logs (created_at);

CREATE INDEX IF NOT EXISTS idx_owner_logs_entity
ON owner_logs (entity_type, entity_id);
