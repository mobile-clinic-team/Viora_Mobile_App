# Domain model and lifecycle

This is the authoritative field dictionary. API schemas reference these types; screens must not create competing entities. These are explicit technical modeling choices for the existing MVP. Product-specific validation and grants remain [BD-01 through BD-05](PRODUCT-SPEC.md).

## Dictionary conventions

All JSON properties listed are required unless marked optional-key. Nullable means an explicit null is a valid representation; it does not authorize disclosure or satisfy a business-required-field policy. Create/PATCH allowlists are below. Server-generated ownership fields can never be mass-assigned.

| Type | Wire definition / constraint |
|---|---|
| Id | Lowercase canonical UUID string, server-generated for domain resources. Android generates UUIDv4 only for request, correlation and operation IDs |
| InstantUTC | RFC 3339 string YYYY-MM-DDTHH:mm:ss.SSSZ; UTC only; java.time.Instant on client. Server owns creation/update/action timestamps |
| DateOnly | Strict Gregorian YYYY-MM-DD; use LocalDate, never timezone-convert a birth date |
| ZoneId | IANA timezone string, e.g. Asia/Ho_Chi_Minh; invalid zone fails decoding. Workspace owns scheduling display zone |
| Text(n) | Unicode string of at most n code points; no NUL/control characters except newline/tab in long text. Trim outer whitespace for short input, preserve clinical text/newlines |
| Counter | Positive signed-64-bit integer encoded as decimal string, no leading zero; display/reference only, never an ETag |
| OpaqueETag | Strong quoted HTTP validator, up to 128 ASCII characters; exact header value also appears as versionToken. No weak/W/ validator, client arithmetic or parsing |
| AppointmentStatus | PENDING, CONFIRMED, CHECKED_IN, IN_PROGRESS, COMPLETED, CANCELLED or NO_SHOW; exact case-sensitive wire strings |
| PermissionCode | Case-sensitive code defined by AUTH-SECURITY; unknown code grants nothing |
| Access | {allowedActions: PermissionCode[]} intersected with workspace grants, resource relationship, state and configured policy; calculated by server |
| ClinicalContent | {diagnosis:Text(16000), symptoms:Text(16000), clinicalNotes:Text(16000), treatmentPlan:Text(16000)}. Empty strings allowed in saved drafts; final completeness is BD-04 |
| EmergencyContact | {name:Text(200), phone:Text(40), relationship:Text(100) or null}; null for the entire object is supported |

Embedded technical bounds: Workspace.locations at most 200; permission/action/field-mask arrays at most 128 unique entries each; blockedDecisionIds at most 32; Doctor locationIds at most 200; provenance at most eight (clinical-draft minimum is owned by AI-ASSISTANT-SPEC). Oversized known fields fail decoding; do not silently truncate permissions or clinical content.

Time intervals are half-open [startsAt,endsAt), finite and strictly startsAt < endsAt. API bounds limit query size; business scheduling eligibility remains BD-03. Client converts local scheduling inputs through the workspace zone; DST gaps are rejected and overlaps require choosing one offset. Send only the resulting UTC instants. Never infer the clinic zone from the phone.

## Resource fields

“Mutable base” means {id:Id, workspaceId:Id, versionToken:OpaqueETag, access:Access, createdAt:InstantUTC, updatedAt:InstantUTC}. OpaqueETag is transport concurrency metadata, not a persisted client model version.

| Resource | Exact additional fields / base | Ownership, relationships and status |
|---|---|---|
| User | {id:Id, displayName:Text(200), email:Text(254) or null, status:ACTIVE or DISABLED} | Server identity; no global permission list. Disabled cannot maintain an application session |
| WorkspaceSummary | {id:Id, name:Text(200), status:ACTIVE or SUSPENDED or ARCHIVED} | Server-managed clinic; directory only for current user's memberships |
| Location | {id:Id, name:Text(200), status:ACTIVE or INACTIVE} | Nested in authorized Workspace; immutable parent workspace, no mobile editing |
| Workspace | WorkspaceSummary + {timezone:ZoneId, locations:Location[]} | Location list includes inactive labels for existing appointments; only eligible active locations are selectable |
| Membership | {id:Id, userId:Id, workspaceId:Id, role:CLINIC_ADMIN or DOCTOR or NURSE or RECEPTIONIST, status:ACTIVE or SUSPENDED or REVOKED, permissionRevision:OpaqueETag} | Unique active membership per (userId,workspaceId), one role per membership. Grant management is server-only |
| WorkspaceContext | {workspace:Workspace, membership:Membership, permissions:PermissionCode[], patientReadableFields:string[], patientWritableFields:string[], blockedDecisionIds:string[]} | Arrays are allowlists, not permission grants by arbitrary names; workspace matches selected header. patientWritableFields is a subset of patientReadableFields and the command allowlist |
| Patient | Mutable base + {medicalRecordNumber:Text(80), fullName:Text(200)}; optional-key demographic fields below | Workspace-owned, not a login account. MRN business allocation/uniqueness is BD-02 |
| Patient demographic fields | dateOfBirth:DateOnly or null, sex:Text(64) or null, phone:Text(40) or null, email:Text(254) or null, address:Text(1000) or null, emergencyContact:EmergencyContact or null, status:Text(64) | Keys omitted when not authorized. If authorized, keys are present and nullable exactly as shown. Known sex/status catalogue and field-required policy are BD-02 |
| Doctor | {id:Id, workspaceId:Id, displayName:Text(200), specialization:Text(200) or null, departmentName:Text(200) or null, locationIds:Id[], status:ACTIVE or INACTIVE or SUSPENDED, bio:Text(2000) or null, access:Access} | Directory projection; no separate Department entity or mobile doctor editing |
| Shift | {id:Id, workspaceId:Id, doctorId:Id, locationId:Id, startsAt:InstantUTC, endsAt:InstantUTC, status:ACTIVE or CANCELLED} | Read-only server schedule; not a booking guarantee |
| Appointment | Mutable base + {patientId:Id, doctorId:Id, locationId:Id, startsAt:InstantUTC, endsAt:InstantUTC, status:AppointmentStatus, checkedInAt:InstantUTC or null, reason:Text(1000) or null, notes:Text(4000) or null, encounterId:Id or null} | Related resources belong to workspace. One appointment can link to at most one encounter |
| AvailabilityWindow | {doctorId:Id, locationId:Id, startsAt:InstantUTC, endsAt:InstantUTC} | Projection of currently free continuous time; no reservation ID or client authority |
| Encounter | Mutable base + {patientId:Id, doctorId:Id or null, appointmentId:Id or null, recordId:Id or null, status:OPEN or IN_PROGRESS or COMPLETED or CANCELLED, startedAt:InstantUTC or null, endedAt:InstantUTC or null} | One patient, optional appointment; at most one logical record. Null doctor supports an authorized non-doctor creator without inventing a clinician identity |
| ClinicalRecord | Mutable base + {encounterId:Id, patientId:Id, status:DRAFT or IN_REVIEW or FINALIZED or AMENDED, currentVersion:Counter, current:RecordVersion, reviewedVersion:Counter or null} | One logical record per encounter. current.version must equal currentVersion |
| RecordVersion | {id:Id, recordId:Id, version:Counter, content:ClinicalContent, kind:INITIAL or EDIT or AMENDMENT or AI_HANDOFF, createdBy:Id, createdAt:InstantUTC, amendmentReason:Text(2000) or null, sourceDraftId:Id or null} | Immutable snapshot; ordered history within one record. Changes append, never update previous versions |
| Context | Discriminated {kind:GENERAL} OR {kind:PATIENT,patientId:Id} OR {kind:ENCOUNTER,patientId:Id,encounterId:Id} | Server validates all references; immutable for a conversation/draft generation |
| Conversation | {id:Id, workspaceId:Id, ownerUserId:Id, context:Context, status:ACTIVE or CLOSED or EXPIRED, createdAt:InstantUTC, updatedAt:InstantUTC, expiresAt:InstantUTC, access:Access} | One owner in MVP, no participants/sharing; server closes/expires by BD-05 policy |
| Message | {id:Id, conversationId:Id, role:USER or ASSISTANT, text:Text(16000), createdAt:InstantUTC, requestOperationId:Id, provenance:Provenance[]} | Public projection only. SYSTEM/TOOL prompts and raw tool output never appear in this API |
| Provenance | {id:Id, kind:RECORD_VERSION or APPROVED_KNOWLEDGE, sourceId:Id, sourceVersion:Text(128), label:Text(200), excerpt:Text(500) or null} | Server-derived authorized source reference; no arbitrary URLs or model-invented citations |
| AiDraft | Mutable base + {patientId:Id, encounterId:Id, targetRecordId:Id, targetVersionToken:OpaqueETag, draftType:CLINICAL_NOTE, content:ClinicalContent, provenance:Provenance[], status:GENERATED or IN_REVIEW or APPROVED or REJECTED or EXPIRED, createdBy:Id, reviewedBy:Id or null, approvedBy:Id or null, rejectedBy:Id or null, decidedAt:InstantUTC or null, expiresAt:InstantUTC, handoff:HandoffEvidence or null} | Encounter-bound only. Existing target record must be DRAFT; generation captures its ETag. No client-supplied approval actor |
| HandoffEvidence | {operationId:Id, recordId:Id, recordVersionId:Id, recordVersion:Counter, recordVersionToken:OpaqueETag, approvedDraftVersionToken:OpaqueETag, auditEventId:Id, committedAt:InstantUTC} | Backend commit evidence; record remains DRAFT after handoff |

Retained states are wire strings. Unknown security/context/state values disable the affected operation and show Unsupported; unknown optional response fields are ignored. An unknown patient sex/status may be displayed verbatim as a server value, never used to invent a creation default. Counters, timestamps, access and actor fields are server-only.

## Mutation allowlists

| Input | Allowed fields and technical validation |
|---|---|
| PatientCreate | Required fullName Text(200), nonempty; required keys medicalRecordNumber:Text(80) or null, dateOfBirth:DateOnly or null, sex:Text(64) or null, phone:Text(40) or null, email:Text(254) or null, address:Text(1000) or null, emergencyContact:EmergencyContact or null. No status, id, workspace, timestamps or user link |
| PatientPatch | Nonempty subset fullName,dateOfBirth,sex,phone,email,address,emergencyContact,status with Patient types. Null clears only a nullable field. Writable/readable masks and BD-02 required fields apply |
| AppointmentCreate | Required patientId,doctorId,locationId,startsAt,endsAt; optional reason/notes default null. No status, encounter, ownership, timestamps |
| AppointmentPatch | Nonempty subset doctorId,locationId,startsAt,endsAt,reason,notes; omitted fields unchanged. Cannot replace patient/workspace |
| EncounterCreate | Required patientId; required keys doctorId:Id or null, appointmentId:Id or null, appointmentVersionToken:OpaqueETag or null. appointmentVersionToken is null exactly when appointmentId is null. A linked encounter requires the appointment's non-null doctorId and matching patient/workspace; validate the related appointment token atomically |
| ClinicalCreate / ClinicalEdit | {content:ClinicalContent}; full replacement of working content, never a partial clinical merge |
| ClinicalAmend | {content:ClinicalContent, amendmentReason:Text(2000)}; reason nonempty, new version rather than overwrite |
| ConversationCreate | {context:Context}; owner/workspace supplied by trusted session/context |
| MessageCreate | {text:Text(4000)} nonempty; no role, tools, provider, context replacement or actor |
| DraftGenerate | {targetRecordId:Id, targetVersionToken:OpaqueETag, instruction:Text(2000) or null}; backend derives patient/encounter, fixed CLINICAL_NOTE |
| DraftEdit | {content:ClinicalContent}; cannot alter target/context/provenance/actor/status |
| DraftReject | {reason:Text(2000) or null}; retained only under BD-05, never copied into audit metadata |

Business rules not derivable from types (patient required fields/MRN catalogues, scheduling windows, clinical completeness) are not invented. Corresponding command is disabled while its BD policy is unset. Server validation rejects unsupported request keys with 422 VALIDATION_ERROR; client field masks cannot authorize extra fields.

## Appointment transition contract

Actor H means authenticated HUMAN with the listed grant, workspace/resource authorization and approved BD-01 mapping. Policy gates are explicitly required, not optional. All commands use current ETag and an operation key. Errors: 403 for grant denial; 404 hidden resource; 412 stale token; 409 INVALID_STATE, SCHEDULE_CONFLICT or RELATIONSHIP_CONFLICT; 503 FEATURE_UNAVAILABLE for unresolved policy.

| Source -> target | Actor / permission | Preconditions and API command | Success and version effect |
|---|---|---|---|
| Absent -> creation state | H / appointment.create | AP02; future valid interval; current same-workspace patient/doctor/location; BD-03 chooses PENDING or CONFIRMED initial state | New Appointment, ETag, no encounter. Creation remains blocked until initial state and eligibility policy resolved |
| PENDING -> CONFIRMED | H / appointment.confirm | AP05; current eligibility and conflict recheck | Updated status/new ETag |
| CONFIRMED -> CHECKED_IN | H / appointment.checkIn | AP07; BD-03 check-in timing | Server checkedInAt, new ETag |
| CHECKED_IN -> IN_PROGRESS | H / appointment.start + encounter.start | AP08 with encounterId; matching linked OPEN encounter | Atomic appointment + encounter IN_PROGRESS; startedAt set; both new ETags |
| IN_PROGRESS -> COMPLETED | H / appointment.complete + encounter.complete | AP09 with encounterId; linked IN_PROGRESS encounter; BD-04 completeness policy | Atomic appointment + encounter COMPLETED; endedAt set; both new ETags |
| PENDING or CONFIRMED -> CANCELLED | H / appointment.cancel | AP06; BD-03 cancellation conditions | New ETag; no appointment deletion |
| CONFIRMED -> NO_SHOW | H / appointment.noShow | AP10; explicit BD-03 time/authority policy, no automatic timer | New ETag |
| Same eligible state -> same state (reschedule) | H / appointment.reschedule | AP04; BD-03 eligible states; revalidate doctor/location/interval and booking conflict | New ETag; no patient or status replacement |
| Terminal state -> anything | None | No supported command | 409 INVALID_STATE |

Availability AP11 computes free half-open windows within authorized eligible ACTIVE shifts minus appointments in the BD-03 occupancy-status set, clipped to query bounds. Adjacent endpoints do not overlap; take the union of overlapping eligible shifts before subtracting bookings, merge adjacent windows. Do not expose another patient's busy details. No fixed slot length is assumed. Creation/reschedule atomically repeats eligibility/overlap checks, so a prior availability response can still lose a race with 409 SCHEDULE_CONFLICT.

## Encounter and record lifecycle

These are technical version/state conventions; final clinical eligibility remains BD-04. Grant authorizations remain BD-01.

| Source -> target | Actor / permission | Command and precondition | Effect / conflict |
|---|---|---|---|
| No encounter -> OPEN | H / encounter.create | CL01; matching patient/optional appointment; appointment if present must be CHECKED_IN with matching appointmentVersionToken | Atomically create encounter and set Appointment.encounterId/new appointment ETag. One encounter per appointment; duplicate relationship 409, discover through AP03; startedAt/endedAt null |
| OPEN -> IN_PROGRESS | H / encounter.start | CL03 for standalone; AP08 for linked encounter | Set startedAt/new ETag. Linked CL03 returns 409 USE_APPOINTMENT_COMMAND |
| IN_PROGRESS -> COMPLETED | H / encounter.complete | CL04 standalone or AP09 linked; BD-04 | Set endedAt/new ETag. No automatic record finalization |
| OPEN or IN_PROGRESS -> CANCELLED | H / encounter.cancel | CL05 standalone only; BD-04 cancellation eligibility | EndedAt/new ETag; history retained. Linked cancellation is unavailable pending BD-04, not an appointment status shortcut |
| No record -> DRAFT | H / record.create | CL07, IN_PROGRESS encounter with no record | Append version 1 kind INITIAL; return recordId through encounter read; duplicate 409 RECORD_EXISTS |
| DRAFT -> DRAFT; AMENDED -> AMENDED | H / record.edit | CL08, current ETag | Append EDIT version, clear reviewedVersion, new record ETag |
| DRAFT or AMENDED -> IN_REVIEW | H / record.review | CL09, current working version and BD-04 review eligibility | Set reviewedVersion=currentVersion; content snapshot unchanged, new record ETag |
| IN_REVIEW -> DRAFT or AMENDED | H / record.edit | CL10 reopen; target based on whether current work derives from an amendment | Clear reviewedVersion; content unchanged; new ETag. Editing while IN_REVIEW directly is 409 INVALID_STATE |
| IN_REVIEW -> FINALIZED | H / record.finalize + assurance | CL11; reviewedVersion=currentVersion; current ETag and BD-04 completeness/sign-off | New record ETag; immutable content revision unchanged |
| FINALIZED -> AMENDED | H / record.amend | CL12; nonempty reason, current ETag, BD-04 amendment eligibility | Append AMENDMENT version; prior finalized snapshots retained; current work is NOT final; review/finalize again |
| DRAFT -> DRAFT via AI handoff | H / draft.approve + record.edit + assurance | AI08, exact draft and target tokens; see AI spec | Append AI_HANDOFF version; clear reviewedVersion; new target ETag; never FINALIZED |

For EDIT following AMENDMENT, preserve the original amendmentReason and amendment lineage, so reopening returns AMENDED. No operation edits an immutable RecordVersion. Changing record lifecycle alone changes ETag but not currentVersion. Clinical write conflicts never merge content automatically. Finalizing an amended working version permits later correction only if BD-04 explicitly allows it; the technical state path is the same. Record history CL13 is ordered by version descending and accessible only with record.read.

## Discovery and completion

Appointment.encounterId and Encounter.recordId are required nullable links. Patient history CL06 discovers encounters; CL13 discovers versions; AI01 discovers the current user's conversations. Reads never create missing resources. Explicit create is offered only when the authorized parent link is null and the action is allowed. Encounter completion and record finalization are separate events; clinical acceptance rules must not be inferred from one another.
