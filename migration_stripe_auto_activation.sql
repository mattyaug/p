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
