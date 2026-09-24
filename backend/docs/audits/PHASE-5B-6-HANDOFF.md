# HANDOFF — Viora Backend

Date: 2026-09-21. This report records local evidence, not owner approval.

## 1. Current Phase

- Phase 5B incomplete: its fixture defect is fixed and all 375 tests pass, but the mandatory boundary stage fails.
- Phase 6 not started: scope discovery completed; implementation waits for a genuinely green Phase 5B.
- Stop reason: an explicit architecture decision is required to resolve the remaining quality gate, not a token limit or unavailable PostgreSQL.

## 2. Completed Work

- Reproduced PostgreSQL 23503 on audit_events_session_id_fkey with the original fixture on isolated PostgreSQL 18.
- Proved the fixture inserted only tenants/users and supplied nonexistent session/membership UUIDs.
- Followed session-repository.integration.test.ts: insert the identity subject, then call PostgresSessionRepository.create to persist the session, matching refresh family, and refresh token.
- Added an ACTIVE membership and its three Patient grants. Resolve the persisted session/membership to construct RequestContext; assert identity, workspace, membership status, and audit linkage.
- Preserved the real command/recovery path, existing assertions, FK, transaction behavior, and schema.
- Focused test: 1/1 passed. Related tests: 80/80 passed. Complete suite: 375/375 passed, no skips.
- Inspected the five boundary failures and found them already documented as unresolved in FOUND-003-quality-gate-report.md and BD-01-PASS-2-IMPLEMENTATION-REPORT.md.

## 3. Files Changed

Authored changes, relative to the repository root:

- backend/apps/api/src/postgres-phase5b-commands.integration.test.ts — persist and verify a valid authenticated fixture; assert every audit row uses its tenant/actor/session.
- backend/docs/audits/PHASE-5B-6-HANDOFF.md — evidence, architecture proposal, Phase 6 scope, and continuation instructions.

The required build regenerated backend/dist outputs. Those are generated artifacts, not separately authored source changes.

## 4. Database Changes

No schema or migration changes. Fixture-only inserts: identity_subjects, memberships, membership_grants, sessions, refresh_families, refresh_tokens.

Created isolated disposable viora_mobile_test on loopback port 55439 using the installed PostgreSQL 18 binaries and pgvector. Cluster directory: C:/Users/LAPTOP/AppData/Local/Temp/viora-backend-phase5b-6-pg18/data.

The first disposable PostgreSQL 16 attempt lacked pgvector; it was stopped. Its unused cluster remains under C:/Users/LAPTOP/AppData/Local/Temp/viora-backend-phase5b-6/data. Neither existing database service nor its authentication configuration was changed.

Both task-created servers are stopped at handoff. The PostgreSQL 18 test cluster uses local trust authentication and contains synthetic test data only.

## 5. Validation Results

| Validation | Latest result |
|---|---|
| Original focused reproduction on PostgreSQL 18 | 0 pass, 1 fail, 0 skipped; exact session FK 23503 |
| Fixed Phase 5B focused integration | 1 pass, 0 fail, 0 skipped |
| Related Patient/operation/authorization/PostgreSQL/session tests | 80 pass, 0 fail, 0 skipped |
| Complete backend tests, including real PostgreSQL integrations | 375 pass, 0 fail, 0 skipped, 0 cancelled, 0 todo |
| Lint | Passed |
| Typecheck | Passed |
| Build | Passed |
| Boundaries | Failed: five pre-existing violations |
| npm run quality | Exit 1 at boundaries |

Logs: C:/Users/LAPTOP/AppData/Local/Temp/viora-phase5b-related.log and C:/Users/LAPTOP/AppData/Local/Temp/viora-phase5b-quality.log.

The related run selected apps/api/src test files matching patient, operation, postgres, or authorization, plus postgres-operation-store.test.ts and session-repository.integration.test.ts. Runs used --test-concurrency=1; never run resetting integration suites concurrently against this database.

## 6. Phase 5B Status

Passed: valid persisted identity/session fixture, real create/patch, durable admission, receipt replay, idempotency conflict, pending operations, close/recovery race, stale OCC and replay, authorization denial, mandatory audit, and rollback. Related suites cover MRN conflict, ambiguous transaction outcome remaining pending, reference authorization, expiry, tenant scoping, session verification/revocation, and permission revision behavior.

Existing fail-closed feature gates remain intact. The fixture test is a runtime integration test, not an end-to-end OIDC authentication test. No claim of full BD-01 or complete Appointment/Clinical runtime implementation is made.

Remaining: resolve the approved boundary architecture, then rerun the complete quality gate. Do not call Phase 5B complete from test counts alone.

## 7. Phase 6 Scope Discovered

Authoritative backend plan: backend/docs/IMPLEMENTATION-PLAN.md, sections 5, 16–19, 24, and the M5 milestone:

- Phase 6: “AI MVP features”; exit: “Approved AI reads, summaries, drafts, and approval ready.”
- AI-002: read-only Patient/Clinical tools; depends on AI-001, PAT-002, CLIN-001.
- AI-003: clinical draft/human approval; depends on AI-002, CLIN-002 and approved AI-006/AI-007 policies.
- RAG-001 spans phases 5–6 and requires tenant/status/permission isolation.
- Approval proceeds through human review, application validation and controlled Clinical handoff. AI is not a direct database client or privileged actor.

Apply backend/docs/AI-SAFETY.md, API-CONTRACTS.md, DATA-MODEL.MD, architecture/architecture-decisions.md, and the newer FINAL/DECIDED docs/decisions/BD-05-AI-GOVERNANCE-POLICY.md together with BD-01 through BD-04.

docs/mobile/MOBILE-MIGRATION-PLAN.md has a separate Phase 6 “Testing/hardening.” This is a distinct mobile sequence, not authority to replace the explicitly backend Phase 6 scope.

No dedicated Phase 5B/6 backend acceptance document was found beyond the runtime contracts/tests and the canonical backend plan. Do not infer that passing the Patient slice has completed all AI prerequisites.

## 8. Phase 6 Work Completed

Scope/prerequisite discovery only. No Phase 6 implementation criterion is claimed complete.

Existing code inspected: AI read tools, gateway, provider completion port, draft workflow, domain read composition, clinical read services, and role ceilings. These are existing partial slices, not work completed by this task.

## 9. Remaining Phase 6 Work

1. Clear Phase 5B architecture blocker and pass full quality.
2. Map AI-001/AI-002/AI-003/RAG-001 prerequisites against current runtime evidence and BD-05; establish the concrete acceptance checklist before edits.
3. Compose approved read-only tools through existing authorized Patient/Clinical services, mandatory audit, and minimal projections; add real PostgreSQL isolation/relationship tests.
4. Implement bounded, approved provider/summary and tenant-authorized retrieval paths only with required configuration and provenance.
5. Implement exact-version human review, step-up/OCC/stale-draft behavior, rejection and controlled Clinical handoff using existing operation semantics and mandatory transactional audit.
6. Wire the approved HTTP contract, add real integration/security/safety evidence, then run full backend quality.

Current role ceilings do not classify AI grants, current Clinical mutation paths are gated, and the existing draft workflow does not establish the complete BD-05 human approval/handoff path. Reconcile those prerequisites explicitly; do not enable routes solely because partial library functions exist.

## 10. Current Blockers / Risks

The five exact findings:

1. libs/platform/audit/src/index.ts -> audit-contracts.
2. libs/platform/database/src/postgres-migration.integration.test.ts -> platform-context.
3. Same test -> ai-tools.
4. Same test -> audit-data-access.
5. Same test -> ai-data-access.

The approved graph permits platform-audit to depend only on platform-context/shared-util. It permits platform-database-port to depend only on platform-config/shared-util. Even the API composition-root row currently omits ai-data-access.

FOUND-003-quality-gate-report.md explicitly says audit ownership/policy remains “UNCERTAIN; no exception approved.” The app's development instructions prohibit changing architecture without its required approved decision. Prior FIX-004/FIX-012 approvals are narrowly scoped and do not approve these edges. Routine permission was not inferred from this historical report; the actual current dependency graph and protected architecture constraint were checked.

### Concrete proposal for Architecture Owner approval — NOT APPLIED

Keep the existing canonical AuditEvent/AuditEventInput ownership and every runtime/data contract unchanged:

1. Add exactly boundary:audit-contract to the boundary:platform-audit allowlist in backend/docs/architecture/NX-PROJECT-GRAPH.md. The present dependency is type-only.
2. Add exactly boundary:ai-data-access to boundary:app-api-composition-root in the same graph. This is a real expansion of composition authority and requires explicit approval.
3. Move the intact cross-domain migration/persistence integration test to backend/apps/api/src/postgres-migration.integration.test.ts. Rebase imports to ../../../libs/... and migration paths to ../../../database/migrations. Preserve all tests/assertions.
4. Update the child-runner path in backend/libs/platform/database/src/index.test.ts and the test location in backend/database/migrations/README.md.
5. Record the approved decision; run the moved integration suite, disposable opt-in regression, and full quality.

This is a narrow, reviewable proposal, not an assertion that the owner prefers these edges. An owner may instead require canonical audit contract relocation and a dedicated integration-test boundary. Do not duplicate audit contracts, disguise imports, exempt tests from checking, retag database infrastructure as an application, or relax all boundary rules to avoid the decision.

## 11. Exact Next Step

Obtain the Architecture Owner's decision on the exact proposal above, inspecting backend/docs/architecture/NX-PROJECT-GRAPH.md and backend/docs/audits/FOUND-003-quality-gate-report.md. Once approved, implement only the approved dependency/placement changes before starting Phase 6.

## 12. Exact Next Commands

PowerShell, for the existing isolated PostgreSQL 18 cluster:

```powershell
Set-Location 'C:\Users\LAPTOP\Viora-Mobile-App\backend'
$taskPgRoot = Join-Path $env:TEMP 'viora-backend-phase5b-6-pg18'
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D (Join-Path $taskPgRoot 'data') -l (Join-Path $taskPgRoot 'postgres.log') -o '-h 127.0.0.1 -p 55439' -w start
$env:DATABASE_URL = 'postgresql://postgres@127.0.0.1:55439/viora_mobile_test'
$env:VIORA_DISPOSABLE_DATABASE = '1'
node --experimental-strip-types --test --test-concurrency=1 apps/api/src/postgres-phase5b-commands.integration.test.ts
npm run boundaries
# After the approved boundary fix:
npm run quality
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D (Join-Path $taskPgRoot 'data') -m fast -w stop
```

Do not re-run initdb on the existing cluster. The current boundaries command is expected to fail until the approved fix is implemented.

## 13. Important Invariants Not To Break

- Keep the audit session FK, mandatory audit, immutable evidence, transaction rollback, session/identity binding, tenant isolation and current authorization.
- Preserve durable admission, request fingerprints, replay authorization, operation-resource references, expiry/close rules, and pending recovery for ambiguous COMMIT.
- Preserve atomic version checks and exact reviewed-output binding; AI never becomes a human approver.
- Never silently approve architecture, AI policy, API or data-model changes.
- No commits, push, broad Git cleanup, or unrelated Android changes.

## 14. Working Tree Notes

Branch remains chore/android-baseline-stabilization. backend/ was already untracked as a whole. Numerous pre-existing Android/Gradle/docs changes and other untracked files remain untouched. No branch, commit, staging, push or PR was created. No source file besides the Phase 5B integration test was modified. Generated build outputs may have refreshed under backend/dist.
