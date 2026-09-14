# Viora Mobile MVP application specification

Status: **PROPOSED scope**, grounded in R01/R03/R04/R05/R06. A capability being confirmed in the Viora domain is not a claim that its HTTP implementation exists. API IDs and release blockers are in [API integration](MOBILE-API-INTEGRATION.md).

## Smallest useful product

An authorized clinic worker can select their clinic, find/register a patient, schedule and check in an appointment, open the patient's clinical context, document and review an encounter, and request an AI summary or draft for explicit human review. The proposed app is online for protected work. It is an installed mobile app, not a web wrapper.

Receptionist and DOCTOR are the primary operational and clinical personas. Nurse/Clinical Staff and CLINIC_ADMIN may use the same permitted workflows under their actual backend permissions; there is no separate administration app in this MVP. Product sign-off on the launch role subset is ADR-M02. Unknown role/permission values grant no action.

| Reference actor | Proposed mobile access | Boundary |
|---|---|---|
| Receptionist | Patient demographic search/create/update, doctor/availability lookup, appointment operations | No clinical notes, allergy panels or clinical AI by virtue of this role |
| DOCTOR | Authorized patient/scheduling work, encounters, medical records, clinical AI assistance and approval | Requires patient relationship, operation permission and step-up where applicable |
| Nurse/Clinical Staff | Permitted patient/scheduling/clinical assistance | Do not infer finalization/AI approval rights from title; require explicit clinical authorization |
| CLINIC_ADMIN | Permitted clinic context and operational workflows | Tenant administration does not grant clinical need-to-know; staff/role/configuration management deferred |
| PATIENT | Excluded from this smallest mobile MVP | Some self-read contracts exist, but no mobile self-registration/self-booking is established |
| SUPER_ADMIN | Excluded from ordinary mobile workflows | No automatic cross-tenant clinical access |

Nurse/Clinical Staff and Receptionist are approved separate application roles. Their exact transport identifiers are TBD. `STAFF` or test-only `ADMIN` must not become mobile role enums without a published mapping. A separate login account is not a Patient record or Doctor profile.

## Feature requirements

All protected features require a valid session, active validated tenant membership and operation-level permission. All successes are confirmed by backend responses; no optimistic clinical/appointment mutation is authoritative. Shared error behavior is specified in the API document and screen state rules.

| Feature; phase; purpose/user | Preconditions | Main flow | Success | Failure | API dependency and security |
|---|---|---|---|---|---|
| F01 Authentication/restoration — MVP; identify clinic worker | Approved CIAM native integration; provisioned active user | Launch → external login/MFA or secure restoration → validate user/memberships | Authenticated, server-validated context | Cancelled login, invalid callback, expired/revoked/ambiguous context: remain locked or select clinic | I01/I02, G02; SEC01–03. Never collect credentials in app-owned forms |
| F02 Clinic context — MVP; prevent wrong-clinic work for all users | Valid identity; one or more active memberships | Resolve one membership or choose among authorized memberships → validate tenant → show clinic label/status | Every screen/request belongs to selected tenant | No membership: access-unavailable state; suspended/archived tenant: ordinary mutations unavailable | I01/I02/T01/T02, G02; SEC04/05. Location selection never changes tenant |
| F03 Patient discovery/detail — MVP; staff find authorized profile | Patient directory/read permission | Search by allowlisted fields → bounded results → confirm identity → detail | Field-minimized current profile | Empty results distinct from search failure/denial; wrong tenant indistinguishable from missing | P01/P03; SEC04–06/09. Do not log search values or infer omitted fields |
| F04 Patient create/edit — MVP; authorized staff maintain demographics | Create/update permission; approved field values/optionality and MRN policy; edit requires current ETag | Enter known fields → validate → submit once; edit only allowlisted changes | New/updated profile and ETag returned | Invalid/duplicate/key conflict: correct explicitly; 412: reload and review; unknown outcome: reconcile | P02/P04, ADR-M12; SEC05–08/09. Never edit clinical content here |
| F05 Doctor/scheduling information — MVP supporting capability; authorized scheduling user | Same clinic, read/schedule permission | Find doctor → inspect permitted profile/shifts → select location/availability | Doctor/location references ready for appointment form | No doctor/shift/availability: no assumed slot; denied sensitive fields remain absent | D01–D03/T02/A07; SEC04–06. Ratings/profile maintenance later |
| F06 Appointments/check-in — MVP; receptionist/doctor/authorized staff | Patient/doctor/location access, valid interval, operation permission and G03 closure | Agenda/detail → create or edit → confirmation command → check-in; cancel only from allowed states | Server-returned appointment and derived queue status | Double booking 409, stale 412, invalid transition, network ambiguity; explicit resolution | A01–A07/G03/G09; SEC04–09. Availability advisory; no generic state assignment |
| F07 Encounters/history — MVP; authorized clinical actor | Clinical relationship/permission; G04 history/association reads | Patient history → existing encounter or create with patient/doctor and optional appointment | Authorized encounter reference and current status | Unavailable history is not empty history; duplicate encounter or mismatch rejected | C01/C02/G04; SEC04–07/09. Scheduled/walk-in policy and transition mapping ADR-M13 |
| F08 Medical records/allergies — MVP; authorized clinical actor documents encounter | Current clinical context; lifecycle permission; G08/G10 closed | Read allergies/history → create initial DRAFT → review IN_REVIEW → explicit finalize; correction via amendment | Current backend record/version visible; finalized version immutable | Invalid/missing clinical fields, stale record, denied assurance, missing correction contract: block action | C03–C08/G08/G10; SEC05–09. Do not invent diagnoses or use placeholder values to pass validation |
| F09 AI assistance/knowledge — MVP; authorized clinician, other users only for separately permitted nonclinical tasks | AI permission + authorized context + G06 ready | Confirm patient/encounter context → bounded request → authorized summary/knowledge response | Validated advisory output and permitted sources/limitations | Unsafe/uncertain/failed provider/tool/context: safe deferral; manual work remains available | AI01–AI03/K01/G06; SEC04–06/09/10. No provider selection, arbitrary tools or clinical certainty claims |
| F10 AI clinical draft review/approval — MVP; authorized human clinician | G05–G07 closed; exact draft/state/version, clinical permission and fresh step-up | Generate → view GENERATED → explicit review REVIEWING → inspect/edit through approved contract → approve or reject | Verified approval/handoff reference, or REJECTED; clinical status independently read | Stale/expired/unsafe/missing handoff or assurance: stop approval; no silent retry | AI04–AI07/G05–G07; SEC05/07–10. APPROVED draft is not FINALIZED record |
| F11 Account/logout — MVP; current user controls session | Accessible account surface even when clinical access fails | View safe identity/clinic context → logout → local state invalidated, revoke attempted | No protected UI or credentials retained locally; remote revocation success separately reported | Offline revocation cannot be claimed complete; app still locks and clears local credentials | I01/T01/G02; SEC01–04/06/09 |
| F12 Clinic home — MVP navigation; all permitted workers orient themselves | Valid session/context | Show current clinic and permitted shortcuts/agenda preview | Reach appropriate workflow without aggregate claims | Individual unavailable section is labelled; session failure locks all protected content | T01/A01 where permitted; no aggregate API required. NEW MOBILE REQUIREMENT NM01 |

## Scope exclusions and examined candidates

| Candidate | Decision and evidence |
|---|---|
| Full month calendar, operational totals and analytics | Agenda is sufficient for MVP; no aggregate endpoint exists. Loaded page counts cannot be presented as clinic-wide totals |
| Tenant selection | Required only for multiple active memberships; single membership may be resolved automatically. Exact transport remains G02 |
| Patient edit | Included because P04 exists in reference and application; launch depends on field policy/OCC reconciliation |
| Staff onboarding/user management and clinic settings | Product references them, but complete admin API/mobile flow is absent. Provision test/pilot users and clinic locations outside this app |
| Encounter list/history | Included as a necessary existing-domain workflow; G04 explicitly blocks integration |
| Doctor editing, shift administration and ratings | Read information supports MVP; administration is later mobile scope, ratings already Post-MVP |
| Notification/push/reminders | Not required. Notification is Post-MVP in R01/R04; no push registration or delivery contract. No notification permission requested |
| Offline clinical reading/editing and background synchronization | NEW MOBILE REQUIREMENT if later requested; proposed MVP has no durable PHI cache or queued writes |
| Patient app, clinical files, prescriptions, labs, billing, payments | Excluded. No new portal, payment, upload, camera, voice transcription or device-data feature inferred |
| Standalone audit viewer, knowledge management, AI inbox | Not necessary for smallest workflow; audit remains server-side. Known conversation/draft recovery still required |

## Mobile-specific requirements

| ID | Requirement | Status |
|---|---|---|
| NM01 | Role-aware screen hierarchy, clinic label and safe navigation | NEW MOBILE REQUIREMENT — PROPOSED |
| NM02 | Process/lifecycle-safe session coordinator, native OIDC callback and tenant reset | NEW MOBILE REQUIREMENT — PROPOSED |
| NM03 | OS-protected token storage, no persistent PHI by default | NEW MOBILE REQUIREMENT — PROPOSED |
| NM04 | Explicit offline/unavailable/unknown-command states; no queued clinical writes | NEW MOBILE REQUIREMENT — PROPOSED |
| NM05 | Accessible touch/forms/text, narrow/wide layouts and keyboard behavior | NEW MOBILE REQUIREMENT — PROPOSED |
| NM06 | App-switcher/screenshot privacy and restricted logging/backup | NEW MOBILE REQUIREMENT — PROPOSED |
| NM07 | Mobile builds, signing, environment separation and artifact verification | NEW MOBILE REQUIREMENT — PROPOSED |
| NM08 | UTC transport, explicit clinic-time display, locale and date-only handling | NEW MOBILE REQUIREMENT — PROPOSED; clinic time-zone source/locales TBD |

## MVP acceptance and constraints

The pilot must demonstrate F01–F11 for authorized operational and clinical actors using synthetic data, two tenants and real API integration. F12 supplies navigation, not new business analytics. A receptionist must not receive clinical notes; an authorized doctor must not see another tenant's data. A stale approval must fail, and successful approval must be traceable to the reviewed version and controlled clinical handoff.

The pilot must support correction of documentation safely; absence of a defined draft correction or post-AMENDED lifecycle is not an acceptable silent limitation. An outage must distinguish unknown/unavailable information from absent medical facts. Complete API integration, backend policy enforcement, audit evidence and clinical/AI safety evaluation are release gates, not optional polish.

No numeric performance SLO, clinic device baseline, distribution channel, localization set or medical policy is invented. See [decisions](MOBILE-ARCHITECTURE-DECISIONS.md), [testing](MOBILE-TESTING.md) and [release](MOBILE-RELEASE.md).
