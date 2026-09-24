-- A user may have at most one Patient profile in each tenant. Existing
-- duplicate links deliberately abort this forward migration for remediation.
CREATE UNIQUE INDEX patients_tenant_user_id_key
  ON patients (tenant_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX patients_user_id_idx ON patients (user_id, tenant_id)
  WHERE user_id IS NOT NULL;
