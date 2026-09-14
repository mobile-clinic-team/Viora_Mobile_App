# Clinical entry and read contracts

Member C — Clinical Entry & Read Foundation. This implements only CL02 (encounter), CL06 (patient encounter history) and CL14 (current record). DOMAIN-MODEL and API-SPEC remain authoritative. No clinical command, review, finalization, amendment, AI generation or AI handoff is implemented.

## Public boundary

- `ClinicalReadRepository` exposes `encounter(id)`, `encounters(PatientReference, PageRequest)` and `record(id)`, returning platform `ApiResult` and clinical domain models. It contains no mutation method or storage/network client.
- `ClinicalContent` owns exactly diagnosis, symptoms, clinicalNotes and treatmentPlan, each limited to 16000 Unicode code points. Empty strings remain valid draft content. It is available for future D-owned domain work without importing clinical data/UI classes.
- `Encounter`, `ClinicalRecord` and `RecordVersion` retain server-provided IDs, actor references, timestamps, access, state and nullable links. `currentVersion` and `reviewedVersion` are decimal counters, not editable ETags. The current version must match its parent record and currentVersion counter. Unknown statuses/kinds are retained for read-only display with Unsupported status; they confer no action authority.
- `ClinicalRecordReference` is an in-memory reference for future review/concurrency/handoff work. It contains workspace/patient/encounter/record/version IDs, exact strong versionToken and content counter. Never place it in route arguments or persistent state. Consumers must re-read before any future effect.
- `ClinicalReader` composes those reads with B's `PatientDirectory`, `PatientReference`, `AppointmentLookup` and `AppointmentReference`. It verifies current patient/workspace and both directions of linked encounter/appointment and encounter/record relationships before publishing a screen context. A missing nullable link is empty; a failed resource read is not empty.

These are read/reference seams, not an implementation or authorization of AI08. D must later use the approved server-mediated dual-version/assurance/handoff-evidence workflow. No direct record-write shortcut, AI provider access or speculative mutation interface is supplied.

## Navigation and entry

`ClinicalNavigationAdapter` implements B's `EncounterNavigation`. Create(patient, optional appointmentId) maps to `ClinicalEntryRoute(patientId, appointmentId)` after session/workspace/grant checks. Here Create is an entry intent only: it does not execute CL01. Patient entry re-reads the patient and shows a bounded CL06 encounter history page. Appointment entry re-reads AP03 and follows its encounterId if present; otherwise shows an explicit no-encounter state.

Existing(encounterId) maps to `ClinicalEncounterRoute(id)`. That screen re-reads the encounter and authorized patient/optional appointment, then offers `ClinicalRecordRoute(id)` only for an existing recordId and current record.read permission. A null recordId shows no-record state with no automatic CL07. All routes contain IDs only. Malformed/empty IDs fail before resource I/O. There is no new tab or external deep link.

`ClinicalNavigationContribution` registers the routes through A's `NavigationBindings`/`NavigationRegistry`. AppGraph's necessary constructor wiring selects the environment repository, constructs the reader/screens and supplies the adapter to B's existing clinical navigation parameter. AppNavHost and core platform internals remain unchanged. The old platform placeholder remains a safe unused fallback.

## Repository and state behavior

The HTTP factory `clinicalReadRepository` receives `SessionPort` and `AuthenticatedRequestPort`. Every request uses workspace GET scope, explicit captured workspace ID and no body, mutation key or private HTTP client. Mutable reads enforce exact header/body strong ETag equality. DTO decoding rejects missing required nullable keys, invalid IDs/timestamps/counters, overlong content, duplicate grants, invalid pagination and mismatched workspace/resource/version relationships. Unknown additional fields are ignored. Cancellation propagates; stale auth/context epochs discard results.

Destination ViewModels retain only memory state. `ClinicalState` distinguishes Initial, Loading, Loaded, Empty, PermissionDenied, NotFound, Error, RetriableFailure and Stale. Empty retains validated parent context, never a failed payload. Retry is explicit and uses the current read; a changed context clears hidden state and removes the old retry action. Superseded responses cannot replace newer ones. A conflict discards displayed content and offers refresh, without merging or generating a new version.

Record content is read-only plain text with scrolling. No clipboard, selection container, logging, analytics, saved-state serialization or offline cache is added. Existing platform session/privacy cover and secure-window behavior apply. Exception bodies and server messages are never displayed or logged. Sensitive DTO/domain/context/state string representations are redacted.

## Synthetic environment

`SyntheticClinicalReadRepository` exists only in devDebug, uses the same session snapshots/grants and rejects stale results. Its fixed fictional data includes a Willow linked IN_PROGRESS encounter with an existing DRAFT record at content version 7, a standalone OPEN encounter without a record, and isolated Harbor references. Fixed dates, IDs and version tokens are fixtures, not client-generated production versions. Failure and suspend hooks exist only in the synthetic service for deterministic tests.

The explicit `clinical-read-demo-policy-2` extends Willow's fixture context with record.read. Harbor still has no encounter/record read grant, and its data cannot be retrieved through Willow. No mutation grant/policy is added. One additional IN_PROGRESS appointment is seeded in the existing devDebug composition to represent the same linked encounter; B's private operational implementation is unchanged. Synthetic operational and clinical services remain read-consistent for that fixed link; coupled lifecycle effects remain unavailable.

Staging/prod select the HTTP read adapter through environment-specific bindings, but A's existing live build guard, unavailable identity gateways and disabled graph transport remain in force. No live endpoint or credential is configured.

## Unresolved gates and next stage

BD-01 still owns production grants and relationships. BD-04 owns clinical eligibility, completeness, review/sign-off, terminal encounter behavior and amendment policy; nothing in a read fixture closes it. BD-06 owns real environment/OIDC/signing. BD-05 applies to future AI and retention. Backend read authorization and durable sensitive-read audit (including AUDIT_UNAVAILABLE) still require deployed evidence.

CL01/03–05/07–13/15, full version-history screens, operational recovery, clinical mutations, step-up and AI remain outside this batch. B's patient-detail history placeholder is unchanged because C does not edit B's private UI; real history is reachable via the existing Open encounter entry action. Final test evidence and exact changed-file inventory are in [CLINICAL-FOUNDATION-REPORT.md](CLINICAL-FOUNDATION-REPORT.md).
