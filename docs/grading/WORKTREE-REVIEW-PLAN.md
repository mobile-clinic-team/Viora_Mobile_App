# Worktree review and commit plan

Review date: 2026-09-15  
Baseline: [WORKTREE-BASELINE.md](WORKTREE-BASELINE.md)  
Revision: `7bbec4b`  
Current working tree: dirty; no history rewritten.

This review classifies the dirty application work without claiming that any feature is complete. The Phase 1A statement that no Gradle task reached execution is historical. Phase 1B.1 produced fresh targeted-test, lint, and assembly results; the full JVM suite still fails, so no dirty product feature is promoted to completed status solely from source inspection.

## Application changes

| Path | Status | Classification | Handling |
|---|---|---|---|
| `app/src/devDebug/java/com/viora/mobile/dev/FakeBackend.kt` | M | B — incomplete feature work | Keep with the role-aware demo flow; review separately from baseline evidence. |
| `app/src/main/java/com/viora/mobile/MainActivity.kt` | M | B — incomplete feature work | Review lifecycle/privacy changes with device tests. |
| `app/src/main/java/com/viora/mobile/app/AppGraph.kt` | M | B — incomplete feature work | Review composition and flavor bindings separately. |
| `app/src/main/java/com/viora/mobile/app/AppNavHost.kt` | M | B — incomplete feature work | Review route registration and authorization together. |
| `app/src/main/java/com/viora/mobile/app/AppViewModel.kt` | M | B — incomplete feature work | Review lifecycle and dirty-state behavior. |
| `app/src/main/java/com/viora/mobile/core/session/SessionCoordinator.kt` | M | B — incomplete feature work | Security-sensitive review required; preserve fail-closed behavior. |
| `app/src/main/java/com/viora/mobile/core/session/SessionModels.kt` | M | B — incomplete feature work | Review role, membership, and permission contracts. |
| `app/src/main/java/com/viora/mobile/core/ui/Theme.kt` | M | B — incomplete feature work | Review as part of the UI shell/accessibility work. |
| `app/src/main/java/com/viora/mobile/feature/appointments/ui/AppointmentScreens.kt` | M | B — incomplete feature work | Review with operational state and navigation behavior. |
| `app/src/main/java/com/viora/mobile/feature/appointments/ui/OperationalNavigation.kt` | M | B — incomplete feature work | Review with protected route registration. |
| `app/src/main/java/com/viora/mobile/feature/assistant/ui/AssistantNavigation.kt` | M | B — incomplete feature work | Review against assistant and assurance boundaries. |
| `app/src/main/java/com/viora/mobile/feature/auth/ui/LoginScreen.kt` | M | B — incomplete feature work | Keep synthetic login clearly separated from production authentication. |
| `app/src/main/java/com/viora/mobile/feature/clinical/ui/ClinicalNavigation.kt` | M | B — incomplete feature work | Review clinical route authorization. |
| `app/src/main/java/com/viora/mobile/feature/patients/ui/PatientScreens.kt` | M | B — incomplete feature work | Review patient field masking and UI states. |
| `app/src/main/java/com/viora/mobile/feature/workspace/ui/WorkspaceScreen.kt` | M | B — incomplete feature work | Review role/workspace selection and context invalidation. |
| `app/src/main/res/values/colors.xml` | M | B — incomplete feature work | Review with the UI shell and contrast evidence. |
| `app/src/main/res/values/themes.xml` | M | B — incomplete feature work | Review startup/system-bar behavior with the UI shell. |
| `app/src/main/java/com/viora/mobile/app/PatientAppShell.kt` | ?? | B — incomplete feature work | Keep separate until navigation and lifecycle tests run. |
| `app/src/main/java/com/viora/mobile/app/RoleShells.kt` | ?? | B — incomplete feature work | Review role separation with route authorization. |
| `app/src/main/java/com/viora/mobile/app/navigation/RouteAuthorization.kt` | ?? | B — incomplete feature work | Security-sensitive review; client checks cannot replace server enforcement. |
| `app/src/main/java/com/viora/mobile/core/session/Authorization.kt` | ?? | B — incomplete feature work | Review permission policy and negative cases. |
| `app/src/main/java/com/viora/mobile/core/ui/Components.kt` | ?? | B — incomplete feature work | Review as shared UI infrastructure. |
| `app/src/main/java/com/viora/mobile/core/ui/VioraBrand.kt` | ?? | B — incomplete feature work | Review as shared UI/branding work. |
| `app/src/main/java/com/viora/mobile/feature/home/ui/PatientScreens.kt` | ?? | B — incomplete feature work | Review with the patient shell and synthetic-only data. |
| `app/src/androidTest/java/com/viora/mobile/phase1/PatientPhase1SmokeTest.kt` | ?? | C — test-only work | Keep separate; execute only after the baseline build is available. |
| `app/src/test/java/com/viora/mobile/testutil/Fixtures.kt` | M | C — test-only work | Candidate isolated baseline correction; corrected fixture membership ID and role. Fresh verification is still blocked. |

No application entry is classified as **A — completed coherent feature** because current same-revision verification is unavailable. No application entry was identified as intentionally unrelated or unknown from the available source/diff evidence.

## Non-application changes

| Group | Classification | Handling |
|---|---|---|
| `build.gradle.kts`, `gradle/verification-metadata.xml` | B — toolchain/dependency work | Keep separate from product feature commits; preserve pre-existing edits. |
| `docs/ARCHITECTURE.md`, historical reports, and `docs/mobile/*` | D — documentation | Review as documentation consistency changes. |
| `docs/grading/*` | D — Phase 0/Phase 1A/Phase 1B evidence | Commit separately from application behavior. |
| `.github/workflows/android-baseline.yml` | D — CI configuration | Commit separately; configured but not hosted-verified. |
| `docs/design/viora-ui-reference.png.png` | E — visual evidence artifact | Preserve; label revision and synthetic provenance before grading use. |
| `hs_err_pid769892.log` | E — generated artifact | Preserve for owner inspection; exclude from grading evidence and commits unless explicitly needed. |

## Proposed logical commits or PRs

1. **`test: align assurance fixtures with role-aware workspace context`** — `Fixtures.kt` only. Require the targeted and full JVM test results before calling it verified.
2. **`docs: record Phase 1A and Phase 1B baseline evidence`** — grading documents plus current/historical documentation labels. Keep factual historical reports identifiable.
3. **`ci: add devDebug Android baseline workflow`** — `.github/workflows/android-baseline.yml` only. Require a hosted run before calling CI green.
4. **Separate future review: role-aware/patient-facing application work** — all pre-existing application source, resources, and the Phase 1 smoke test. Do not mix this with baseline documentation or fixture correction.
5. **Separate owner review: toolchain/dependency metadata** — `build.gradle.kts` and `gradle/verification-metadata.xml`. Do not rewrite or normalize these changes during Phase 1B.

No commit was created in Phase 1B. Existing history remains unchanged.

## Phase 1B.1 review update

## Phase 1B.2 review update

The 29 JVM failures were traced without reverting preserved work. The final logical groups are:

1. `test: align shared fixtures with current workspace and login contract` — shared login, membership, assistant, clinical, and operational test support.
2. `fix(dev): model synthetic multi-workspace access boundaries` — `FakeBackend.kt`; workspace B and restricted grants.
3. `fix(session): keep workspace selection in memory and preserve empty-workspace lock` — `SessionCoordinator.kt`; two contract-backed lifecycle fixes.
4. `test: make role-aware session context explicit` — `SessionCoordinatorTest.kt`.
5. `fix(resources): move API31 splash attributes to versioned resources` — prior baseline resource correction.
6. `build: review dependency verification metadata` — `gradle/verification-metadata.xml`, requiring owner review.
7. `ci: add devDebug Android baseline checks` — `.github/workflows/android-baseline.yml`, configured but hosted-unverified.
8. `docs: record JVM failure triage and baseline evidence` — grading reports and verification records.

Pre-existing UI/application feature work remains separate. No commit was created and existing history was not rewritten.

### Earlier Phase 1B.1 detail (historical)

The following Phase 1B.1 changes are test-support or baseline resource work and should be reviewed separately from the pre-existing product changes:

| Logical change | Paths | Classification | Evidence |
|---|---|---|---|
| Assurance fixture alignment | `app/src/test/java/com/viora/mobile/testutil/Fixtures.kt`, `app/src/test/java/com/viora/mobile/feature/assistant/AssistantFixture.kt`, `app/src/test/java/com/viora/mobile/feature/clinical/ClinicalFixture.kt`, `app/src/test/java/com/viora/mobile/app/OperationalIntegrationTest.kt`, `app/src/test/java/com/viora/mobile/feature/appointments/OperationalFixture.kt` | C — test-only work | Targeted `AssuranceHandoffBoundaryTest` fresh PASS: 16/16. Full suite remains FAIL: 29 failures. |
| API 31 splash resource correction | `app/src/main/res/values/themes.xml`, `app/src/main/res/values-v31/themes.xml` | Baseline resource correction | Fresh lint PASS: 0 errors, 34 warnings. |
| Verification metadata | `gradle/verification-metadata.xml` | Pre-existing dirty toolchain/dependency work touched by recovery | Preserve and require owner review; Gradle verification writing updated metadata during dependency resolution. |

### Revised logical commit plan

1. `test: align assurance fixtures with role-aware workspace and virtual-time behavior` — the five test-support paths above.
2. `fix: qualify API31 splash theme resources` — the two theme resource paths above.
3. `docs: record Phase 1B.1 environment recovery` — grading evidence and consistency documents.
4. `ci: add devDebug Android baseline workflow` — `.github/workflows/android-baseline.yml`; hosted execution is still required before calling CI green.
5. Separate future review for the pre-existing role-aware/patient-facing application work.
6. Separate owner review for `build.gradle.kts` and `gradle/verification-metadata.xml`; do not normalize them in this phase.

No commit was created. Existing history and all pre-existing dirty entries remain unchanged.
