-- AUTH-SECURITY: one-use, two-minute assurance bound to session/user/workspace,
-- action and both exact reviewed/target ETags. auth_transactions is the OIDC
-- exchange lifecycle and cannot represent a separately consumed command grant.
CREATE TABLE draft_assurance_grants (
  id UUID PRIMARY KEY,
  token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  draft_id UUID NOT NULL,
  draft_version BIGINT NOT NULL CHECK (draft_version > 0),
  target_record_id UUID NOT NULL,
  target_version_token TEXT NOT NULL CHECK (length(target_version_token) BETWEEN 3 AND 128),
  action TEXT NOT NULL CHECK (action = 'draft.approve'),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CONSTRAINT draft_assurance_expiry CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '2 minutes'),
  FOREIGN KEY (tenant_id,draft_id) REFERENCES ai_drafts(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,target_record_id) REFERENCES medical_records(tenant_id,id) ON DELETE RESTRICT
);
