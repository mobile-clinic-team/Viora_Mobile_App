# Medical AI assistant mobile specification

Status: **PROPOSED mobile interaction; existing AI safety requirements preserved.** R04/R06/R07/R15–R18 are evidence in [README](MOBILE-README.md). G05–G07 block an integrated assistant with safe approval today. Mobile communicates exclusively with the Viora backend for AI.

## Intended capability and trust

The assistant supports authorized patient information retrieval, clinical history summaries, approved tenant knowledge retrieval and clinical note drafts. It is text/structured-data only. It never autonomously diagnoses, prescribes, finalizes records, changes permissions, executes code/SQL, exports data or communicates externally. Operational AI mutation tools, files, prescriptions, laboratory workflows and notification automation are not introduced by this MVP.

A summary is derived advisory text, not a source medical record. Retrieved knowledge is untrusted source data. An AI draft is non-authoritative until the required human/application process; an APPROVED draft is still not proof that a medical record has been FINALIZED. A source citation must come from permitted backend provenance, never from invented model text.

## Data boundary

| Hop | Permitted content | Required checks / current evidence |
|---|---|---|
| Mobile → Viora | Bearer session, approved clinic-context mechanism, patient/encounter/conversation/draft references, bounded user message or draft request, required key/ETag | No actor substitution, credentials for providers, arbitrary tools/model choices, database query, vectors, raw files or full-record dumps. Exact DTO/context/limit schemas are G01/G06 |
| Backend → authorized tools/domain | Server-derived actor, membership/tenant/resource context, strictly validated operation and bounded input | Repeat resource/relationship authorization. `get_patient` uses a minimal summary loader; `get_recent_encounters` returns at most 20 matching summaries. Loader binding is backend responsibility |
| Backend → knowledge retrieval | Authorized bounded query/current tenant, approved status/source policy | `TenantScopedKnowledgeSearch` filters tenant and APPROVED status; per-document permissions/source lifecycle still need full integration. No global knowledge in MVP |
| Backend → AI provider/runtime | Minimum necessary authorized, redacted context and bounded prompt; internal correlation/conversation handling only | Current Dify adapter sends `inputs:{}`, `query`, blocking `response_mode`, actor user ID and optional provider conversation ID. No full context orchestration is proven; provider IDs are not public client IDs |
| Provider → backend | Untrusted text/structured content and internal correlation identifiers | Schema/size/content/safety/context checks before display or persistence; completion port's text/size check alone does not implement all clinical safety gates |
| Backend → mobile | Validated advisory response/draft, safe classification/deferral, permitted sources/provenance/resource references and current state/ETag | Exact public envelope and handoff schema TBD. Do not expose provider secrets/model config/raw internal context or diagnostic errors |

`get_recent_encounters` exposes status, times, patient/doctor/encounter references, not diagnosis or notes. It cannot by itself support a clinical-note summary. Authorized clinical content loaders and provenance must be implemented explicitly; the app must not compensate by posting a whole chart.

## Current implementation versus required path

| Component | CURRENTLY EXISTS | Missing for mobile |
|---|---|---|
| Tool gateway | Context validation, registry, input validation, resource policy, output byte bound, audit hook, safe tool failure | Complete application registry/policy/loaders, content/safety validation and end-to-end orchestration |
| Provider completion | Bounded prompt/output, metadata audit, timeout/cancel/unavailable/invalid-response classification | Public operation auth/context selection, clinical risk checks and HTTP result mapping |
| Dify adapter | Server-held key from secret provider; blocking request; configured timeout, cancellation | Deployment assurance and controlled full model/provider topology evidence; mobile never uses adapter directly |
| Draft generation | Draft tool shape and draft persistence function | Tool is DRAFT with `requiresHumanApproval:true`; default gateway denies such non-read execution. No proven authorized generation-to-persistence path; G06 must resolve semantics safely |
| Draft review/approval/rejection | HUMAN checks, GENERATED→REVIEWING→APPROVED/REJECTED, repository current-version predicate | Client-reviewed version, step-up, durable command idempotency/audit and Clinical handoff absent in workflow |
| Conversations/RAG persistence | AI SQL adapters and tenant knowledge boundary | Conversation owner/participant API service, minimized content representation, draft retrieval, expiry/purge/Legal Hold execution and request recovery |

Existing tests establish primitives and selected negative cases, not an end-to-end safe medical assistant. Do not remove `requiresHumanApproval` to make generation work; define generation's bounded draft behavior separately from approval and preserve the application gate.

## User interaction

S19 always identifies current clinic and attached patient/encounter when applicable. Context selection is explicit and authorized. Switching patient or tenant never silently reuses conversation content; define any permitted rebinding server-side or start a separately authorized conversation. The proposed default is one bounded synchronous submission at a time with clear loading and a cancel/wait UI. Async/streaming is not assumed; any 202 must have an approved recovery/status contract before use.

Display validated advisory responses with clear limitations and human-review requirements where returned. A clinical answer must never be presented as an automatically approved record. If the backend cannot supply required classification, safe content or permitted sources, show unavailable/deferral rather than deriving safety from natural-language phrasing. Exact response fields and maximum sizes are G06 decisions.

The user may request a clinical draft from S15/S19. AI04 returns GENERATED content; S20 loads it with G05 and retains the exact reviewed version binding. Review is a human action AI05, not merely opening the screen. Compare content against authorized source records; no auto-accept-all, auto-finalize or background approval.

## Draft and clinical lifecycle

| State/action | Required mobile behavior |
|---|---|
| GENERATED | Show draft label, patient/encounter and content; offer explicit review to authorized human |
| REVIEWING | Human inspects content and provenance. Edits/resubmission require an approved server contract, refresh version and renewed review |
| Approval | Explicit clinician action; backend step-up, current reviewed If-Match, authorization, tenant/business/draft checks, idempotency and audit |
| APPROVED | Report only verified approval/handoff. Follow returned clinical resource and read its actual state; stop retaining purged draft content |
| REJECTED | Show rejected outcome; no promotion, edit or retry under an invented transition |
| EXPIRED/missing/purged content | Cannot approve; refetch or start a new authorized request as appropriate; no local reconstruction of approved content |
| Clinical DRAFT/IN_REVIEW/FINALIZED/AMENDED | Separate resource lifecycle, governed by Clinical. AI approval does not replace C05/C06 or authorize a generic overwrite |

Reference policy allows a single authorized clinician to review, edit and approve; it does not require a second reviewer by default. G05 must define edit/resubmit transitions and a read operation; G07 must define a Clinical handoff with atomicity, resulting record/state, duplicate prevention and audit/purge ordering. A successful in-memory `approveAiDraft` return is insufficient. The app must not post the draft through C03 and declare that the absent backend handoff succeeded.

## Failure and timeout behavior

| Outcome | Mobile behavior | Backend requirement |
|---|---|---|
| Low-risk authorized assistance | Show validated advisory output with permitted references | Enforce bounded allowed capability |
| Medium-risk clinical content | Mark advisory/draft-only; require clinician review before authoritative use | Risk classification and review policy independent of model claims |
| High-risk/emergency/ambiguous/material conflict | Safe deferral and direction to an authorized clinician; no invented diagnosis or medical thresholds | Approved escalation policy; no autonomous mutation or notification dispatch |
| Missing/denied context or tool | No result masquerading as clinical fact; permitted manual workflow remains reachable | Fail closed; audit safe denial/failure |
| TIMEOUT/CANCELLED/UNAVAILABLE | Safe interrupted/unavailable state; user can return to manual work | Map to public errors/outcomes; no automatic fallback model/provider |
| INVALID_RESPONSE/OUTPUT_REJECTED or malformed content | Suppress unsafe/unvalidated content; no approval affordance | Validate and log metadata only |
| 429/quota | Show bounded rate-limit state; retry only through published guidance/user intent | Enforce user/tenant/tool/cost limits |
| 412 approval conflict | Reload current draft/context and repeat human review/confirmation | Reject stale reviewed version before mutation |
| Lost response after message/draft/approval | Show outcome unknown, disable duplicate action and reconcile via approved read/key semantics | Durable outcome recovery; approval must not duplicate Clinical handoff |

The current Dify timeout accepts a configured positive value up to 120,000 ms; that is a constructor constraint, not the mobile timeout or a service SLO. Mobile/HTTP/proxy/provider timeout ordering and exact retry windows are ADR-M10/G06. Cancelling local wait does not prove server work was cancelled. Current internal provider errors are not public HTTP codes; do not invent 408/504 mappings.

## Authorization, audit and data handling

All AI operations revalidate actor, active tenant, conversation ownership/participation, patient/encounter access and operation/tool permission. The client cannot assert HUMAN as proof of a human authorization, choose another tenant through a prompt, or forward provider conversation IDs to bypass application ownership. Late results from an old clinic/patient context are discarded client-side and prevented server-side.

Audit must link originating human, tenant, tool/operation, resource, outcome, request ID, draft version, review/approval/rejection and resulting Clinical reference. Store metadata/provenance rather than complete prompts/responses or duplicated PHI. Mobile diagnostics are not an audit substitute. The approved backend retention baseline is in [security](MOBILE-SECURITY.md); no local conversation/draft archive is proposed.

Provider/model credentials and model routing remain exclusively backend concerns. The repository's pinned model/embedding choices are recorded as backend reference decisions, not current availability guarantees or public mobile settings. Do not change provider/model policy in this task.

## Safety acceptance

MT08/MT09 test client behavior; BT04/BT06 verify backend generation, authorization, review-version binding, step-up, audit, purge and handoff. AI release requires the source's versioned Golden Dataset jointly owned by Clinical/AI: context recall and precision each ≥85%, faithfulness/hallucination failure <2%, classified-sensitive-field redaction 100%, plus Clinical/Security approval and provider evidence. Numeric latency targets remain TBD. None of these evaluation results is claimed by this documentation task.
