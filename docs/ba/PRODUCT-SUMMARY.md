# Viora product summary

Audit date: 2026-09-16
Evidence boundary: branch `chore/android-baseline-stabilization`, evidence commits `4d6af89`, `ec12836`, and `c49dcf6`, with preserved dirty application work.

## Product purpose

Viora is an Android-first clinic-team workflow and support application. Its documented goal is to help authorized clinic staff work with patient information, doctor and scheduling information, appointments, clinical context, and human-reviewed AI assistance. The server is intended to remain authoritative for identity, authorization, clinical truth, audit, and durable operations.

Viora is a workflow/support tool. It does not claim to diagnose patients, replace clinical judgment, finalize records autonomously, or provide a production clinical service in the current repository.

## Currently implemented or evidenced locally

- Kotlin Android application using Jetpack Compose and Material 3.
- Session state, lifecycle epochs, workspace selection, logout, refresh, privacy timeout, and fail-closed authorization boundaries.
- Dev-only synthetic sign-in and two synthetic clinic workspaces through `FakeBackend`.
- Typed navigation with login/session, workspace, dashboard, Patients, Schedule, Assistant, Account, doctor directory, clinical entry, clinical record, outcome recovery, and draft routes.
- Synthetic patient search/detail, doctor directory, scheduling and appointment form/state flows.
- Synthetic clinical encounter and record reads. The current clinical UI states that encounter changes and record creation are unavailable.
- Deterministic synthetic assistant conversations and draft workflow with explicit human review, simulated assurance, provenance, and synthetic clinical handoff boundaries. No provider is contacted.
- Loading, empty, failure, permission-denied, unavailable, stale-scope, and uncertain-outcome states in the client foundation.
- HTTP client/repository interfaces and DTO mapping for future service integration. They do not constitute a deployed backend.
- JVM evidence: 139/139 tests pass. Lint has 0 errors. Dev debug assembly produces an APK with temporary local debug signing.

## Current worktree additions requiring owner review

The preserved dirty worktree contains a patient-facing shell, administrator shell, route authorization, UI components, and a Phase 1 smoke test. These are source-visible worktree behavior, but they are not yet a clean reviewed product decision. `PRODUCT-SPEC.md` explicitly excludes patient self-service from the smallest MVP and limits administration; those worktree additions must be reconciled before being called final scope.

## Planned or proposed

- Production OIDC/browser authentication, token exchange, refresh, revocation, and verified callback configuration.
- A backend API with server-side role, workspace, field, relationship, concurrency, idempotency, and audit enforcement.
- PostgreSQL schema, migrations, backup/recovery, and a deployed non-PHI test environment.
- A real backend-mediated AI provider gateway with bounded context, provenance, retention, safety evaluation, and human approval.
- Complete server-backed patient mutations, appointment policy, encounter mutations, clinical record lifecycle, and reliable operation recovery.
- Hosted CI, device/accessibility validation, release signing custody, deployment, monitoring, and rollback evidence.

## Not implemented or not established

- Production backend or database.
- Production authentication or OIDC integration.
- Real AI provider integration.
- Production server authorization, audit, retention, or clinical policy enforcement.
- A production release artifact or hosted CI result.
- Real patient/PHI data, clinician validation, survey responses, or clinic partnership evidence.
- Autonomous diagnosis or autonomous clinical decision-making.
