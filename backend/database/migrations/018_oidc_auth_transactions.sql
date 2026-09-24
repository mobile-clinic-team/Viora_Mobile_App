-- Phase 5A.7a OIDC transaction hardening.
-- Existing transactions are rejected before the new security fields become
-- mandatory; no previously pending transaction is trusted across this change.

-- The migration runner executes every migration in one transaction. PostgreSQL
-- does not permit using an enum value added by ALTER TYPE until that transaction
-- commits, so replace the type in-place instead of using ADD VALUE.
ALTER TABLE auth_transactions
  ALTER COLUMN status DROP DEFAULT;

ALTER TYPE auth_transaction_status RENAME TO auth_transaction_status_legacy;
CREATE TYPE auth_transaction_status AS ENUM ('PENDING', 'EXCHANGING', 'CONSUMED', 'EXPIRED', 'REJECTED');
ALTER TABLE auth_transactions
  ALTER COLUMN status TYPE auth_transaction_status
  USING status::text::auth_transaction_status;
ALTER TABLE auth_transactions
  ALTER COLUMN status SET DEFAULT 'PENDING'::auth_transaction_status;  
DROP TYPE auth_transaction_status_legacy;

ALTER TABLE auth_transactions
  ADD COLUMN IF NOT EXISTS provider_key TEXT,
  ADD COLUMN IF NOT EXISTS state_hash BYTEA,
  ADD COLUMN IF NOT EXISTS nonce_hash BYTEA,
  ADD COLUMN IF NOT EXISTS nonce_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS pkce_verifier_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS redirect_uri TEXT;

UPDATE auth_transactions
SET status = 'REJECTED',
    consumed_at = COALESCE(consumed_at, CURRENT_TIMESTAMP),
    provider_key = COALESCE(provider_key, 'legacy'),
    state_hash = COALESCE(state_hash, decode(repeat('00', 32), 'hex')),
    nonce_hash = COALESCE(nonce_hash, decode(repeat('00', 32), 'hex')),
    nonce_ciphertext = COALESCE(nonce_ciphertext, 'legacy-rejected'),
    pkce_verifier_ciphertext = COALESCE(pkce_verifier_ciphertext, 'legacy-rejected'),
    code_challenge = repeat('A', 43),
    redirect_uri = COALESCE(redirect_uri, 'https://invalid.invalid/legacy'),
    expires_at = CASE
      WHEN expires_at <= created_at THEN created_at + INTERVAL '1 second'
      ELSE expires_at
    END;

ALTER TABLE auth_transactions
  ALTER COLUMN provider_key SET NOT NULL,
  ALTER COLUMN state_hash SET NOT NULL,
  ALTER COLUMN nonce_hash SET NOT NULL,
  ALTER COLUMN nonce_ciphertext SET NOT NULL,
  ALTER COLUMN pkce_verifier_ciphertext SET NOT NULL,
  ALTER COLUMN redirect_uri SET NOT NULL;

ALTER TABLE auth_transactions
  DROP CONSTRAINT IF EXISTS auth_transactions_code_challenge_check;

ALTER TABLE auth_transactions
  ADD CONSTRAINT auth_transactions_provider_key_check
    CHECK (btrim(provider_key) <> '' AND char_length(provider_key) <= 128),
  ADD CONSTRAINT auth_transactions_state_hash_check
    CHECK (octet_length(state_hash) = 32),
  ADD CONSTRAINT auth_transactions_nonce_hash_check
    CHECK (octet_length(nonce_hash) = 32),
  ADD CONSTRAINT auth_transactions_nonce_ciphertext_check
    CHECK (btrim(nonce_ciphertext) <> '' AND char_length(nonce_ciphertext) <= 8192),
  ADD CONSTRAINT auth_transactions_pkce_verifier_ciphertext_check
    CHECK (btrim(pkce_verifier_ciphertext) <> '' AND char_length(pkce_verifier_ciphertext) <= 8192),
  ADD CONSTRAINT auth_transactions_code_challenge_check
    CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43,128}$'),
  ADD CONSTRAINT auth_transactions_redirect_uri_check
    CHECK (btrim(redirect_uri) <> '' AND char_length(redirect_uri) <= 2048),
  ADD CONSTRAINT auth_transactions_expiry_check
    CHECK (expires_at > created_at),
  ADD CONSTRAINT auth_transactions_consumed_consistency_check
    CHECK (
      (status IN ('CONSUMED', 'REJECTED') AND consumed_at IS NOT NULL)
      OR
      (status NOT IN ('CONSUMED', 'REJECTED') AND consumed_at IS NULL)
    );

CREATE UNIQUE INDEX auth_transactions_pending_state_key
  ON auth_transactions (state_hash)
  WHERE status NOT IN ('CONSUMED', 'EXPIRED', 'REJECTED');

CREATE INDEX auth_transactions_provider_status_expiry_idx
  ON auth_transactions (provider_key, status, expires_at, id);
