# BD-01 implementation slice — 2026-09-20

Authority: `../../docs/decisions/BD-01-AUTHORIZATION-POLICY.md`, FINAL / DECIDED. This implementation is partial, not production readiness or full BD-01 completion. No BD-02/03/04/05 policy was implemented. No git staging, commits, resets, stashes, checkout, or pushes were performed. Existing Android and unrelated dirty files were not edited.

## Inspection and former blocker inventory

- Identity resolves the authenticated session's user and one ACTIVE membership on each request. Membership has one role; the database enforces one membership per user/workspace. Permission revision is compared exactly before loading tenant/membership-scoped `membership_grants`.
- Previously `createPatientAuthorization` accepted a matching grant without a role ceiling. Patient HTTP search/detail were blanket BD-01 gates despite existing application/repository reads. There was no runtime Patient presenter.
- `domainRouteGates` also gates Doctor directory/detail/shifts, Appointment list/detail, Encounter detail/history, and ClinicalRecord/version reads on BD-01. Those reads remain unavailable: BD-01 does not define a complete Doctor-directory/Appointment permission matrix and clinical reads lack canonical durable relationship/assignment state. Mutations/availability retain their other decision gates.
- `createDomainReadDependencies` supplies `canRead = false` for appointment and clinical reads. This remains a deliberate denial because the necessary canonical authorization state is absent, not because BD-01 is undecided.
- No durable Doctor–Patient relationship or Nurse–Patient assignment persistence, management workflow, or review mechanism was found. Appointment/encounter associations are not durable authorization state.
- The canonical permission vocabulary has no access-management, relationship-management, assignment-management, or break-glass permission. None was invented.
- Existing audit contracts support actor/workspace/action/resource/result/request/correlation/time and scalar metadata, with an append-only PostgreSQL repository. Audit is not consulted as an authorization grant.
- Permission-revision validation exists. No revision-bump implementation was found or added.

## Implemented behavior

1. Effective HTTP grants are the intersection of explicit stored grants and classified role ceilings. Unknown roles, unknown permissions, case variants, wildcard grants, and out-of-ceiling grants confer no authority. Clinical read ceilings are limited to DOCTOR/NURSE; these do not themselves enable clinical routes. Unclassified operations are denied.
2. Ceiling evaluation unions supplied canonical roles without creating grants. Production identity still supplies its existing single canonical role; multi-role persistence/administration was not added or inferred from request input.
3. `GET /v1/patients` and `GET /v1/patients/{id}` support CLINIC_ADMIN/NURSE demographic reads with explicit `patient.read`, valid workspace/session/membership/revision, tenant-scoped lookup and resource checks. Doctor-only and Receptionist-only access remains denied for missing durable relationship / established minimum-necessary workflow purpose. A clinical role combined with Admin demographic authority does not yield clinical fields.
4. Server projection explicitly selects identifiers, name, MRN, version/access metadata, timestamps, DOB, sex, phone, email, and address. It omits clinical fields, internal user linkage, status, legacy emergency-contact text, and every unclassified/new field. No forbidden field is serialized as null or REDACTED. Projection rechecks resource authorization. The public envelope and detail ETag follow the existing wire contract.
5. Search retains required bounded query, tenant/revision/filter-bound encrypted cursor, and fixed sort. Every loaded row (including lookahead) is checked before returning a page/cursor. Foreign detail rows return RESOURCE_NOT_FOUND. Query role/purpose claims cannot authorize access.
6. Successful and denied Patient reads/searches emit metadata-only audit evidence through the existing append-only repository. Audit append must succeed before a Patient response is released; missing/failing audit returns AUDIT_UNAVAILABLE without data. No Patient names, search text, contact values, or clinical text are included in audit metadata.
7. Fresh canonical roles, membership status, grants and revision are used on each HTTP request. Tests demonstrate next-request grant removal, role changes, membership revocation, and revision mismatch without logout. This is not a claim of automatic revision bumping.

## Remaining fail-closed behavior and completion blockers

- Doctor normal Patient access and all clinical reads: no persisted durable Doctor relationship / Nurse assignment state. No booking/check-in, encounter participation, or audit event establishes such state.
- Manual relationship/assignment create/revoke, permission administration and target-role grant validation at a mutation boundary: no canonical management permission names or existing management APIs. No self-grant or self-assignment path was introduced.
- Durable relationship/assignment review and revocation behavior: not implemented without the above state/administration. No stale-review TTL or automatic revocation was invented.
- Break-glass: no concrete authority representation, lifetime, workflow, or review process. No exceptional authorization path was enabled; no synthetic authority/reason/status was invented.
- Temporary Nurse workflow access and automatic Doctor link creation remain closed; exact lifecycle transitions are outside this pass.
- Receptionist Patient access remains denied until backend workflow necessity can be established. Appointment reasons/notes remain undisclosed because Appointment HTTP reads remain gated. No safe/clinical reason classification was guessed.
- Emergency contact is legacy free text in persistence but a structured object in the public contract. It remains omitted rather than inventing a conversion. Patient status remains unclassified by this authorization slice and omitted.
- Doctor directory, Appointment, clinical and AI routes are not enabled. Comprehensive denied clinical/break-glass audit and authorization-state-change audit remain outstanding with those operations. Patient audit added here does not constitute those implementations.
- Multiple-role ceiling logic is tested, but canonical membership persistence remains single-role. No schema/API role representation change was made.
- PostgreSQL integration tests were skipped by the existing test configuration. Live PostgreSQL audit persistence and HTTP integration were not verified in this run.

## Schema and migrations

None. Existing membership, grants, Patient and audit persistence are reused. RequestContext gains optional internal canonical `roles`; this is not a client-supplied authority field or public membership schema change.

## Files changed in this task

All paths below are relative to `backend/`; the backend was already untracked in the dirty repository, so `git diff` does not describe this task's file changes.

- `apps/api/src/authorization-policy.ts` (new)
- `apps/api/src/authorization-policy.test.ts` (new)
- `apps/api/src/auth-composition.ts`
- `apps/api/src/auth-composition.test.ts`
- `apps/api/src/patient-authorization.ts`
- `apps/api/src/patient-authorization.test.ts`
- `apps/api/src/patient-composition.test.ts`
- `apps/api/src/patient-directory.test.ts`
- `apps/api/src/patient-read.ts` (new)
- `apps/api/src/http-server.ts`
- `apps/api/src/http-server.test.ts`
- `apps/api/src/main.ts`
- `apps/api/src/domain-read-composition.ts`
- `apps/api/src/domain-route-gates.ts`
- `apps/api/src/api-contract.test.ts`
- `libs/shared/src/request-context.ts`
- `libs/platform/context/src/index.ts`
- `libs/patient/application/src/index.ts`
- `libs/patient/application/src/patient-directory.ts`
- `docs/api/openapi.json`
- `docs/BD-01-IMPLEMENTATION-REPORT.md` (new)

## Tests and command results

Working directory: `C:\Users\LAPTOP\Viora-Mobile-App\backend`.

- Focused command: `node --experimental-strip-types --test apps/api/src/authorization-policy.test.ts apps/api/src/patient-authorization.test.ts apps/api/src/patient-composition.test.ts apps/api/src/patient-directory.test.ts apps/api/src/http-server.test.ts apps/api/src/auth-composition.test.ts` — exit 0; 86 passed, 0 failed, 0 skipped. Earlier focused execution identified the expected context-shape assertion needing canonical roles; it was corrected before this passing run.
- `npm test` — exit 0; 320 tests, 308 passed, 0 failed, 12 PostgreSQL integration tests skipped.
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0.
- `npm run boundaries` — exit 1; exactly 5 existing findings, no new findings:
  1. platform/audit index → audit-contracts.
  2. postgres-migration.integration → platform-context.
  3. postgres-migration.integration → ai-tools.
  4. postgres-migration.integration → audit-data-access.
  5. postgres-migration.integration → ai-data-access.

New tests cover role ceilings, explicit grants, unknown roles/permissions, multiple-role ceiling union, missing Doctor relationship, unresolved Receptionist purpose, HTTP field omission including injected future/clinical fields, metadata-only audit, audit failure, foreign workspace row denial, query validation, and next-request revocation. Existing composition/directory/context and OpenAPI assertions were updated for the implemented Patient read slice. No database, lifecycle or Android behavior is claimed verified by these tests.
