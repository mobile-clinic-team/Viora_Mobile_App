# Worktree baseline

Audit date: 2026-09-15  
Repository: `mobile-clinic-team/Viora_Mobile_App`  
Commit observed: `7bbec4b` (`Initial Viora Android baseline`)  
Branch: `main`

This is the pre-Phase-1A inventory. No file was reverted, deleted, reset, or normalized. The entries below were dirty before the Phase 1A test-fixture correction and documentation work began. Directory entries from `git status` are expanded to their contained files so later work can be compared precisely.

## Pre-Phase-1A entries

| Path | Status | Classification | Risk | Recommended handling |
|---|---|---|---|---|
| `app/src/devDebug/java/com/viora/mobile/dev/FakeBackend.kt` | M | Pre-existing user work; likely incomplete implementation | High: changes synthetic identity, role grants, and local credential behavior | Review against session contracts; preserve until owner review and tests are complete. |
| `app/src/main/java/com/viora/mobile/MainActivity.kt` | M | Pre-existing user work; likely incomplete implementation | Medium: lifecycle, privacy cover, and window behavior changed | Review with lifecycle/privacy tests before commit. |
| `app/src/main/java/com/viora/mobile/app/AppGraph.kt` | M | Pre-existing user work; likely incomplete implementation | High: composition and environment bindings are central runtime wiring | Preserve; compare with architecture docs and verify each flavor. |
| `app/src/main/java/com/viora/mobile/app/AppNavHost.kt` | M | Pre-existing user work; likely incomplete implementation | High: route reachability and authorization can regress | Preserve; review route matrix and device navigation tests. |
| `app/src/main/java/com/viora/mobile/app/AppViewModel.kt` | M | Pre-existing user work; likely incomplete implementation | Medium: lifecycle and unsaved-state behavior | Preserve; validate rotation and auth/context invalidation. |
| `app/src/main/java/com/viora/mobile/core/session/SessionCoordinator.kt` | M | Pre-existing user work; likely incomplete implementation | Very high: session epochs, role selection, and workspace authorization | Do not simplify; review security boundary and run session tests. |
| `app/src/main/java/com/viora/mobile/core/session/SessionModels.kt` | M | Pre-existing user work; likely incomplete implementation | Very high: role and permission model is security-sensitive | Preserve; require contract and negative authorization tests. |
| `app/src/main/java/com/viora/mobile/core/ui/Theme.kt` | M | Pre-existing user work; UI implementation | Low to medium: visual regressions and accessibility contrast | Preserve; validate screenshots and accessibility. |
| `app/src/main/java/com/viora/mobile/feature/appointments/ui/AppointmentScreens.kt` | M | Pre-existing user work; likely incomplete implementation | Medium: operational form and navigation behavior | Preserve; review state and error handling. |
| `app/src/main/java/com/viora/mobile/feature/appointments/ui/OperationalNavigation.kt` | M | Pre-existing user work; likely incomplete implementation | Medium: protected route registration | Preserve; verify direct navigation and role gates. |
| `app/src/main/java/com/viora/mobile/feature/assistant/ui/AssistantNavigation.kt` | M | Pre-existing user work; likely incomplete implementation | High: assistant route and clinical action boundary | Preserve; review against AI and assurance contracts. |
| `app/src/main/java/com/viora/mobile/feature/auth/ui/LoginScreen.kt` | M | Pre-existing user work; likely incomplete implementation | Medium: demo credential flow can be confused with production auth | Preserve; label synthetic behavior and keep production fail-closed. |
| `app/src/main/java/com/viora/mobile/feature/clinical/ui/ClinicalNavigation.kt` | M | Pre-existing user work; likely incomplete implementation | High: clinical route exposure | Preserve; require authorization and lifecycle verification. |
| `app/src/main/java/com/viora/mobile/feature/patients/ui/PatientScreens.kt` | M | Pre-existing user work; likely incomplete implementation | High: patient data presentation and role separation | Preserve; use synthetic data only and review field masks. |
| `app/src/main/java/com/viora/mobile/feature/workspace/ui/WorkspaceScreen.kt` | M | Pre-existing user work; likely incomplete implementation | High: role/workspace selection affects tenant scope | Preserve; verify selection, denial, and context invalidation. |
| `app/src/main/res/values/colors.xml` | M | Pre-existing user work; UI implementation | Low: theme and contrast changes | Preserve; validate contrast and large-text presentation. |
| `app/src/main/res/values/themes.xml` | M | Pre-existing user work; UI implementation | Low: theme configuration changes | Preserve; validate startup and system-bar behavior. |
| `build.gradle.kts` | M | Pre-existing user work; toolchain configuration | High: a small diff can change every build | Preserve; reconcile only with actual wrapper/catalog versions. |
| `gradle/verification-metadata.xml` | M | Pre-existing user work; dependency verification metadata | High: accidental edits can weaken reproducibility or trust | Preserve checksums; review against dependency evidence. |
| `app/src/androidTest/java/com/viora/mobile/phase1/PatientPhase1SmokeTest.kt` | ?? | Pre-existing user work; likely incomplete implementation/test | Medium: unverified device evidence | Preserve; do not call it passing until executed on the current revision. |
| `app/src/main/java/com/viora/mobile/app/PatientAppShell.kt` | ?? | Pre-existing user work; likely incomplete implementation | High: new application shell and navigation | Preserve; review ownership and route/lifecycle behavior. |
| `app/src/main/java/com/viora/mobile/app/RoleShells.kt` | ?? | Pre-existing user work; likely incomplete implementation | High: role separation is security-sensitive | Preserve; require route authorization tests. |
| `app/src/main/java/com/viora/mobile/app/navigation/RouteAuthorization.kt` | ?? | Pre-existing user work; likely incomplete implementation | Very high: client route checks must remain fail-closed | Preserve; confirm server enforcement remains authoritative. |
| `app/src/main/java/com/viora/mobile/core/session/Authorization.kt` | ?? | Pre-existing user work; likely incomplete implementation | Very high: permission policy can expose clinical actions | Preserve; require negative tests and code review. |
| `app/src/main/java/com/viora/mobile/core/ui/Components.kt` | ?? | Pre-existing user work; UI implementation | Low to medium: shared components affect many screens | Preserve; review with screenshots/accessibility checks. |
| `app/src/main/java/com/viora/mobile/core/ui/VioraBrand.kt` | ?? | Pre-existing user work; UI implementation | Low: branding/resource changes | Preserve; verify synthetic demo presentation. |
| `app/src/main/java/com/viora/mobile/feature/home/ui/PatientScreens.kt` | ?? | Pre-existing user work; likely incomplete implementation | Medium: new patient-facing flow | Preserve; verify states and role separation. |
| `docs/design/viora-ui-reference.png.png` | ?? | Pre-existing user work; visual evidence artifact | Medium: may be mistaken for current validated UI evidence | Preserve; label revision, synthetic status, and provenance before grading use. |
| `hs_err_pid769892.log` | ?? | Generated/build artifact | Medium: may contain machine paths or diagnostics; not source evidence | Preserve for investigation; do not publish as grading evidence. |
| `docs/grading/GRADING-MATRIX.md` | ?? | Phase 0 grading artifact | Low: baseline scoring can become stale | Preserve; update only with verified Phase 1A evidence. |
| `docs/grading/GAP-ANALYSIS.md` | ?? | Phase 0 grading artifact | Low: gap priorities depend on current evidence | Preserve; append verified Phase 1A updates. |
| `docs/grading/MASTER-ROADMAP.md` | ?? | Phase 0 grading artifact | Medium: future work can be misread as current scope | Preserve; update phase status without starting later phases. |

## Phase 1B.2 additions

| Path | Status | Classification | Risk | Recommended handling |
|---|---|---|---|---|
| `app/src/devDebug/java/com/viora/mobile/dev/FakeBackend.kt` | M | Preserved user work with Phase 1B.2 synthetic fixture correction | High: workspace and role grants affect negative authorization coverage | Review separately as a dev-only fixture change; retain synthetic data and verify grant boundaries. |
| `app/src/main/java/com/viora/mobile/core/session/SessionCoordinator.kt` | M | Preserved user work with Phase 1B.2 minimal production lifecycle correction | Very high: persistence and empty-workspace behavior are security-sensitive | Require focused code review against `AUTH-SECURITY.md`; keep the fix separate from feature work. |
| `app/src/test/java/com/viora/mobile/core/session/SessionCoordinatorTest.kt` | M | Phase 1B.2 test-only context correction | Medium: role fixture affects authorization assertions | Keep separate and retain the explicit valid doctor context. |
| `.android-recovery-5/` | ?? | Generated environment-recovery directory | Medium: temporary debug signing/Android state; machine-specific | Temporary debug keystore was removed; keep out of commits and remove only through explicit owner-approved cleanup. |

The final Phase 1B.2 review is recorded in [JVM-FAILURE-TRIAGE.md](JVM-FAILURE-TRIAGE.md). No pre-existing path was reverted, reset, or deleted.

## Safety conclusion

All 19 modified tracked files and 10 pre-existing untracked paths were treated as user work or user-generated evidence. None was reverted or deleted. The Phase 1A-only change to `app/src/test/java/com/viora/mobile/testutil/Fixtures.kt` and new Phase 1A documentation/CI files are outside this pre-Phase-1A snapshot and are identified as such in subsequent status reviews.

## Phase 1B.1 additions and recovery artifacts

These paths were created or changed after the pre-Phase-1A snapshot. They are recorded here so the repository-local recovery artifacts and narrow baseline corrections are not confused with pre-existing product work.

| Path | Status | Classification | Risk | Recommended handling |
|---|---|---|---|---|
| `app/src/test/java/com/viora/mobile/feature/assistant/AssistantFixture.kt` | M | Phase 1B.1 test-only work | Medium: test lifecycle scheduling and demo credentials affect assurance coverage | Review as an isolated test-support change; targeted assurance class is fresh PASS. |
| `app/src/test/java/com/viora/mobile/feature/clinical/ClinicalFixture.kt` | M | Phase 1B.1 test-only work | Medium: fixture login affects clinical test coverage | Keep separate; review remaining full-suite failures. |
| `app/src/test/java/com/viora/mobile/app/OperationalIntegrationTest.kt` | M | Phase 1B.1 test-only work | Medium: fixture login affects integration coverage | Keep separate; review remaining full-suite failures. |
| `app/src/test/java/com/viora/mobile/feature/appointments/OperationalFixture.kt` | M | Phase 1B.1 test-only work | Medium: role/membership fixture affects authorization coverage | Keep separate; review remaining full-suite failures. |
| `app/src/main/res/values-v31/themes.xml` | ?? | Phase 1B.1 baseline resource correction | Low: API-specific startup theme resource | Review with `values/themes.xml`; fresh lint has 0 errors. |
| `.gradle-local/` | ?? | Phase 1B.1 generated recovery cache | Medium: local cache is machine-specific and can be large | Keep out of commits; remove only as an explicit cleanup after review. |
| `.android-local/`, `.android-recovery-2/`, `.android-recovery-3/`, `.android-recovery-4/` | ?? | Phase 1B.1 generated Android preference/lock test directories | Medium: generated local signing/analytics state; one lock failure was observed | Keep out of commits; retain only while diagnosing the Windows file-lock limitation. |

The Phase 1B.1 status and logical commit boundaries are maintained in [WORKTREE-REVIEW-PLAN.md](WORKTREE-REVIEW-PLAN.md). No path was reset, discarded, or blindly normalized.
