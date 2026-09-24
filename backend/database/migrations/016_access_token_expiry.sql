-- Phase 5A access-token lifetime.
-- Refresh/session lifetime remains in sessions.expires_at.
-- Access tokens expire independently and more quickly.

ALTER TABLE sessions
  ADD COLUMN access_expires_at TIMESTAMPTZ;

UPDATE sessions
SET access_expires_at = LEAST(
  expires_at,
  last_seen_at + INTERVAL '10 minutes'
);

ALTER TABLE sessions
  ALTER COLUMN access_expires_at SET NOT NULL;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_access_expiry_check
  CHECK (
    access_expires_at > created_at
    AND access_expires_at <= expires_at
  );

CREATE INDEX sessions_access_token_idx
  ON sessions (status, access_expires_at, id);