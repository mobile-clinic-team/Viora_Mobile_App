# Operational feature contracts

This document records the public operational interfaces delivered by Member B. Domain fields and API behavior remain owned by [DOMAIN-MODEL.md](DOMAIN-MODEL.md) and [API-SPEC.md](API-SPEC.md). Product decisions BD-01, BD-02 and BD-03 remain gates; fixture behavior is synthetic evidence only.

## Platform boundary

Patient, doctor and appointment implementations receive `SessionPort` and `AuthenticatedRequestPort` through their constructors. They do not access `SecureStore`, `ApiClient`, `SessionCoordinator`, databases or Android `Context`. Reads use `RequestScope.WORKSPACE` after a validated workspace snapshot. Mutations carry an `OperationReceipt`, strong `If-Match` where required, and operation metadata through `AuthenticatedRequestPort`.

Read repositories return `ApiResult` and preserve `StaleScope`, `Failure` and `OutcomeUnknown`. UI maps these to Loading, Content, Empty, PermissionDenied, Unavailable and Failure states. A transport failure never becomes Empty. A stale context clears the destination state and requires a fresh read.

## Public interfaces

`PatientDirectory` exposes `search(PatientSearch)` and `patient(id)`, returning `DirectoryPage<Patient>` or an authorized `Patient`. `Patient` uses `PatientField.Withheld` for an omitted unauthorized field and `PatientField.Disclosed(null)` for an authorized nullable field. `PatientReference` contains only the patient and workspace IDs and is safe to pass to clinical entry flows.

`DoctorDirectory` exposes bounded directory, detail and shift reads. Doctors are selected from Schedule and picker routes. There is no global doctor tab.

`AppointmentLookup` exposes bounded agenda and detail reads. `AppointmentRepository` adds availability, creation, rescheduling and supported lifecycle commands. `AppointmentReference` carries the opaque appointment version token and nullable encounter link. Member C must re-read the appointment and send the exact `appointmentVersionToken` when creating or starting a linked encounter.

`EncounterEntry` and `EncounterNavigation` are the handoff seam for clinical workflows. Member B does not create, start, complete or cancel encounters. A linked `AppointmentAction.START` or `COMPLETE` remains unavailable until a clinical implementation supplies the coupled workflow.

## Routes and picker state

`OperationalNavigationContribution` declares typed ID-only routes for patient and doctor pickers, patient and doctor detail, agenda, appointment create/detail/edit, and the Schedule root. Search text, names, notes, tokens, ETags, permissions and callback values never enter a route. Picker handles are memory-only, bound to auth/context epochs, consumed once and abandoned on process death or scope change.

The contribution is registered through Member A's `NavigationRegistry`/`NavigationBindings` integration point. It does not edit `AppNavHost` and does not add a fifth tab.

## Platform integration handoff

Member A now composes one devDebug `SyntheticOperationalBackend` per `EnvironmentBindings` instance and shares its three repository ports through `AppGraph`. `NavigationBindings.contributions(screens)` registers `OperationalNavigationContribution`; `OperationalNavigatorHost` binds only while the protected shell exists. Four tabs remain unchanged. The shell guards dirty forms through picker navigation, rotation, Home, tabs and voluntary workspace exits; auth/context invalidation clears form and picker state.

`WorkspaceContext.locations` is validated by the session gateway: bounded unique IDs, names and ACTIVE/INACTIVE status. The operational presentation selects only ACTIVE locations from that context. Session snapshots, permission checks, epoch/sequence rejection and operation receipt admission remain the existing platform boundaries. The synthetic service is directly composed as allowed by ARCHITECTURE; HTTP adapters still use `AuthenticatedRequestPort`. No second client/session/store exists.

`operational-demo-policy-1` is an explicit fixture policy, not BD approval. Willow has synthetic operational and clinical-entry grants plus demographic read fields; Harbor lacks clinical-entry grants and withholds optional demographics. Each has a distinct location, patient, doctor and current-day seeded appointment. Synthetic creation is PENDING, rescheduling and occupancy use PENDING/CONFIRMED, active doctor/location/shift and future nonconflicting time checks apply. Fixture confirm/cancel/check-in/no-show edges are explicit; coupled clinical start/complete remain unavailable. The app shows its synthetic banner and cannot make network calls.

Clinical entry currently ends in `ClinicalEntryPlaceholderRoute`. `EncounterNavigation` accepts B's public ID references, checks active workspace/grants and projects only IDs into that route. Member C must still re-read and authorize referenced resources and relationships; the placeholder reads and mutates no clinical data. App composition accepts a future `EncounterNavigation` implementation through `OperationalDependencies.clinical`.

Device validation also exposed concrete completion defects in B's UI: workspace state now uses lifecycle collection; forms preserve the dirty guard while a picker hides them; a visible Saved result can acknowledge its durable receipt and open the appointment, while detail refresh acknowledges the result before another action. These are integration fixes, not a transfer of feature ownership.

Unknown outcomes remain locked with metadata retained; OP01/OP02/OP03 recovery adapters and UI remain a separate platform batch before live mutations. No resubmission or backend durability guarantee is inferred from the fake. See [operational integration evidence](OPERATIONAL-INTEGRATION-REPORT.md) for executed checks and remaining gates.

## Blocked decisions

- BD-01 keeps grants and resource relationships server-owned. Unknown or missing grants deny actions.
- BD-02 keeps patient sex/status catalogues, MRN allocation and required-field policy unavailable. Patient reads/searches are supported; patient write UI is disabled.
- BD-03 keeps appointment initial state, eligible rescheduling states, occupancy, location/shift eligibility, cancellation/no-show timing and availability policy unavailable. SyntheticSchedulingPolicy names every fixture rule instead of selecting a product default.

Availability uses half-open UTC intervals produced from the workspace timezone. DST gaps are rejected and overlaps require an explicit offset. Availability is advisory; creation and rescheduling repeat conflict checks atomically on the server or fixture backend.

## Clinical read foundation addendum

Member C now connects the operational `EncounterNavigation` parameter to clinical entry/history, encounter context and current-record read screens. Patient entry shows authorized history; existing appointment links open the matching encounter; missing links remain empty. No clinical mutation or AI operation is introduced. The previous placeholder evidence above remains historical. See [Clinical contracts](CLINICAL-CONTRACTS.md) and [Clinical foundation report](CLINICAL-FOUNDATION-REPORT.md) for current scope and validation.
