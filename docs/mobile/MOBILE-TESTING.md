# Mobile testing and validation

> **Historical proposal snapshot (2026-09-08).** The statement that no mobile source/tests existed was true for that audit checkpoint. Current test inventory and execution status are recorded in the root grading documents; this remains the proposed test plan.

Status: **PROPOSED future tests; documentation checks are reported separately below.** No mobile source/tests exist and no production workflow was exercised. API gap IDs are in [API integration](MOBILE-API-INTEGRATION.md); security IDs in [security](MOBILE-SECURITY.md).

## Mobile test boundaries

| ID / category | Boundary and meaningful cases | Expected evidence |
|---|---|---|
| MT01 Authentication/native callback | Session adapter + real test CIAM where available: successful/cancelled OIDC, invalid redirect/state/nonce, wrong issuer/audience, MFA/recovery assurance, no credentials in embedded app UI | Native return flow reaches validated identity only; invalid/cancelled response never unlocks |
| MT02 Restoration/rotation/logout | Session coordinator with controllable clock/storage/network: 15-minute expiry, 7-day absolute lifetime, simultaneous 401, one refresh rotation, lost refresh response, invalidated storage, replay/revoked refresh, logout during refresh | One refresh in flight; late refresh cannot resurrect session; secure clear on invalidity; remote revoke status reported honestly |
| MT03 API client/serialization | Published schema fixtures and real test HTTP: snake_case mapping, null versus absent, unknown/missing fields, UUID/date-only/UTC handling, TLS/host validation, request IDs, canonical errors, ETags, redirect origin | Correct client models and exact opaque headers; no permissive trust or secret forwarding |
| MT04 Tenant/account isolation | ViewModel/repository/session: switch A→B while A patient/search/AI/refresh response is delayed; same resource ID under two tenants; Back/rotation/process recreation after switch | No A content, keys, cursor or approval intent appears under B; context revalidated before protected fetch |
| MT05 Authorization/navigation | Every feature route with operational/clinical permissions, denied same-tenant resource, unknown role, revoked membership and direct resource navigation | UX gates fail closed; receptionist cannot see notes; clinic admin is not automatic clinician; denial clears inaccessible data |
| MT06 Patient/appointment commands | State + API: exact field allowlists, duplicate taps, original key replay, payload/key mismatch, 409 schedule conflict, 412 stale edit, timeout after accepted write, correct date-zone display | No duplicate intent or silent overwrite; PENDING not shown as CONFIRMED; availability never treated as reservation |
| MT07 Clinical workflow | ViewModel/UI + integrated backend: history and association lookup, allergy empty versus unavailable, one initial record, DRAFT/IN_REVIEW/FINALIZED, invalid state, client-reviewed ETag, amendment reason, unknown AMENDED continuation | No duplicated initial record, fabricated negative findings or overwritten finalized content; unsupported lifecycle blocks action |
| MT08 AI response/context | State/UI/contract: permitted context, missing context, injected HTML/links, malformed/oversized/unsafe output, absent citations, high-risk deferral, timeout/429, late cross-context response, unknown 202 | Advisory display only; unsafe/unsupported response cannot expose approval; no invented source or polling URL; manual authorized work remains available |
| MT09 AI human approval | Real version-bound flow + UI: GENERATED cannot approve, REVIEWING human review, edited/stale draft, expired/purged content, denied step-up, local biometrics alone, double tap, lost approval response, missing handoff | Human-confirmed exact version only; no automatic replay/promotion; backend returns one controlled clinical result; clinical finality independently read |
| MT10 General failure states | State/UI: offline launch, DNS/TLS/network errors, invalid cursor, page failure, 400/401/403/404/409/412/422/429/500, cancellation and process death mid-command | Empty/unavailable/denied/outcome-unknown are distinct; no retry storm or silent new-key write |
| MT11 Sensitive-data handling | Device/manual and artifact inspection with synthetic markers: logs/crashes/analytics, screenshots/recents, clipboard/share, saved state, backup/device transfer, cache/preferences and HTTP bodies | Marked tokens/PHI absent from prohibited locations; background cover and approved capture policy effective |
| MT12 Accessibility/lifecycle/UI | Compose/device or chosen framework: screen reader, large text, touch targets, keyboard/error focus, contrast/status text, small/wide windows, rotation, background/resume, unsaved form/process loss | All task-critical controls usable; no obscured patient/approval context; no PHI persisted for convenience |
| MT13 Release smoke/security | Signed artifact on agreed devices: correct environment/native callback, no debug flags/cleartext/service secrets, install/upgrade, logout, limited permissions, supported backend schema | Traceable artifact/signature/build version; production/staging separation; secret scan and installation evidence |

Unit tests cover deterministic data mapping, validation and state transitions that matter to behavior. ViewModel tests use controlled fakes for session, clock and API and assert emitted safe states, not private implementation details. Repository tests verify actual contract adaptation/header preservation, not a fake that returns exactly what the implementation expects. UI/navigation tests cover all S01–S21 and the important conditional gates; avoid adding one test for every trivial render branch.

No live provider or database is needed for ordinary mobile unit/UI tests. Contract integration uses a dedicated test backend with published fixtures/schema; never model a missing endpoint as an already-working production API. Wire drift, tenant transport and permission projection must be closed before contract fixtures can be considered authoritative.

## Backend responsibilities retained

| ID | Backend responsibility | Why mobile tests cannot prove it |
|---|---|---|
| BT01 | OIDC/JWT verification, refresh replay/revocation, MFA/step-up, active identity/membership and endpoint policy | Client state cannot enforce access against a modified client |
| BT02 | Tenant-bound queries, field policy, related patient/doctor/location/appointment/encounter access and AI source filtering | A mobile test cannot establish data-layer isolation for every caller |
| BT03 | Durable transactional idempotency, scheduling exclusion/shift checks, OCC after authorization, expiry and race behavior | Disabling a button or carrying a key is not atomic server persistence |
| BT04 | Clinical append-only versions; correct DRAFT/amendment lifecycle; HUMAN approval, reviewed-version/assurance binding, handoff and purge ordering | An APPROVED UI label does not establish authoritative medical record integrity |
| BT05 | Durable immutable metadata audit for success/denial/failure and required clinical reads/mutations | Mobile telemetry is mutable and cannot prove server action attribution |
| BT06 | Tool allowlists, prompt injection resistance, minimized context, provider isolation, risk/deferral handling, Golden Dataset evaluation and retention/Legal Hold enforcement | Rendering warnings does not evaluate medical output, prevent server tool abuse or execute lifecycle cleanup |
| BT07 | PostgreSQL migrations/adapters, transaction rollback, outbox, secret delivery, backup/recovery and operational limits | These are server infrastructure; never run or copy them into mobile |

Integrated acceptance must demonstrate both MT and relevant BT evidence. A backend defect is filed/handled by its owner in a future authorized task, not patched in the mobile client.

## Existing tests inspected as reference

| Current source | Evidence present | Limit |
|---|---|---|
| [Identity tests](../../../Viora/libs/identity/application/src/identity-context.test.ts), [identity handler tests](../../../Viora/apps/api/src/identity-api.test.ts) | Active/absent/cross-tenant/ambiguous membership resolution | Store fakes; no OIDC exchange, token verification or real HTTP |
| [Authorization tests](../../../Viora/libs/platform/authorization/src/authorization.test.ts), [tenant handler tests](../../../Viora/apps/api/src/tenant-api.test.ts) | Fail-closed policy, tenant substitution, role/version and tenant input checks | No complete production permission matrix/context middleware |
| [Patient application tests](../../../Viora/libs/patient/application/src/patient-application.test.ts), [patient handler tests](../../../Viora/apps/api/src/patient-api.test.ts) | Idempotent creation, tenant access, ETag/presenter, allowlisted search | Fake repositories/presenter; no normalized paginated real HTTP schema |
| [Doctor tests](../../../Viora/libs/doctor/application/src/doctor-application.test.ts), [appointment tests](../../../Viora/libs/appointment/application/src/appointment-application.test.ts), [conflict tests](../../../Viora/libs/appointment/domain/src/appointment-conflicts.test.ts) | Tenant filtering, availability range, create/replay/conflict, versioned check-in and overlap rules | Does not prove full shift validation, public commands or persistent atomicity |
| [Clinical tests](../../../Viora/libs/clinical/application/src/clinical-application.test.ts) | Encounter/record creation, lifecycle DRAFT→IN_REVIEW→FINALIZED, amendment result AMENDED | Repository fakes supply outcomes; no client If-Match, step-up, full history or post-AMENDED workflow |
| [AI gateway tests](../../../Viora/libs/ai/gateway/src/gateway.test.ts), [read-tool tests](../../../Viora/libs/ai/tools/src/read-only-tools.test.ts), [knowledge tests](../../../Viora/libs/ai/tools/src/knowledge-search.test.ts) | Context/input/policy/size failure, minimal summaries, tenant/status filtering and bounded search | Primitive evidence, not full RAG/clinical safety evaluation |
| [Draft tests](../../../Viora/libs/ai/tools/src/clinical-draft-workflow.test.ts), [draft-tool tests](../../../Viora/libs/ai/tools/src/clinical-draft-tools.test.ts) | HUMAN transitions and draft-only schema | No client-reviewed-version challenge, step-up or Clinical handoff |
| [Provider tests](../../../Viora/libs/ai/provider/src/provider.test.ts), [completion tests](../../../Viora/libs/ai/gateway/src/provider-completion.test.ts) | Safe timeout/cancel/malformed/provider errors and metadata limits | Mocked fetch/provider; no assurance of deployed topology/model safety |
| [Audit repository tests](../../../Viora/libs/audit/data-access/src/audit-repository.test.ts), [PostgreSQL integration tests](../../../Viora/libs/platform/database/src/postgres-migration.integration.test.ts) | Parameterized adapter/tenant/replay cases; conditional real migration suite exists | Inspecting code is not executing DB tests; migration suite can reset a disposable database and was not run |

No historical pass count is represented as a test result from this task. Tests supply terminology and behavior examples; fixture role `ADMIN`, synthetic IDs and fake transition defaults are not new public contracts.

## Future execution sequence and gates

1. Resolve G01/G02 schemas/identity/context and create synthetic tenant A/B accounts/resources in an approved test environment.
2. Implement/test one authenticated vertical read, including denied same-tenant and cross-tenant paths.
3. Add Patient/Doctor/Appointment unit/state/contract/UI cases and real idempotency/OCC/availability checks.
4. Add Clinical history/correction/finalization/amendment cases only after G04/G08/G10 contracts close.
5. Add assistant/context/draft/review/approval integration and backend safety gate evidence after G05–G07 close.
6. Run accessibility/lifecycle/privacy/device tests, then signed-release smoke against the correct environment.

AI release requires the existing strict safety thresholds and Clinical/Security review described in [AI specification](MOBILE-AI-ASSISTANT-SPEC.md). Performance/latency, device coverage, recovery targets and release channel remain explicit decisions. Store only synthetic/redacted evidence with build/commit/schema identity, environment, test ID, owner, date and result.

## This documentation batch — actual validation

Executed on 2026-09-08:

| Check | Actual result |
|---|---|
| Required output inventory | PASS — all 15 requested Markdown files exist under `docs/mobile/`; these are the only files in the output workspace |
| Internal/reference links | PASS — all 125 local Markdown links resolve; 10 external citation occurrences are separate from the local-link check |
| API traceability | PASS — all 37 concrete reference method/path contracts are accounted for: 34 integration/supporting operations plus 3 explicitly excluded from the smallest mobile scope; zero invented endpoints |
| Screen/feature coverage | PASS — S01–S21 and F01–F12 have specification rows; API, flow, security and test mappings reviewed for the included workflows |
| Markdown structure | PASS — balanced fenced blocks, consistent table column counts, no unresolved editing placeholders or merge-conflict markers |
| Terminology review | PASS — appointment, encounter, medical-record and AI-draft statuses remain distinct; UI states explicitly labelled; role wire ambiguity and AMENDED lifecycle remain open rather than guessed |
| Source preservation | PASS — SHA-256 comparison of all 187 inventoried reference files found zero changes/removals; reference HEAD and all 55 initial Git-status entries unchanged. Inventory excludes Git internals, dependencies and generated/cache directories |
| Reference `git diff --check` | PASS — exit 0 using the repository's normal Git configuration; 38 pre-existing LF/CRLF conversion warnings, no whitespace diagnostics |
| New-document diff/whitespace review | PASS — `git diff --no-index --check` against an empty temporary directory produced zero whitespace diagnostics. Exit 1 indicates the expected new-file differences. Full addition diff accounted for 15 new files and zero deletions; independent trailing-whitespace/conflict-marker scan passed |
| Output repository status | The output workspace is not a Git repository, so an ordinary tracked output diff is unavailable; no-index review used instead. No Git repository was initialized |
| Scope | PASS — no existing file modified, production/mobile source created or changed, dependency installed, backend/database/migration/CI configuration changed, commit, push or PR |

An extra diagnostic with Git CRLF conversion disabled flags existing CRLF lines in the reference tree; this is not a new-file defect and no line endings were changed. The normal configured `git diff --check` result above is the relevant repository check. Documentation checks do not imply application build/test or release success.

Already executed during audit: `node tools/validate-boundaries.mjs` in the reference repository **FAIL — 5 pre-existing findings**, listed in README AUD-09. This is a read-only check; no source repair was attempted. Backend tests/build/migrations and all mobile tests were **not run** because this task is documentation-only and no mobile application exists.
