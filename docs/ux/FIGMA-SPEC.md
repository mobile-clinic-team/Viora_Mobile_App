# Figma frame specification

## File setup

- Create one Figma page named `Viora - Course MVP`.
- Use mobile frames at **360 × 800 dp** for the primary baseline and **412 × 915 dp** for a wide-phone check.
- Use Auto Layout and the tokens in [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).
- Use fictional/synthetic data only.
- Mark frames with `CURRENT` or `TARGET` in the frame name. Do not label planned service behavior as implemented.

| Frame | Frame name | Android source | Components/content | Important interaction | State | Role | Current/target | Screenshot/reference |
|---:|---|---|---|---|---|---|---|---|
| 01 | `01 Login - CURRENT synthetic` | `LoginScreen.kt` | Viora brand, email/password fields, sign-in, demo entry, safe feedback | Explore demo opens account choices; sign in validates fields | Ready/validation | Demo staff | CURRENT | Android screenshot needed |
| 02 | `02 Workspace - CURRENT synthetic` | `WorkspaceScreen.kt` | Membership rows, role/clinic labels, sign out | Select one authorized workspace | Ready/empty/denied | Staff | CURRENT | Android screenshot needed |
| 03 | `03 Dashboard - CURRENT synthetic` | `AppNavHost.kt` | Date, welcome card, Patients/Schedule/Assistant actions | Tap primary workflow card | Success/content | Doctor/nurse | CURRENT | Android screenshot needed |
| 04 | `04 Patient Search - CURRENT synthetic` | `PatientScreens.kt` | Search field, patient rows, MRN, empty/error panel | Enter query, clear, select patient | Initial/loading/empty/error/content | Receptionist/doctor/nurse | CURRENT | Android screenshot needed |
| 05 | `05 Patient Detail - CURRENT synthetic` | `PatientScreens.kt` | Patient identity, authorized fields, appointment/encounter actions | Open appointment or clinical context | Loading/content/unavailable | Authorized staff | CURRENT | Android screenshot needed |
| 06 | `06 Doctor Schedule - CURRENT synthetic` | `DoctorScreens.kt`, `AppointmentScreens.kt` | Doctor search, schedule filters, shift/appointment rows | Open doctor or appointment | Loading/empty/error/content | Scheduling staff | CURRENT | Android screenshot needed |
| 07 | `07 Appointment List - CURRENT synthetic` | `AgendaScreen` | Date controls, filters, new appointment, appointment cards | Open detail or create | Loading/empty/error/content | Scheduling staff | CURRENT | Android screenshot needed |
| 08 | `08 Appointment Detail - CURRENT synthetic` | `AppointmentDetailScreen` | Time/status card, patient/doctor details, actions | Confirm destructive/action dialog; open encounter | Content/conflict/unknown | Authorized staff | CURRENT | Android screenshot needed |
| 09 | `09 Appointment Action - TARGET live` | `AppointmentFormScreen`, `AppointmentSubmissionPane` | Structured date/time, references, reason/notes, save, result panel | Save; show receipt or outcome recovery | Form/submitting/saved/conflict/unknown | Scheduling staff | TARGET | Figma only until live path |
| 10 | `10 Clinical Record - CURRENT read-only` | `ClinicalRecordScreen` | Patient/encounter context, record version, fields, refresh | Refresh or return | Loading/empty/denied/error/content | Doctor/nurse | CURRENT | Android screenshot needed |
| 11 | `11 AI Assistant - CURRENT synthetic` | `AssistantScreens.Home/Conversation` | Context banner, messages, advisory notice, composer | Create/open conversation; send question | Empty/loading/error/content | Authorized clinician | CURRENT | Android screenshot needed |
| 12 | `12 AI Draft Review - CURRENT synthetic` | `AssistantScreens.Draft` | Provenance, current/proposed comparison, review/edit/reject/approve | Open review dialog; edit draft | Generated/in-review/stale | Approving clinician | CURRENT | Android screenshot needed |
| 13 | `13 Loading State - CURRENT` | `InfoPanel`, `ClinicalReadPane` | Spinner, concise status, preserved context | Wait; no accidental action | Loading | All | CURRENT | Android screenshot needed |
| 14 | `14 Empty State - CURRENT` | `OperationalReadPane` | Explanation, next action or search hint | Start search/retry context | Empty/initial | All | CURRENT | Android screenshot needed |
| 15 | `15 Error Retry - TARGET normalized` | `OperationalReadPane`, clinical/assistant state | Error title, safe explanation, retry button, request ID when safe | Retry read; retain form on uncertain write | Error/retriable | All | TARGET | Figma plus Android screenshot needed |
| 16 | `16 Success Receipt - TARGET normalized` | Submission panes and receipt routing | Saved/verified receipt, next safe action, current-read refresh | Open saved resource or acknowledge | Success/saved | Staff | TARGET | Figma plus Android screenshot needed |

## Content rules

- Use synthetic names and fictional IDs only.
- Use short, actionable copy: “Retry”, “Check outcome”, “Review current details”, “Stay”, and “Discard”.
- Show workspace and role context near protected content.
- Show AI provenance and human-review responsibility near generated content.
- Do not place database credentials, provider secrets, or real patient information in Figma.
