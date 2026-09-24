-- BD-01 Pass 2. Internal durable state; no management permission or lifecycle trigger.
CREATE TABLE patient_care_access (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  membership_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('DOCTOR_RELATIONSHIP', 'NURSE_ASSIGNMENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_membership_id UUID NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by_membership_id UUID,
  FOREIGN KEY (tenant_id, patient_id) REFERENCES patients (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES memberships (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, revoked_by_membership_id) REFERENCES memberships (tenant_id, id) ON DELETE RESTRICT,
  CHECK ((revoked_at IS NULL) = (revoked_by_membership_id IS NULL)),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
-- ACTIVE is derived from revoked_at IS NULL. Re-creation is a new history row.
CREATE UNIQUE INDEX patient_care_access_active_key
  ON patient_care_access (tenant_id, membership_id, patient_id, kind) WHERE revoked_at IS NULL;
CREATE INDEX patient_care_access_review_idx
  ON patient_care_access (tenant_id, patient_id, created_at, id);

CREATE FUNCTION protect_patient_care_access_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'patient care access history cannot be deleted';
  END IF;
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR
     (to_jsonb(NEW) - 'revoked_at' - 'revoked_by_membership_id') IS DISTINCT FROM
     (to_jsonb(OLD) - 'revoked_at' - 'revoked_by_membership_id') THEN
    RAISE EXCEPTION 'only first explicit revocation is allowed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER patient_care_access_history_update BEFORE UPDATE OR DELETE ON patient_care_access
  FOR EACH ROW EXECUTE FUNCTION protect_patient_care_access_history();
CREATE TRIGGER patient_care_access_history_truncate BEFORE TRUNCATE ON patient_care_access
  FOR EACH STATEMENT EXECUTE FUNCTION protect_patient_care_access_history();
