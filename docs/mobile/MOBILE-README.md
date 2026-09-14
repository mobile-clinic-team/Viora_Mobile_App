# Viora Mobile — documentation and architecture preparation

Audit date: 2026-09-08. Deliverable status: **PROPOSED mobile specification; documentation audit complete; implementation and release are blocked by the dependencies below.**

Product: **Viora Mobile — Clinic Management Mobile App with Medical AI Assistant**. This set defines a future installed mobile application. It creates no application, backend change, database change, CI workflow, or approved mobile technology decision.

## Reference and evidence boundaries

The output workspace is `C:/Users/LAPTOP/Viora-Mobile-App`, which was empty and is not a Git repository. The existing saved project `C:/Users/LAPTOP/Viora` is the source of reference. It is a TypeScript/Nx backend repository at HEAD `c955cfdc3df40608171fdb40a44916215e89a2d9`, with 55 initial Git status entries, including untracked files. The audit uses those current working files, not HEAD alone. No reference file was edited.

Sibling-relative reference links below resolve in this checkout layout. If these documents move, preserve the reference revision and remap the source root; do not copy backend source into mobile to repair links. A new audit is required when the backend contracts change.

Evidence labels used throughout:

| Label | Meaning |
|---|---|
| REFERENCE REQUIREMENT | Existing product/domain/security rule; its implementation may be incomplete |
| CURRENTLY EXISTS | Verified file, function, type, test, or configuration; does not imply a deployed service |
| PROPOSED | Recommendation in this documentation, awaiting the relevant owner decision |
| NEW MOBILE REQUIREMENT | Client requirement needed for mobile; not claimed to originate in backend product requirements |
| ARCHITECTURE DECISION REQUIRED | Missing or conflicting information prevents a final implementation choice |
| MISSING API — IMPLEMENTATION REQUIRED | A needed capability lacks a public contract, a complete implementation, or both; see the operation-specific distinction |

The repository's source hierarchy is Product → Architecture → Data Model → API → Security/AI Safety → Development Contracts. Explicit approved follow-ups in the Decision Log explain stale earlier prose. Actual code establishes implementation evidence, not permission to weaken an approved requirement. Unresolved contradictions remain blockers.

## Read this set

| Document | Purpose |
|---|---|
| [MOBILE-ARCHITECTURE.md](MOBILE-ARCHITECTURE.md) | Boundaries, client layers, ownership, state and networking |
| [MOBILE-APP-SPEC.md](MOBILE-APP-SPEC.md) | Smallest useful scope, roles, features and acceptance |
| [MOBILE-USER-FLOWS.md](MOBILE-USER-FLOWS.md) | Sequential workflows, failures and lifecycle rules |
| [MOBILE-SCREEN-SPEC.md](MOBILE-SCREEN-SPEC.md) | Screen map, data/actions, navigation and UI states |
| [MOBILE-API-INTEGRATION.md](MOBILE-API-INTEGRATION.md) | Contract inventory, implementation evidence and missing APIs |
| [MOBILE-AI-ASSISTANT-SPEC.md](MOBILE-AI-ASSISTANT-SPEC.md) | Context, generation, review, approval and fail-closed behavior |
| [MOBILE-AUTH-SESSION.md](MOBILE-AUTH-SESSION.md) | Login, restoration, tenant selection, refresh and logout |
| [MOBILE-SECURITY.md](MOBILE-SECURITY.md) | Reused security rules and explicit mobile additions |
| [MOBILE-PROJECT-STRUCTURE.md](MOBILE-PROJECT-STRUCTURE.md) | Current folders versus proposed Android structure |
| [MOBILE-TESTING.md](MOBILE-TESTING.md) | Mobile tests, backend responsibilities and release evidence |
| [MOBILE-RELEASE.md](MOBILE-RELEASE.md) | Future build, signing, environments and release gates |
| [MOBILE-TRACEABILITY.md](MOBILE-TRACEABILITY.md) | Reference → feature → screen → API → security → test |
| [MOBILE-ARCHITECTURE-DECISIONS.md](MOBILE-ARCHITECTURE-DECISIONS.md) | Framework comparison, proposals, alternatives and open decisions |
| [MOBILE-MIGRATION-PLAN.md](MOBILE-MIGRATION-PLAN.md) | Reference extraction through a future MVP release |

## Current repository audit

| Area | Verified current evidence | Implication for mobile |
|---|---|---|
| Workspace/runtime | 51 `project.json` files; Node/TypeScript/Nx root tooling; `pg` runtime dependency | Reuse API semantics; no evidence of Kotlin, Flutter, React Native, React, Next or Vite application dependencies |
| API | Only identity, tenant and patient handler source under `apps/api/src`; no HTTP listener/router/bootstrap or executable OpenAPI document found | Handler unit tests are not HTTP integration evidence. No deployable endpoint is certified by this audit |
| Web/workers | `apps/web`, `apps/workers` and `libs/web/api-client` contain project metadata only | No web components, navigation, design system or generated client to port |
| Identity | Subject-to-user resolution, active membership filtering, tenant ambiguity errors | OIDC verification, token exchange, refresh, revocation, MFA and trusted HTTP context composition are missing |
| Tenant | Profile/read/name patch and location list/create application functions and handlers | Read clinic/location context in mobile; administration is outside the proposed smallest mobile scope |
| Patient | Create/read/list/patch application functions; strict input allowlists, injected authorization/presenter, ETag handling | Reusable profile/search semantics; HTTP DTO and pagination reconciliation required |
| Doctor | List departments/doctors/shifts and get doctor application functions | Scheduling support exists below HTTP; no doctor handler or profile-update application function |
| Appointment | Create/list/read/availability/update/status-transition functions; valid transition table, OCC inputs, create idempotency | Public handlers absent. Confirmation/start/completion/NO_SHOW route contracts missing. Update/command idempotency is incomplete |
| Clinical | Encounter create/read; record create/review/finalize/amend; private record-read helper; repository ports | No HTTP adapter, public history enumeration, allergies service, record read entrypoint, or client `If-Match` handling for clinical commands |
| AI | Tool and completion gateways, Dify adapter, bounded read tools, tenant-only knowledge search, human draft transitions; AI PostgreSQL adapters | No complete conversation API, safe draft-generation orchestration, draft read/edit/resubmit API or approved clinical handoff implementation |
| Audit/platform | Metadata-first audit builder/sink, PostgreSQL audit adapter, idempotency/outbox contracts and tests | Preserve audit semantics; endpoint-wide durable audit/idempotency integration is not demonstrated |
| Persistence | Migrations `001`–`012`; core Patient/Tenant/Doctor/Appointment/Clinical data-access files currently re-export repository ports; AI/Audit contain concrete SQL adapters | Schema and ports do not establish complete domain persistence. Never replicate these internals in mobile |
| Tests/CI | Node unit, handler, migration and conditional PostgreSQL tests; lint/type/build/boundary tooling in current quality workflow | Inspected tests use fakes for many domain paths. Runtime, safety and release guarantees still need integration evidence |

No course requirement, mandated Android deliverable, iOS launch requirement, device fleet, mobile expertise or deadline was found. The documented four full-stack engineers and TypeScript code are relevant context, not proof of React or mobile proficiency.

## Classification of major existing decisions

| Category | Decision/content | Why and treatment |
|---|---|---|
| A — REUSE AS MOBILE BUSINESS/DOMAIN REFERENCE | Tenant ≠ location; patients belong to tenants; doctor/appointment/patient references must agree | These are product identities and workflow invariants independent of client technology |
| A | Endpoint-specific permissions, active memberships, field minimization and clinical need-to-know | Mobile exposes permitted actions; backend remains the authority |
| A | Appointment transitions, shift-based availability, derived queue, double-booking conflict | Same clinic workflow on a phone; availability is never a reservation |
| A | Clinical `DRAFT → IN_REVIEW → FINALIZED`, append-only versions and amendments | Preserve clinical meaning and accountability; do not invent editable finalized records |
| A | AI advisory/draft distinction, human approval, step-up MFA, tenant-only retrieval, audit and retention rules | Safety and data governance do not depend on screen technology |
| A | `/api/v1`, error semantics, strong ETag/If-Match, opaque pagination, scoped idempotency | Public interaction requirements apply to every client; gaps are catalogued rather than copied as defects |
| B — REUSE AS ARCHITECTURAL PRINCIPLE ONLY | Presentation/application/domain separation and dependency direction | Use a small client UI/state/data arrangement; do not replicate every backend layer |
| B | Public contracts, explicit ownership, isolated AI and identity adapters, default deny | Preserve boundaries and review responsibility, not Nx tags or server factory signatures |
| C — BACKEND-SPECIFIC — DO NOT COPY INTO MOBILE | PostgreSQL, SQL, migrations, repository ports/adapters, `BIGINT` implementation, transaction/outbox infrastructure | Server owns persistence, atomicity, scheduling conflicts and audit durability; mobile carries opaque ETags and keys only |
| C | Nx backend projects, Node test runner, database integration suite, secret/KMS and Dify/provider implementation | Backend runtime and deployment mechanisms; no imports or reimplementation in the app |
| D — WEB-SPECIFIC — DO NOT COPY | `apps/web`, `libs/web/api-client`, browser routing/UX assumptions in architecture | Present only as scaffold/concept. There is no existing React/Next/Vite decision to inherit |
| E — MOBILE-SPECIFIC — MUST BE DESIGNED | Framework, navigation, session coordinator, API DTO mapping, local state and request lifecycle | Not defined by source; proposed in ADR-M01–M06 and M10 |
| E | Secure storage, app-switcher privacy, accessibility, process death, offline behavior, mobile CI/signing | New mobile requirements NM01–NM08; exact policies remain explicit decisions |
| E | Push notifications | New mobile capability if ever required; defer because Notification is explicitly Post-MVP |

## Findings that must not be silently resolved

1. **AUD-01 — Contract is not implementation.** There are **37** concrete method/path headings in API Contracts. Its summary says 31; its category totals also sum to 37. The separate NO_SHOW application command is not an additional HTTP endpoint.
2. **AUD-02 — Wire drift.** API prose uses snake_case DTO fields, canonical nested errors and pagination envelopes. Current handlers return camelCase structures/bare arrays and `{ code }`; `/me` returns actor/membership/tenant rather than the documented user profile and requires an unambiguous active membership. There is no chosen tenant-context transport.
3. **AUD-03 — Workflow reachability.** A new appointment is `PENDING`; check-in requires `CONFIRMED`. Confirmation has an internal generic transition but no concrete HTTP contract. Clinical history, record lookup from encounter, draft recovery and several lifecycle actions are not publicly reachable.
4. **AUD-04 — Clinical concurrency/amendment.** Approved public OCC needs a mutable resource ETag; current medical record has `currentVersion`, without a distinct public OCC input/version. Clinical commands do not accept `If-Match`. `AMENDED` exists, but review/finalize only accept `DRAFT/IN_REVIEW`, and amendment creation only accepts `FINALIZED`; subsequent amendment lifecycle is unresolved.
5. **AUD-05 — AI approval gap.** Draft functions enforce HUMAN and state transitions, but obtain the current version themselves, with no client review-version comparison, step-up proof, durable idempotency, audit hook or clinical handoff. `draft_clinical_note` is defined as requiring approval; DefaultAiGateway denies non-read tools with that flag before execution. Generation needs a safe orchestration contract, not removal of the approval guard.
6. **AUD-06 — Field/policy gaps.** Patient `sex` and `status` deliberately remain open strings. Current create requires nonempty demographic/contact fields including all contact fields. Clinical initial content requires all four nonempty fields. Product must resolve allowed values/optionality and avoid encouraging fabricated clinical data. Role test fixtures such as `ADMIN` are not canonical product roles; Nurse/Clinical Staff and Receptionist wire identifiers are unspecified.
7. **AUD-07 — Security integration gap.** Authorization is injected, several related-resource checks are delegated to missing composition/persistence, and durable audit is not wired across domain paths. Local UI gating cannot compensate.
8. **AUD-08 — Stale governance prose.** Earlier passages call retention, role mapping and knowledge scope open; explicit approved follow-ups establish separate staff roles, tenant-only MVP knowledge and an AI retention baseline. Preserve the stronger, explicit decisions and record remaining implementation/release gaps.
9. **AUD-09 — Current quality gate.** Read-only execution of `node tools/validate-boundaries.mjs` failed with **5** findings: platform-audit → audit-contracts, and four PostgreSQL integration-test imports into platform-context, ai-tools, audit-data-access and ai-data-access. The older report's 13 is not the current count. No violation was fixed in this task.

## Evidence catalogue

| ID | Reference inspected | Reuse |
|---|---|---|
| R01 | [System Definition](../../../Viora/docs/product/system-definition.md), especially §§3–14, 25–26, 29–34 | Product, actors, scope and workflows |
| R02 | [Architecture](../../../Viora/docs/architecture/architecture-decisions.md), §§3–12, AI/domain boundaries and runtime structure | Principles and backend context |
| R03 | [Data Model](../../../Viora/docs/DATA-MODEL.MD), §§4–24, 29–34, 39–40, 59–60 | Entities, statuses and integrity |
| R04 | [API Contracts](../../../Viora/docs/API-CONTRACTS.md), §§3–15, 18–24 | All 37 method/path contracts, errors and concurrency |
| R05 | [Security](../../../Viora/docs/SECURITY.md), §§4–11, 15–26 | Permissions, tenancy, PHI and audit |
| R06 | [AI Safety](../../../Viora/docs/AI-SAFETY.md), §§5–30, 34–39 | AI capabilities, safety, governance and evaluation |
| R07 | [Decision Log](../../../Viora/docs/DECISION-LOG.md), DEC-001–007, approved follow-ups, BLOCK-009/010, TEN-001 | Approval provenance; not a fresh mobile approval |
| R08 | [Nx Graph](../../../Viora/docs/architecture/NX-PROJECT-GRAPH.md), [Development Contracts](../../../Viora/docs/DEVELOPMENT-CONTRACTS.md), [AGENTS.md](../../../Viora/AGENTS.md) | Boundaries and ownership; implementation rules |
| R09 | [Identity handler](../../../Viora/apps/api/src/identity-api.ts), [Identity application](../../../Viora/libs/identity/application/src/index.ts), [contracts](../../../Viora/libs/identity/contracts/src/index.ts) | Actual context resolution and wire gap |
| R10 | [Tenant handler](../../../Viora/apps/api/src/tenant-api.ts), [application](../../../Viora/libs/tenant/application/src/index.ts), [domain](../../../Viora/libs/tenant/domain/src/index.ts) | Tenant/location operations |
| R11 | [Patient handler](../../../Viora/apps/api/src/patient-api.ts), [application](../../../Viora/libs/patient/application/src/index.ts), [contracts](../../../Viora/libs/patient/contracts/src/index.ts), [domain](../../../Viora/libs/patient/domain/src/index.ts) | Profile fields, validation, OCC and search |
| R12 | [Doctor application](../../../Viora/libs/doctor/application/src/index.ts), [contracts](../../../Viora/libs/doctor/contracts/src/index.ts), [domain](../../../Viora/libs/doctor/domain/src/index.ts) | Doctor/shift information |
| R13 | [Appointment application](../../../Viora/libs/appointment/application/src/index.ts), [domain](../../../Viora/libs/appointment/domain/src/index.ts), [contracts](../../../Viora/libs/appointment/contracts/src/index.ts) | Scheduling, status and concurrency |
| R14 | [Clinical application](../../../Viora/libs/clinical/application/src/index.ts), [domain](../../../Viora/libs/clinical/domain/src/index.ts), [repository ports](../../../Viora/libs/clinical/domain/src/repository-ports.ts) | Encounters/records and implementation limitations |
| R15 | [AI contracts](../../../Viora/libs/ai/contracts/src/index.ts), [draft contract](../../../Viora/libs/ai/contracts/src/draft.ts), [gateway](../../../Viora/libs/ai/gateway/src/index.ts) | Tool boundaries and draft states |
| R16 | [Draft workflow](../../../Viora/libs/ai/tools/src/clinical-draft-workflow.ts), [draft tool](../../../Viora/libs/ai/tools/src/clinical-draft-tools.ts), [read tools](../../../Viora/libs/ai/tools/src/read-only-tools.ts), [knowledge search](../../../Viora/libs/ai/tools/src/index.ts) | Human transitions, bounded context and retrieval |
| R17 | [Completion gateway](../../../Viora/libs/ai/gateway/src/provider-completion.ts), [Dify adapter](../../../Viora/libs/ai/provider/src/index.ts), [AI persistence](../../../Viora/libs/ai/data-access/src/index.ts) | Server-only provider calls and failure semantics |
| R18 | [Authorization](../../../Viora/libs/platform/authorization/src/index.ts), [context](../../../Viora/libs/shared/src/request-context.ts), [audit builder](../../../Viora/libs/platform/audit/src/index.ts), [audit adapter](../../../Viora/libs/audit/data-access/src/index.ts), [idempotency](../../../Viora/libs/platform/idempotency/src/index.ts) | Default deny, attribution, opaque keys and persistence limits |
| R19 | [Migration guide](../../../Viora/database/migrations/README.md), [clinical migration](../../../Viora/database/migrations/010_clinical.sql), [AI scope migration](../../../Viora/database/migrations/012_ai_tenant_scope.sql) | Read-only schema evidence; no mobile schema reuse |
| R20 | [Web scaffold](../../../Viora/apps/web/project.json), [web-client scaffold](../../../Viora/libs/web/api-client/project.json), [package manifest](../../../Viora/package.json) | Verified absence of a reusable frontend |
| R21 | [Quality workflow](../../../Viora/.github/workflows/quality.yml), [boundary validator](../../../Viora/tools/validate-boundaries.mjs), [configuration contract](../../../Viora/docs/CONFIGURATION-AND-SECRETS.md) | Future CI/security principles |
| R22 | [API traceability audit](../../../Viora/docs/prep/PREP-006-API-TRACEABILITY-AUDIT.md), [security evidence matrix](../../../Viora/docs/prep/PREP-008-SECURITY-AI-EVIDENCE-MATRIX.md), [quality report](../../../Viora/docs/audits/FOUND-003-quality-gate-report.md) | Historical leads rechecked against current files |
| R23 | [Implementation Plan](../../../Viora/docs/IMPLEMENTATION-PLAN.md), [workflow](../../../Viora/docs/GITHUB-DEVELOPMENT-WORKFLOW.md), [Decision Closure](../../../Viora/docs/DECISION-CLOSURE-REPORT.md), [Decision Packets](../../../Viora/docs/DECISION-PACKETS.md) | Ownership, dependency order and approval provenance |

Specific existing tests and their evidence limits are linked in [MOBILE-TESTING.md](MOBILE-TESTING.md). Validation of this documentation batch is recorded there. Start implementation only in a separately authorized task after the relevant decisions and backend prerequisites are closed.
