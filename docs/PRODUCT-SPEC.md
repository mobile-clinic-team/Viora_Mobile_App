# Product specification

Foundation Contract Closure — 2026-09-08. This document owns product scope and unresolved owner decisions. Technical defaults elsewhere are engineering decisions for this greenfield client, not inherited backend rules.

## Product and scope

Viora Mobile is an Android phone application for a small clinic team: patient operations, doctor information, appointments, clinical documentation and human-reviewed AI assistance. The server is authoritative for access and clinical truth.

| Priority | Scope |
|---|---|
| MUST HAVE | Staff login; authorized workspace selection; patient search/detail/create/edit; doctor directory; appointment create/reschedule/cancel/check-in; encounter and record workflows; contextual assistant; draft review/edit/approve/reject; required review provenance; secure session, privacy, audit integration and recovery |
| SHOULD HAVE | Convenience filters within the active session; recent patients in memory; in-app upcoming-appointment reminders on the dashboard; non-clinical dashboard shortcuts |
| COULD HAVE | Push reminders, attachments, voice input, analytics and multi-device draft handoff |
| OUT OF SCOPE | Patient self-service, billing, inventory, labs, prescribing, doctor/staff administration, clinic-settings editing, offline clinical writes, autonomous medical decisions, direct provider/database access |

“Doctor management” in this MVP means directory and scheduling information. Clinic administrators may use authorized operational functions; their title does not imply a settings/staff-management UI or unrestricted clinical access. No extra tab, management API or enterprise subsystem is required.

## Users and permission ceilings

| Role identifier | Established purpose | Explicit limit |
|---|---|---|
| CLINIC_ADMIN | Workspace administration role, operational functions only within this app's scope | Never a clinical or AI approval override |
| DOCTOR | Authorized patient/appointment care, clinical records, assistant and draft approval | Subject to resource relationship, effective permissions and required assurance |
| NURSE | Patient/appointment support, encounter and permitted clinical input, assistant | No AI approval grant by default; exception is BD-01 |
| RECEPTIONIST | Patient demographics, scheduling, rescheduling, cancellation and check-in | No clinical record content or AI clinical approval |

These are new wire identifiers for the existing role labels. Actual grant assignments, clinical visibility and relationship criteria require BD-01. Unknown roles or grants confer no authority. Authentication and membership can be implemented before these clinical grants are approved.

## Goals and acceptance

A permitted user can select a clinic, find a patient, schedule a visit, document an encounter and request/review an AI draft. Every action reports actual server evidence; a draft approval is distinct from clinical finalization. Slow connectivity, interruption, conflict and expiry must have recoverable or explicitly uncertain outcomes.

Acceptance uses synthetic users in two workspaces. Verify field-level restrictions, scope changes, version conflicts, duplicate prevention, human review and manual workflow availability during AI failure. A scaffold or a fake-server demonstration is not integrated MVP acceptance.

Phone interactions use at least 48dp targets, system text scaling, readable contrast and non-color status cues. The neutral startup/login shell works without network access; authentication and protected data require connectivity. The first device baseline is defined in [architecture](ARCHITECTURE.md). No real-patient pilot is authorized merely by completing this batch.

## Blocked owner decisions

These are the only unresolved business/owner decisions. They are not permissions to invent defaults. Until closed, affected backend actions return 503 FEATURE_UNAVAILABLE with the relevant decisionIds; they are disabled in the UI. Synthetic fixtures may exercise explicit test-only policies.

| ID | Status and owner | Decision to supply | Affected behavior and safe boundary |
|---|---|---|---|
| BD-01 | BLOCKED DECISION — Product + clinical lead + Security | Exact role-to-permission grants, field visibility, care relationships, administrator limits and whether/how a Nurse may approve | Clinical/AI access and operational grants cannot be enabled by guessed role mappings; default deny |
| BD-02 | BLOCKED DECISION — Product + clinic operations | Patient sex/status value sets and initial status; MRN allocation/uniqueness policy; which demographic/contact fields are business-required | Patient read/search may consume validated responses; patient create/edit remains unavailable until policy is published |
| BD-03 | BLOCKED DECISION — Clinic operations | Appointment creation state; reschedule eligible states; occupancy statuses; shift/location eligibility; cancellation/no-show timing and operational permissions | Scheduling mutations/availability disabled until policy exists; known appointments remain readable if authorized |
| BD-04 | BLOCKED DECISION — Clinical lead | Clinical completeness/sign-off requirements; encounter cancellation/completion conditions; amendment eligibility, including later corrections | Technical version/lifecycle protocols are fixed, but finalize/amend/encounter terminal commands fail closed until the corresponding policy is approved |
| BD-05 | BLOCKED DECISION — Clinical + Privacy/Security + service owner | Approved AI use/context/knowledge sources; provider data processing; conversation/draft/clinical/audit retention and deletion/hold policy | No real-patient AI or production data lifecycle until approved; no invented retention duration or medical recommendation policy |
| BD-06 | BLOCKED DECISION — deployment/release owner | Real API/issuer domains, verified callback-domain ownership, OIDC client registration, production distribution and signing custody | Live authentication/release require supplied configuration; fake-environment foundation work can proceed |

Closing a decision requires an approved value/policy and affected contract/test updates, not simply removing a disabled button. Technical transport, session timing, cipher/storage, API schemas and state ownership are fixed in their owning documents.

## Contract ownership

[Domain](DOMAIN-MODEL.md) owns fields/invariants/lifecycles; [API](API-SPEC.md) owns wire schemas, errors, versions and recovery; [authentication](AUTH-SECURITY.md) owns trust, sessions, grants and audit; [storage](DATA-STORAGE.md) owns local retention/privacy; [AI](AI-ASSISTANT-SPEC.md) owns generation and handoff. Screens and flows reference these rules instead of redefining them.
