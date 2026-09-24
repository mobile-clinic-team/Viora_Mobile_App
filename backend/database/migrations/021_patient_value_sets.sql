-- BD-02 / migration 021
-- Canonical Patient sex/status value sets.
--
-- This migration intentionally does not coerce legacy data. If incompatible
-- Patient rows exist, deployment fails closed so remediation is explicit.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM patients
    WHERE sex NOT IN ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN')
  ) THEN
    RAISE EXCEPTION
      'cannot apply migration 021: patients contain non-canonical sex values';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM patients
    WHERE status NOT IN ('ACTIVE', 'INACTIVE')
  ) THEN
    RAISE EXCEPTION
      'cannot apply migration 021: patients contain non-canonical status values';
  END IF;
END
$$;

ALTER TABLE patients
  ADD CONSTRAINT patients_sex_check
    CHECK (sex IN ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN')),
  ADD CONSTRAINT patients_status_check
    CHECK (status IN ('ACTIVE', 'INACTIVE'));