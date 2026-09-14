# API specification

Contract version 1.0 — Foundation Contract Closure. These are requirements for a new backend, not existing deployed endpoints. Wire ownership is here; fields and lifecycle are in [DOMAIN-MODEL.md](DOMAIN-MODEL.md), trust/audit in [AUTH-SECURITY.md](AUTH-SECURITY.md). Product-gated operations cannot be enabled until the cited BD decisions close.

## Wire rules and endpoint notation

Base origin is environment configuration; paths below include /v1. HTTPS only, UTF-8 application/json, camelCase property names. No alternate snake_case compatibility layer. Id, InstantUTC, DateOnly, Counter, OpaqueETag and resource schemas refer to the domain dictionary. No request body on GET. Unknown request keys are rejected, unknown response keys ignored, missing required fields/malformed known fields fail decoding. Nullable and absent are distinct: PATCH omission means unchanged; null clears a nullable field. Empty PATCH is 422.

Read success envelope is {data:T}; collection envelope is {data:T[],page:{nextCursor:string or null,hasMore:boolean}}. hasMore=true requires a non-null nextCursor; false requires null. Success command responses use WriteReceipt below, not a raw domain object. This consistent technical change allows durable recovery without storing duplicate PHI response bodies. After a write, follow its resource reference with the named read endpoint; do not infer the current resource state from old receipt metadata.

| Notation | Required request headers / authentication |
|---|---|
| Public | Accept:application/json; no bearer; Content-Type on body. Optional X-Request-ID and X-Correlation-ID |
| Self | Public + Authorization:Bearer application access token; no workspace headers |
| WS | Self + X-Workspace-ID:Id + X-Permission-Revision:OpaqueETag. W01 validation is the one exception that does not require a previous permission revision |
| CMD | WS + Idempotency-Key:UUIDv4 + X-Operation-Created-At:InstantUTC. Key generated once per human intent; see recovery |
| OCC | CMD + If-Match:OpaqueETag for the primary mutable resource |
| ASSURE | OCC + X-Assurance-Token bound to action/resource/draft/target versions |

Every response, including errors, has X-Request-ID:UUID and X-Correlation-ID:UUID and Cache-Control:no-store. Server accepts correctly formatted incoming correlation IDs, generates missing/invalid ones, and never treats them as identity or audit proof. These IDs are distinct from an idempotency key. No caller-supplied actor/workspace fields in bodies. Header workspace is checked against the session and every related resource.

Per-row response forms: Read(T), Page(T), Write(type) and error-code additions. All WS rows also inherit the shared error table. Grant names are the exact AUTH-SECURITY permission vocabulary. Optional query parameters not listed are rejected with 400 INVALID_QUERY. No arbitrary sort expressions or filters.

## Error and transport state contract

Error JSON:
~~~json
{"error":{"code":"VALIDATION_ERROR","message":"Check the highlighted fields.","details":{"fields":[{"path":"/fullName","code":"REQUIRED"}],"decisionIds":[]},"requestId":"11111111-1111-4111-8111-111111111111","correlationId":"22222222-2222-4222-8222-222222222222"}}
~~~
details always contains fields (array of {path:JSON-pointer string,code:string}) and decisionIds (string[]); both empty when unused. No rejected values, raw stack traces, PHI or internal provider errors. Unknown field error codes map to a generic validation message.

| HTTP / code | Server meaning | Client action |
|---|---|---|
| 400 INVALID_REQUEST / INVALID_QUERY / INVALID_CURSOR | Malformed JSON, UUID, query or cursor, unsupported header form | Correct request; invalid cursor restarts the same filter from page one |
| 400 AUTH_TRANSACTION_INVALID | Expired/replayed/mismatched login transaction | Fresh login transaction, never resend code |
| 401 UNAUTHENTICATED / SESSION_REVOKED | Invalid/expired access or invalid application session | One eligible read refresh; revoked session always clears immediately |
| 401 REFRESH_REJECTED | Invalid/replayed/expired refresh credential | Clear and interactively login; never retry refresh |
| 403 FORBIDDEN | Same-workspace action/grant denied | Disable action; no refresh loop |
| 403 WORKSPACE_ACCESS_REVOKED | Workspace/membership no longer active | Clear context, refresh memberships |
| 403 ASSURANCE_REQUIRED | Missing/invalid/expired assurance | Start fresh bound step-up; no silent command resubmission |
| 404 RESOURCE_NOT_FOUND / OPERATION_NOT_FOUND | Absent or inaccessible resource; never disclose another workspace's existence | Safe unavailable; operation absence is NOT proof of no execution |
| 409 CONTEXT_STALE | Permission revision changed | Clear feature context, W01, renew confirmation |
| 409 INVALID_STATE / RELATIONSHIP_CONFLICT / RECORD_EXISTS / USE_APPOINTMENT_COMMAND | Domain/state/association precondition failed | Fetch current authorized parent/resource and choose supported flow |
| 409 SCHEDULE_CONFLICT | Interval no longer eligible/free | Refresh availability/appointment, user selects new intent |
| 409 IDEMPOTENCY_CONFLICT / OPERATION_CLOSED | Key bound to different intent or explicitly closed | No retry under this key; new intent only after prior outcome is resolved |
| 409 OPERATION_IN_PROGRESS | Same operation still executing or ambiguous | Resolve by OP02; never another mutation key |
| 410 OPERATION_EXPIRED / RESOURCE_EXPIRED | Operation admission/result window expired or caller-owned AI content expired | No re-execution; report unavailable/verification expired and use authorized resource history |
| 412 VERSION_CONFLICT | Strong validator mismatch, including target-record mismatch | Refetch and re-review; confirmation/assurance invalidated |
| 428 PRECONDITION_REQUIRED | Required If-Match or target-version value absent | Client contract error; no automatic retry |
| 400 INVALID_PRECONDITION | Weak, wildcard, multiple, malformed or conflicting header/body validator | Client contract error |
| 413 PAYLOAD_TOO_LARGE | Technical request cap exceeded | Local correction, no retry |
| 422 VALIDATION_ERROR | Well-formed body violates types, allowlists, bounds or approved business validation | Map field errors; preserve current form securely |
| 429 RATE_LIMITED | Budget/rate exceeded before command admission | Respect Retry-After; explicit write retry only after non-execution is established |
| 503 FEATURE_UNAVAILABLE / AUDIT_UNAVAILABLE / SERVICE_UNAVAILABLE | Policy unset, mandatory audit unavailable, or service unavailable | Disable affected action/show retry; a transport-ambiguous command still needs recovery |
| 502 AI_OUTPUT_REJECTED | Provider output did not pass structural/safety validation | No partial content; manual workflow remains available |
| 504 AI_TIMEOUT | Provider generation deadline reached before publishing a result | Recover operation; no provider fallback |
| 500 INTERNAL_ERROR | Safe unspecified failure | Read failure or unknown command outcome, not assumed rollback |

Authorization happens before returning resource-specific errors. Bad token 401; inaccessible cross-workspace resource 404; then permitted resource/state/version checks. Unsupported ordinary reads still return 403 if action forbidden. Availability/feature error details expose only decisions applicable to the authorized workspace.

Ordinary client call deadline 30 seconds; connect 10 seconds; server ordinary execution deadline 20 seconds. AI generation/message call deadline 75 seconds; server provider/output deadline 60 seconds. Total response body cap 1 MiB and ordinary request cap 256 KiB; larger payload -> 413. Network TLS/hostname errors are terminal transport errors. Invalid success JSON after a command is OutcomeUnknown, never “failed, retry.”

ApiClient disables automatic connection-failure retries and redirects for mutations. GETs may retry once after transient disconnect, 502/503/504, or 429 within a maximum 30-second retry delay. Retry-After is integer seconds or HTTP-date; compare dates to server clock offset. Invalid/missing value -> one-second GET delay; value over 30 seconds -> show availability time and require manual retry, do not ignore it. Cancellation cancels transport only. No auth/mutation/AI automatic retry.

## Pagination, dates and filters

All paginated endpoints accept optional limit integer 1..100 (default 20), cursor string 1..2048. Opaque cursors bind workspace, filter values, sort and permission revision. Change any -> discard cursor. No offset pagination. Fixed stable sort below; concurrent writes may change membership of later pages, so deduplicate IDs and refresh page one for current truth. Arrays not described as pages (locations, permissions, provenance, availability) are bounded embedded collections.

Search q is trimmed 2..100 code points. Omit q to list only on endpoints that allow it; patient directory requires q and returns 400 INVALID_QUERY without it. Requests never include search text in logs or routes.

## Authentication schemas and endpoints

A01 input {purpose:LOGIN or STEP_UP,codeChallenge:base64url S256 (43 chars),challenge:AssuranceBinding or null}; LOGIN requires null challenge. AssuranceBinding={action:record.finalize or draft.approve,workspaceId:Id,resourceId:Id,versionToken:OpaqueETag,targetVersionToken:OpaqueETag or null}. Draft approval requires target token; finalization requires null.
AuthTransaction={transactionId:Id,state:base64url random 32 bytes,expiresAt:InstantUTC,authorizationUrl:HTTPS string up to 4096,redirectUri:HTTPS string up to 2048}.
A02 input {transactionId:Id,code:Text(4096),state:Text(128),codeVerifier:base64url 43 chars}.
TokenBundle={sessionId:Id,userId:Id,accessToken:Text(4096),tokenType:Bearer,accessExpiresAt:InstantUTC,refreshToken:Text(4096),refreshExpiresAt:InstantUTC,serverTime:InstantUTC}.
AssuranceGrant={assuranceToken:Text(4096),expiresAt:InstantUTC,binding:AssuranceBinding}.
RefreshRequest and RevokeRequest={refreshToken:Text(4096)}. Nonempty token/code fields only.

| ID | Method/path | Auth / request / query | Success | Additional behavior |
|---|---|---|---|---|
| A01 | POST /v1/auth/transactions | Public for LOGIN, Self for STEP_UP; A01 input; no query | 201 Read(AuthTransaction) | Five-minute bound transaction; rate limited; step-up authorization checked here |
| A02 | POST /v1/auth/session | Public LOGIN or Self STEP_UP; A02 input | 200 Read(TokenBundle) for LOGIN; Read(AssuranceGrant) for STEP_UP | Stored transaction purpose determines response; reject client attempt to switch purpose |
| A03 | POST /v1/auth/refresh | Public; RefreshRequest; no bearer/interceptor | 200 Read(TokenBundle) | Rotates application refresh family; REFRESH_REJECTED on failure |
| A04 | POST /v1/auth/revoke | Public; RevokeRequest; credential proves session | 204 empty | Idempotent family revocation; unknown/already revoked token also 204, no validity oracle |
| A05 | GET /v1/me | Self; no body/query | 200 Read(User), X-Server-Time:InstantUTC | No workspace permissions; active user only |
| A06 | GET /v1/workspaces | Self; limit,cursor only; name ascending then id | 200 Page({workspace:WorkspaceSummary,membership:Membership}) | Current user's memberships only, including unavailable status for selection UI |
| W01 | GET /v1/workspaces/{id} | Self + X-Workspace-ID equal path; no prior permission revision needed | 200 Read(WorkspaceContext), ETag=membership.permissionRevision, X-Server-Time | Active authorized context only; not a workspace mutation |

No endpoint accepts provider tokens as application access tokens. Every body schema above is exact; endpoints have no other query parameters.

## Patient, doctor and scheduling endpoints

Dates from/to below are InstantUTC, inclusive from/exclusive to. Appointment list requires both with range <=31 days; availability and shifts require both with range <=7 days. List windows describe queried rows, not all-time totals.

| ID | Method/path | Auth / permission | Query or body | Success |
|---|---|---|---|---|
| P01 | GET /v1/patients | WS / patient.read | q required, limit,cursor; fullName then id ascending | 200 Page(Patient) |
| P02 | POST /v1/patients | CMD / patient.create | PatientCreate | 201 Write(PATIENT); BD-02 |
| P03 | GET /v1/patients/{id} | WS / patient.read | None | 200 Read(Patient), ETag |
| P04 | PATCH /v1/patients/{id} | OCC / patient.update | PatientPatch | 200 Write(PATIENT); BD-02 |
| D01 | GET /v1/doctors | WS / doctor.read | q optional, locationId optional, status optional Doctor status, limit,cursor; displayName then id ascending | 200 Page(Doctor) |
| D02 | GET /v1/doctors/{id} | WS / doctor.read | None | 200 Read(Doctor) |
| D03 | GET /v1/doctors/{id}/shifts | WS / doctor.read | from,to required; locationId optional; limit,cursor; startsAt then id ascending | 200 Page(Shift), ACTIVE shifts only |
| AP01 | GET /v1/appointments | WS / appointment.read | from,to; optional doctorId,patientId,locationId,status; limit,cursor; startsAt then id ascending | 200 Page(Appointment) |
| AP02 | POST /v1/appointments | CMD / appointment.create | AppointmentCreate | 201 Write(APPOINTMENT); BD-03 |
| AP03 | GET /v1/appointments/{id} | WS / appointment.read | None | 200 Read(Appointment), ETag |
| AP04 | PATCH /v1/appointments/{id} | OCC / appointment.reschedule | AppointmentPatch | 200 Write(APPOINTMENT); BD-03 |
| AP05 | POST /v1/appointments/{id}/confirm | OCC / appointment.confirm | {} | 200 Write(APPOINTMENT) |
| AP06 | POST /v1/appointments/{id}/cancel | OCC / appointment.cancel | {} | 200 Write(APPOINTMENT); BD-03 |
| AP07 | POST /v1/appointments/{id}/check-in | OCC / appointment.checkIn | {} | 200 Write(APPOINTMENT); BD-03 |
| AP08 | POST /v1/appointments/{id}/start | OCC / appointment.start + encounter.start | {encounterId:Id,encounterVersionToken:OpaqueETag} | 200 Write(APPOINTMENT), related ENCOUNTER; both preconditions atomic |
| AP09 | POST /v1/appointments/{id}/complete | OCC / appointment.complete + encounter.complete | {encounterId:Id,encounterVersionToken:OpaqueETag} | 200 Write(APPOINTMENT), related ENCOUNTER; BD-04 |
| AP10 | POST /v1/appointments/{id}/no-show | OCC / appointment.noShow | {} | 200 Write(APPOINTMENT); BD-03 |
| AP11 | GET /v1/appointments/availability | WS / appointment.read + doctor.read | doctorId,locationId,from,to required; no cursor/limit | 200 Read({windows:AvailabilityWindow[],checkedAt:InstantUTC}); max 200 windows, 422 VALIDATION_ERROR with /to field code RANGE_TOO_WIDE if exceeded; BD-03 |

Literal availability route takes precedence over {id}. All supplied IDs must be authorized within selected workspace, regardless of field names. AP08/AP09 return new validators for both resources; a stale related encounter produces 412 without either transition. Client retrieves both resources after conflict.

## Clinical endpoints

| ID | Method/path | Auth / permission | Query or body | Success |
|---|---|---|---|---|
| CL01 | POST /v1/encounters | CMD / encounter.create | EncounterCreate, including nullable related appointment token | 201 Write(ENCOUNTER); related APPOINTMENT when linked, with updated encounterId/ETag |
| CL02 | GET /v1/encounters/{id} | WS / encounter.read | None | 200 Read(Encounter), ETag |
| CL03 | POST /v1/encounters/{id}/start | OCC / encounter.start | {} | 200 Write(ENCOUNTER); standalone only |
| CL04 | POST /v1/encounters/{id}/complete | OCC / encounter.complete | {} | 200 Write(ENCOUNTER); standalone, BD-04 |
| CL05 | POST /v1/encounters/{id}/cancel | OCC / encounter.cancel | {} | 200 Write(ENCOUNTER); standalone, BD-04 |
| CL06 | GET /v1/patients/{id}/encounters | WS / encounter.read | limit,cursor; createdAt then id descending | 200 Page(Encounter) |
| CL07 | POST /v1/encounters/{id}/records | OCC / record.create | ClinicalCreate; If-Match is the parent encounter ETag | 201 Write(RECORD), related ENCOUNTER with updated recordId/ETag |
| CL08 | PATCH /v1/records/{id} | OCC / record.edit | ClinicalEdit | 200 Write(RECORD) |
| CL09 | POST /v1/records/{id}/review | OCC / record.review | {} | 200 Write(RECORD); BD-04 |
| CL10 | POST /v1/records/{id}/reopen | OCC / record.edit | {} | 200 Write(RECORD) |
| CL11 | POST /v1/records/{id}/finalize | ASSURE / record.finalize | {} | 200 Write(RECORD); BD-04 |
| CL12 | POST /v1/records/{id}/amend | OCC / record.amend | ClinicalAmend | 201 Write(RECORD), related RECORD_VERSION; BD-04 |
| CL13 | GET /v1/records/{id}/versions | WS / record.read | limit,cursor; version descending | 200 Page(RecordVersion) |
| CL14 | GET /v1/records/{id} | WS / record.read | None | 200 Read(ClinicalRecord), ETag |
| CL15 | GET /v1/records/{id}/versions/{versionId} | WS / record.read | None | 200 Read(RecordVersion), immutable, no editable ETag |

CL01 atomically validates a linked appointment token and sets its encounterId; 428/400/412 apply to missing/malformed/stale related token. Standalone creation requires null appointmentId and appointmentVersionToken. The receipt exposes both new validators when linked.

Successful content saves append versions; lifecycle-only commands do not create content duplicates. CL11 also requires the currently reviewed content per domain lifecycle; assurance alone cannot satisfy clinical policy.

## AI endpoints — synchronous MVP

| ID | Method/path | Auth / permission | Query or body | Success |
|---|---|---|---|---|
| AI01 | GET /v1/ai/conversations | WS / assistant.use | limit,cursor; updatedAt then id descending | 200 Page(Conversation), current owner only |
| AI02 | POST /v1/ai/conversations | CMD / assistant.use | ConversationCreate | 201 Write(CONVERSATION) |
| AI03 | GET /v1/ai/conversations/{id} | WS / assistant.use | None | 200 Read(Conversation) |
| AI04 | GET /v1/ai/conversations/{id}/messages | WS / assistant.use | limit,cursor; createdAt then id ascending | 200 Page(Message); public roles only |
| AI05 | POST /v1/ai/conversations/{id}/messages | CMD / assistant.use | MessageCreate | 200 Write(MESSAGE), primary assistant message and related user message; synchronous complete response only |
| AI06 | POST /v1/ai/drafts | CMD / draft.generate + record.read | DraftGenerate | 201 Write(AI_DRAFT), completed generation; target version precondition |
| AI07 | POST /v1/ai/drafts/{id}/review | OCC / draft.review | {} | 200 Write(AI_DRAFT) |
| AI08 | POST /v1/ai/drafts/{id}/approve | ASSURE / draft.approve + record.edit | {targetRecordId:Id,targetVersionToken:OpaqueETag}; exact match to bound draft target | 200 Write(AI_DRAFT), related RECORD and RECORD_VERSION, handoff required |
| AI09 | POST /v1/ai/drafts/{id}/reject | OCC / draft.reject | DraftReject | 200 Write(AI_DRAFT) |
| AI10 | GET /v1/ai/drafts/{id} | WS / draft.read | None | 200 Read(AiDraft), ETag |
| AI11 | PATCH /v1/ai/drafts/{id} | OCC / draft.edit | DraftEdit | 200 Write(AI_DRAFT) |
| AI12 | GET /v1/ai/conversations/{id}/messages/{messageId} | WS / assistant.use | None | 200 Read(Message); owning conversation/context must still be authorized |
| AI13 | GET /v1/ai/drafts | WS / draft.read + record.read | targetRecordId required; status optional AiDraft status; limit,cursor; createdAt then id descending | 200 Page(AiDraft), only currently authorized drafts for the target; expired content excluded |

AI responses never return 202, streaming fragments, a polling job or a client-selectable provider. Operation recovery is receipt lookup for an interrupted synchronous command, not an asynchronous AI job API. BD-01/BD-05 gate AI use; return no raw provider failure. Conversation content not yet committed is not represented as an assistant message. Client may keep its unsent text locally under storage policy.

## Version semantics

For a mutable resource read, header ETag equals its body versionToken exactly, including quotes. The client stores them as one value. Missing/unequal values mean invalid response and actions stay disabled. A write's ETag equals its primary ResourceRef.versionToken, except immutable/message/conversation references that have null versionToken and no ETag. CL07 consumes parent ETag but returns the newly created record's token.

If-Match accepts exactly one strong opaque validator. Missing -> 428; malformed/weak/*/multiple -> 400; stale -> 412. Related-resource tokens in command bodies follow the same rules. Version comparison, state validation and mutation are atomic. Every mutable resource change generates a new token, even when currentVersion is unchanged. currentVersion is the immutable clinical-content counter and is never used as If-Match.

## Idempotency and operation recovery

This section replaces ambiguous “search to see whether create succeeded.” No PHI payload is persisted on the phone for retries.

ResourceRef={type:PATIENT or APPOINTMENT or ENCOUNTER or RECORD or RECORD_VERSION or CONVERSATION or MESSAGE or AI_DRAFT,id:Id,parentId:Id or null,versionToken:OpaqueETag or null}. parentId is recordId for RECORD_VERSION and conversationId for MESSAGE, otherwise null.

WriteReceipt={operationId:Id,state:SUCCEEDED,primary:ResourceRef,related:ResourceRef[],handoff:HandoffEvidence or null,committedAt:InstantUTC,expiresAt:InstantUTC}. Success is Read(WriteReceipt); original success status 200/201 is retained on replay. Non-handoff commands set handoff=null. A successful read of current data may have a newer ETag than the receipt; never display the receipt as current content.

OperationStatus={operationId:Id,state:PROCESSING or SUCCEEDED or FAILED or CLOSED or INDETERMINATE,result:WriteReceipt or null,errorCode:string or null,createdAt:InstantUTC,expiresAt:InstantUTC or null}. SUCCEEDED requires result; other states require null. FAILED/CLOSED prove no application/domain commit. INDETERMINATE explicitly does not. CLOSED errorCode=OPERATION_CLOSED; FAILED has a public error code; PROCESSING/INDETERMINATE errorCode=null. expiresAt is null while nonterminal; otherwise it equals the settlement time plus 24 hours. SUCCEEDED errorCode is null. A success receipt expiresAt equals committedAt plus 24 hours. These receipts contain IDs/versions only, no clinical/prompt/request content.

| ID | Method/path | Request | Response / meaning |
|---|---|---|---|
| OP01 | GET /v1/operations | WS; limit,cursor, state optional PROCESSING or INDETERMINATE or SUCCEEDED or FAILED or CLOSED; createdAt descending then operationId | 200 Page(OperationStatus), current actor/workspace only; nonterminal plus retained terminal receipts |
| OP02 | GET /v1/operations/{operationId} | WS; no body/query | 200 Read(OperationStatus); 404 OPERATION_NOT_FOUND means unknown, never a proven failed mutation |
| OP03 | POST /v1/operations/{operationId}/close | WS + X-Operation-Created-At original timestamp; {} | 200 Read(OperationStatus). Atomic close-if-not-admitted, or return actual terminal/PROCESSING/INDETERMINATE state; inherently idempotent, no new operation key |

Key ownership is actor + workspace + Idempotency-Key, immutably bound to method, concrete path and canonical intent fingerprint. No reuse on another endpoint/resource. Payload hash is a comparator, never an additional identity dimension. Fingerprint includes the canonical parsed JSON body (sorted object keys, preserved array order and string content), If-Match/related version tokens and original operation timestamp; excludes bearer/assurance/correlation IDs. Same key/same intent -> original receipt/status with Idempotency-Replayed:true; different intent -> 409 IDEMPOTENCY_CONFLICT. Replay is authorized again and may return 403/404 rather than expose revoked resource references. After current identity/workspace/resource authorization and fingerprint comparison, return an already committed receipt before rechecking current lifecycle/ETags or consuming assurance. ASSURE replay still supplies the header but need not obtain a new grant for an already committed operation. Replays never append a second clinical version or approval event.

For an authorized new command with valid operation identity, parse/canonicalize the body and bind its fingerprint before domain validation. A deterministic validation/state/version/policy rejection records FAILED with its public error code and returns the listed HTTP error. An existing key is looked up first: a rejected repeat cannot overwrite a prior success or pending result. Malformed identity/JSON, authentication denial or rate limiting may precede admission; use OP02/OP03 before treating an unresolved locally recorded intent as closed. Same-key FAILED repeats return the recorded error/status; pending repeats return 409 OPERATION_IN_PROGRESS. This makes a corrected, newly confirmed form a new key only after the previous intent is resolved.

Backend creates durable PROCESSING before side effects. Mandatory audit and domain/result commit are atomic; failures before commit become FAILED. A server crash must reconcile its own transaction evidence before marking FAILED; uncertain remote/provider activity remains INDETERMINATE. Repeating the command cannot dispatch a second generation or handoff while pending.

Android sets X-Operation-Created-At from server-time-adjusted clock and stores it in the receipt. New admission accepts timestamps within the last 24 hours and at most 60 seconds in the future. The timestamp cannot grant authority; it only bounds replay admission. A request older than that returns 410 OPERATION_EXPIRED even if its receipt was purged. Client never changes timestamp or key to revive the same intent. Nonterminal operation metadata is never expired while effects are uncertain. Terminal reference retention is 24 hours for recovery; broader audit/clinical retention remains BD-05. Do not retain duplicate payload bodies for idempotency.

On a transport timeout after possible send, persist OutcomeUnknown and call OP02. Poll pending status every two seconds for at most 30 seconds while foreground, then offer “Check outcome” manually. No background polling worker. On OPERATION_NOT_FOUND, OP03 can establish a CLOSED tombstone under the same atomic admission lock; any late original request then receives OPERATION_CLOSED. If original work was admitted first, close must return PROCESSING/actual outcome and cannot claim cancellation. OP03 accepts only the original correctly formatted timestamp; a mismatched known timestamp is 409 IDEMPOTENCY_CONFLICT. An expired admission window returns 410 OPERATION_EXPIRED, without claiming the original operation failed. Keep the tombstone through the admission window; no clinical/provider side effect may bypass admission.

On process death, restore only encrypted receipt metadata, authenticate, select matching workspace and resolve; never reconstruct/resubmit the body. On logout receipts are cleared; after next login OP01 exposes current actor/workspace outstanding work before another sensitive mutation. Unavailable/expired history is explicitly “outcome cannot be verified”; do not declare failure or automatically generate a new intent. If receipt creation reached neither server admission nor local persistence, no request was permitted to be sent.

After FAILED or CLOSED, a new explicit user intent may receive a new key. After SUCCEEDED, fetch the result resource and show success once. A new key is never a workaround for PROCESSING/INDETERMINATE/unknown outcome. Rescheduling after a resolved conflict is a new reviewed intent, not a retry with edited payload.

## Worked transport examples

Synthetic patient creation P02 is gated by BD-02 in a real environment. Illustrative request:
~~~json
{"medicalRecordNumber":null,"fullName":"Synthetic Patient","dateOfBirth":"1990-01-01","sex":null,"phone":null,"email":null,"address":null,"emergencyContact":null}
~~~
These nullable schema values do not imply approval of the clinic's required-field policy.

Record edit CL08 requires a strong If-Match such as "rec-7" and a fresh operation key. Body:
~~~json
{"content":{"diagnosis":"","symptoms":"Synthetic text","clinicalNotes":"","treatmentPlan":""}}
~~~
A successful WriteReceipt references the new record validator; follow CL14 before another command. A body literal currentVersion=7 is never a substitute precondition.

AI08 success must carry handoff evidence with matching primary draft token and related record/version references. A syntactically valid 200 missing that evidence is OutcomeUnknown and invokes OP02; mobile cannot create a replacement clinical record to compensate.

## Compatibility

/v1 changes are additive optional response fields only unless jointly versioned. Changing required fields, enum transition meaning, permission semantics, type/nullability, errors or command behavior requires a new negotiated contract version and fixtures before rollout. Unknown actions/statuses disable dependent controls. No dual snake/camel parser, invented endpoint fallback or implicit provider failover is supported.
