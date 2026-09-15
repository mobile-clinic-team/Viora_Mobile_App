# Viora master roadmap

## Phase 1B.1 current result

The Windows Gradle environment was recovered without changing the declared toolchain. The wrapper, targeted assurance class, lint, and dev debug assembly reached and completed their tasks. The full JVM suite is fresh `FAIL` with 29 failures out of 139 tests, so the Android baseline is still `NO-GO`. Connected tests and hosted CI are `NOT_EXECUTED` because no device/emulator or hosted runner was available.

## Exact next recommended phase after Phase 1B.1

**Phase 1B.2 — Preserved-worktree baseline defect triage and review.** Isolate and resolve the remaining 29 JVM failures with the owners of the pre-existing application changes, rerun the targeted and full baseline checks, then obtain a hosted CI run. Keep backend, database, production authentication, and real AI work closed until the full baseline is green or an explicit technical acceptance records the remaining failures.

Audit date: 2026-09-15.
This roadmap is the recommended execution order after the Phase 0 audit. Phase 1A established the baseline package and stopped; later phase implementation is not included.

## Phase 1A result

Complete for documentation and stabilization scope, with fresh Gradle verification blocked by the environment. The worktree inventory, toolchain baseline, verification classification, historical-document labels, and minimal Android CI workflow are recorded. The assurance fixture correction is the only code/test-support change; no backend, database, production authentication, or real AI implementation was started.

Exit condition for the next phase: run the narrow assurance test target and full devDebug lint/unit/assemble commands on a machine with the configured wrapper, AGP plugin, Android SDK, and dependency cache available. Treat any remaining test failures as fresh failures and repair them before architecture expansion.

## Exact next recommended phase

**Phase 1B — Environment-enabled baseline verification and worktree review.** Re-run the assurance test target and the full devDebug lint/unit/assemble checks on the current preserved worktree, validate the new CI workflow with a hosted run, and decide which pre-existing dirty entries belong in the reviewed baseline. Keep this phase limited to baseline verification, test/support corrections, and evidence packaging. Do not begin backend, database, production authentication, or real AI implementation until this exit evidence is green or its remaining failures are explicitly accepted.

### Historical Phase 1B result (superseded)

Attempted on revision `7bbec4b` with the dirty worktree preserved. The targeted assurance test and broad devDebug command were blocked during Gradle configuration because the offline environment lacks AGP 9.4.0; the wrapper also has an external lock/download permission problem. No Gradle task executed. `adb` was present but reported no attached device. The worktree review and logical commit plan are recorded; the Android baseline remains **NO-GO** until verification can run.

## Phase 1B.2 result

Phase 1B.2 recovered the preserved-worktree JVM baseline. Fresh local evidence is green for the targeted assurance test, the full 139-test JVM suite, lint, and dev debug assembly. Assembly required a temporary debug-only keystore because the ordinary Windows debug keystore lock remained blocked by the environment. No backend, database, production authentication, OIDC, or real AI implementation was started.

The next recommended phase is **Phase 1C — hosted CI and clean baseline review**. It should verify `.github/workflows/android-baseline.yml`, split and review the logical change groups, inspect the dependency verification metadata, and obtain device/accessibility evidence. It must remain an evidence/Git baseline phase; backend, database, authentication, and AI work stay closed until that review is complete.

## Phase 1D business-analysis result

Phase 1D prepared the real user-research and requirements evidence package without changing Android production code. The product summary, problem statement, role-derived personas, journeys, scope, FR/NFR requirements, user stories, survey plan/questions/results template, traceability matrix, and criterion 2.1 checklist are in `docs/ba/`. Criterion 2.1 remains partial until genuine survey responses and analysis exist.

The exact next recommended phase is **Phase 1D.1 — Execute the real survey and capture evidence**. Publish the neutral Google Form, collect at least 15 genuine responses, preserve the response count and aggregate charts, analyze limitations, and update the results template. Do not fabricate results or begin backend/database/authentication/AI implementation as a substitute for research evidence.

## Ordering principles

1. Make claims reproducible before adding more features.
2. Close policy decisions before coding security-sensitive or clinical behavior.
3. Build one real vertical slice through Android → HTTPS API → database → audit before expanding breadth.
4. Keep FakeBackend and synthetic fixtures for previews/tests; never allow them to represent production integration.
5. Treat server authorization, OCC, idempotency, audit, AI safety, and retention as backend acceptance gates.
6. Package evidence at the same revision as the behavior it proves.

## Recommended sequence

| Phase | Purpose | Main scope | Exit evidence | Rubric value | Risk |
|---|---|---|---|---|---|
| 0 — Master audit | Establish the truth baseline. | Repository/docs/Git/build/test/rubric audit; create this matrix, gap analysis, and roadmap. | Three grading documents; exact commit/worktree caveat; no fabricated claims. | All criteria | Complete |
| 1 — Baseline stabilization and evidence packaging | Make the project reviewable and testable. | Reconcile root/mobile docs and toolchain; choose supported Gradle/AGP versions; review current dirty changes; fix current test failures; add CI for verified `devDebug`; create an evidence index and synthetic demo script; establish branch/PR/ownership workflow. | Clean reviewed baseline commit; CI pass; current JVM/lint/build/device results; raw reports and screenshots tied to the revision; no PHI/secrets. | Android, Testing, Team/Git, Presentation, UI | Medium |
| 2 — Decisions and backend contract readiness | Remove policy ambiguity before live writes. | Close BD-01…BD-06; confirm G01…G10/B01…B06 owners; publish executable API fixtures/schema; agree environment/device/release requirements and data governance. | Approved decision records; updated contracts/tests; no feature silently enabled by guessed policy. | Idea, Android, API, AI, Testing | High |
| 3 — Real identity, workspace, and read vertical slice | Prove production trust and API boundary. | Backend OIDC broker/session/workspace service; database schema/migrations; server authorization/audit; Android HTTP auth/context adapters; patient/doctor protected reads; tenant isolation. | Deployed non-PHI test environment; live login/refresh/revoke/context; two-workspace isolation; API contract tests; Android connected evidence. | Android 2.00, API 1.50, Testing 0.75 | High |
| 4 — Operational workflow | Deliver a useful clinic operations product. | Patient search/detail/create/edit; doctor/shift reads; appointment availability/create/confirm/reschedule/cancel/check-in; server OCC/idempotency/transaction behavior; outcome recovery UI. | Same-revision real API demo with synthetic users; conflict/timeout/recovery evidence; field-level authorization; accessible screens. | UI 1.00, Android, API, Completeness | High |
| 5 — Clinical documentation | Make the core clinical workflow real and safe. | Encounter discovery/creation/start/completion policy; record create/edit/review/finalize/amend; immutable version history; allergies and unavailable-state distinction; server audit and clinical integrity. | Backend B03/B06 evidence; stale/conflict tests; no duplicate records; authorized doctor/nurse/receptionist boundary; clinical owner sign-off. | Android, API, Testing, Completeness | Very High |
| 6 — AI assistant and controlled handoff | Earn the largest rubric category honestly. | Backend AI gateway/provider adapter; bounded context and tenant-only knowledge; safe output classification; assistant conversations; draft generation/edit/review/reject; real step-up; atomic AI_HANDOFF to an existing DRAFT record; audit, retention, safety evaluation. | B05 evidence; adversarial/tenant/privacy tests; human review and stale-version rejection; one audited handoff; safe failure; no provider credentials in APK. | AI 2.00, API, Testing, Completeness | Very High |
| 7 — Release and grading closeout | Convert working software into defensible submission evidence. | Signed release build; artifact inspection/hash; environment promotion; device/accessibility/privacy matrix; monitoring/rollback plan; final report, slides, demo, contribution evidence, and risk register. | Installable non-debuggable artifact; CI/release logs; genuine screenshots/video; final rubric crosswalk; unresolved gaps disclosed. | Presentation, UI, Android, Testing, Team/Git, Completeness | High |

## Phase 1 entry criteria

Phase 1 should begin only with the current repository state preserved for review. The worktree currently contains 19 modified tracked files and 10 untracked paths, including Phase 1-looking UI/smoke-test work. Decide whether those changes belong to the baseline before claiming them.

Phase 1 must not add backend credentials, real patient data, provider secrets, a local clinical database, or a permanent fake in staging/prod. It should improve reproducibility and evidence, then stop at its agreed boundary.

## Phase 1 exit criteria

- Root documentation states the actual Gradle/AGP/Kotlin/SDK versions and valid commands.
- Historical proposals under `docs/mobile/` are labeled as historical/proposed or reconciled with the root authority.
- A chosen revision builds with the wrapper in a clean or documented environment.
- `devDebug` JVM, lint, assembly, and connected-device checks run with no failures, errors, skipped tests, or unexplained warnings that block acceptance.
- Current worktree behavior is covered by the same revision’s test and screenshot evidence.
- CI runs the same meaningful commands and stores reviewable reports.
- Git history contains scoped commits and a review record with named ownership.
- A synthetic demo script covers login/workspace, patient, schedule, clinical read, assistant/draft, safe failure, and logout boundaries without claiming live services.
- The project still clearly states that production authentication, backend/database, live AI, signing, and clinical pilot readiness are future gates if they remain incomplete.

## Evidence plan by rubric

| Criterion | Evidence to collect in later phases |
|---|---|
| Presentation/report | Final PDF/slides, architecture/data-flow diagram, demo script, current artifact links, known-limitations page, and traceable rubric table. |
| Idea/problem analysis | Interview/survey protocol and honest results, personas, workflow map, prioritized requirements, and success measures. |
| UI/UX | Same-revision screen captures, interaction video, accessibility results, large-font/device matrix, and error/recovery walkthrough. |
| Android/architecture | Source links, dependency/toolchain report, CI logs, clean build, signed artifact inspection, lifecycle/privacy tests, and live integration evidence. |
| Database/API | Executable schema/API contract, migrations, deployed test service, API contract tests, tenant/authorization/OCC/idempotency/audit results. |
| AI | Provider/gateway architecture, safety evaluation, bounded-context tests, provenance, human review/step-up/handoff results, retention policy, and failure evidence. |
| Testing | CI reports, unit/Compose/device/API/backend test results, test matrix, defect/fix history, and no skipped or suppressed failures. |
| Team management/Git | Issues, branch/PR history, review comments, contribution map, CI checks, milestones, and release checklist. |
| Creativity/completeness | Working end-to-end synthetic demonstration, measured usability, safe workflow differentiator, and comparison with the problem’s alternatives. |

## Stop conditions

Stop and escalate to the owner when a contract, role grant, clinical transition, AI data-use rule, retention rule, API route, or release credential is missing. Do not replace an unresolved decision with a UI default, client-side permission, guessed endpoint, fake database, or provider shortcut.

The exact next recommended phase is **Phase 1 — Baseline stabilization and evidence packaging**. This audit stops here as requested.
