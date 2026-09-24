-- BD-01 Pass 2. A durable care-access kind must match the target membership role.
-- This is an internal persistence invariant; it does not create a management permission.

CREATE FUNCTION enforce_patient_care_access_target_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_role TEXT;
BEGIN
  SELECT role
    INTO target_role
    FROM memberships
   WHERE tenant_id = NEW.tenant_id
     AND id = NEW.membership_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'target membership not found in workspace'
      USING ERRCODE = '23503';
  END IF;

  IF
    (NEW.kind = 'DOCTOR_RELATIONSHIP' AND target_role <> 'DOCTOR')
    OR
    (NEW.kind = 'NURSE_ASSIGNMENT' AND target_role <> 'NURSE')
  THEN
    RAISE EXCEPTION 'patient care access kind does not match target membership role'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER patient_care_access_target_role_insert
BEFORE INSERT ON patient_care_access
FOR EACH ROW
EXECUTE FUNCTION enforce_patient_care_access_target_role();