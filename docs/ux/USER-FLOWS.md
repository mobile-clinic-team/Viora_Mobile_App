# Current navigation and user flows

The application currently uses one protected `NavHost` with a dashboard root and four bottom tabs: Patients, Schedule, Assistant, and Account. Route inputs are typed and ID-only. The flow statuses below distinguish the current synthetic path from the target final-course MVP.

## Navigation map

```text
S00 Session restore
  -> S01 Login
  -> S02 Role/workspace selection
  -> S03 Dashboard
       -> S04 Patients -> S06 Patient detail
       -> S10 Schedule -> S12 Appointment detail
       -> S17 Assistant -> S18 Conversation -> S19 AI draft review
       -> S20 Account -> switch workspace or logout
```

Patient and doctor pickers use temporary in-memory handles. Clinical handoffs and assistant operations are guarded by the current authentication/context epochs. The preserved patient/admin shells are not part of the approved staff navigation map.

| Flow | Current route sequence | Status | Current evidence | Target final MVP |
|---|---|---|---|---|
| Login to workspace | S00 -> S01 -> S02 -> S03 | PARTIAL | Synthetic login, role selection, workspace selection, fail-closed session tests | Real authentication, token lifecycle, server membership and authorization |
| Dashboard to patient | S03 -> S04 -> S06 | CURRENTLY WORKS | FakeBackend patient directory/detail and current Compose screens | Live authorized patient API and persistent data |
| Dashboard to schedule | S03 -> S10 | CURRENTLY WORKS | Synthetic agenda, filters, paging, and state mapping | Live appointments/schedule API with server state |
| Schedule to appointment | S10 -> S12 | PARTIAL | Appointment list/detail and action confirmation exist; service is synthetic | Persistent appointment CRUD, conflict/OCC/idempotency evidence |
| Create/reschedule appointment | S10 -> S11 or S12 -> S13 -> S12 | PARTIAL | Forms, validation, synthetic submission and recovery states exist | Real API/database transaction and verified receipt |
| Appointment to encounter | S12 -> S14 or S21 | PARTIAL | Navigation boundary exists; clinical creation/change is explicitly unavailable | Authorized encounter creation/start policy and live record link |
| Encounter to clinical record | S14 -> S15 | PARTIAL | Authorized synthetic clinical reads and read-only record screen | Live clinical record workflow at selected MVP depth |
| Clinical record to AI | S15 -> S17/S18 -> S19 | PARTIAL | Synthetic assistant context, draft, provenance, and human review boundary | Real backend-mediated AI, evaluation, limitations, and human-reviewed handoff |
| Error and retry | Any read -> state pane -> retry/reopen | PARTIAL | ReadState/ClinicalState/AssistantState and several retry actions exist | Consistent live API error mapping and safe write recovery |
| Logout/scope change | S20 -> S01 or S02 | CURRENTLY WORKS | Session epoch invalidation, privacy handling, and logout tests | Live revoke/expiry behavior and device evidence |

## Interaction rules for prototype and implementation

- Back from a tab root returns to the dashboard; back from a child route returns to its parent.
- Dirty forms show Stay/Discard before voluntary navigation.
- Appointment actions show confirmation dialogs.
- Read failures remain distinct from empty results and expose retry where the state permits it.
- Unknown write outcomes require outcome checking and must not automatically resubmit.
- No route or UI state grants authorization; server enforcement remains a target requirement.
