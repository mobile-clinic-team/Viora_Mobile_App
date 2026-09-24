-- Phase 5A session integrity.
-- A refresh family must belong to the same user as its parent session.

ALTER TABLE sessions
  ADD CONSTRAINT sessions_id_user_key
  UNIQUE (id, user_id);

ALTER TABLE refresh_families
  DROP CONSTRAINT refresh_families_session_user_fk;

ALTER TABLE refresh_families
  ADD CONSTRAINT refresh_families_session_user_fk
  FOREIGN KEY (session_id, user_id)
  REFERENCES sessions (id, user_id)
  ON DELETE RESTRICT;