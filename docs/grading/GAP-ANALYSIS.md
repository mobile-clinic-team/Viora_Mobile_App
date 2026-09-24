# Viora gap analysis

Audit date: 2026-09-15. This document expands [GRADING-MATRIX.md](GRADING-MATRIX.md) into an execution-oriented baseline. It does not implement Phase 1 or any later phase.

## Executive assessment

Viora is a serious Android client foundation with unusually strong domain, API, session, privacy, lifecycle, and AI safety contracts. It is not yet a production-oriented application in the grading sense because the server boundary described by those contracts is absent from this repository and production variants are intentionally unavailable.

The current product can demonstrate synthetic clinic workflows. It cannot honestly demonstrate live staff authentication, server-enforced authorization, a real database/API, real provider-backed AI, durable server-side idempotency/audit, or a releasable production artifact. The application therefore has a good architectural base but a high integration and evidence risk.

## Evidence classification

| Class | Meaning in this audit |
|---|---|
| Verified source | Behavior visible in current source, with a test or direct static check that corresponds to it. |
| Historical report | A dated report records a real prior command/artifact. It is not treated as a fresh pass for the current worktree. |
| Contract/design | A requirement, schema, or proposed flow. It is not implementation evidence. |
| Local ignored artifact | Build output, screenshot, emulator log, or APK under ignored paths. Useful for investigation; not portable grading evidence by itself. |
| Worktree-only | Current uncommitted or untracked source. It must be reviewed and committed before being described as delivered. |

## Cross-cutting gaps

### G-01 — Committed baseline and worktree are not the same product

Evidence: Git shows one commit on `main` and 29 dirty entries: 19 tracked modifications and 10 untracked paths. The worktree includes role-aware shells, patient-facing screens, route authorization, UI components, a Phase 1 smoke test, and a design image. Some tracked files overlap foundation/navigation/security behavior.

Impact: Reviewers cannot tell which behavior is the agreed baseline. Test and screenshot claims may target a different revision than the committed source.

Required technical work: review the diff, run the complete flavored checks on the chosen revision, split or discard changes only under an explicitly authorized follow-up, and commit logically.

Required non-technical work: assign ownership and review approval for the current scope; identify the grading/demo revision.

### G-02 — Documentation drift

Evidence: Root documentation says the synthetic Android foundation and operational/clinical/assistant foundations exist. Several `docs/mobile/*` files still say that no Android project/source/tests exist and that the architecture is only proposed. The root architecture says Gradle 8.13/AGP 8.13.2, while the committed build files request Gradle 9.6.0/AGP 9.4.0.

Impact: A grader can find contradictory claims and reasonably question the project’s control of its own evidence.

Required technical work: choose the actual supported toolchain, update the owning docs and reproducibility report, validate links and commands, and archive historical proposals clearly.

Required non-technical work: architecture owner sign-off on the toolchain and a document owner for deprecation/history labels.

### G-03 — No backend/database implementation is present

Evidence: No backend source, SQL, migrations, OpenAPI executable file, service deployment configuration, or database test environment exists in this repository. The API/domain documents explicitly describe contracts and gates; Android uses fakes or unavailable bindings.

Impact: The 1.50-point Database/API criterion cannot reach full evidence. Client fakes cannot prove authorization, atomicity, data persistence, audit durability, or idempotency.

Required technical work: implement the backend vertical slice in the authorized service boundary, with schema/migrations, test database, auth/context policy, API contract tests, and deployed non-PHI environment.

Required non-technical work: close BD-01 through BD-06 with product, clinical, security, privacy, deployment, and release owners.

### G-04 — Production authentication and environment are fail-closed

Evidence: `devDebug` uses `FakeBackend` and no network login. Staging/prod use `UnavailableGateway`/unavailable repositories and the live build guard. `HttpStepUpGateway` and `HttpClinicalHandoff` provide boundaries, but no live OIDC registration, callback App Link, issuer, API origin, or real auth/workspace adapters is configured.

Impact: No production runtime or live protected read can be claimed.

Required technical work: implement server-mediated OIDC broker flow, callback validation, refresh/revoke, workspace context, server permission enforcement, environment injection, and live integration tests.

Required non-technical work: register provider clients/domains, approve signing custody and environment ownership, and verify no production credentials enter Android.

### G-05 — AI is a synthetic/client proof of concept

Evidence: `SyntheticAssistantBackend` drives the assistant/draft flow. Staging/prod bind `UnavailableAssistant`. The client has a clinical handoff adapter and strict evidence validation, but no live assistant repository/provider adapter or backend AI gateway is present. Reports explicitly state that synthetic/client tests do not prove provider privacy, clinical safety, or production readiness.

Impact: The largest rubric category remains high risk. A working chat screen alone will not satisfy the criterion for a clinical assistant.

Required technical work: implement bounded context loading, tenant-only knowledge, provider isolation, output validation, safe deferral, real step-up, durable operation recovery, atomic draft→clinical handoff, audit, retention, and safety evaluation.

Required non-technical work: approve AI use cases, data processing/provider terms, clinical safety thresholds, human review policy, retention/deletion/hold rules, and named clinical accountability.

### G-06 — Current verification is not green for the present worktree

Evidence: The wrapper command failed because it attempted to create `C:\.gradle\...` and network access was denied. A direct cached Gradle 9.6 run failed during generated dependency-accessor compilation because the external cached Gradle JAR was access-denied. Existing `app/build/test-results` contains a dated report with 139 tests, 4 failures, 0 errors, 0 skipped, all four in `AssuranceHandoffBoundaryTest`; existing device XML contains a targeted 5/5 result. These are artifacts, not a fresh full-suite pass.

Impact: Current build/test status is unknown-to-failing, not green. Historical 95/95 and 17/17 reports must be labeled historical.

Required technical work: restore a verified wrapper/toolchain path, rerun `:app:testDevDebugUnitTest`, `:app:lintDevDebug`, `:app:assembleDevDebug`, and the full connected suite on the same revision; investigate the four failures rather than suppressing them.

Required non-technical work: agree which revision is the grading baseline and retain dated raw reports.

### G-07 — CI is unverified and release/deployment evidence is absent

Evidence: A minimal `.github/workflows/android-baseline.yml` now exists, but no hosted run has been observed. Release docs are proposed. There is no checked-in signing configuration, AAB/release artifact, artifact hash record in versioned evidence, promotion record, deployment configuration, monitoring, or rollback evidence.

Impact: Team/Git, Testing, Android, Presentation, and Completeness points are all weakened.

Required technical work: execute and harden the baseline CI for verified devDebug checks, then add static/secret/dependency scans, artifact inspection, and later controlled release builds. Keep signing secrets external.

Required non-technical work: define reviewers, release custodian, environment promotion, distribution channel, incident ownership, and assessment submission format.

### G-08 — Usability and research evidence are thin

Evidence: Product/user-flow documents are detailed. Synthetic UI tests exercise 360dp emulator paths and state branches. Reports explicitly omit complete 200% font/accessibility, physical-device, full process-kill, offline-form, and live-provider validation. No user research artifacts were found.

Impact: UI/UX and Idea/Problem Analysis cannot reach full points from code alone.

Required technical work: complete accessibility/adaptive/privacy test matrix and package same-revision screenshots.

Required non-technical work: conduct genuine interviews/survey/usability review and report sample/method/limitations honestly.

## Criterion-by-criterion action gaps

### Presentation/report

Already present: a strong specification/report set and explicit synthetic boundaries.

Missing: one coherent grading narrative, current evidence index, diagrams/screenshots, demo script, and submission-ready report.

Technical: make evidence links portable and version-aligned.

Non-technical: prepare slides, speaking roles, and a claim review.

Risk: medium; easy to improve after the product baseline is stable.

### Idea/problem analysis

Already present: clinic team scope, roles, product goals, workflow, exclusions, and safety constraints.

Missing: stakeholder validation and measurable problem evidence.

Technical: map research findings to acceptance tests.

Non-technical: obtain real feedback with no PHI and document it.

Risk: medium–high because fabricated or unverifiable research would invalidate the evidence.

### UI/UX

Already present: Compose/Material 3, role shells, typed navigation, synthetic banner, operational/clinical/assistant screens, and explicit states.

Missing: current-revision verification, full accessibility/privacy matrix, and reviewable visual evidence.

Technical: finish UX hardening after choosing the baseline.

Non-technical: usability review and presentation capture.

Risk: high while the worktree is unsettled.

### Android application/architecture

Already present: the documented separation between Compose, ViewModels, repositories, HTTP, session, storage, and operations; no database credentials or direct database access; dev-only fake graph; guarded live variants.

Missing: real services, production auth, release validation, and current clean verification.

Technical: complete the vertical integration in dependency order.

Non-technical: approve decisions and release ownership.

Risk: high.

### Database/API

Already present: authoritative domain/API/security/storage contracts and selected DTO/client adapters.

Missing: server, database, migrations, deployed environment, and server-side evidence.

Technical: backend/API vertical slice.

Non-technical: policy and data-governance approvals.

Risk: very high.

### AI integration

Already present: safe context boundary, draft-first model, version/OCC checks, synthetic human review, simulated handoff evidence, and failure-state tests.

Missing: real provider-backed backend, safety evaluation, governance, and a real atomic handoff.

Technical: backend AI stages and live Android adapter.

Non-technical: clinical/privacy/provider decisions.

Risk: very high.

### Testing

Already present: broad JVM/device test structure and meaningful negative cases.

Missing: fresh full pass, CI, backend integration, physical/accessibility/process-death evidence, and safety evaluation.

Technical: fix toolchain and failing tests, then add missing acceptance tests.

Non-technical: review test results and sign off release gates.

Risk: high.

### Team management/Git

Already present: a Git remote and an initial commit with logically separated source/docs.

Missing: shared workflow, review trail, branches/issues, ownership, milestones, and CI.

Technical: CI and contribution metadata.

Non-technical: allocate work and retain review evidence.

Risk: medium.

### Creativity/completeness

Already present: multi-workspace clinic context, privacy-aware outcome recovery, and human-reviewed AI/clinical separation.

Missing: a working server-backed product path and evidence that these design choices work in practice.

Technical: complete one safe vertical slice.

Non-technical: explain the differentiator and compare it with alternatives.

Risk: high.

## Baseline decision

The project is ready for a controlled stabilization phase. It is not ready for a production release, real patient data, real clinical pilot, or a claim of full rubric completion. The highest-return immediate work is evidence/toolchain/Git stabilization, followed by a real backend/API vertical slice that the Android app can consume.

## Phase 1A closure evidence

- The pre-Phase-1A dirty worktree is inventoried in [WORKTREE-BASELINE.md](WORKTREE-BASELINE.md). No pre-existing entry was discarded.
- Toolchain truth is separated from historical execution claims in [TOOLCHAIN-BASELINE.md](TOOLCHAIN-BASELINE.md). The current configuration remains Gradle 9.6.0/AGP 9.4.0/Kotlin 2.3.10 with Java target 17.
- The four assurance failures were traced to test support returning a context without the newly required membership ID and role. The production boundary remains fail-closed; the fixture was corrected. Fresh verification remains blocked before task execution by external wrapper/cache/plugin resolution conditions.
- A CI workflow exists at `.github/workflows/android-baseline.yml`, but no hosted run has been observed. It is proposed operational evidence until GitHub executes it successfully.

## Historical Phase 1B closure evidence (superseded)

- Targeted `AssuranceHandoffBoundaryTest`, full JVM tests, lint, and assemble were attempted on the preserved dirty worktree at revision `7bbec4b`. All were blocked before task execution by wrapper permissions or unavailable offline AGP `9.4.0` plugin resolution.
- `adb` was found, but the device list was empty; connected tests were correctly recorded as `NOT_EXECUTED`.
- [WORKTREE-REVIEW-PLAN.md](WORKTREE-REVIEW-PLAN.md) keeps the fixture correction, documentation, CI, toolchain metadata, and pre-existing application work in separate review boundaries.
- The Android baseline remains unverified and is not ready for a GO decision.

## Phase 1B.1 closure evidence

## Phase 1B.2 closure

The recovered local environment now executes the Android baseline. The initial 29 JVM failures were triaged into 19 shared login/fixture failures, 7 synthetic multi-workspace fixture failures, and 3 session lifecycle/role-context failures. Shared test support was corrected, the dev fake backend now represents the two synthetic workspaces and their distinct grants, and `SessionCoordinator` was minimally corrected to keep workspace selection in memory and retain a locked identity when no membership exists. Fail-closed authorization and all security/clinical assertions were preserved.

Fresh same-revision evidence is now:

- Full JVM: `PASS`, 139/139, 0 failures, 0 skipped, 0 errors.
- `AssuranceHandoffBoundaryTest`: `PASS`, 16/16.
- `lintDevDebug`: `PASS`, 0 errors, 34 warnings.
- `assembleDevDebug`: `PASS` with a temporary debug-only workspace keystore; the ordinary Windows debug-keystore lock path remains `BLOCKED_BY_ENVIRONMENT`.
- Connected tests: `NOT_EXECUTED`, no device/emulator.
- Hosted CI: `NOT_EXECUTED`, workflow configured but no hosted run observed.

The testing gap is narrowed but not closed. Remaining evidence gaps are hosted CI, connected-device/accessibility execution, clean logical commit/review of the preserved worktree, production backend/API/authentication, real AI integration, and release evidence. The exact failure inventory and commit grouping are in [JVM-FAILURE-TRIAGE.md](JVM-FAILURE-TRIAGE.md).

## Phase 1D.2 finalized survey evidence

The business-analysis evidence gap for criterion 2.1 is substantially closed. docs/ba/ now indexes the 61-response Google Forms evidence, records the supplied quantitative results, documents seven findings, maps findings to existing requirements and user stories, and provides a Vietnamese report-ready section and figure plan.

Criterion 2.1 is **READY / STRONG EVIDENCE** for final report preparation. The survey is exploratory convenience sampling, not statistically representative or clinical validation. A sanitized raw export and Q19 qualitative analysis remain pending; optional clinician feedback is not required unless the project claims clinical validation.

The survey supports prioritizing patient search, clinical records, doctor/schedule and appointments, recoverable errors, authentication/RBAC, and one bounded human-reviewed AI use case. It does not provide evidence that the real API, persistent database, authentication, AI provider, or deployment already exists; those remain separate implementation gates.

## Phase 2 UI/UX audit

The UI/UX foundation is substantial but the grading artifact is incomplete. The current Compose routes, screens, state coverage, Material 3 tokens, usability issues, accessibility static review, Figma frame set, component plan, prototype flow, Android mapping, and evidence checklist are now documented under `docs/ux/`.

Criterion 2.2 remains **PARTIAL / FIGMA EVIDENCE PENDING**. No actual Figma file, click-through prototype, same-revision Android screenshot set, device accessibility execution, or Figma-to-Android comparison is claimed. The highest-value pre-submission work is to create the specified Figma artifact, capture matching synthetic Android states, and resolve the small high-severity state/recovery gaps.

### Earlier Phase 1B.1 detail (historical)

- Gradle environment recovery succeeded with a repository-local `GRADLE_USER_HOME`; the declared toolchain was preserved. The `C:\.gradle` target was caused by unset `GRADLE_USER_HOME` combined with Java `user.home=C:\`.
- Fresh targeted assurance evidence is `PASS` at 16/16. The four historical failures were corrected in test support, with production fail-closed authorization unchanged.
- Fresh full JVM evidence is `FAIL`: 139 executed, 110 passed, 29 failed, 0 skipped, 0 errors. The remaining failures are preserved dirty-worktree contract drift and need a separate stabilization review.
- Fresh `lintDevDebug` is `PASS` with 0 errors and 34 warnings after the API 31 splash resource correction. An earlier same-revision `assembleDevDebug` is `PASS` and produced the dev debug APK; the final recovery rerun is `BLOCKED_BY_ENVIRONMENT` at debug-keystore locking.
- Connected tests and hosted CI are `NOT_EXECUTED` because no device/emulator or hosted runner was available. No later roadmap implementation was started.
