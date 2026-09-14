# AI assistance and clinical handoff

This owns AI orchestration and approval behavior. [API-SPEC.md](API-SPEC.md) owns AI01–AI13 transport and operation recovery; [DOMAIN-MODEL.md](DOMAIN-MODEL.md) owns shared content and reference schemas. BD-01 and BD-05 gate real clinical use.

## Selected execution mode: synchronous

MVP generation is one bounded request/response. No 202, streaming, background job, job cancellation route or provider choice is exposed. A receipt means generation finished and its authorized result was committed; reading that result is an ordinary follow-up read. A disconnected client checks operation status, not an AI job.

For AI05/AI06, backend first validates session, workspace/grants, immutable context, expiry and operation admission; records required invocation audit before provider dispatch. It assembles only authorized context permitted by BD-05, calls a server-held provider adapter, validates output, then atomically persists result/operation receipt/audit. Server generation deadline is 60 seconds; client call deadline is 75 seconds as defined in API-SPEC. No fallback provider or repeat generation under a different key.

On disconnect/cancel, request cancellation is best-effort and never evidence that provider processing or backend commit stopped. If generation committed, recovery finds the result. If it conclusively failed before application publication, operation becomes FAILED and a new user-confirmed generation is possible. Otherwise retain PROCESSING/INDETERMINATE. Partial text is never delivered or treated as a record.

## Context, ownership and visibility

Conversation.context is immutable GENERAL, PATIENT or ENCOUNTER. Every patient, encounter and record relationship is checked in the current workspace. Only the initiating ownerUserId can access the conversation in MVP, in addition to current assistant/context permissions. No sharing or implicit administrative read override. Changing workspace, patient or encounter starts a new conversation after explicit confirmation; it never rebinds an old transcript.

Android sends a bounded question or a target record reference, never full fetched medical history, provider tokens, model selection, arbitrary tool commands, SQL, hidden system prompts or attachments. Server authorizes every contextual read; prompt instructions and source content cannot alter grants. Approved knowledge and context sources are BD-05; unset policy returns FEATURE_UNAVAILABLE.

Public Message has only USER or ASSISTANT role. Internal SYSTEM/TOOL entries and raw retrieval output are not serialized. Conversation list returns metadata; messages require separate authorized reads. Assistant output is plain text. Provenance uses validated identifiers and bounded excerpts; no arbitrary clickable URLs or active HTML.

Limits come from domain/API types: user message 4000 code points, instruction 2000, assistant text 16000, clinical content four fields up to 16000 each, maximum eight provenance items. Server rejects invalid/oversized output with AI_OUTPUT_REJECTED and publishes no partial result. Low-risk general replies may have empty provenance; a clinical draft requires at least one authorized provenance reference. Sources must originate in the server's assembled context, not model-invented IDs.

The UI labels output advisory and distinguishes generated text from accepted record content. It never presents a response as a diagnosis, prescription or final decision. Clinical appropriateness/refusal criteria and evaluation sign-off are BD-05; technical schema validation is not proof of medical safety.

## Draft target decision

MVP AI drafting updates an EXISTING DRAFT clinical record only. It never creates a record during approval and never modifies IN_REVIEW, FINALIZED or AMENDED content. This technical restriction makes the destination, duplicate protection and edit conflicts explicit without selecting medical policy.

AI13 discovers currently authorized drafts for a known target record, including after process death or receipt expiry. S15 presents that list and opens AI10/S19; it does not depend on remembered draft IDs. Draft visibility requires draft.read and the BD-01 record relationship policy, never an administrator override.

Before AI06, the UI reads the encounter and its record. If absent, an authorized user may explicitly create an initial manual DRAFT through CL07; generation does not create it implicitly. A read-only finalized record cannot be silently converted into a draft.

AI06 captures targetRecordId and exact targetVersionToken. Backend derives patientId/encounterId from that record and validates the supplied token. The resulting draft retains immutable target binding, provenance and structured ClinicalContent. If the record changes during generation, the draft may be retained for inspection but cannot pass approval with its stale target token.

## Draft lifecycle and review

| Source -> target | Action / actor grant | Preconditions and result |
|---|---|---|
| Absent -> GENERATED | AI06 / draft.generate + record.read | Authorized DRAFT target, current target ETag, validated content/provenance; server creator/time; no clinical mutation |
| GENERATED -> IN_REVIEW | AI07 / draft.review | Explicit authenticated human intent and current draft ETag; set reviewedBy; return new ETag |
| IN_REVIEW -> IN_REVIEW | AI11 / draft.edit | Replace full content with current ETag; target/provenance immutable; new ETag invalidates any earlier confirmation/assurance |
| IN_REVIEW -> APPROVED | AI08 / draft.approve + record.edit + assurance | Exact handoff below; success only after durable commit |
| IN_REVIEW -> REJECTED | AI09 / draft.reject | Explicit human intent, current ETag; optional reason, no clinical mutation |
| GENERATED or IN_REVIEW -> EXPIRED | Server expiry under BD-05 | Current server time past expiresAt; further review/edit/approval rejected, no client clock transition |
| APPROVED, REJECTED, EXPIRED -> review/approve | Unsupported | 409 INVALID_STATE or 410 RESOURCE_EXPIRED; no hidden resubmission |

Opening a draft is a read, never AI07. One authorized human may perform review and approval if BD-01 permits; no two-reviewer rule is invented. After an edit, show the exact updated content/provenance and obtain a fresh explicit confirmation; do not retain an earlier assurance grant. Rejection from GENERATED is not implemented; start review first.

## Approval transaction

1. UI reads AI10 and CL14, shows the target record and a before/after comparison for all four content fields. Verify draft IN_REVIEW, target DRAFT, same workspace/patient/encounter and targetVersionToken unchanged. Any mismatch stops approval; target changes require a new draft, not silent rebasing.
2. User requests step-up through A01/A02. Grant is bound to current user/session/workspace, draft ETag, target record ETag and draft.approve. On browser return, revalidate both resources and obtain final confirmation.
3. Android persists the operation receipt metadata and sends AI08 with If-Match for draft, targetRecordId/targetVersionToken body and X-Assurance-Token. It supplies no approver ID or time.
4. In one backend transaction, lock/revalidate draft and target plus operation ownership, current authorization, expiry, human/assurance binding and both ETags. Target must still be DRAFT; any failure causes no clinical/draft transition.
5. Append one immutable AI_HANDOFF RecordVersion containing the exact reviewed edited content and sourceDraftId. Advance record.currentVersion, clear reviewedVersion and change record ETag; record status remains DRAFT.
6. Mark draft APPROVED, set trusted approvedBy/decidedAt, assign its new ETag and HandoffEvidence. Atomically commit clinical version, record pointer, draft state, consumed assurance, durable operation result and mandatory draft.approve/clinical.aiHandoff audit.
7. AI08 returns a WriteReceipt with handoff evidence and related record/version references. UI reads the actual target and draft before showing current content. If the draft has since expired/purged under BD-05, use the authorized clinical reference and receipt evidence; never reconstruct purged draft text locally.

A database/audit failure before commit leaves both resources unchanged and settles FAILED only with reliable transaction evidence. A response lost after commit is recoverable through OP02. Duplicate intent returns the same committed references without another version or approval. A different key cannot approve an already APPROVED draft. A stale target or draft returns 412 VERSION_CONFLICT with no partial change. No 200 is accepted as approval evidence without the matching handoff fields.

Clinical finalization is a separate CL11 action with its own review/completeness/assurance checks. AI approval does not mark an encounter complete.

## Retention, audit and failure UI

BD-05 must supply actual provider/context/knowledge and retention/hold policy before real data is used. Required API projections always supply expiresAt. The server denies expired content even before cleanup runs. Cleanup cannot remove committed clinical content merely because a source draft expires; clinical and AI lifetimes are separate policies.

All required audit ordering/metadata is defined in AUTH-SECURITY. Do not duplicate prompts, answers, rejection reasons or clinical text into audit metadata. A permitted provenance excerpt is sensitive UI data, not a diagnostic field.

Errors map through API-SPEC: authorization/context failures stop access; output rejection shows a safe refusal/unavailable state; timeout/cancellation triggers operation reconciliation; FEATURE_UNAVAILABLE explains that the feature is unavailable, not a medical diagnosis. Manual clinical work is available only if its own authorization and policy gates pass.

[TESTING.md](TESTING.md) separates UI correctness from backend/provider/clinical-safety evidence.
