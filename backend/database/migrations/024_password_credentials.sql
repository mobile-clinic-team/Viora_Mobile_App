-- Password identities are independent of staff membership provisioning.
ALTER TABLE users ADD COLUMN display_name TEXT CHECK (length(display_name) BETWEEN 1 AND 200);
CREATE TABLE password_credentials (
  email TEXT PRIMARY KEY CHECK (email = lower(email) AND length(email) <= 254),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
