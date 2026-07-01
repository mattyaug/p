-- Perigee customer account portal migration
-- Run this once in your existing Cloudflare D1 database.

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT NOT NULL,
  property_address TEXT NOT NULL,
  membership_status TEXT NOT NULL DEFAULT 'pending' CHECK(membership_status IN ('pending', 'active', 'inactive', 'canceled')),
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer', 'owner')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_members_email
ON members (email);

CREATE INDEX IF NOT EXISTS idx_members_membership_status
ON members (membership_status);

CREATE TABLE IF NOT EXISTS member_sessions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_member_sessions_token_hash
ON member_sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_member_sessions_expires_at
ON member_sessions (expires_at);

-- Existing installs need this column added to appointments.
-- If D1 says the column already exists, do not worry; it means this migration step already ran.
ALTER TABLE appointments ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_appointments_user_id
ON appointments (user_id);

CREATE INDEX IF NOT EXISTS idx_appointments_email
ON appointments (email);
