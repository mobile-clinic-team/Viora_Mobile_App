# Product scope

## In scope for final course submission

The final course demonstration should be a small, coherent clinic-team workflow using synthetic data:

1. Role-aware demo sign-in and explicit workspace selection.
2. Patient search and minimized patient detail.
3. Doctor directory and schedule/appointment workflow with visible loading, empty, denied, conflict, and uncertain-outcome states.
4. Clinical context and read-only record demonstration with explicit unavailable states for unsupported mutations.
5. Deterministic assistant conversation and draft review demonstration with provenance, human review, and safe failure messaging.
6. Logout, privacy timeout, scope invalidation, and no-cross-workspace behavior.
7. A traceable requirements report supported by a genuine user survey.
8. If backend work is authorized later, one narrow server-backed vertical slice through Android, HTTPS API, database, authorization, and audit.

The submission must use synthetic accounts and fictional records only. A single reliable vertical demonstration has higher value than a broad unfinished hospital system.

## Out of scope

- Full hospital information system.
- Billing, inventory, laboratory, prescribing, pharmacy, insurance, or claims.
- Patient self-registration, self-booking, or patient portal as part of the staff MVP.
- Staff onboarding, role administration, clinic settings, or enterprise administration UI.
- Offline clinical writes or a local clinical database.
- Autonomous diagnosis, autonomous treatment recommendations, or automatic record finalization.
- Direct Android access to PostgreSQL or an AI provider.
- Real patient data, PHI, production clinical pilot, or regulatory compliance claims.

## Future work

- Production OIDC and verified session broker.
- PostgreSQL schema, migrations, authorization, transactions, audit, retention, backup, and recovery.
- Complete patient, appointment, encounter, and clinical record mutations.
- Backend-mediated AI provider gateway, safety evaluation, provenance, retention, and atomic handoff.
- Hosted CI, device/accessibility matrix, signed release, deployment, monitoring, and rollback.
- Reconciled patient/admin shell only if product ownership approves those personas and scope.

## MoSCoW priorities

### MUST

- Synthetic sign-in/workspace flow: FR-001–FR-004.
- Patient lookup/detail and doctor/schedule access: FR-005–FR-008.
- Demonstrable appointment flow and safe state handling: FR-009–FR-011, FR-018–FR-019.
- Clinical read boundary and assistant/draft safety demonstration: FR-012, FR-014–FR-017.
- Privacy/logout and requirements/survey evidence: FR-020 plus the BA evidence checklist.

### SHOULD

- One real non-PHI backend vertical slice with server authorization and audit.
- Hosted CI and connected-device/accessibility evidence.
- Conflict and lost-response demo using the existing operation model.

### COULD

- Additional role-specific dashboard shortcuts, reminders, and polished reporting.
- Approved patient-facing flow after explicit scope reconciliation.

### WON'T FOR THIS RELEASE

- Full hospital modules, offline writes, autonomous clinical decisions, production AI without approved policy, and unbounded administration.

