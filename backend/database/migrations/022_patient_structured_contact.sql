-- Preserve legacy free text without guessing a structured interpretation.
-- DOMAIN-MODEL EmergencyContact is stored separately for canonical commands.
ALTER TABLE patients ADD COLUMN emergency_contact_details JSONB;
ALTER TABLE patients ADD CONSTRAINT patients_emergency_contact_details_object
  CHECK (emergency_contact_details IS NULL OR jsonb_typeof(emergency_contact_details) = 'object');
