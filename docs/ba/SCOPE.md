# Product scope

## Current implementation baseline

The repository currently contains a synthetic/local Android foundation. `FakeBackend`, synthetic fixtures, and `SyntheticAssistantBackend` support development and testing. They do not provide persistent storage, production authentication, a deployed API, or real AI integration.

## Target final-course MVP

The final submission should be a small, coherent clinic-team workflow that extends the current Android app with a minimal real service path:

1. Role-aware demo sign-in and explicit workspace selection.
2. Real authenticated API access with server-side workspace and role authorization.
3. Persistent database storage and real CRUD for the selected grading-relevant resources: patients, appointments, and the clinical record path.
4. Doctor directory and schedule/appointment workflow with visible loading, empty, denied, conflict, and uncertain-outcome states.
5. Clinical context and record workflow at the level needed for the selected demonstration.
6. One valuable real AI-assisted workflow through a backend-mediated provider, with documented prompt/model behavior, evaluation, limitations, provenance, and human review before draft acceptance.
7. Logout, privacy timeout, scope invalidation, and no-cross-workspace behavior enforced across the live path.
8. Automated tests, staging/deployment evidence where feasible, and a traceable requirements report supported by a genuine user survey.

The submission must use synthetic accounts and fictional records only. A single reliable end-to-end vertical demonstration has higher value than a broad unfinished hospital system. The current synthetic path remains useful for previews and tests while the real path is built.

## Out of scope

- Full hospital information system.
- Billing, inventory, laboratory, prescribing, pharmacy, insurance, or claims.
- Patient self-registration, self-booking, or patient portal as part of the staff MVP.
- Staff onboarding, role administration, clinic settings, or enterprise administration UI.
- Offline clinical writes or a local clinical database.
- Autonomous diagnosis, autonomous treatment recommendations, or automatic record finalization.
- Direct Android access to PostgreSQL or an AI provider.
- Real patient data, PHI, production clinical pilot, or regulatory compliance claims.

## Future post-course work

- Production OIDC and verified session broker.
- Complete hospital information system modules, including billing, insurance, laboratory, pharmacy, prescribing, and claims.
- Patient self-service if it is not required by the final course demonstration.
- Complex offline synchronization and production multi-region/high-availability architecture.
- Reconciled patient/admin shell expansion only if product ownership approves those personas and scope.

## MoSCoW priorities

### MUST

- Current Android foundation and synthetic fallback: FR-001 to FR-002.
- Real authentication and server-enforced workspace/role authorization: FR-003 to FR-004, FR-017.
- Persistent patient, doctor/schedule, appointment, and clinical workflows with real CRUD in the selected vertical slice: FR-005 to FR-013.
- Demonstrable live workflow and safe state handling: FR-009 to FR-011, FR-018 to FR-019.
- Real AI integration with bounded context, evaluation, human review, and safe handoff: FR-014 to FR-016.
- Privacy/logout and requirements/survey evidence: FR-020 plus the BA evidence checklist.

### SHOULD

- Staging deployment and connected-device/accessibility evidence.
- Additional audit, conflict, and recovery evidence beyond the minimum demonstration.

### COULD

- Additional role-specific dashboard shortcuts, reminders, and polished reporting.
- Approved patient-facing flow after explicit scope reconciliation.

### WON'T FOR THIS RELEASE

- Full hospital modules, billing/insurance, offline writes, autonomous clinical decisions, patient self-service if unnecessary, and unbounded administration.
