-- Phase 4B foundation / migration 013
-- Forward-only hardening for the existing tenant-based schema. In the public
-- API, tenant is the persisted workspace root until the identity migration
-- renames that concept without duplicating the source-of-truth table.

ALTER TABLE memberships
  ADD COLUMN permission_revision BIGINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT memberships_permission_revision_positive CHECK (permission_revision > 0),
  ADD CONSTRAINT memberships_tenant_id_key UNIQUE (tenant_id, id);

CREATE TABLE membership_grants (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  membership_id UUID NOT NULL REFERENCES memberships (id) ON DELETE RESTRICT,
  permission TEXT NOT NULL CHECK (btrim(permission) <> ''),
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT membership_grants_tenant_membership_fk
    FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT membership_grants_membership_permission_key UNIQUE (membership_id, permission),
  CONSTRAINT membership_grants_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX membership_grants_tenant_membership_idx
  ON membership_grants (tenant_id, membership_id, permission);

CREATE TYPE auth_transaction_purpose AS ENUM ('LOGIN', 'STEP_UP');
CREATE TYPE auth_transaction_status AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED', 'REJECTED');

CREATE TABLE auth_transactions (
  id UUID PRIMARY KEY,
  purpose auth_transaction_purpose NOT NULL,
  user_id UUID REFERENCES users (id) ON DELETE RESTRICT,
  tenant_id UUID REFERENCES tenants (id) ON DELETE RESTRICT,
  code_challenge TEXT NOT NULL CHECK (btrim(code_challenge) <> ''),
  assurance_action TEXT,
  assurance_resource_id UUID,
  assurance_version_token TEXT,
  status auth_transaction_status NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX auth_transactions_pending_idx
  ON auth_transactions (status, expires_at, id);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  access_token_hash BYTEA,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX sessions_user_status_idx ON sessions (user_id, status, expires_at);

CREATE TABLE refresh_families (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions (id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT refresh_families_session_user_fk
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE RESTRICT
);

CREATE INDEX refresh_families_user_status_idx ON refresh_families (user_id, status, expires_at);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES refresh_families (id) ON DELETE RESTRICT,
  token_hash BYTEA NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ROTATED', 'REVOKED', 'EXPIRED')),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  rotated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT refresh_tokens_family_hash_key UNIQUE (family_id, token_hash)
);

CREATE INDEX refresh_tokens_active_idx ON refresh_tokens (family_id, status, expires_at);

CREATE TYPE operation_status AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED', 'INDETERMINATE', 'CLOSED');

CREATE TABLE operations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  idempotency_key UUID NOT NULL,
  request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  operation_created_at TIMESTAMPTZ NOT NULL,
  status operation_status NOT NULL,
  result_resource_type TEXT CHECK (result_resource_type IS NULL OR btrim(result_resource_type) <> ''),
  result_resource_id UUID,
  result_resource_version BIGINT CHECK (result_resource_version IS NULL OR result_resource_version > 0),
  result_http_status INTEGER CHECK (result_http_status IS NULL OR result_http_status BETWEEN 100 AND 599),
  failure_code TEXT CHECK (failure_code IS NULL OR btrim(failure_code) <> ''),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  CONSTRAINT operations_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT operations_actor_key UNIQUE (tenant_id, actor_id, idempotency_key)
);

CREATE INDEX operations_actor_status_idx
  ON operations (tenant_id, actor_id, status, updated_at, id);

CREATE TABLE operation_resource_refs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  operation_id UUID NOT NULL REFERENCES operations (id) ON DELETE RESTRICT,
  resource_type TEXT NOT NULL CHECK (btrim(resource_type) <> ''),
  resource_id UUID NOT NULL,
  resource_version BIGINT CHECK (resource_version IS NULL OR resource_version > 0),
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT operation_resource_refs_tenant_operation_fk
    FOREIGN KEY (tenant_id, operation_id) REFERENCES operations (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT operation_resource_refs_identity_key UNIQUE (operation_id, resource_type, resource_id),
  CONSTRAINT operation_resource_refs_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX operation_resource_refs_resource_idx
  ON operation_resource_refs (tenant_id, resource_type, resource_id, operation_id);

ALTER TABLE audit_events
  ADD COLUMN session_id UUID REFERENCES sessions (id) ON DELETE RESTRICT,
  ADD COLUMN operation_id UUID,
  ADD COLUMN resource_version BIGINT CHECK (resource_version IS NULL OR resource_version > 0),
  ADD CONSTRAINT audit_events_metadata_size CHECK (pg_column_size(metadata) <= 4096),
  ADD CONSTRAINT audit_events_tenant_id_key UNIQUE (tenant_id, id);

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_tenant_operation_fk
    FOREIGN KEY (tenant_id, operation_id) REFERENCES operations (tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX audit_events_tenant_time_idx
  ON audit_events (tenant_id, created_at DESC, id DESC);
CREATE INDEX audit_events_operation_idx ON audit_events (tenant_id, operation_id);

ALTER TABLE locations
  ADD CONSTRAINT locations_tenant_id_key UNIQUE (tenant_id, id);
ALTER TABLE patients
  ADD CONSTRAINT patients_tenant_id_key UNIQUE (tenant_id, id);
ALTER TABLE departments
  ADD CONSTRAINT departments_tenant_id_key UNIQUE (tenant_id, id);
ALTER TABLE doctors
  ADD CONSTRAINT doctors_tenant_id_key UNIQUE (tenant_id, id),
  ADD CONSTRAINT doctors_department_tenant_fk
    FOREIGN KEY (tenant_id, department_id) REFERENCES departments (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT doctors_location_tenant_fk
    FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE doctor_working_shifts
  ADD CONSTRAINT doctor_working_shifts_tenant_id_key UNIQUE (tenant_id, id),
  ADD CONSTRAINT doctor_working_shifts_doctor_tenant_fk
    FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT doctor_working_shifts_location_tenant_fk
    FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_tenant_id_key UNIQUE (tenant_id, id),
  ADD CONSTRAINT appointments_patient_tenant_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT appointments_doctor_tenant_fk
    FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT appointments_location_tenant_fk
    FOREIGN KEY (tenant_id, location_id) REFERENCES locations (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE encounters
  ADD CONSTRAINT encounters_tenant_id_key UNIQUE (tenant_id, id),
  ADD CONSTRAINT encounters_patient_tenant_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT encounters_doctor_tenant_fk
    FOREIGN KEY (tenant_id, doctor_id) REFERENCES doctors (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT encounters_appointment_tenant_fk
    FOREIGN KEY (tenant_id, appointment_id) REFERENCES appointments (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE medical_records
  ADD COLUMN reviewed_version BIGINT,
  ADD COLUMN version_token TEXT NOT NULL DEFAULT '"v1"',
  ADD CONSTRAINT medical_records_tenant_id_key UNIQUE (tenant_id, id),
  ADD CONSTRAINT medical_records_reviewed_version_positive CHECK (reviewed_version IS NULL OR reviewed_version > 0),
  ADD CONSTRAINT medical_records_version_token_check CHECK (length(version_token) BETWEEN 3 AND 128);

ALTER TABLE medical_records
  ADD CONSTRAINT medical_records_patient_tenant_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT medical_records_encounter_tenant_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE medical_record_versions
  ADD COLUMN tenant_id UUID,
  ADD COLUMN source_ai_draft_id UUID,
  ADD COLUMN version_token TEXT NOT NULL DEFAULT '"v1"',
  ADD CONSTRAINT medical_record_versions_version_token_check CHECK (length(version_token) BETWEEN 3 AND 128);

-- Existing medical record versions are immutable to application workflows.
-- This migration temporarily disables only the immutable application trigger
-- to backfill tenant ownership derived from the parent medical record.
-- The migration runner executes the batch transactionally, so a failure rolls
-- back both the backfill and trigger state.

ALTER TABLE medical_record_versions
  DISABLE TRIGGER medical_record_versions_immutable_trigger;

UPDATE medical_record_versions version_row
SET tenant_id = record.tenant_id
FROM medical_records record
WHERE record.id = version_row.medical_record_id;

ALTER TABLE medical_record_versions
  ENABLE TRIGGER medical_record_versions_immutable_trigger;

ALTER TABLE medical_record_versions
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT medical_record_versions_tenant_id_key UNIQUE (tenant_id, id),
  ADD CONSTRAINT medical_record_versions_record_tenant_fk
    FOREIGN KEY (tenant_id, medical_record_id) REFERENCES medical_records (tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX medical_record_versions_record_version_idx
  ON medical_record_versions (tenant_id, medical_record_id, version DESC, id DESC);

ALTER TABLE ai_conversations
  ADD CONSTRAINT ai_conversations_tenant_id_key UNIQUE (tenant_id, id),
  ADD CONSTRAINT ai_conversations_patient_tenant_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT ai_conversations_status_check CHECK (status IN ('ACTIVE', 'CLOSED', 'EXPIRED'));

ALTER TABLE ai_drafts
  ADD COLUMN target_record_id UUID,
  ADD COLUMN target_version_token TEXT,
  ADD COLUMN reviewed_by UUID REFERENCES users (id) ON DELETE RESTRICT,
  ADD COLUMN decided_at TIMESTAMPTZ,
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD CONSTRAINT ai_drafts_tenant_id_key UNIQUE (tenant_id, id),
  ADD CONSTRAINT ai_drafts_target_pair_check CHECK ((target_record_id IS NULL) = (target_version_token IS NULL)),
  ADD CONSTRAINT ai_drafts_target_version_token_check CHECK (target_version_token IS NULL OR length(target_version_token) BETWEEN 3 AND 128),
  ADD CONSTRAINT ai_drafts_patient_tenant_fk
    FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT ai_drafts_encounter_tenant_fk
    FOREIGN KEY (tenant_id, encounter_id) REFERENCES encounters (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT ai_drafts_target_record_tenant_fk
    FOREIGN KEY (tenant_id, target_record_id) REFERENCES medical_records (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE medical_record_versions
  ADD CONSTRAINT medical_record_versions_source_draft_tenant_fk
    FOREIGN KEY (tenant_id, source_ai_draft_id) REFERENCES ai_drafts (tenant_id, id) ON DELETE RESTRICT;

CREATE TABLE ai_provenance (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  draft_id UUID NOT NULL REFERENCES ai_drafts (id) ON DELETE RESTRICT,
  target_record_id UUID NOT NULL,
  target_record_version BIGINT NOT NULL CHECK (target_record_version > 0),
  target_version_token TEXT NOT NULL CHECK (length(target_version_token) BETWEEN 3 AND 128),
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 0 AND 7),
  source_type TEXT NOT NULL CHECK (btrim(source_type) <> ''),
  source_reference TEXT NOT NULL CHECK (btrim(source_reference) <> ''),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 2048),
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT ai_provenance_tenant_draft_fk
    FOREIGN KEY (tenant_id, draft_id) REFERENCES ai_drafts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_provenance_tenant_record_fk
    FOREIGN KEY (tenant_id, target_record_id) REFERENCES medical_records (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_provenance_draft_ordinal_key UNIQUE (draft_id, ordinal),
  CONSTRAINT ai_provenance_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX ai_provenance_draft_idx ON ai_provenance (tenant_id, draft_id, ordinal);

CREATE TABLE ai_handoffs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  draft_id UUID NOT NULL,
  operation_id UUID NOT NULL,
  record_id UUID NOT NULL,
  record_version_id UUID NOT NULL,
  record_version BIGINT NOT NULL CHECK (record_version > 0),
  record_version_token TEXT NOT NULL CHECK (length(record_version_token) BETWEEN 3 AND 128),
  approved_draft_version_token TEXT NOT NULL CHECK (length(approved_draft_version_token) BETWEEN 3 AND 128),
  audit_event_id UUID NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT ai_handoffs_tenant_draft_fk
    FOREIGN KEY (tenant_id, draft_id) REFERENCES ai_drafts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_handoffs_tenant_operation_fk
    FOREIGN KEY (tenant_id, operation_id) REFERENCES operations (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_handoffs_tenant_record_fk
    FOREIGN KEY (tenant_id, record_id) REFERENCES medical_records (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_handoffs_tenant_version_fk
    FOREIGN KEY (tenant_id, record_version_id) REFERENCES medical_record_versions (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_handoffs_tenant_audit_fk
    FOREIGN KEY (tenant_id, audit_event_id) REFERENCES audit_events (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT ai_handoffs_one_per_draft_key UNIQUE (tenant_id, draft_id),
  CONSTRAINT ai_handoffs_one_per_operation_key UNIQUE (tenant_id, operation_id),
  CONSTRAINT ai_handoffs_tenant_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX ai_handoffs_operation_idx ON ai_handoffs (tenant_id, operation_id);

CREATE INDEX patients_workspace_lookup_idx ON patients (tenant_id, full_name, id);
CREATE INDEX doctors_workspace_lookup_idx ON doctors (tenant_id, display_name, id);
CREATE INDEX doctor_shifts_location_time_idx
  ON doctor_working_shifts (tenant_id, doctor_id, location_id, start_time, id);
CREATE INDEX appointments_workspace_time_idx
  ON appointments (tenant_id, start_time, id);
CREATE INDEX encounters_patient_time_idx
  ON encounters (tenant_id, patient_id, started_at, id);
CREATE INDEX ai_conversations_owner_updated_idx
  ON ai_conversations (tenant_id, user_id, updated_at DESC, id DESC);
CREATE INDEX ai_drafts_target_status_idx
  ON ai_drafts (tenant_id, target_record_id, status, created_at DESC, id DESC);
