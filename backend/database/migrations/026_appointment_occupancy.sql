-- BD-03 approved: completed visits release doctor capacity.
ALTER TABLE appointments DROP CONSTRAINT appointments_doctor_schedule_exclusion;
ALTER TABLE appointments ADD CONSTRAINT appointments_doctor_schedule_exclusion
  EXCLUDE USING gist (doctor_id WITH =, tstzrange(start_time, end_time, '[)') WITH &&)
  WHERE (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));
