# Member A — Operational Integration Report

> **Historical execution record (2026-09-09).** The Gradle 8.13/AGP 8.13.2 commands below describe that source checkpoint. They are not current same-revision verification; see [the Phase 1A verification baseline](grading/VERIFICATION-BASELINE.md).

2026-09-09 · Local devDebug · Operational Integration Seam

Final validation: complete. The same final source revision passed the Gradle JVM/lint/build checks and all 12 Android tests on each of API 26 and API 36 (24 final device test executions).

## 1. Files Changed

22 maintained source, test and documentation files. Generated Gradle outputs, SDK installations and ignored machine-local evidence under `.tools` are excluded from this source inventory. No Git commands, commits, branches, pushes or PRs were created.

| File | Integration purpose |
|---|---|
| [AppGraph.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/app/AppGraph.kt) | Compose shared operational ports, screens, navigator, contribution and epoch-driven picker cleanup |
| [AppNavHost.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/app/AppNavHost.kt) | Bind protected navigation; guard shell exits; clinical placeholder |
| [AppViewModel.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/app/AppViewModel.kt) | Retain dirty guard in memory across rotation; clear it on epoch change |
| [Destination.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/app/Destination.kt) | ID-only clinical placeholder route |
| [NavigationBindings.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/app/NavigationBindings.kt) | Register operational contribution through the existing mechanism |
| [OperationalDependencies.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/app/OperationalDependencies.kt) | Environment-selected ports and unavailable live bindings; new |
| [OperationalNavigatorHost.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/app/OperationalNavigatorHost.kt) | Application-owned navigation bridge and checked clinical entry adapter; new |
| [SessionModels.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/core/session/SessionModels.kt) | Validated authorized workspace locations |
| [devDebug EnvironmentBindings.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/devDebug/java/com/viora/mobile/app/EnvironmentBindings.kt) | One synthetic operational service with explicit fixtures/policy |
| [FakeBackend.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/devDebug/java/com/viora/mobile/dev/FakeBackend.kt) | Validated fixture grants, distinct field masks and locations |
| [staging EnvironmentBindings.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/staging/java/com/viora/mobile/app/EnvironmentBindings.kt) | Fail-closed operational bindings |
| [prod EnvironmentBindings.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/prod/java/com/viora/mobile/app/EnvironmentBindings.kt) | Fail-closed operational bindings |
| [OperationalScreens.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/appointments/ui/OperationalScreens.kt) | Fix workspace observation, picker dirty lifetime and visible completion handling |
| [AppointmentViewModels.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/appointments/ui/AppointmentViewModels.kt) | Acknowledge verified success before leaving or preparing another action |
| [AppointmentScreens.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/appointments/ui/AppointmentScreens.kt) | Allow a saved form to open its verified appointment |
| [OperationalIntegrationTest.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/test/java/com/viora/mobile/app/OperationalIntegrationTest.kt) | Five composition/session/location/receipt/handoff seam tests; new |
| [FoundationNavigationTest.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/androidTest/java/com/viora/mobile/navigation/FoundationNavigationTest.kt) | Assert connected doctor content instead of the retired placeholder |
| [OperationalNavigationTest.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/androidTest/java/com/viora/mobile/navigation/OperationalNavigationTest.kt) | Five integrated device flows; new |
| [README.md](C:/Users/LAPTOP/Viora-Mobile-App/README.md) | Current demo behavior and report link |
| [FOUNDATION-IMPLEMENTATION.md](C:/Users/LAPTOP/Viora-Mobile-App/docs/FOUNDATION-IMPLEMENTATION.md) | Addendum preserving historical foundation evidence |
| [OPERATIONAL-CONTRACTS.md](C:/Users/LAPTOP/Viora-Mobile-App/docs/OPERATIONAL-CONTRACTS.md) | Close wiring handoff and record synthetic policy/public seams |
| [OPERATIONAL-INTEGRATION-REPORT.md](C:/Users/LAPTOP/Viora-Mobile-App/docs/OPERATIONAL-INTEGRATION-REPORT.md) | This report; new |

## 2. Integration Completed

`AppGraph` constructs the existing session, authenticated request and operation boundaries, then obtains one cached operational dependency set from its environment bindings. devDebug shares one `SyntheticOperationalBackend` across patient, doctor and appointment repository ports. The graph contains composition and lifecycle cleanup, not scheduling policy. No dependency catalogue, build configuration or networking stack was changed.

`NavigationBindings.contributions(screens)` installs `OperationalNavigationContribution`. Patients, Schedule, Assistant and Account remain the four primary tabs; doctor discovery remains in Schedule and picker flows. The application bridge is bound only while protected navigation exists and checks the current auth/context epochs before dispatch. Existing feature read/write epoch checks continue to reject stale results. Navigation and dirty form state stay in memory across rotation and are cleared by scope invalidation. Application-scoped picker references are cleared on auth/context changes independently of Activity observers.

`WorkspaceContext.locations` validates at most 200 unique UUIDs with bounded names and ACTIVE/INACTIVE status. Location choices project ACTIVE entries from the validated context. Effective grants and patient masks are still owned by that context, not inferred from workspace IDs or role names.

`operational-demo-policy-1` is visibly synthetic. Willow includes fixture clinical-entry grants and optional demographics; Harbor has distinct data/location, no clinical-entry grants and withheld optional demographics. Both support the explicit synthetic scheduling policy. Current-day seeded appointments remain discoverable regardless of app launch time. Real staging/prod remain unavailable behind the unchanged environment build guard.

Three B-owned UI files required concrete integration fixes: lifecycle collection of workspace StateFlow (lint error), a dirty guard that survives temporary picker navigation, and acknowledgment/open/refresh of verified Saved outcomes so forms do not trap users and subsequent appointment actions can proceed. No B domain/repository implementation was refactored.

## 3. Tests

Toolchain: Gradle 8.13, AGP 8.13.2, Kotlin 2.3.10, JBR/JDK 21.0.11 on this machine, Java/Kotlin target 17, compile/target SDK 36, min SDK 26. Existing locked dependencies and checksum verification were used with `--offline`; no dependency regeneration flags.

| Command | Result |
|---|---|
| `gradlew.bat lintDebug testDebugUnitTest --offline` | Exit 1 during task selection: `Task 'lintDebug' is ambiguous in root project 'VioraMobile' and its subprojects.` No tests ran from this invocation. |
| `gradlew.bat testDebugUnitTest --offline` | Exit 1 during task selection: `Task 'testDebugUnitTest' is ambiguous ... Candidates are: 'testDevDebugUnitTest', 'testStagingDebugUnitTest'.` No tests ran from this invocation. |
| `:app:lintDevDebug --offline` | PASS — 0 errors, 31 warnings (20 dependency/version notices and 11 existing Composable naming warnings; no suppression/baseline added). |
| `:app:testDevDebugUnitTest --offline` | PASS — 75 tests, 0 failures, 0 errors, 0 skipped. |
| `:app:assembleDevDebug` and `:app:assembleDevDebugAndroidTest` | PASS — application and instrumentation APKs built; the final connected task rebuilt the final source revision. |
| `:app:connectedDevDebugAndroidTest --offline`, API 26 | PASS — 12 tests, 0 failures, 0 errors, 0 skipped; 1080px / density 480 = 360dp width. |
| `:app:connectedDevDebugAndroidTest --offline`, API 36 | PASS — 12 tests, 0 failures, 0 errors, 0 skipped; 1080px / density 480 = 360dp width. |
| `:app:preProdReleaseBuild :app:preStagingDebugBuild --offline` | Expected rejection by their shared `verifyLiveEnvironment` prerequisite: `Live environment unavailable: resolve BD-06 and implement verified OIDC wiring. Use devDebug.` No live artifact was packaged. |

The flavored task names above are the documented valid equivalents; the ambiguous shorthand failures are task-selection issues, not passing checks. Early implementation attempts also caught and repaired a Kotlin setter-name clash, an unavailable test-only Espresso import, and the unobserved workspace StateFlow lint error. They are not counted as passes. All final counts come from Gradle XML reports.

JVM coverage comprises 35 existing platform/foundation tests, Member B's 35 feature tests, and 5 new seam tests. Device coverage comprises 5 foundation tests, B's 2 Compose state tests and 5 new integration tests per API. No skipped or disabled failures are accepted.

Final build log and copied per-device reports live under `.tools/evidence/integration-*`; standard current reports remain under `app/build/reports` and `app/build/outputs/androidTest-results`. APK: `app/build/outputs/apk/dev/debug/app-dev-debug.apk`. Final APK SHA-256: `989DA523B3B247CD757476D2E88D96DB227627E4734E96ADEB166417A3B73E91`.

## 4. UI Validation

Actually exercised by the device suite:

- Login, workspace selection, all four tabs, Schedule, doctor directory/detail, and a seeded appointment list/detail.
- Patient search/detail to clinical placeholder, Return, workspace switch to Harbor, fresh search showing only Harbor's patient, and disabled clinical entry there.
- Patient detail to appointment form, doctor picker/detail selection back to the originating form, active location selection, date/time input, synthetic save, acknowledgment and appointment detail.
- Explicit confirm, verified success/refresh, check-in, verified success/refresh, then appointment-to-clinical placeholder.
- Dirty form remains guarded while a picker is visible and after rotation. Stay retains it; Home/Account prompt; Discard exits; logout removes protected content.
- Injected synthetic read failure, safe error and Retry; malformed typed route reaches unavailable content before resource access; navigation calls after logout cannot reopen protected content.
- Existing navigation/rotation and three real Keystore/envelope/key-loss tests remain part of each device run. B's two Compose tests cover Loading, Empty, Failure/Retry, Content, initial search hint and PermissionDenied.

No clinical operation, AI workflow, live backend authorization, physical-device pilot, complete 200% font/accessibility matrix, offline form matrix or real process-kill recovery is claimed by these tests. Those remain separate acceptance work.

## 5. Security Validation

Operational routes contain UUID identifiers or opaque in-memory picker handles only. No name, record, clinical note, token, ETag or appointment payload enters the route contract. Clinical entry validates route shape/grants; Create also rejects another workspace's PatientReference. The placeholder performs no clinical read/write and cannot establish resource authorization for future clinical implementation.

Protected navigation requires READY session/context; switch/logout replace its scope and clear data/handles. The JVM suite exercises delayed-result rejection and hidden destination clearing; seam tests verify old snapshots fail after a switch, old patient IDs cannot read another workspace's data, masks differ and inactive locations cannot be selected. Device tests demonstrate the corresponding workspace UI reset.

Static inspection found no SecureStore, ApiClient or direct OkHttp access in B's feature implementation. Its HTTP repositories still use the shared request models and `AuthenticatedRequestPort`; synthetic direct repository composition is explicitly permitted by ARCHITECTURE. The single existing ApiClient remains network-disabled in the demo. Receipts are persisted through the real OperationPort before commands, and acknowledged only after a visible verified success. Unknown outcomes retain metadata and remain locked; they are not replayed.

## 6. Remaining Blockers

- **Code blockers for this bounded devDebug seam:** none after final verification. Separate live-feature work still includes real auth/workspace adapters, correlated live operation dispatch, OP01/OP02/OP03 recovery and outcome UI, and broader sensitive-form privacy/accessibility acceptance. Clinical and AI implementation remain separate owners' work.
- **Backend blockers:** B01–B06 deployed authorization, scheduling atomicity, clinical integrity, durable idempotency/recovery, AI/handoff and audit evidence remain unproven by synthetic tests.
- **Product/owner decisions:** BD-01 grants/relationships, BD-02 patient fields/MRN, BD-03 scheduling policy and BD-06 deployment/OIDC/signing remain blocked. This batch does not close BD-04 or BD-05 either.
- **Environment/toolchain:** no remaining blocker for the local supported emulator matrix. SDK emulator/API images were installed and configured local AVDs used. Generic Gradle shorthand is ambiguous; explicit devDebug tasks work. Physical-device/live-provider validation remains pending before a pilot.

## 7. Member B Handoff

B's operational foundation is now composed and reachable in devDebug, with actual Gradle and device validation. Public repository/domain contracts remain unchanged. B continues to own operational UI/repository behavior. The three concrete UI fixes above close observed integration defects; they do not claim the complete operational product or live recovery workflow is finished.

## 8. Member C/D Handoff

C can consume `PatientDirectory` / `PatientReference`, `AppointmentLookup` / `AppointmentReference`, and `EncounterEntry` / `EncounterNavigation` from B's public domain packages. Register the clinical implementation through application-owned composition and navigation contributions. Replace the placeholder through `OperationalDependencies.clinical`; re-read resources and validate current workspace/relationship/grants before clinical work. `AppointmentReference.appointmentVersionToken` is an in-memory protocol reference, never a route argument; linked clinical changes must use the current authorized version and coupled workflow.

D should consume C's forthcoming public clinical content/handoff domain interfaces. Those implementations do not yet exist, and no fake C-to-D runtime interface is invented here. D does not need to import B's private UI/data classes. No C/D feature was implemented.

## 9. Regression Assessment

The four-tab/session/security foundation remains intact and its tests stay green. Patient/doctor/schedule placeholders intentionally become operational screens. Dirty shell exits, synthetic context projections and verified receipt acknowledgment are the only additional behavior. Staging/prod guards, network disablement, encrypted store boundaries and protected navigation reset remain unchanged. No detected regression within executed coverage; broader production/privacy/device gates remain explicitly outside the claim.

## 10. Senior Engineering Verdict

INTEGRATED AND VERIFIED

The claim covers the synthetic devDebug Operational Integration Seam only. It is not release readiness or approval of backend/product policy.

VERDICT: INTEGRATED AND VERIFIED
NEXT BATCH: Member C — clinical entry/read foundation using B's public references and EncounterNavigation.
