-- Phase 5A authenticated-session identity binding.
-- Every active session must be bound to the exact external identity
-- (issuer + subject) that created it.
--
-- Existing unbound sessions are revoked instead of guessing which
-- external identity originally authenticated them.

ALTER TABLE identity_subjects
  ADD CONSTRAINT identity_subjects_provider_subject_user_key
  UNIQUE (issuer, subject, user_id);

ALTER TABLE sessions
  ADD COLUMN identity_issuer TEXT,
  ADD COLUMN identity_subject TEXT;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_identity_issuer_check
  CHECK (
    identity_issuer IS NULL
    OR (
      btrim(identity_issuer) <> ''
      AND char_length(identity_issuer) <= 2048
    )
  );

ALTER TABLE sessions
  ADD CONSTRAINT sessions_identity_subject_check
  CHECK (
    identity_subject IS NULL
    OR (
      btrim(identity_subject) <> ''
      AND char_length(identity_subject) <= 1024
    )
  );

-- Fail closed for legacy sessions that cannot prove which
-- external identity created them.

UPDATE refresh_tokens rt
SET status = 'REVOKED',
    revoked_at = COALESCE(rt.revoked_at, CURRENT_TIMESTAMP)
FROM refresh_families rf
JOIN sessions s
  ON s.id = rf.session_id
 AND s.user_id = rf.user_id
WHERE rt.family_id = rf.id
  AND s.identity_issuer IS NULL
  AND rt.status IN ('ACTIVE', 'ROTATED');

UPDATE refresh_families rf
SET status = 'REVOKED',
    revoked_at = COALESCE(rf.revoked_at, CURRENT_TIMESTAMP)
FROM sessions s
WHERE rf.session_id = s.id
  AND rf.user_id = s.user_id
  AND s.identity_issuer IS NULL
  AND rf.status = 'ACTIVE';

UPDATE sessions
SET status = 'REVOKED',
    revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
    last_seen_at = CURRENT_TIMESTAMP
WHERE identity_issuer IS NULL
  AND status = 'ACTIVE';

ALTER TABLE sessions
  ADD CONSTRAINT sessions_identity_pair_check
  CHECK (
    (
      identity_issuer IS NOT NULL
      AND identity_subject IS NOT NULL
    )
    OR (
      identity_issuer IS NULL
      AND identity_subject IS NULL
      AND status <> 'ACTIVE'
    )
  );

ALTER TABLE sessions
  ADD CONSTRAINT sessions_identity_subject_user_fk
  FOREIGN KEY (
    identity_issuer,
    identity_subject,
    user_id
  )
  REFERENCES identity_subjects (
    issuer,
    subject,
    user_id
  )
  ON DELETE RESTRICT;