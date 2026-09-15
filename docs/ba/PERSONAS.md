# Personas

These personas are derived from the four staff roles in `docs/PRODUCT-SPEC.md`. Goals and pain points are role-based hypotheses pending real research.

## P-01 Receptionist

| Field | Definition |
|---|---|
| Role | `RECEPTIONIST` |
| Goals | Keep patient and appointment coordination accurate and understandable. |
| Tasks | Search patient demographics, inspect permitted doctor/schedule information, create or reschedule appointments, cancel, and check in. |
| Pain points to validate | Repeated lookup, scheduling conflicts, unclear appointment state, and uncertain network outcomes. |
| Information needed | Minimized patient identity, doctor/location availability, appointment time/status, current workspace, and actionable errors. |
| Permissions | Patient demographics and scheduling operations allowed by effective server grants; no clinical record content or AI clinical approval. |
| Key flows | Login, workspace selection, patient search/detail, doctor directory, agenda, appointment form, check-in, outcome recovery, logout. |
| Security concerns | Wrong workspace, overexposed patient fields, unauthorized clinical navigation, duplicate submissions, and stale appointment versions. |

## P-02 Doctor

| Field | Definition |
|---|---|
| Role | `DOCTOR` |
| Goals | Access authorized patient and clinical context, manage permitted care workflow, and review assistance without losing clinical control. |
| Tasks | Find patients, inspect appointments, open encounters and records, review/edit/approve permitted drafts, and handle conflicts. |
| Pain points to validate | Switching between scheduling and clinical context, locating the current record version, and distinguishing advisory content from trusted clinical documentation. |
| Information needed | Authorized patient/encounter/record projections, appointment state, version tokens, provenance, permissions, and assurance status. |
| Permissions | Authorized patient, appointment, encounter, record, assistant, and draft actions subject to relationship, policy, and assurance. |
| Key flows | Login, workspace selection, patient detail, appointment, encounter/record read, assistant context, draft review, step-up, handoff, logout. |
| Security concerns | Clinical need-to-know, stale versions, AI provenance, assurance binding, cross-workspace leakage, and accidental finalization. |

## P-03 Nurse

| Field | Definition |
|---|---|
| Role | `NURSE` |
| Goals | Support permitted patient, appointment, encounter, and clinical input workflows. |
| Tasks | Find authorized patients, inspect schedules and encounters, and perform only explicitly granted clinical actions. |
| Pain points to validate | Ambiguous role boundaries, unavailable actions, and needing to know whether a record is current or still awaiting another role. |
| Information needed | Patient/schedule/encounter projections, effective permissions, state explanations, and safe retry/conflict guidance. |
| Permissions | Effective server grants; the title alone does not grant record finalization or AI approval. |
| Key flows | Login, workspace selection, patient search/detail, schedule, clinical context, permitted record actions, error recovery, logout. |
| Security concerns | Role overreach, hidden clinical fields, workspace mismatch, and accidental interpretation of unavailable as empty. |

## P-04 Clinic administrator

| Field | Definition |
|---|---|
| Role | `CLINIC_ADMIN` (represented as the current app’s administrator role where mapped) |
| Goals | Use authorized clinic and operational information while respecting clinical access ceilings. |
| Tasks | Inspect permitted workspace, user, role, clinic, or audit information if such access is supplied by policy. |
| Pain points to validate | Separating operational administration from clinical need-to-know and understanding which management functions are outside the mobile MVP. |
| Information needed | Workspace status, effective administrative permissions, bounded system information, and clear unavailable states. |
| Permissions | Explicit administrative grants only; administrator title is not a clinical or AI approval override. |
| Key flows | Login, role/workspace selection, permitted administrative shell, account, logout. |
| Security concerns | Privilege escalation, cross-workspace administration, exposure of audit/system information, and confusing local demo data with production data. |

## Excluded or unresolved roles

`PATIENT` and `SUPER_ADMIN` appear in the mobile specification as excluded from ordinary staff workflows. The preserved worktree contains an experimental patient shell, but no final patient persona is accepted until the product owner reconciles it with the documented MVP exclusion.
