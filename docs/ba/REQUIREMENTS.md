# Functional requirements

Status describes the current repository, not a promise of production capability.

| ID | Name | Description | Actor | Priority | Acceptance criteria | Status |
|---|---|---|---|---|---|---|
| FR-001 | Neutral startup | Start in a neutral restoring/signed-out state without opening protected content. | All users | MUST | Process start shows no protected data until session/context is validated. | IMPLEMENTED |
| FR-002 | Synthetic demo sign-in | Allow approved dev-only demo accounts to enter the synthetic environment. | Demo staff | MUST | Valid demo credentials enter session flow; invalid credentials remain signed out; no production variant uses the fake gateway. | IMPLEMENTED |
| FR-003 | Production identity | Authenticate through an approved browser/OIDC/API service. | Staff | MUST | Provider callback, token exchange, refresh, revoke, and failure states are verified against a non-PHI service. | NOT STARTED |
| FR-004 | Role/workspace selection | Show only the user’s active memberships and validate the selected role/workspace before protected navigation. | Staff | MUST | Missing, stale, denied, or cross-workspace context cannot enter READY; selection changes invalidate old work. | PARTIAL |
| FR-005 | Patient search | Search authorized patient projections with bounded query and paging. | Receptionist, doctor, nurse, authorized staff | MUST | Search is debounced, encoded, scoped, paged, and distinct from empty/error/denied states. | PARTIAL |
| FR-006 | Patient detail | Display only fields authorized for the current workspace and role. | Authorized staff | MUST | Omitted, null, and date-only fields remain distinct; cross-workspace content is not shown. | PARTIAL |
| FR-007 | Patient demographic mutation | Create or edit patient demographics using approved field masks and current version. | Authorized staff | SHOULD | Policy, validation, ETag/OCC, receipt, and recovery behavior are server verified. | PLANNED |
| FR-008 | Doctor and schedule information | Find permitted doctors, locations, shifts, and availability. | Scheduling staff | MUST | Results are scoped, bounded, and clearly empty/unavailable when no data exists. | PARTIAL |
| FR-009 | Appointment agenda/detail | Read appointments and show current state and workspace time zone. | Scheduling staff | MUST | Authorized reads show server state; unknown status does not enable actions. | PARTIAL |
| FR-010 | Appointment creation | Create an appointment from authorized patient, doctor, location, and interval inputs. | Receptionist, doctor, authorized staff | MUST | Exact allowlist, policy, relationship, conflict, idempotency, and receipt behavior are verified. | PARTIAL |
| FR-011 | Appointment lifecycle | Reschedule, confirm, cancel, check in, start, complete, or no-show only through allowed transitions. | Authorized staff | MUST | Invalid state, stale version, permission, conflict, and unknown outcome are handled without duplicate commands. | PARTIAL |
| FR-012 | Clinical context reads | Open authorized encounter history and existing clinical records. | Doctor, nurse, authorized clinical actor | MUST | Current workspace, permission, relationship, ID, and epoch are checked before content display. | PARTIAL |
| FR-013 | Clinical record mutation | Create, edit, review, finalize, reopen, or amend records under clinical policy. | Authorized clinical actor | SHOULD | Server policy, immutable versions, OCC, assurance, audit, and recovery are verified. | NOT STARTED |
| FR-014 | Assistant conversation | Create an immutable, authorized assistant context and exchange bounded advisory messages. | Authorized assistant user | MUST | Context, workspace, owner, permission, expiry, output limits, provenance, and safe failures are enforced. | PARTIAL |
| FR-015 | AI draft lifecycle | Generate, inspect, review, edit, reject, and recover a draft for an existing DRAFT target. | Authorized clinician | MUST | Draft target/version/provenance remain bound; manual workflow remains available on failure. | PARTIAL |
| FR-016 | Assured clinical handoff | Require fresh human assurance and verify an atomic AI handoff into an existing DRAFT record. | Authorized approving clinician | SHOULD | Exact target tokens, assurance, receipt, record version, and audit evidence are verified server-side. | PARTIAL |
| FR-017 | Authorization safety | Use effective role, grant, workspace, relationship, state, and policy checks for protected actions. | System/server | MUST | Unknown permissions deny; UI cannot create authority; denied actions dispatch no protected request. | PARTIAL |
| FR-018 | Explicit UI states | Distinguish loading, empty, failure, unavailable, denied, stale, and uncertain outcome. | All users | MUST | Each state has a truthful message and appropriate retry/review action. | IMPLEMENTED |
| FR-019 | Operation recovery | Persist safe receipt metadata and reconcile uncertain operations without replaying a command body. | Signed-in staff | MUST | Timeout becomes unknown; outcome check/close follows operation contract; duplicate submission is prevented. | PARTIAL |
| FR-020 | Privacy and logout | Cover sensitive UI on background, invalidate scope on change, and clear protected state on logout. | All signed-in users | MUST | Timeout, logout, expiry, and workspace change cannot restore old protected back stack or data. | IMPLEMENTED |

## Requirement status caveat

`PARTIAL` commonly means the client and synthetic fixture exist while production server enforcement or deployed integration is missing. It must not be reported as a completed production feature.

