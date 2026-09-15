# User journeys

The journeys below separate current synthetic demonstrations from planned production behavior. Survey validation is pending real evidence.

## J-01 Authentication and workspace selection

- **Trigger:** User opens the app.
- **Actor:** Clinic staff member.
- **Preconditions:** Dev demo account for the current synthetic flow, or future approved identity configuration for production.
- **Main flow:** Restore neutral session → sign in → receive memberships → choose role if required → choose a workspace → validate current context → open dashboard.
- **Alternative/error flow:** Invalid demo details, unavailable identity service, expired session, zero memberships, denied workspace, or stale context keeps the user in a signed-out, role-selection, workspace-selection, or unavailable state.
- **Expected outcome:** A ready session has one validated user, membership, role, workspace, permissions, and context epoch. No protected screen opens without it.
- **Evidence:** `SessionCoordinatorTest`, `AuthContractTest`, `PrivacyControllerTest`; production identity is planned.

## J-02 Patient access

- **Trigger:** Staff needs to locate a patient.
- **Actor:** Receptionist, doctor, nurse, or another role with effective patient-read access.
- **Preconditions:** Ready session and current workspace; query meets the screen’s minimum length.
- **Main flow:** Open Patients → enter a bounded search → wait for debounce → inspect paged, minimized results → select a patient ID → load detail.
- **Alternative/error flow:** Empty results, denied access, hidden cross-workspace resource, malformed page, network failure, or context change shows a distinct state and prevents unsafe navigation.
- **Expected outcome:** The user sees only the authorized projection and can continue to permitted appointment or clinical context flows.
- **Evidence:** Synthetic patient repository/UI and `PatientDirectoryTest`; production API is planned.

## J-03 Appointment workflow

- **Trigger:** Staff needs to schedule or manage a visit.
- **Actor:** Receptionist, doctor, or authorized operational staff.
- **Preconditions:** Ready workspace; authorized patient, doctor, location, interval, and appointment grant; scheduling policy resolved in production.
- **Main flow:** Open Schedule → inspect agenda/doctor information → choose patient/doctor/location/time → review → submit one operation → display the server receipt → refresh the appointment.
- **Alternative/error flow:** Empty schedule, unavailable policy, field validation, 409 schedule conflict, 412 stale version, permission denial, timeout, or unknown outcome provides a bounded recovery action without duplicate submission.
- **Expected outcome:** Synthetic mode shows a deterministic appointment result; production must return server-authoritative state and receipt.
- **Evidence:** `OperationalHttpTest`, `OperationalStateTest`, `AppointmentLifecycleTest`, `SchedulingTest`; live API is planned.

## J-04 Encounter and clinical record access

- **Trigger:** Authorized clinical staff needs patient context or a record.
- **Actor:** Doctor, nurse, or another explicitly authorized clinical actor.
- **Preconditions:** Current patient/encounter identifiers, same workspace, effective clinical grant, and relationship checks.
- **Main flow:** Open patient context → inspect encounter history → open an existing encounter → open its read-only clinical record → refresh when needed.
- **Alternative/error flow:** Missing context, denied grant, hidden resource, stale workspace response, unsupported state, or network failure blocks content or offers safe retry.
- **Expected outcome:** The current app demonstrates synthetic clinical reads. Encounter changes and record creation remain unavailable in the current UI.
- **Evidence:** `ClinicalRepositoryTest`, `ClinicalContextTest`, `ClinicalStateTest`; clinical mutations are planned.

## J-05 Assistant conversation

- **Trigger:** Authorized user wants bounded workflow assistance.
- **Actor:** Clinician or another role with explicit assistant permission.
- **Preconditions:** Ready session, authorized immutable GENERAL/PATIENT/ENCOUNTER context, and resolved AI policy in production.
- **Main flow:** Choose context → confirm → create conversation → ask a bounded question → read advisory response and provenance.
- **Alternative/error flow:** Invalid context, expired content, denied grant, unavailable policy, unsafe/failed output, timeout, or workspace change stops the request and preserves manual navigation.
- **Expected outcome:** Synthetic mode returns deterministic advisory content. No provider is contacted by the current app.
- **Evidence:** `AssistantContractTest`, `AssistantStateTest`, `SyntheticAssistantBackend`; real AI is planned.

## J-06 AI draft review and handoff

- **Trigger:** Authorized clinician wants assistance with an existing draft record.
- **Actor:** Doctor or future explicitly authorized reviewer.
- **Preconditions:** Existing DRAFT target, current target version, provenance, draft permission, review permission, and fresh assurance for approval.
- **Main flow:** Generate synthetic draft → inspect provenance → start human review → optionally edit → request step-up → confirm → approve/handoff → verify receipt and resulting record version.
- **Alternative/error flow:** Stale target, missing draft, expired draft, denied assurance, malformed receipt, lost response, or policy block prevents approval and requires re-review or outcome recovery.
- **Expected outcome:** Synthetic handoff evidence is displayed. Production must atomically enforce and audit the handoff server-side.
- **Evidence:** `AssuranceHandoffBoundaryTest`, `AssistantStateTest`, `HttpClinicalHandoff`; production integration is planned.

## J-07 Privacy, logout, and scope change

- **Trigger:** App backgrounds, user changes workspace, or user logs out.
- **Actor:** Any signed-in user or the operating system lifecycle.
- **Preconditions:** A session may contain sensitive in-memory state or an unresolved operation.
- **Main flow:** Background timeout covers sensitive UI; voluntary workspace change confirms unsaved work; logout revokes/clears session and receipt state; next entry returns to neutral selection.
- **Alternative/error flow:** Forced expiry clears immediately; unresolved operation is not replayed automatically; stale late results are discarded.
- **Expected outcome:** No old workspace or protected back stack is reused after scope invalidation.
- **Evidence:** `PrivacyControllerTest`, `SessionCoordinatorTest`, `OperationCoordinatorTest`.
