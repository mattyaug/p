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

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  user_id TEXT,
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
  hidden_from_owner INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  archive_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_user_id
ON appointments (user_id);

CREATE INDEX IF NOT EXISTS idx_appointments_email
ON appointments (email);

CREATE INDEX IF NOT EXISTS idx_appointments_requested_at
ON appointments (requested_date, requested_time);

CREATE INDEX IF NOT EXISTS idx_appointments_status
ON appointments (status);

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

CREATE TABLE IF NOT EXISTS membership_payments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  email TEXT NOT NULL,
  stripe_customer_id TEXT DEFAULT '',
  stripe_subscription_id TEXT DEFAULT '',
  payment_link_id TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_membership_payments_email
ON membership_payments (email);

CREATE INDEX IF NOT EXISTS idx_membership_payments_status
ON membership_payments (status);
