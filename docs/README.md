# Viora Mobile documentation

Foundation Contract Closure, 2026-09-08. These 13 contract documents are the authority for the greenfield Android MVP and the new backend contract it requires.

Implementation update, 2026-09-09: the synthetic devDebug foundation now exists. See [implementation evidence](FOUNDATION-IMPLEMENTATION.md) and [build instructions](../README.md). The closure ledger below concerns contract readiness, not a live backend or clinical release.

## Ownership and reading order

| Document | Owns |
|---|---|
| [PRODUCT-SPEC.md](PRODUCT-SPEC.md) | Scope, acceptance outcomes and BLOCKED DECISION register |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Accepted Kotlin/Compose architecture, pinned foundation, state and concurrency ownership |
| [DOMAIN-MODEL.md](DOMAIN-MODEL.md) | Field dictionary, mutation allowlists, relationships and lifecycle transitions |
| [AUTH-SECURITY.md](AUTH-SECURITY.md) | Login, session rotation, workspace trust, assurance and durable audit |
| [API-SPEC.md](API-SPEC.md) | Wire schemas, endpoint IDs, errors, validators and operation recovery |
| [DATA-STORAGE.md](DATA-STORAGE.md) | Credential/receipt persistence, sensitive memory and device privacy |
| [AI-ASSISTANT-SPEC.md](AI-ASSISTANT-SPEC.md) | Synchronous execution, human review and atomic clinical handoff |
| [USER-FLOWS.md](USER-FLOWS.md) | Navigation topology and complete user sequences |
| [SCREEN-SPEC.md](SCREEN-SPEC.md) | Typed route inputs and screen interaction/recovery |
| [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md) | Future single-module package and source-set placement |
| [TESTING.md](TESTING.md) | Fixtures, deterministic acceptance cases and client/backend evidence boundaries |
| [DEVELOPMENT-GUIDE.md](DEVELOPMENT-GUIDE.md) | Implementation handoff, validation workflow and next bounded batch |

## Audit closure ledger

The numbered findings below preserve the supplied audit issue list. CLOSED means the technical contract is specified, not that implementation tests have passed. BLOCKED DECISION means its technical mechanism is specified but the cited owner policy still prevents feature acceptance. No unresolved HIGH/CRITICAL finding is silently marked ready.

| Finding | Disposition | Resolution / authoritative owner |
|---|---|---|
| 01 Workspace authorization | BLOCKED DECISION BD-01 | Membership, grant transport, revision invalidation and field masks are defined in AUTH-SECURITY; actual role/relationship grants need owner approval |
| 02 Authentication transaction | CLOSED | One broker/PKCE/state/nonce/callback/exchange sequence in AUTH-SECURITY; deployment registration is BD-06 |
| 03 Session races | CLOSED | Single-flight rotation, atomic publication, epoch rejection, logout and lost-response rules in AUTH-SECURITY |
| 04 API wire definitions | CLOSED | Exact endpoint schemas, header presets, envelopes, nullability, errors, limits and recovery in API-SPEC; gated business endpoints return FEATURE_UNAVAILABLE |
| 05 Domain ownership/invariants | BLOCKED DECISION BD-02 | Domain dictionary fixes technical ownership/cardinality; patient catalogues, MRN and required-field policy remain owner decisions |
| 06 Version relationships | CLOSED | Strong ETag/versionToken equality, separate clinical currentVersion and atomic preconditions in API-SPEC |
| 07 Idempotency/unknown outcome | CLOSED | Actor/workspace operation identity, durable admission, reference receipts and close-if-not-admitted recovery in API-SPEC |
| 08 Appointment lifecycle | BLOCKED DECISION BD-03 | Transition commands and concurrency defined in DOMAIN-MODEL; initial state, occupancy and operational eligibility remain gated |
| 09 Clinical lifecycle | BLOCKED DECISION BD-04 | Working/reviewed/finalized/amended versions and encounter commands defined in DOMAIN-MODEL; clinical eligibility/sign-off remain gated |
| 10 Resource discovery | CLOSED | Nullable relationship links, encounter/version/conversation/message reads and receipt routing in DOMAIN-MODEL/API-SPEC/SCREEN-SPEC |
| 11 AI clinical handoff | CLOSED | Exact existing DRAFT target, dual validators, step-up, atomic commit and verifiable evidence in AI-ASSISTANT-SPEC; use still requires BD-01/BD-05 |
| 12 AI execution/visibility/retention | BLOCKED DECISION BD-05 | Synchronous mode, owner/context binding, safe public projection and provenance defined; approved data use/retention require owners |
| 13 Audit persistence | CLOSED | Trusted attribution, event catalogue, transaction coupling and failure behavior in AUTH-SECURITY; retention is BD-05 |
| 14 Sensitive-state/device privacy | CLOSED | Memory-only forms, bounded visibility, encrypted metadata, backup/IME/platform rules in DATA-STORAGE |
| 15 Android foundation choices | CLOSED | Exact baseline, variants and composition in ARCHITECTURE; subsequent build verification is recorded in FOUNDATION-IMPLEMENTATION |
| 16 State ownership/placement | CLOSED | Epochs, ViewModel lifecycle, acknowledged events and feature-owned UI in ARCHITECTURE/PROJECT-STRUCTURE |
| 17 Screen interaction | CLOSED | S00-S26 define inputs, entry/exit, validation, permission, unsaved changes and reconciliation in SCREEN-SPEC |
| 18 Executable testing contract | CLOSED | Named fixtures and T01-T23/B01-B06 acceptance cases, source sets, device matrix and commands in TESTING |

## Readiness boundary

The synthetic Android foundation is implemented and build-verified. See FOUNDATION-IMPLEMENTATION for its exact coverage; this does not establish clinical policy, live identity registration or a production backend.

BD-01 through BD-06 in PRODUCT-SPEC remain explicit gates for their dependent live capabilities. Full MVP and clinical pilot readiness remain blocked. The earlier documentation-only batch introduced no source; the subsequent authorized foundation batch added Android source and build dependencies, with no backend or Git publication.
