# BD-01 implementation — Pass 2

Date: 2026-09-21. Pass 1 remains accepted; its report is historical.
Authority: repository-root `docs/decisions/BD-01-AUTHORIZATION-POLICY.md`.
**Full BD-01 is not complete.** PostgreSQL execution was not verified locally.

## 1. Implementation plan and outcome

Inspected migrations 003/007/010/013, the migration runner, Patient authorization
and projection, clinical read ports/repositories, HTTP gates, audit persistence,
and the disposable-database test convention. Reused existing Patient domain and
data-access boundaries; no new project, module boundary exception, or external
dependency was introduced.

Added durable workspace-scoped care state and transactional audit primitives;
wired fresh persistence checks into Patient reads and the existing clinical read
composition; preserved HTTP projection and audit behavior; added focused and real
PostgreSQL integration tests; ran the requested verification.

## 2. Schema and migration

Forward-only migration `019_patient_care_access.sql` adds `patient_care_access`.
The previous migrations are unchanged. Composite foreign keys bind the Patient,
recipient membership, creator membership, and revoker membership to one workspace.
The table retains UUID, kind, creation timestamp/actor, and revocation timestamp/actor.
A partial unique index permits one active instance per workspace/member/Patient/kind.
A review index supports historical retrieval. Triggers reject hard deletion,
truncation, changing identity/history, and reactivating revoked rows.

## 3. Files changed

All paths below are relative to `backend/`. The backend was already untracked;
ordinary git diff cannot represent this task's changes independently of Pass 1.

- `database/migrations/019_patient_care_access.sql` — new schema and history protection.
- `database/migrations/README.md` — chain and focused disposable verification instructions.
- `libs/patient/domain/src/care-access.ts` — internal scope and reader port.
- `libs/patient/data-access/src/postgres-care-access-repository.ts` — active lookup, history, transactional create/revoke and audit.
- `libs/patient/application/src/index.ts` — await persisted authorization; check each list row.
- `libs/patient/application/src/patient-directory.ts` — await resource authorization before pagination disclosure.
- `libs/clinical/application/src/reads.ts` — await persisted checks; reject mismatched or absent canonical list linkage.
- `apps/api/src/patient-authorization.ts` — Doctor relationship policy; preserved Admin/Nurse demographics.
- `apps/api/src/patient-composition.ts` — inject care-state reader.
- `apps/api/src/patient-read.ts` — await authorization and retain allowlist projection/audit.
- `apps/api/src/domain-read-composition.ts` — instantiate repository; enforce Doctor/Nurse clinical role/grant/link conjunction.
- `apps/api/src/main.ts` — supply shared repository to Patient HTTP runtime.
- `apps/api/src/care-access.test.ts` — focused policy/composition tests.
- `apps/api/src/http-server.test.ts` — Doctor HTTP relationship, claims, projection, revocation and audit tests.
- `apps/api/src/postgres-care-access.integration.test.ts` — new real database coverage.
- `docs/api/openapi.json` — accurately describe Doctor Patient-read authorization; no new public shape or permission.
- `docs/DATA-MODEL.MD` — implementation supplement for approved durable semantics.
- `docs/BD-01-PASS-2-IMPLEMENTATION-REPORT.md` — this report.

No Android changes, git reset/restore/checkout/clean/stash/stage/commit/push, or
access to `C:\Users\LAPTOP\Viora` occurred in this pass. Unrelated existing changes
were preserved.

## 4. Exact semantics

Internal `DOCTOR_RELATIONSHIP` and `NURSE_ASSIGNMENT` kinds distinguish the two
durable authorities. ACTIVE is derived from null revocation timestamp and actor;
REVOKED has both populated. These are not new public permissions/statuses.
No TTL, age cutoff, automatic stale revocation, participation inference, or
Appointment/Encounter transition creates access. There are no runtime callers
of the internal create/revoke primitives and no public management endpoints.
Future callers must establish approved management authority before invoking them.

Creation and first revocation insert metadata-only audit evidence in the same
database transaction. Failed audit rolls back the state change. Repeated revocation
does not rewrite history. Re-creation uses a new UUID. Audit events are evidence,
never an authorization source. History is queryable by exact workspace/member/
Patient/kind for future review; no review workflow is invented.

Every active lookup binds workspace, membership, Patient, kind, and authenticated
user, and joins active persisted membership and same-workspace Patient. Explicit
grants and applicable role ceilings remain required separately. No cross-request
cache delays revocation. Permission revision/session/workspace preflight is unchanged.

## 5. Newly enabled reads

- `GET /v1/patients/{id}`: Doctor demographic/contact projection now succeeds with
  explicit `patient.read` and an active persisted same-workspace relationship.
- `GET /v1/patients`: Doctor directory reads can succeed when every fetched row,
  including pagination lookahead, is authorized. This is conservatively all-or-nothing;
  it does not yet filter the directory SQL to the Doctor's related Patients. An
  unauthorized row denies the entire page, including its cursor.
- Admin and Nurse demographic reads remain allowed with the explicit grant;
  Nurse demographic access does not require an assignment.
- Existing **application read functions**, through `createDomainReadDependencies`,
  now permit `readEncounter`, `readPatientEncounters`, `readClinicalRecord`,
  `readClinicalVersion`, and `readClinicalHistory` with their canonical read grant,
  clinical role ceiling, and active Doctor relationship or Nurse assignment.
  Patient identity comes from persisted Encounter/Medical Record rows, not a
  request claim. These tests do not establish clinical HTTP availability.

## 6. Still fail closed

No clinical HTTP route was enabled. Existing HTTP gates remain for Encounter detail,
Patient encounter history, record detail/history/version, Doctor directory and
Appointment reads. The internal clinical persistence/read foundation now has
authorization, but clinical HTTP audit/projection dispatch is still unimplemented.
The current clinical wire/persistence mapping also has gaps (for example, Encounter
version metadata); raw repository rows and invented wire values were not exposed.
This is an implementation limitation, not a claim that BD-01 lacks clinical authority.

The application Patient-encounter list denies an empty page because that reader
has no independent Patient lookup with which to establish canonical linkage.
It also denies rows linked to a different Patient than the requested filter.

Receptionist Patient reads lack canonical workflow necessity. Temporary Nurse
clinical access and break-glass remain denied. All public management routes remain
absent. Patient/Appointment/Encounter/record mutations, finalization, and AI workflows
remain gated; BD-02/03/04/05 business workflows were not implemented.

Patient projection continues to omit legacy emergency-contact text, status,
clinical content, internal user linkage, and unclassified/future fields. Audit
failure still prevents Patient data disclosure.

## 7. Tests added

Focused tests cover absent/active/revoked Doctor relationship; live next-request
Patient HTTP decisions; wrong workspace; Nurse demographics without assignment;
absent/active/revoked clinical assignment for Encounter and record reads; exact
clinical grants and role ceilings; missing/mismatched canonical linkage; empty
Encounter list; query/header/body claims; projection; audit failure; and unknown
role/state representations.

The PostgreSQL test applies forward migrations without schema reset and rolls back
synthetic fixtures. It covers both kinds, active lookup, recipient/user/workspace
isolation, composite FK rejection, unknown kind rejection, duplicate active rows,
revocation/history retention, re-creation, immutable history, delete/truncate
rejection, inactive membership, audit records, and audit-failure rollback for both
creation and revocation. Savepoints isolate expected constraint failures.

## 8. Exact verification results

Working directory: `C:\Users\LAPTOP\Viora-Mobile-App\backend`.

```powershell
node --experimental-strip-types --test apps/api/src/care-access.test.ts apps/api/src/postgres-care-access.integration.test.ts apps/api/src/patient-authorization.test.ts apps/api/src/patient-composition.test.ts apps/api/src/patient-directory.test.ts apps/api/src/http-server.test.ts apps/api/src/domain-reads.test.ts
```

Final focused run: exit 0; **87 tests: 86 passed, 0 failed, 1 skipped**.
An earlier test run exposed an incorrectly encoded HTTP test body; that fixture
was corrected before the passing run.

| Command | Final result |
| --- | --- |
| `npm test` | Exit 0; 328 tests, 315 passed, 0 failed, 13 skipped |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0 |
| `npm run boundaries` | Exit 1; exactly 5 known baseline findings, no new findings |

## 9. PostgreSQL result

**Skipped: `DATABASE_URL` is absent.** No live PostgreSQL migration/repository
verification is claimed and no database was reset or accessed by this pass.

Against a separately provisioned disposable PostgreSQL database with the existing
extension prerequisites, supply these process-scoped settings and run:

```powershell
cd C:\Users\LAPTOP\Viora-Mobile-App\backend
$env:DATABASE_URL = '<connection string for the disposable test database>'
$env:VIORA_DISPOSABLE_DATABASE = '1'
node --experimental-strip-types --test apps/api/src/postgres-care-access.integration.test.ts
```

The focused test fails before connecting if the disposable opt-in is missing.
It runs the forward migration chain itself, without dropping any schema. The
existing broader migration suite has separate destructive disposable-schema tests;
never use an application database for either command.

## 10. Boundary baseline

Exactly these five existing findings remain:

1. `platform/audit/src/index.ts` → `audit-contracts`.
2. `postgres-migration.integration.test.ts` → `platform-context`.
3. `postgres-migration.integration.test.ts` → `ai-tools`.
4. `postgres-migration.integration.test.ts` → `audit-data-access`.
5. `postgres-migration.integration.test.ts` → `ai-data-access`.

## 11. Remaining blockers to full BD-01

Canonical access/relationship/assignment-management permissions and authorized
management services; automatic Doctor creation transitions from BD-03/04; temporary
Nurse workflow policy; break-glass authority, scope/lifetime and review workflow;
Receptionist workflow necessity and safe scheduling-content classification; complete
clinical HTTP projection/audit dispatch; human access-review workflow; structured
emergency-contact mapping; live PostgreSQL verification; and the existing broader
single-role persistence limitation. Doctor directory filtering remains an implementation
follow-up; the current all-or-nothing page policy is conservative and fail closed.
