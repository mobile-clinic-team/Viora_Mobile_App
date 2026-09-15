# UI state matrix

The matrix reflects current source behavior. `Yes` means the state is represented in the inspected Compose/state model; it does not mean that a live backend currently supplies the state.

Survey support: Q14 found an explicit error plus retry preference of **40/61 (65.6%)**, automatic retry with notification of **17/61 (27.9%)**, and some retry mechanism preferred by **57/61 (93.4%)**. This supports making retry and outcome recovery visible in the final demo.

| Screen | Loading | Empty | Error | Success/content | Retry | Permission denied | Conflict if relevant | Evidence/source | Gap |
|---|---|---|---|---|---|---|---|---|---|
| Login | Yes, signing-in state | N/A | Yes, validation/safe message | Yes, session transition | Re-enter/submit | Production sign-in unavailable | N/A | `LoginScreen.kt`, `SessionCoordinator` | Real auth states not implemented |
| Role/workspace selection | Partial | Yes, no roles/memberships | Partial | Yes, selected context | Workspace retry in screen contract | Yes | Stale context | `RoleShells.kt`, `WorkspaceScreen.kt` | Current synthetic membership only |
| Dashboard | No explicit load pane for dashboard | Partial, no appointments is described | Partial | Yes | Planned/read retry | Guarded before entry | N/A | `AppNavHost.kt`, `USER-FLOWS.md` | Dashboard data is mostly local/synthetic |
| Patient list | Yes | Yes, no matches | Yes | Yes, directory content | Yes | Yes | N/A | `PatientScreens.kt`, `OperationalReadPane` | Live API absent |
| Patient detail | Yes | Yes, unavailable patient/related sections | Yes | Yes, authorized projection | Yes | Yes/unavailable | N/A | `PatientDetailScreen`, `ReadState` | Editing and live related records missing |
| Doctor directory/detail | Yes | Yes | Yes | Yes | Yes for profile/shifts | Yes/unavailable | N/A | `DoctorScreens.kt`, `ReadState` | No live service |
| Schedule/agenda | Yes | Yes, no appointments in range | Yes | Yes, appointment list | Yes | Yes | Schedule conflict on writes | `AgendaScreen`, `OperationalReadPane` | Status chips and live API missing |
| Appointment create/edit | Submitting | No locations/required reference | Field/rejected states | Saved receipt | Outcome check/edit | Unavailable for workspace | Yes, schedule/version conflict | `AppointmentFormScreen`, `AppointmentSubmissionPane` | Native date/time picker and consistent result hierarchy needed |
| Appointment detail | Yes | Yes, unavailable appointment | Yes | Yes, detail/actions | Yes | Yes | Yes, action/version conflict | `AppointmentDetailScreen` | Live receipts/server state missing |
| Clinical entry/encounter | Yes | Yes, no encounter/record | Yes | Partial, read context | Retry/refresh | Yes | Planned clinical conflict | `ClinicalReadPane`, `ClinicalScreens` | Creation/change explicitly unavailable |
| Clinical record | Yes | Yes, no record | Yes/retriable failure | Yes, read-only | Refresh/retry depending state | Yes | Planned 412/version conflict | `ClinicalRecordScreen`, `ClinicalReadPane` | Current error state sometimes lacks retry |
| Assistant home/conversation | Yes | Yes, no conversations/messages | Yes | Yes, synthetic advisory content | Reload/check outcome | Yes | Stale/expired target | `AssistantScreens.kt` | Provider-backed behavior missing |
| AI draft review | Yes | No draft/target | Yes | Partial, synthetic draft/handoff | Reload/review | Yes | Stale target/version | `AssistantScreens.kt` | Real model/evaluation/handoff missing |
| Account | No explicit load pane | N/A | Partial | Yes | N/A | Guarded before entry | Scope change | `AppNavHost.kt` | Remote revocation evidence missing |
| Outcome recovery | Pending/unknown | N/A | Resolved failure/unavailable | Verified receipt | Check outcome | Owner/context guard | Idempotency/version | `AppointmentSubmissionPane`, `AssistantScreens` | No single dedicated S25 route |

## Highest-value state gaps

1. Add a consistent visible retry action to every final-demo read failure, especially clinical error states.
2. Normalize saved, rejected, conflict, and unknown-outcome messages into the same visual state component.
3. Demonstrate the four representative Figma/Android states with synthetic data before live integration.
