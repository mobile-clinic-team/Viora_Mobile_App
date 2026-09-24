import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = readFile(new URL('./013_phase4b_foundation.sql', import.meta.url), 'utf8');

test('Phase 4B migration adds durable operation, auth, audit, clinical and AI foundations', async () => {
  const sql = await migration;
  for (const fragment of [
    "CREATE TYPE operation_status AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED', 'INDETERMINATE', 'CLOSED')",
    'CREATE TABLE membership_grants',
    'CREATE TABLE auth_transactions',
    'CREATE TABLE sessions',
    'CREATE TABLE refresh_families',
    'CREATE TABLE refresh_tokens',
    'CREATE TABLE operations',
    'CREATE TABLE operation_resource_refs',
    'CREATE TABLE ai_provenance',
    'CREATE TABLE ai_handoffs',
    'operations_actor_key UNIQUE (tenant_id, actor_id, idempotency_key)',
    'ai_handoffs_one_per_draft_key UNIQUE (tenant_id, draft_id)',
    'ai_handoffs_one_per_operation_key UNIQUE (tenant_id, operation_id)',
    'medical_record_versions_record_tenant_fk',
    'appointments_patient_tenant_fk',
    'encounters_appointment_tenant_fk',
  ]) assert.match(sql, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(sql, /\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i);
});

test('Phase 4B persistence tables do not define request or prompt payload columns', async () => {
  const sql = await migration;
  assert.doesNotMatch(sql, /CREATE TABLE operations[\s\S]*\b(request_body|payload|prompt|response)\b/i);
  assert.doesNotMatch(sql, /ALTER TABLE audit_events[\s\S]*\b(request_body|payload|prompt|response)\b/i);
});
