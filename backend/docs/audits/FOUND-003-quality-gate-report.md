# FOUND-003 Executable Quality Gate Report

Status: **IMPLEMENTED WITH ARCHITECTURE BLOCKER**

Branch: `feature/FOUND-003-executable-quality-gates`

## Current checkpoint — 2026-09-08

**FOUND-003-BOUNDARY-FIX-012 is validated. FOUND-003 remains BLOCKED with
13 live boundary findings.** The Phase 2 RequestContext ownership decision was
approved and implemented. This batch stops here as instructed; other findings
are unchanged. Counts in earlier validation sections are historical evidence,
not the current gate result.

### FIX-012: approved RequestContext ownership

- Moved the exact RequestContext declaration to
  `libs/shared/src/request-context.ts` under the existing shared project.
- Platform-context imports and type-re-exports the canonical type while keeping
  its existing factories. AI contracts import the canonical shared type directly.
- No other consumer import, factory, public signature, security behavior,
  database, Nx configuration, or dependency-policy row was changed.
- Graph Section 8.1 records this approved ownership. The prior Phase 2 stop
  below is retained as historical context, not an outstanding approval request.

Validation:

- Focused AI and RequestContext-consuming authorization tests: **42 passed,
  0 failed, 0 skipped** (31 AI tests and 11 authorization/context tests).
- `npm run lint`, `npm run typecheck`, `npm run build`: **PASS**.
- `npm run boundaries`: **FAIL / BLOCKED, 14 -> 13 findings**. Exactly
  `libs/ai/contracts/src/index.ts -> platform-context` was resolved; no new finding.
- `git diff --check`: **PASS**.
- Declaration comparison confirmed the exact original interface, one canonical
  declaration, unchanged factory source and AI public declarations. TypeScript
  symbol resolution verified the compatibility re-export and all 17 consumer
  import bindings resolve to the same shared symbol.
- In-memory emit using the build compiler options confirmed identical JavaScript
  for platform-context and AI contracts. Shared has no outgoing imports, so the
  new type edges cannot introduce a dependency cycle. Policy rows are unchanged.
- Full-suite and PostgreSQL tests were not rerun for this type-only batch.

Batch files: the three source paths above, graph Section 8.1, and this report.
Pre-existing worktree changes were preserved. No commit, push, or PR performed.

### FIX-011: AI read-tool public projections

The project owner's continuation instruction authorizes minimal read contracts
after inspecting existing ownership and queries. Search found no suitable read
DTO: PatientReference is deliberately identity-only, request contracts are not
read results, and the current application methods return private domain entities.
The existing graph assigns public read contracts to the owning domain.

- Patient contracts now declare `PatientSummary`, extending PatientReference
  with only the five profile fields already selected by the tool.
- Clinical contracts now declare `EncounterSummary`, retaining tenant/patient
  identity for existing filtering and reusing the canonical EncounterStatus.
- ReadOnlyToolLoaders and its mappers use these contracts instead of importing
  private Patient/Encounter entities. Existing tool output contracts, explicit
  field selection, context forwarding, authorization, limits, and filters stay
  unchanged. This is not new HTTP functionality or production loader wiring.
- No policy row or validator was changed. Nx graph Section 6.2 records this
  implemented ownership under the existing approved dependency directions.

Validation on this checkpoint:

- Focused AI read-tool/Gateway, Patient application/repository/API, and Clinical
  application tests: **33 passed, 0 failed, 0 skipped** (including two added
  regressions for summary-only loaders and filtering before result limiting).
- `npm run lint`, `npm run typecheck`, `npm run build`: **PASS**.
- `npm run boundaries`: **FAIL / BLOCKED, 16 -> 14 findings**, exactly the two
  read-only-tools imports removed; no new findings.
- `git diff --check`: **PASS**.
- TypeScript checker confirmed Patient -> PatientSummary and Encounter ->
  EncounterSummary assignability without casts. In-memory TypeScript emit with
  comments removed produced identical JavaScript hashes before/after for the
  read-only tools and both contract modules. This verifies runtime behavior
  preservation alongside the focused tests.
- Full-suite and PostgreSQL integration tests were not rerun for this type-only
  batch. Historical full-suite results below are not new validation evidence.

Files changed in FIX-011:

- `libs/patient/contracts/src/index.ts`
- `libs/clinical/contracts/src/index.ts`
- `libs/ai/tools/src/read-only-tools.ts`
- `libs/ai/tools/src/read-only-tools.test.ts`
- `docs/architecture/NX-PROJECT-GRAPH.md` (ownership documentation only)
- This report (current checkpoint, historical count progression, remaining work).

No commit, push, or PR was performed. Existing FOUND-003 worktree changes remain.

## Implemented

- Root ESLint 10 configuration for TypeScript and repository tooling.
- Strict `tsconfig.json` and emitting `tsconfig.build.json`.
- Reproducible `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm run boundaries`, and `npm run quality` commands.
- Nx wrapper compatibility with the repository's ES-module package mode.
- CI installation from `package-lock.json` and execution of lint, typecheck,
  build, tests, and boundary validation.
- Mechanical type/import corrections required for the new strict gate; no
  business, database, authorization, or AI policy was changed.

## Validation evidence

The original local quality run passed lint, strict typecheck, build, and the
existing test suite: **132 passed, 0 failed, 3 skipped**. The skipped cases
are the PostgreSQL migration tests because that invocation did not opt into a
disposable database. CI supplies the pgvector PostgreSQL service and
`VIORA_DISPOSABLE_DATABASE=1`.

The earlier FOUND-003-BOUNDARY-FIX-001 safe batch was validated as follows:

- Focused appointment/doctor tests: **10 passed, 0 failed**.
- Lint: **PASS**.
- Strict typecheck: **PASS**.
- Build: **PASS**.
- `git diff --check`: **PASS**.
- Boundary validation: **FAIL** with **27 remaining findings**.

### FOUND-003-BOUNDARY-FIX-004 validation

The approved AI contract refactor was validated on its FIX-004 working tree:

- Focused AI draft repository, clinical-draft-workflow, clinical-draft-tools,
  and knowledge-search tests: **13 passed, 0 failed, 0 skipped**.
- `npm run lint`: **PASS**.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**.
- `npm test`: **132 passed, 0 failed, 3 skipped**. The PostgreSQL integration
  cases were skipped without a configured test database; this run does not
  provide new PostgreSQL integration evidence.
- `npm run boundaries`: **FAIL / BLOCKED**, **26 remaining findings**.
- `git diff --check`: **PASS**.
- Declaration comparison confirmed all four moved definitions unchanged.
  TypeScript symbol resolution confirmed that the old tools paths and new
  contracts barrel resolve to the same canonical declarations. Emitted
  runtime code is unchanged after normalizing Git/working-copy line endings;
  adapter implementation bytes outside the import replacement are unchanged
  against the pre-batch snapshot.
- Policy comparison confirmed exactly the two approved source-tag row changes.

No commit, push, or PR creation was performed for this batch.

## Resolved findings in the safe batch

The following four findings were resolved without changing architecture,
public contracts, database schema, AI safety boundaries, or security policy:

- **F-018** — appointment application-entrypoint dependency on appointment domain.
- **F-019** — appointment application-entrypoint re-export of appointment data-access.
- **F-022** — doctor application-entrypoint dependency on doctor domain.
- **F-023** — doctor application-entrypoint re-export of doctor data-access.

## AI project registration and approved contract refactor

FOUND-003-BOUNDARY-FIX-002 resolved **F-009 / F-010** by registering
`libs/ai/data-access` as `ai-data-access`. Registration exposed previously
unchecked dependencies; the validator then reported **29 findings**.

FOUND-003-BOUNDARY-FIX-004 implements the project owner's approved
FOUND-003-ARCH-DECISION-001, recorded in
`docs/architecture/NX-PROJECT-GRAPH.md` Section 6.1:

- `AiDraft`, `AiDraftStatus`, and `AiDraftRepository` now live in
  `libs/ai/contracts/src/draft.ts`.
- `KnowledgeDocumentStatus` now lives in
  `libs/ai/contracts/src/knowledge.ts`.
- The AI contracts barrel exports these declarations as types. The old
  tools paths retain type-only compatibility re-exports without duplicating
  declarations; the adapter imports the types from AI contracts.
- `boundary:ai-data-access` allows only `boundary:ai-contracts`.
  `boundary:ai-contracts` additionally allows `boundary:clinical-contract`
  for the unchanged `AiDraft.content: ClinicalRecordCreateRequest`.

This resolves the missing `ai-data-access` policy row and both
`ai-data-access -> ai-tools` import findings. It does not change SQL,
authorization, tenant isolation, concurrency, AI workflow behavior, database
schema, or the boundary validator. Other findings are not reclassified.

| Validation point | Findings |
|---|---:|
| Original audit baseline | 31 |
| After FIX-001: F-018, F-019, F-022, F-023 resolved | 27 |
| After FIX-002: F-009/F-010 resolved; additional dependencies exposed | 29 |
| After FIX-004: approved AI contract refactor | 26 |
| After FIX-005: Patient F-025/F-026 | 24 |
| After FIX-006: Doctor F-021 | 23 |
| After FIX-007: Tenant F-031 | 22 |
| After FIX-008: Appointment F-016/F-017 | 20 |
| After FIX-009: Clinical F-020 | 19 |
| After FIX-010: approved provider port alignment | 16 |
| After FIX-011: AI tools consume public read projections | 14 |
| After FIX-012: approved RequestContext ownership | 13 |

FIX-005 through FIX-010 rows preserve the completed batch checkpoints supplied
in the continuation. This run independently verified the live 16-finding start
and 14-finding result; it did not rerun or reopen those completed refactors.

## Blocking findings

The live validator reports **13 findings**. It provides paths/project names,
not numeric F-* IDs; the following identifiers are exact current findings.
The assessment describes evidence and remaining work, not a policy approval.

| Current source/project | Target or missing row | Assessment / next action |
|---|---|---|
| appointment-contracts | boundary:appointment-contract policy row missing | Policy registration mismatch; existing contract project. Inspect exact permitted dependencies in a separate batch. |
| audit-contracts | boundary:audit-contract policy row missing | Policy registration mismatch; same separate contract-row batch. |
| clinical-contracts | boundary:clinical-contract policy row missing | Policy registration mismatch; same separate contract-row batch. |
| doctor-contracts | boundary:doctor-contract policy row missing | Policy registration mismatch; same separate contract-row batch. |
| identity-contracts | boundary:identity-contract policy row missing | Policy registration mismatch; same separate contract-row batch. |
| patient-contracts | boundary:patient-contract policy row missing | Policy registration mismatch; same separate contract-row batch. |
| tenant-contracts | boundary:tenant-contract policy row missing | Policy registration mismatch; same separate contract-row batch. |
| libs/identity/application/src/identity-context.test.ts | identity-application-entrypoint | Test dependency points back through an entrypoint that re-exports the implementation. Existing application/contracts definitions are candidates for direct imports in a later independent batch. |
| libs/platform/audit/src/index.ts | audit-contracts | Production AuditEvent/AuditEventInput dependency conflicts with the platform-audit row. Correct ownership/policy resolution remains UNCERTAIN; no exception approved. |
| libs/platform/database/src/postgres-migration.integration.test.ts | platform-context | Cross-project integration scenario inside a database-port project; test ownership/policy needs a separate review. |
| libs/platform/database/src/postgres-migration.integration.test.ts | ai-tools | Same integration-test placement/dependency issue. |
| libs/platform/database/src/postgres-migration.integration.test.ts | audit-data-access | Same integration-test placement/dependency issue. |
| libs/platform/database/src/postgres-migration.integration.test.ts | ai-data-access | Same integration-test placement/dependency issue. |

### Historical Phase 2 stop: resolved by FIX-012

At FIX-011, RequestContext had one canonical declaration in
`libs/platform/context/src/index.ts`. Sixteen other source files named this
type; the AI contracts AiToolDefinition, AiAuditRecord, and AiGateway exposed it
in their signatures. IdentityContext and TenantContext had different shapes
and could not replace it. No lower-level equivalent existed.

The graph assigns stateless context interfaces to `libs/shared`, and already
permits both ai-contracts and platform-context to depend on shared-util.
Nevertheless, the continuation's Phase 2 explicitly says to STOP when changing
ownership would affect multiple consumers or public contracts. No context
declaration, factory, import, or policy was changed during that inspection.

The minimum Architecture Owner decision requested was: make the unchanged RequestContext
interface canonical in `libs/shared/src/request-context.ts`, with a compatibility
type re-export from its current platform-context path. Keep both context factories
and all authentication/authorization checks where they are. Change only the AI
contracts import to the new canonical type; existing consumers keep their paths.

The proposed source scope was exactly:

1. `libs/shared/src/request-context.ts`: move the existing declaration unchanged.
2. `libs/platform/context/src/index.ts`: type import/re-export; retain factories.
3. `libs/ai/contracts/src/index.ts`: type import from shared.

The Architecture Owner approved this scope in FOUND-003-BOUNDARY-FIX-012.
It is implemented and validated above with no new project, context shape,
runtime policy, or allowlist edge. Phases 3 and 4 have not started: the FIX-012
instruction explicitly ends this batch after validation.

These are architecture/source-graph discrepancies, not reasons to widen the
allowlist automatically. Architecture and affected owners must decide whether
to correct imports/project registration or amend the source-of-truth graph.
Until then the boundary gate must remain blocking and the repository is not
fully quality-green.
