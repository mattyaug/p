CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  property_address TEXT NOT NULL,
  service TEXT NOT NULL,
  member_status TEXT NOT NULL,
  requested_date TEXT NOT NULL,
  requested_time TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested', 'confirmed', 'completed', 'canceled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_requested_at
ON appointments (requested_date, requested_time);

CREATE INDEX IF NOT EXISTS idx_appointments_status
ON appointments (status);
