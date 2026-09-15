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
| FR-013 | Clinical record mutation | Create, edit, review, finalize, reopen, or amend records under clinical policy. | Authorized clinical actor | MUST | Server policy, immutable versions, OCC, assurance, audit, and recovery are verified for the selected clinical-record path. | NOT STARTED |
| FR-014 | Assistant conversation | Create an immutable, authorized assistant context and exchange bounded advisory messages. | Authorized assistant user | MUST | Context, workspace, owner, permission, expiry, output limits, provenance, and safe failures are enforced. | PARTIAL |
| FR-015 | AI draft lifecycle | Generate, inspect, review, edit, reject, and recover a draft for an existing DRAFT target. | Authorized clinician | MUST | Draft target/version/provenance remain bound; manual workflow remains available on failure. | PARTIAL |
| FR-016 | Assured clinical handoff | Require fresh human assurance and verify an atomic AI handoff into an existing DRAFT record. | Authorized approving clinician | MUST | Exact target tokens, assurance, receipt, record version, and audit evidence are verified server-side. | PARTIAL |
| FR-017 | Authorization safety | Use effective role, grant, workspace, relationship, state, and policy checks for protected actions. | System/server | MUST | Unknown permissions deny; UI cannot create authority; denied actions dispatch no protected request. | PARTIAL |
| FR-018 | Explicit UI states | Distinguish loading, empty, failure, unavailable, denied, stale, and uncertain outcome. | All users | MUST | Each state has a truthful message and appropriate retry/review action. | IMPLEMENTED |
| FR-019 | Operation recovery | Persist safe receipt metadata and reconcile uncertain operations without replaying a command body. | Signed-in staff | MUST | Timeout becomes unknown; outcome check/close follows operation contract; duplicate submission is prevented. | PARTIAL |
| FR-020 | Privacy and logout | Cover sensitive UI on background, invalidate scope on change, and clear protected state on logout. | All signed-in users | MUST | Timeout, logout, expiry, and workspace change cannot restore old protected back stack or data. | IMPLEMENTED |

## Final-course target mapping

The current repository is synthetic/local. The target final-course MVP requires the following planned production capabilities to be completed before submission:

- **Real service boundary:** FR-003, FR-004, and FR-017 require production authentication and server-enforced workspace/role authorization.
- **Persistent CRUD:** FR-005 through FR-013 cover the selected patient, doctor/schedule, appointment, encounter, and clinical-record path. At least one coherent resource path must demonstrate real create, read, update, and delete behavior through the API and database, subject to the documented clinical policy.
- **Real AI:** FR-014 through FR-016 require a valuable provider-backed use case, documented prompt/model design, evaluation, limitations, provenance, and human review before clinical draft handoff.
- **Operational evidence:** FR-018 through FR-020 require truthful error handling, recovery, privacy, and logout behavior on the live path, supported by tests and staging/deployment evidence where feasible.

These are target acceptance obligations, not current implementation claims. `PLANNED` and `NOT STARTED` remain incomplete; `PARTIAL` means that only the client contract, synthetic implementation, or test support is currently available.

## Requirement status caveat

`PARTIAL` commonly means the client and synthetic fixture exist while production server enforcement or deployed integration is missing. It must not be reported as a completed production feature.

## Survey evidence mapping

The survey supports the following existing requirements. Requirements without a direct survey question retain their product, security, or architecture basis and are not given invented survey support.

| Requirement | Survey support | Interpretation |
|---|---|---|
| FR-001, FR-002 | No direct survey question; baseline safety evidence | Current implementation and secure startup are architectural foundations. |
| FR-003 | Q11: login/authorization 23/61 (37.7%); Q18: authorization 60/61 (98.4%) rated 4 or 5 | Authentication is a prioritized first-version capability and authorization is a strong expectation. |
| FR-004 | Q18: 60/61 (98.4%) rated role/permission access 4 or 5 | Supports explicit workspace and role enforcement. |
| FR-005, FR-006 | Q7: patient lookup 16/61 (26.2%); Q11: patient search 28/61 (45.9%) and patient detail 23/61 (37.7%) | Supports patient search and authorized detail as core workflow capabilities. |
| FR-007 | Q7: reducing repetitive entry 7/61 (11.5%) | Provides limited support for future demographic mutation; it remains SHOULD/PLANNED. |
| FR-008 | Q4 schedule difficulty 31/61 (50.8%); Q11 doctor/schedule viewing 24/61 (39.3%) | Supports schedule information as a core MVP capability. |
| FR-009, FR-010, FR-011 | Q4 appointment/schedule difficulty 31/61 (50.8%); Q7 appointment management 16/61 (26.2%); Q11 appointment management 21/61 (34.4%) | Supports real appointment reads, CRUD, lifecycle, and conflict handling. |
| FR-012, FR-013 | Q7 authorized history access 7/61 (11.5%); Q11 clinical record viewing 26/61 (42.6%) | Supports the selected clinical record path; FR-013 is MUST for final-course CRUD scope. |
| FR-014, FR-015 | Q11 AI summarization/draft support 13/61 (21.3%); Q15 ratings 4 or 5 from 53/61 (86.9%) | Supports one focused real AI workflow after core access flows. |
| FR-016, FR-017 | Q17 insufficient context 28/61 (45.9%) and incorrect information 27/61 (44.3%); Q18 60/61 (98.4%) rated authorization 4 or 5 | Supports human review, safe handoff, and server-side authorization. |
| FR-018, FR-019 | Q14 retry mechanism preferred by 57/61 (93.4%) | Supports explicit retry, error, and uncertain-outcome behavior. |
| FR-020 | Q17 privacy concerns are visible; Q18 authorization 60/61 (98.4%) rated 4 or 5 | Supports privacy and scope-clearing behavior, without claiming security validation. |

Priority changes in this phase: FR-013 and FR-016 moved from SHOULD to MUST because the final-course scope requires a real clinical-record CRUD path and human-reviewed AI handoff. This is a transparent scope decision informed by the rubric and survey evidence.
