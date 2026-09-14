# Mobile API integration

Status: **PROPOSED client integration over existing reference contracts; no API implemented.** Evidence: R04 and R09–R18 in [the reference catalogue](MOBILE-README.md). All paths below are copied from API Contracts. Missing capabilities have identifiers, not invented URLs.

## Availability and contract rules

**No operation is verified as reachable over HTTP.** `H` means an in-process handler exists; `A` means application functions exist without a handler; `P` means persistence/helper evidence only; `D` means documented only. Every row requires **MISSING API — IMPLEMENTATION REQUIRED** work at least at the transport/composition boundary (G01). More specific gaps follow each table.

Shared contract for every operation unless explicitly overridden:

| Concern | Required integration behavior |
|---|---|
| HTTP/JSON | `/api/v1`, JSON bodies, lowercase UUID strings, RFC 3339 UTC timestamps; date-of-birth is a date, not an instant. Preserve absent versus nullable fields |
| Authentication | `Authorization: Bearer <access token>`; the server verifies identity/session. I01/I02 concern the caller's identity, with the special tenant scope below |
| Tenant | For T/P/D/A/C/AI/K operations, active validated membership and target/reference tenant agreement. Tenant-selection transport is **TBD**, not an assumed `X-Tenant-ID` header |
| Authorization | Each row's permission AND resource/relationship/location/need-to-know checks. Labels describe policy; they are not new OAuth scopes or role identifiers |
| Collection response | `data` plus `pagination.next_cursor` and `pagination.has_more`; default limit 20, max 100. Client passes opaque cursors unchanged and resets them on filter/tenant changes. Endpoint sort allowlists and several filters remain incomplete |
| Errors | Canonical `{ error: { code, message, details, request_id } }`; every response has `X-Request-ID`. Safely handle malformed responses, network failure and 500 in addition to each row's documented errors |
| Authentication errors | Every protected operation can return 401. A 403 is denial, not a reason to loop refresh; cross-tenant resource lookup is indistinguishable from 404 |
| Concurrency | Preserve strong ETag byte-for-byte. Send matching `If-Match` for mutable-resource updates and relevant privileged commands. 412 means refetch and renewed human review; no silent merge of clinical content |
| Idempotency | `Idempotency-Key` is opaque, PHI-free, scoped by server to tenant + actor + endpoint + key. Same key/payload replays original result; different payload gives 409 `IDEMPOTENCY_CONFLICT`. Current key validation accepts 1–255 characters; exact per-operation expiry is server configuration |

The API document's per-operation error lists sometimes omit 412 despite its later global concurrency rule. The tables below preserve the explicit lists, with `+OCC` meaning the global 412 requirement also applies. Missing header behavior and the `PRECONDITION_FAILED` code need normalization: current Patient/Tenant code uses 412 for missing/malformed/stale `If-Match`, while the canonical code table omits that code.

Do not generate a client from server domain TypeScript. Prose field names are snake_case, while current in-process contracts use camelCase. There is no executable OpenAPI schema or approved serialization adapter. Resolve this drift and publish examples/schema before binding the mobile DTOs. Do not silently support both wire formats indefinitely.

## Identity and clinic

| ID; method/path; evidence | Request | Success response | Authorization and tenant exception | Error statuses; idempotency/OCC | Mobile use |
|---|---|---|---|---|---|
| I01 `GET /api/v1/me` — H | No body; optional active context transport TBD | Documented 200 `id`, permitted `email`/`phone`, `status`, timestamps. Current handler instead returns `actor`, `membership`, `tenant` | Caller self; documented platform identity does not inherently require a tenant. Current resolver requires exactly one active membership after optional tenant selection | Documented 401; current also 409 `TENANT_CONTEXT_REQUIRED`, 401 `MEMBERSHIP_REQUIRED`/`INVALID_IDENTITY`; no idempotency/OCC | Bootstrap, account, context revalidation |
| I02 `GET /api/v1/me/memberships` — H | No body; collection pagination details TBD | Documented 200 memberships with ID, tenant ID, role, status, timestamps; current bare array has `id,userId,tenantId,role,status`, active memberships only | Caller self; memberships across own tenants, not a tenant directory | 401; no idempotency/OCC | Choose one authorized clinic; labels may require approved enrichment |
| T01 `GET /api/v1/tenants/{tenant_id}` — H | Path tenant UUID | 200 `id,name,status,created_at,updated_at`; strong ETag | Authorized member, administrative fields need clinic-admin authority; path must match authorized context | 401/403/404/422; no idempotency | Current clinic label/status |
| T02 `GET /api/v1/tenants/{tenant_id}/locations` — H | `status,search,limit,cursor`; documented sort allowlist TBD | 200 paginated locations, permitted `id,tenant_id,name,address,phone,status,timestamps`; current handler bare array/camelCase | Authorized member; administrative fields separately permissioned | 401/403/404/422; collection invalid cursor 400; no idempotency/OCC | Location choices for scheduling |

G02 covers the approved login/callback/refresh/logout/revoke capabilities: no concrete Viora method/path/request/response contract or implementation was found. OIDC provider endpoints must come from approved discovery/configuration, not invented application routes. MFA/step-up evidence, application revocation and active-context transport must be established before integration.

## Patient

| ID; method/path; evidence | Request | Success response | Authorization | Error statuses; idempotency/OCC | Mobile use |
|---|---|---|---|---|---|
| P01 `GET /api/v1/patients` — H | `medical_record_number,full_name,date_of_birth,phone,email,limit,cursor`; sorts TBD | 200 paginated field-minimized patient profiles | Authorized staff/doctor/clinic administrator with directory/search access; PATIENT cannot browse directory | 401/403/422/429, cursor 400; no idempotency/OCC | Search/list, patient picker |
| P02 `POST /api/v1/patients` — H | `user_id` if applicable; `medical_record_number,full_name,date_of_birth,sex,phone,email,address,emergency_contact,status` | 201 authorized patient fields + ETag in current handler | Nurse/Clinical Staff, Receptionist, DOCTOR or CLINIC_ADMIN with patient-create permission | 400/401/403/409/422; key required for retryable creation | Register patient |
| P03 `GET /api/v1/patients/{patient_id}` — H | Path patient UUID | 200 permitted profile + ETag in current handler | Staff/clinical operational need-to-know, resource relationship and read permission; self-view exists in reference but patient app is excluded | 401/403/404/422; no idempotency | Patient detail and conflict refresh |
| P04 `PATCH /api/v1/patients/{patient_id}` — H | Allowed changes: `full_name,date_of_birth,sex,phone,email,address,emergency_contact,status`; nonempty subset | 200 permitted updated profile + fresh ETag | Field-specific update permission, same patient relationship | 400/401/403/404/409/422 +OCC; `If-Match` required. Per-endpoint idempotency not required; current function has no key input | Edit profile |

Current create requires every listed field except `userId` to be a nonempty string. Current patch cannot change `userId`, MRN, tenant or clinical content. `sex` and `status` have no closed allowed sets. Do not invent dropdown values, a default active status, optional contact values, MRN generation or account-linking UX. See ADR-M12. `present(patient, context)` is injected; field-level policy must be supplied and verified by backend composition.

P04 has no documented idempotent retry guarantee. The approved global rule permits at most one retry for explicitly idempotent profile updates protected by a key; until a reconciled contract supplies that guarantee, the mobile client does **not** automatically retry P04.

## Doctor information

| ID; method/path; evidence | Request | Success response | Authorization | Error statuses; idempotency/OCC | Mobile use |
|---|---|---|---|---|---|
| D01 `GET /api/v1/doctors` — A | `department_id,location_id,status,search,limit,cursor`; sorts TBD | 200 paginated permitted doctor profiles | Authorized member with profile/scheduling need | 401/403/422/429, cursor 400; none | Doctor picker/list |
| D02 `GET /api/v1/doctors/{doctor_id}` — A | Path doctor UUID | 200 permitted `id,display_name,specialization,bio,status,department_id,location_id` and other authorized fields | Resource/profile permission; license information separately minimized | 401/403/404/422; none | Doctor detail |
| D03 `GET /api/v1/doctors/{doctor_id}/shifts` — A | Date range, `location_id,status,limit,cursor`; current TS uses `from,to` | 200 shifts with `start_time,end_time`, location and status | DOCTOR, Nurse/Clinical Staff, Receptionist, CLINIC_ADMIN according to scheduling permission | 401/403/404/422/429, cursor 400; none | Scheduling context; does not reserve an appointment |

No public department list route is defined despite `listDepartments`. D01 can operate without a department filter; department-name enrichment is optional, not a release blocker. Do not display raw department IDs as names. Doctor editing is later mobile scope; its documented PATCH lacks an application implementation and a final field allowlist.

## Appointment

| ID; method/path; evidence | Request | Success response | Authorization | Error statuses; idempotency/OCC | Mobile use |
|---|---|---|---|---|---|
| A01 `GET /api/v1/appointments` — A | Date range, `doctor_id,patient_id,location_id,status,limit,cursor`; TS range names `from,to` | 200 paginated permitted appointments | Appointment relationship or permitted staff/doctor/admin operational access | 401/403/422/429, cursor 400; none | Agenda, patient appointments, derived queue |
| A02 `POST /api/v1/appointments` — A | `location_id,patient_id,doctor_id,start_time,end_time,reason`, optional permitted `notes` | 201 created appointment; current application starts `PENDING` | Staff/doctor/clinic admin with appointment-create permission; all references same tenant, valid shift/interval | 400/401/403/404/409/422/429; required key | Create appointment |
| A03 `GET /api/v1/appointments/{appointment_id}` — A | Path appointment UUID | 200 permitted scheduling fields/status; mutable representation must expose ETag | Appointment/patient relationship, assigned doctor or operational/admin permission | 401/403/404/422; none | Detail, pre-command refresh |
| A04 `PATCH /api/v1/appointments/{appointment_id}` — A | Allowed `location_id,doctor_id,start_time,end_time,reason,notes`; no arbitrary status or patient substitution | 200 updated appointment + ETag | Authorized staff/assigned doctor/admin, operation-specific permission | 400/401/403/404/409/422 +OCC; `If-Match`, key for retryable reschedule | Edit/reschedule |
| A05 `POST /api/v1/appointments/{appointment_id}/cancel` — A via generic transition | Optional cancellation reason; exact metadata schema TBD; no target-status field | 200 `CANCELLED` appointment | Authorized cancellation actor; only PENDING/CONFIRMED may cancel | 401/403/404/409/422 +OCC; key and current version | Explicit cancellation |
| A06 `POST /api/v1/appointments/{appointment_id}/check-in` — A | No arbitrary status; optional validated metadata schema TBD | 200 `CHECKED_IN` appointment with `checked_in_at` | Check-in permission and CONFIRMED source state | 401/403/404/409/422 +OCC; key and current version | Arrival/check-in |
| A07 `GET /api/v1/appointments/availability` — A | `doctor_id`, optional `location_id`, date/time range; TS `from,to,limit,cursor` | 200 advisory availability. Current port returns intervals with doctor/location/start/end, not a reservation | Authorized scheduling actor | 401/403/404/422/429; none | Choose interval before create/reschedule |

A04–A06 application functions accept version but no idempotency key; cancellation reason is not represented in the generic transition signature. Application invalid transitions currently become `VALIDATION_ERROR`, while API prose says 409. Persistent scheduling/shift/reference checks and atomic idempotency must be wired and tested (G09). `appointmentsOverlap` and a database exclusion constraint do not prove the availability service is complete.

**G03 — MISSING API — IMPLEMENTATION REQUIRED:** confirmation (`PENDING → CONFIRMED`) is needed to reach check-in for newly created appointments. Beginning/ending a scheduled consultation also needs an approved mapping for `CHECKED_IN → IN_PROGRESS → COMPLETED`, including whether Clinical drives these transitions. Their HTTP methods, paths, metadata, response and errors are TBD; require authenticated same-tenant authorized humans, explicit commands, OCC, idempotency and audit. No generic mobile status PATCH is permitted. `NO_SHOW` has `markAppointmentNoShow` and an approved explicit-command direction, but no method/path or precise responsible permission; defer its mobile control until defined.

## Clinical

| ID; method/path; evidence | Request | Success response | Authorization | Error statuses; idempotency/OCC | Mobile use |
|---|---|---|---|---|---|
| C01 `POST /api/v1/encounters` — A | `patient_id,doctor_id`, optional `appointment_id,started_at` per TS; no arbitrary status input | 201 encounter; production initial-state policy needs confirmation (`OPEN` appears in tests) | DOCTOR or authorized Nurse/Clinical Staff with encounter-create permission and patient/appointment/doctor checks | 400/401/403/404/409/422; required key | Start encounter |
| C02 `GET /api/v1/encounters/{encounter_id}` — A | Encounter UUID | 200 permitted encounter references, status and timestamps | Treating relationship/clinical need-to-know and explicit access permission | 401/403/404/422; none | Encounter detail |
| C03 `POST /api/v1/encounters/{encounter_id}/medical-records` — A | `diagnosis,symptoms,clinical_notes,treatment_plan`; creator derived from actor, not accepted as authority | 201 logical medical record + first DRAFT version | Authorized documentation actor and encounter relationship | 400/401/403/404/409/422; required key | Initial human clinical documentation |
| C04 `GET /api/v1/medical-records/{medical_record_id}` — P/private application helper | Record UUID; approved historical version selector name/values TBD | 200 metadata + authorized current version content and ETag requirement | Treating/authorized clinical actor with resource permission | 401/403/404/422; none | Read record and refresh before review/finalize |
| C05 `POST /api/v1/medical-records/{medical_record_id}/review` — A | No status assignment; optional review metadata schema TBD | 200 `IN_REVIEW` record | Clinical review permission | 401/403/404/409/422 +OCC; required key; version binding must be implemented | Submit DRAFT for review |
| C06 `POST /api/v1/medical-records/{medical_record_id}/finalize` — A | Explicit confirmation; optional finalization metadata schema TBD | 200 FINALIZED record + immutable current version | Authorized clinician with finalization permission; HUMAN, required privileged-operation assurance | 401/403/404/409/422 +OCC; required key/current version | Finalize reviewed clinical content |
| C07 `POST /api/v1/medical-records/{medical_record_id}/amendments` — A | New four-field content + required `amendment_reason` | 201 new version + record with updated current version; test demonstrates `AMENDED` | Authorized clinician, amendment permission and clinical relationship | 400/401/403/404/409/422 +OCC; required key/current version | Correct a finalized record |
| C08 `GET /api/v1/patients/{patient_id}/allergies` — D | Patient UUID; approved status/pagination filters TBD | 200 minimized allergies: allergen, reaction, severity, status, timestamps; severity MILD/MODERATE/SEVERE/UNKNOWN | Clinical read permission and relationship (reference also permits patient self-view) | 401/403/404/422; none | Allergy panel in clinical context |

**G04 — MISSING API — IMPLEMENTATION REQUIRED:** enumerate authorized encounters by patient and resolve an encounter's existing medical-record reference, including an appointment's encounter when present. C02 does not promise these associations. Required request concepts: authorized patient/encounter/appointment reference and bounded cursor for collections; response: minimized matching references, status/times and pagination. No method/path/query schema is defined. Authentication, clinical authorization, same-tenant scope and audit are mandatory; missing/forbidden/error semantics must match the canonical model. This is a completion of existing history/navigation capabilities, not a new domain.

**G08:** clinical HTTP/OCC integration, safe correction of an existing DRAFT before finalization, and the lifecycle after AMENDED need owner decisions and implementation. No draft-edit endpoint or AMENDED-to-review/finalize transition is defined. Do not fake edits by creating a second initial record: the schema has one logical record per encounter. Do not infer a subsequent amendment flow that the current guard rejects. Clinical workflow cannot ship as a complete clinical documentation system until these are resolved.

**G10:** C08 has a schema/table and API prose but no allergy application read service or handler found. Lack of data retrieval is an error/unavailable state, never “no allergies.”

## AI and knowledge

| ID; method/path; evidence | Request | Success response | Authorization | Error statuses; idempotency/OCC | Mobile use |
|---|---|---|---|---|---|
| AI01 `POST /api/v1/ai/conversations` — P | Optional `patient_id,context_type,context_id`; approved contexts only | 201 conversation status and permitted context references | AI-assistant permission and attached-resource access | 400/401/403/404/422/429; key for retries | Begin scoped assistance |
| AI02 `POST /api/v1/ai/conversations/{conversation_id}/messages` — P + completion port, no orchestrator | Message content + approved context references; exact DTO names/bounds TBD | 200 validated response or documented 202 processing reference; classification/source/polling schemas TBD | Conversation owner/authorized participant plus clinical context permission | 400/401/403/404/409/422/429; key for retries | Send request, show advisory response |
| AI03 `GET /api/v1/ai/conversations/{conversation_id}` — P | Conversation UUID; approved message pagination TBD | 200 permitted conversation/messages or references; content access/minimization schema TBD | Owner/participant with current context permissions | 401/403/404/422; none | Recover known conversation, reconcile interrupted message |
| AI04 `POST /api/v1/ai/drafts` — A primitives only | `patient_id`, optional `encounter_id`, `draft_type`, approved context/reference input; no arbitrary tools/provider | 201 GENERATED draft or 202 processing reference; exact clinical content/provenance envelope TBD | Draft-generation permission and attached-resource access | 400/401/403/404/422/429; key for retries | Request clinical note draft |
| AI05 `POST /api/v1/ai/drafts/{draft_id}/review` — A | No arbitrary status; current content/version binding schema TBD | 200 REVIEWING draft | Authorized HUMAN reviewer | 401/403/404/409/422; required key, OCC binding to be finalized | Enter recorded review |
| AI06 `POST /api/v1/ai/drafts/{draft_id}/approve` — A transition only | Optional review metadata; strong `If-Match`; verified step-up evidence mechanism TBD | Documented 200 approved draft + controlled Clinical handoff reference; current function only returns draft | Authorized HUMAN clinician, approval permission, patient/encounter relationship, fresh step-up MFA | 401/403/404/409/422 +OCC; required key; never automatic retry | Explicit approval and verified handoff |
| AI07 `POST /api/v1/ai/drafts/{draft_id}/reject` — A | Optional reason; schema TBD | 200 REJECTED draft | Authorized HUMAN reviewer | 401/403/404/409/422; required key, OCC binding to be finalized | Reject reviewed draft |
| K01 `POST /api/v1/ai/knowledge/search` — A | Bounded `query`, permitted filters, result `limit`; current port only query/limit | 200 authorized references/snippets; current outcome maps RESULTS/DENIED/INVALID/FAILED, HTTP mapping absent | Knowledge permission; **tenant-only APPROVED knowledge** in MVP | 400/401/403/422/429; read operation, no idempotency | Supporting retrieval through assistant; no mandatory separate search screen |

Current knowledge port defaults to query ≤2,000 characters, result limit ≤20, snippet ≤2,000 characters. Those are implementation limits, not finalized public quotas. `get_recent_encounters` returns bounded summaries, not clinical notes. The model cannot summarize notes that no authorized loader supplies.

**G05 — MISSING API — IMPLEMENTATION REQUIRED:** load a draft by ID with current content, state, ETag, permitted provenance and resource references; support authorized review edits/resubmission and refetch after stale approval. Only an internal `findById` exists; HTTP method/path, update schema and transition details are absent. Required security: current human/tenant/resource authorization, audit, OCC for edits, explicit idempotency for mutations. Required failure behavior: inaccessible/expired/purged content cannot be approved or silently reconstructed. Scope includes known draft recovery; a separate global draft inbox is later scope.

**G06 — MISSING API — IMPLEMENTATION REQUIRED:** compose conversation ownership, message persistence, context loaders, authorization, risk/output validation, knowledge retrieval, provider completion and draft generation. Safely map internal timeout/cancellation/invalid-response failures to public errors or deferral; exact HTTP mapping/response schema is TBD. No complete path from AI04 to a provider-generated persisted draft is implemented. Any 202 mode additionally requires a documented completion/status capability; no polling URL, SSE or WebSocket contract exists. Proposed MVP default: bounded synchronous request/response, pending backend-owner decision.

**G07 — MISSING API — IMPLEMENTATION REQUIRED:** approval must compare the version the human reviewed, verify step-up, preserve durable idempotency/audit, revalidate clinical references and perform the controlled Clinical handoff. Its atomicity, resulting resource/state and post-approval content purge order are unresolved. Do not equate `APPROVED` with `FINALIZED` or use mobile C03 as a substitute handoff. AI review edit/resubmit rules must be mapped without inventing states.

## Missing backend capability register

| Gap | Owner from reference | Blocks | Closure evidence |
|---|---|---|---|
| G01 HTTP runtime, normalized wire/schema, error envelope, ETags, pagination and rate limits | A/API plus each domain owner | Every operation | Published contract examples/schema, routed handlers, real authenticated HTTP tests |
| G02 Native-compatible auth/session, MFA, revocation, tenant transport, usable permissions/context response | A/Security | Login and every protected feature | Approved native flow; negative JWT/session/tenant tests; two-membership test |
| G03 Appointment confirmation and consultation transition contract | C with B/Product/Security | Create → check-in → consultation continuity | Concrete approved commands, correct transition/OCC/idempotency tests |
| G04 Encounter history and association discovery | B with C | Patient history and reopening existing clinical work | Bounded authorized reads, stable references and navigation contract tests |
| G05 Draft read/recovery/edit/resubmit | D with B | Reliable draft review | Current ETag read; explicit edit transitions, expiry handling and stale review tests |
| G06 Conversation/context/generation orchestration and public AI outcomes | D with A/B | Integrated assistant | End-to-end synthetic request, minimized context, safe failure/deferral and output checks |
| G07 Human approval, audit/purge and Clinical handoff | D/B/A/Security | AI approval | Step-up/version-bound human action; no duplicate handoff; correct clinical reference |
| G08 Clinical mutable-resource OCC, DRAFT corrections and AMENDED lifecycle | B/Clinical/API | Complete clinical workflow | Approved lifecycle and wire semantics; stale-update and immutable-version tests |
| G09 Core persistence composition, related-resource policy, audit, atomic idempotency/scheduling | A/B/C; D where AI affected | Production use of domain operations | Real same/different-tenant HTTP-to-persistence tests, durable audit and replay evidence |
| G10 Allergy read service/HTTP | B | Allergy context | Authorized minimized read, empty versus unavailable cases |

G01–G10 are this mobile audit's gap IDs, not existing issue numbers. No issues were opened.

## Excluded API scope

Existing but not required by the smallest mobile scope: `PATCH /api/v1/tenants/{tenant_id}`, `POST /api/v1/tenants/{tenant_id}/locations`, `PATCH /api/v1/doctors/{doctor_id}`. Clinic/staff/role administration remains a separate product surface; its provisioning must exist outside the mobile MVP. K01 can be called internally by the assistant, so it does not require an independent mobile screen.

No audit CRUD, aggregate dashboard, notification registration, push token, prescription, laboratory, file, billing, rating, patient self-registration or self-booking API is inferred. No direct database/AI provider access is an acceptable replacement for any missing operation.

## Client error and retry policy

| Outcome | Required mobile response |
|---|---|
| 400/422 | Show safe field/request validation; retain only current-session form input; no guessed correction or fabricated clinical value |
| 401 | Coordinate one session recovery where permitted; clear protected state if invalid/revoked; do not replay a clinical/AI approval command automatically |
| 403/404 | Clear inaccessible resource, show non-disclosing denial/unavailable state; no privilege inference or cross-tenant probing |
| 409 | Explicit business resolution for scheduling/status conflict; for key reuse mismatch, do not silently rotate key and resubmit |
| 412 | Refetch authorized resource, show change, require renewed confirmation; prior approval intent is invalid |
| Invalid cursor | Reset query and refetch first page; do not decode/edit cursor; distinguish failure from empty collection |
| 429 | Respect published retry guidance when present; otherwise offer a later user retry; never invent numeric quotas |
| Network loss/timeout after write | Display outcome unknown, stop duplicate submission and reconcile through authorized reads/original key only when contract permits; do not report failed or saved without evidence |
| AI unsafe/invalid/malformed result | Render safe deferral/error without unvalidated clinical content; keep manual authorized workflows usable |
| Unknown enum/missing mandatory field | Safe unsupported-state presentation; disable affected mutation, never coerce to a known approvable state |

Read-only transient retries may be bounded under ADR-M06. Write retries remain operation-specific; all retries recheck actor, tenant, permission and current version. Losing a request key on process death is not permission to create a new duplicate command. A recovery mechanism for unresolved commands is a release prerequisite wherever existing reads cannot reconcile them.
