# Screen interaction contract

This owns routes and interaction. [USER-FLOWS.md](USER-FLOWS.md) owns sequences; domain fields and API schemas are referenced rather than duplicated.

## Shared interaction rules

Route Id parameters are validated lowercase UUIDs. Unknown enum, malformed ID, missing required reference or extraneous argument is rejected to a safe Back/unavailable state before network access. All protected routes require a validated session/workspace. IDs are context references, never authorization. The only external entry besides the launcher is the validated OAuth callback; no public patient/record deep links.

Each server screen starts Loading, then Content or Empty. A network failure is Failure, not Empty. Read Retry repeats the same authorized query with bounded API policy; inaccessible content is PermissionDenied/Unavailable with Back, never a sign-in loop. Missing configuration/policy disables dependent actions. Responses with missing security/state/version fields cannot enable a mutation.

Forms use domain allowlists and workspace masks. Show inline validation with focus moved to the first error and an accessibility announcement; do not echo raw server input. Every write shows Submitting then a verified receipt and follow-up read, or OutcomeUnknown with S25. Failed follow-up read after a successful receipt means “Saved; current details unavailable,” not permission to resubmit. Row success destinations apply after refetch, unless access was revoked.

Dirty forms use Stay/Discard for voluntary exit; network loss alone retains their memory state. Forced logout/revocation clears immediately. All resource mutations require explicit confirmation where clinical/destructive. No automatic write on navigation, composition or browser return. Duplicate taps are ignored while an intent is unresolved.

All controls have semantics labels, 48dp targets and system text scaling. Loading/status changes announce succinctly; focus returns to the originating action after a sheet closes. Error copy uses safe client messages and a request ID, never backend diagnostics. PHI privacy cover/capture/text-input behavior comes from DATA-STORAGE.

## Routes and screen behavior

“Standard read” below includes Loading/Empty/read Retry/Denied rules above. “Standard form” includes domain validation, dirty exit, conflict review, disabled duplicate submit and S25 recovery. Parenthesized inputs are the entire route contract; optional inputs default null.

| ID / route and inputs | Entry, data and components | Actions, success and exit | Specific empty/error/validation/recovery |
|---|---|---|---|
| S00 session/restore (none) | Launcher, process death or context revalidation; neutral progress, no PHI | SessionCoordinator A03/A05/A06; success S02/S03; invalid credentials S01 | Offline -> Retry or local logout; never unlock from cached permissions |
| S01 auth/login (none) | SignedOut; explanation, Sign in and safe error | Start F01; success S02/S03; Back backgrounds app | Browser cancel -> idle; mismatch/expiry -> new transaction; no embedded password form |
| S02 workspace/select (none) | A06 pages, workspace name/status; only own memberships | Select W01 then S03; logout S01 | Zero memberships -> no-access message; unavailable membership disabled; Retry list |
| S03 main/dashboard (none) | Valid workspace, name/date, AP01 current day, shortcuts/upcoming appointments | Four tab roots, S12, Home context | No appointments -> empty day. Partial page never an aggregate or queue position |
| S04 patients/list (pickerHandle:Id optional) | Search field, q in memory, P01 result rows/name/MRN | S06 result normally; in picker mode return patient ID to the matching live form; S05 create only outside picker | Invalid/dead picker handle returns S10 without restoring a form. Before two chars -> search hint, not empty directory. q change cancels old results; 422/400 safe correction |
| S05 patients/create (none) | Domain PatientCreate fields; permitted masks and BD-02 | P02 -> receipt -> P03 -> S06; discard -> S04 | Standard form; unresolved policy disables Submit; no invented MRN/default status |
| S06 patients/detail (id:Id) | P03 authorized profile; separate AP01 current-day and CL06 history sections | S07 edit; S11 appointment; S21 encounter; S26 patient assistant; Back | Section failures separate from no appointments/history; unavailable patient clears content |
| S07 patients/edit (id:Id) | P03 and current token; only permitted mutable fields | P04 -> P03 -> S06; discard -> S06 | Standard form; cannot change MRN/owner; null-clearing only nullable authorized fields |
| S08 doctors/list (pickerHandle:Id optional) | S10 toolbar or appointment picker; D01 directory/search/filter | S09; pick returns doctor ID to live matching form handle | Standard read; dead picker handle cancels to S10, never restores a form after process death |
| S09 doctors/detail (id:Id, pickerHandle:Id optional) | D02 profile and bounded D03 shift range | Back; choose doctor for matching picker | Inactive status readable, eligibility determined by server; shifts never promise a free slot |
| S10 appointments/list (patientId:Id optional) | Schedule tab or S06; date/status/doctor/location filters, AP01 | S12, S11, S08 toolbar | Default current clinic day; empty range distinct from failure; no doctor tab or inferred queue order |
| S11 appointments/create (patientId:Id optional, doctorId:Id optional) | S04 patient/S08 doctor pickers using in-memory handles, Workspace.locations, local date/time, reason/notes | AP11 check, AP02 -> AP03 -> S12; cancel -> origin | Standard form; date DST ambiguity requires offset choice; 409 reselect interval; availability not a reservation |
| S12 appointments/detail (id:Id) | AP03 current version, patient/doctor labels from separately authorized reads | S13, confirm/cancel/check-in; S21 or linked S14; completion via F14 | Actions from Access + domain state; nonterminal recovery S25; cannot assign status directly |
| S13 appointments/edit (id:Id) | AP03 editable scheduling fields with current token | AP04 -> AP03 -> S12 | Standard form; patient immutable; version conflict discards approval, not silently merges |
| S14 clinical/encounter (id:Id) | CL02, patient/context badge and record link/status | Start if OPEN via CL03/AP08; explicit CL07 if record absent; S15; S26; complete/cancel per lifecycle | No record -> explicit create option only; linked cancellation disabled until BD-04; refetch both linked resources after transition |
| S15 clinical/record (id:Id) | CL14 current content/review status and version, context; AI13 target draft list when permitted | S16 EDIT; CL09; CL10 reopen; CL11 via S24; S16 AMEND; S22 history; AI06 new draft or existing draft S19 | Current FINALIZED is read-only. AI generation only existing DRAFT. 412 -> fresh review; successful approval does not finalize |
| S16 clinical/record/edit (id:Id, mode:EDIT or AMEND) | CL14, ClinicalContent fields; AMEND adds reason | EDIT CL08 or AMEND CL12 -> CL14 -> S15 | Standard form; AMEND requires FINALIZED and BD-04; empty content may save draft but never asserts final completeness |
| S17 assistant/home (none) | AI01 current owner's conversation metadata | S26 new; S18 existing | Empty -> new conversation. Expired entries unavailable, not silently recreated |
| S18 assistant/conversation (id:Id) | AI03 immutable context, AI04 public messages, composer | AI05 -> AI12 -> append response; generation through F16 when an authorized DRAFT target exists | One request at a time; cancel means stop waiting, S25 for uncertainty; no partial answer, unsafe HTML or SYSTEM/TOOL content |
| S19 assistant/draft (id:Id) | AI10 + CL14 target, provenance and content comparison | AI07 review; AI11 edit; AI09 reject; S24 then AI08 -> verified target S15 | Standard form while editing; GENERATED cannot approve. Missing provenance/expired/target conflict stops approval; new generation explicit |
| S20 account (none) | A05 identity and current workspace; Home/switch/logout | Switch clears -> S02; logout clears -> S01 | Logout always locally available; show remote-revocation confirmation separately from local completion |
| S21 clinical/encounter/create (patientId:Id, appointmentId:Id optional) | S06/S12; validate patient and optional AP03, authorized doctor selection | CL01 then CL03 standalone/AP08 linked; read CL02 -> S14 | Each step has separate key; if encounter created but start fails, open existing OPEN encounter instead of create again |
| S22 clinical/record/history (recordId:Id) | S15; CL13 immutable version list | Select S23; Back S15 | Standard read; version list empty on existing record is invalid response, not “no medical history” |
| S23 clinical/record/version (recordId:Id, versionId:Id) | CL15 historical content, author/time/reason/provenance reference | Read-only Back S22/current S15 | No edit/approve action, no mutable ETag fabricated |
| S24 auth/step-up (challengeHandle:Id) | In-memory bound command context owned by SessionCoordinator | Browser A01/A02; return to origin for refetch and renewed confirmation | Missing/dead handle -> cancel to origin; no secret/token/ETag in route; callback never submits command |
| S25 operations/outcome (operationId:Id) | Current owner's receipt or OP01 result; OP02 safe status | Check; OP03 close-if-not-admitted; follow result read; return origin | Pending/indeterminate never “failed.” Expired/inaccessible -> verification unavailable, no automatic new intent |
| S26 assistant/conversation/create (kind:GENERAL or PATIENT or ENCOUNTER, patientId:Id optional, encounterId:Id optional) | S17/S06/S14; context confirmation from authorized reads | AI02 -> AI03 -> S18; Back cancels | GENERAL forbids both IDs; PATIENT requires patient only; ENCOUNTER requires both and matching relationship |

No screen embeds clinical business required-field rules locally before BD decisions close. Backend Access and field masks never excuse a missing server check. Safe fixture mode may demonstrate disabled/error states without pretending policy approval.

## Result routing

ResourceRef types map to reads and routes: PATIENT -> P03/S06; APPOINTMENT -> AP03/S12; ENCOUNTER -> CL02/S14; RECORD -> CL14/S15; RECORD_VERSION with parent record -> CL15/S23; CONVERSATION -> AI03/S18; MESSAGE with parent conversation -> AI12/S18; AI_DRAFT -> AI10/S19. Refetch under current permissions; a receipt is not an access grant. AI approval specifically follows its handoff record reference after validating receipt consistency.

A delayed event can navigate only when its destination handle and auth/context epochs still match. A user on another workspace/tab receives no forced redirection from an old operation.
