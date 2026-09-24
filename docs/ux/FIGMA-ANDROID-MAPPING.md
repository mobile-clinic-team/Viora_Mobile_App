# Figma to Android mapping

Prototype status is **PENDING FIGMA**. Android screenshot and report-figure columns describe evidence still to capture unless explicitly marked current source evidence.

| Figma frame | Android route | Compose file | Current status | UI gap | Screenshot needed | Prototype linked? | Final demo? | Report figure? |
|---|---|---|---|---|---|---|---|---|
| 01 Login | Signed-out state | `feature/auth/ui/LoginScreen.kt` | PARTIAL synthetic | Real auth unavailable; normalize feedback | Yes | No | Yes |
| 02 Workspace | `SELECT_ROLE`/`SELECT_WORKSPACE` | `app/RoleShells.kt`, `feature/workspace/ui/WorkspaceScreen.kt` | PARTIAL | Normalize selection rows | Yes | No | Yes |
| 03 Dashboard | `Dashboard` | `app/AppNavHost.kt` | IMPLEMENTED synthetic | Dashboard data is synthetic | Yes | No | Yes |
| 04 Patient Search | `Patients`, `PatientPickerRoute` | `feature/patients/ui/PatientScreens.kt` | IMPLEMENTED synthetic | Shared state panel/live API | Yes | No | Yes |
| 05 Patient Detail | `PatientDetailRoute` | `feature/patients/ui/PatientScreens.kt` | IMPLEMENTED synthetic | Related sections need stronger grouping | Yes | No | Yes |
| 06 Doctor Schedule | `Doctors`, `DoctorPickerRoute`, `Schedule` | `feature/doctors/ui/DoctorScreens.kt`, `AppointmentScreens.kt` | IMPLEMENTED/PARTIAL synthetic | Doctor row/status normalization | Yes | No | Optional |
| 07 Appointment List | `Schedule`, `AgendaRoute` | `feature/appointments/ui/AppointmentScreens.kt` | IMPLEMENTED synthetic | Status chip and live data | Yes | No | Yes |
| 08 Appointment Detail | `AppointmentDetailRoute` | `AppointmentScreens.kt` | PARTIAL | Action/status hierarchy | Yes | No | Yes |
| 09 Appointment Action | `AppointmentCreateRoute`, `AppointmentEditRoute` | `AppointmentScreens.kt` | PARTIAL | Structured date/time and result panel | Yes | No | Yes |
| 10 Clinical Record | `ClinicalRecordRoute` | `feature/clinical/ui/ClinicalScreens.kt` | PARTIAL read-only | Error retry and real mutations absent | Yes | No | Yes |
| 11 AI Assistant | `Assistant`, `AssistantConversationRoute` | `feature/assistant/ui/AssistantScreens.kt` | PARTIAL synthetic | Real provider and compact provenance | Yes | No | Yes |
| 12 AI Draft Review | `AssistantDraftRoute` | `AssistantScreens.kt` | PARTIAL synthetic | Stronger source/reviewer visual separation | Yes | No | Yes |
| 13 Loading | State inside several routes | `InfoPanel`, `ClinicalReadPane`, assistant page | IMPLEMENTED | Normalize copy/layout | Yes | No | Optional |
| 14 Empty | State inside list/read routes | `OperationalReadPane`, clinical/assistant state | IMPLEMENTED | Normalize next action | Yes | No | Optional |
| 15 Error Retry | State inside read routes | `OperationalReadPane`, clinical/assistant state | PARTIAL | Clinical retry and shared styling | Yes | No | Yes |
| 16 Success Receipt | Inline result state | `AppointmentSubmissionPane`, assistant state | PARTIAL | One shared receipt component | Yes | No | Yes |

## Mapping rules

- A Figma target frame is not implementation evidence.
- A current Android screen is not evidence that the matching final backend exists.
- Screenshots must use synthetic data and the same source revision claimed in the report.
- `Prototype linked?` stays `No` until the student creates the real Figma file and links the prototype.
