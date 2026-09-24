# Run 2 patient appointments: targeted audit

## Reusable implementation path

- Migration 007 already has nullable `patients.user_id` with a foreign key to `users.id`. Migration 013 adds tenant composite foreign keys for appointments, doctors, locations, and patients. Migration 009 protects a doctor's occupied interval with a PostgreSQL exclusion constraint.
- `PostgresPatientRepository` reads the existing patient aggregate. `PostgresAppointmentRepository` implements tenant-scoped reads and writes. `libs/appointment/application` contains create, list, availability, status transition, idempotency, and version checks.
- The live API uses `authenticateBearerRequestContext` for token/session/account validation. Staff routes pass through `authenticateWorkspaceRequestWithPermissions` and `domainRouteGates`. Patient commands use the transaction-backed operation store and transactional audit. A patient self route should use those mechanisms, derive its patient from the authenticated user, and use a safe projection.
- Android already has `AuthenticatedRequestPort`, `HttpAppointmentRepository`, `AppointmentRepository`, and an operation receipt flow for staff. `PatientAppShell.kt` restricts the Patient shell to the Patient persona. Staging and production use live HTTP bindings; devDebug can use synthetic bindings.

## Gaps that prevent safe booking today

1. At audit time there was no uniqueness constraint on `patients.user_id` within a tenant, no `findByUserId` repository method, and no self Patient resolver. Staff Patient creation sets `userId` to null. Password registration creates a user but no Patient profile or link. Migration 025 now enforces the existing tenant/user link's uniqueness; the resolver and provisioning path remain open.
2. The persona resolver currently returns Patient for an active user with no active staff memberships, even if that user has no Patient profile. The Run 2 decision now permits a single authenticated user to have Patient links in multiple clinics. The self appointment resolver reads those links directly from PostgreSQL; it does not require a staff membership or a client-selected tenant.
3. `/v1/appointments` GET and POST are route-gated. The HTTP server returns `FEATURE_UNAVAILABLE`; `createDomainReadDependencies` sets appointment `canRead` to false. The appointment application functions are not wired as live appointment HTTP commands. Existing staff appointment behavior is therefore gated at the backend, despite the Android staff adapter and domain code.
4. The old appointment application create function uses a separate idempotency store, while live Patient commands use durable operation receipts and transactional audit. A self create route must use the live operation transaction infrastructure and adapt operation recovery authorization for Appointment results.
5. BD-03 requires canonical service duration and PENDING capacity semantics. Those values are absent from the inspected schema and runtime. The Run 2 product decision approves a self-booking route as an MVP extension, but explicitly keeps its commit blocked pending BD-03 scheduling policy completion. The live POST route validates input and returns `503 FEATURE_UNAVAILABLE` with `BD-03`; it performs no appointment mutation.
6. The current Android Patient appointments screen is a placeholder. It shows a dev-only demo card and says booking is coming later. It has no Patient appointment repository or create state flow.

## Proposed safe implementation once policy is resolved

`/v1/me/appointments` is the canonical self route. Migration 025 adds the unique `(tenant_id, user_id)` index for non-null links and fails if existing links conflict. The resolver derives all active Patient links from authenticated `userId`, rejects missing and ambiguous links, and propagates database failures. GET uses the existing encrypted cursor codec, keyset ordering, safe projection, and mandatory audit sink; Android uses the authenticated self request port. Staff routes retain their existing gates. POST validates only patient-editable intent and remains fail closed until service duration, capacity, and scheduling policy are approved; its eventual commit path must reuse the existing operation, audit, OCC, and conflict infrastructure.

Patient booking remains fail closed pending the approved scheduling policy. The Android create action is visibly disabled.

## Test count reconciliation

The accepted Run 1 figure of 452/452 is retained user-provided evidence, not a fresh log in this workspace. The previous `npm test` without `DATABASE_URL` discovered 409 tests: 388 passed and 21 PostgreSQL top-level tests skipped. The same command is used; test discovery has not been intentionally narrowed. PostgreSQL integration tests create 43 additional `t.test` child cases only when their top-level database test executes (41 static child calls plus two additional iterations of looped child tests). Thus 409 + 43 = 452 under the previous source state, explaining the baseline difference without deleting or ignoring suites. The current Run 2 `npm run quality` discovered 414 tests: 392 passed, 0 failed, and 22 PostgreSQL tests skipped. The increase of five discovered tests is four non-PostgreSQL tests and one new PostgreSQL integration test. The full PostgreSQL-enabled Run 2 count is unverified until that database run executes.
