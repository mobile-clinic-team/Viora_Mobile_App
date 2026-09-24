-- Phase 5A authentication foundation.
-- External identity subjects are mapped to Viora users without storing
-- provider tokens or credentials in the identity mapping.

CREATE TABLE identity_subjects (
  issuer TEXT NOT NULL
    CHECK (btrim(issuer) <> '' AND char_length(issuer) <= 2048),
  subject TEXT NOT NULL
    CHECK (btrim(subject) <> '' AND char_length(subject) <= 1024),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT identity_subjects_provider_subject_key
    PRIMARY KEY (issuer, subject)
);

CREATE INDEX identity_subjects_user_idx
  ON identity_subjects (user_id, created_at);