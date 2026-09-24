# Verification baseline

Audit date: 2026-09-15. This record separates current commands from historical reports and states exactly where execution stopped. No result below is presented as a pass unless the command actually completed successfully.

## Phase 1B.1 fresh run

Run date: 2026-09-15  
Revision: `7bbec4b`  
Working tree: dirty; all pre-existing application changes were preserved. Commands used the repository-local Gradle home only for the invoking PowerShell process.

For rows using `...`, the exact prefix was `$env:GRADLE_USER_HOME='C:\Users\LAPTOP\Viora-Mobile-App\.gradle-local'; `. The final assembly recovery rerun additionally set `ANDROID_USER_HOME` to a writable session-local directory and cleared `ANDROID_SDK_HOME`.

| Status | Exact command or check | Result |
|---|---|---|
| PASS | `$env:GRADLE_USER_HOME='C:\Users\LAPTOP\Viora-Mobile-App\.gradle-local'; .\gradlew.bat --version` | Gradle 9.6.0 launched with JBR/JDK 21.0.11. |
| FAIL | `... .\gradlew.bat help --no-daemon --stacktrace` (first online resolution) | Project configuration reached dependency verification, which rejected the Guava parent POM and JUnit BOM module because the pre-existing metadata lacked their hashes. |
| PASS | `... .\gradlew.bat help --no-daemon --stacktrace` (after exact hash entries were added) | Configuration completed; `BUILD SUCCESSFUL`. |
| PASS | `... .\gradlew.bat :app:testDevDebugUnitTest --tests '*AssuranceHandoffBoundaryTest' --no-daemon --stacktrace` | 16 tests passed, 0 failures, 0 skipped, 0 errors. |
| FAIL | `... .\gradlew.bat :app:testDevDebugUnitTest --no-daemon` | 139 tests executed: 110 passed, 29 failed, 0 skipped, 0 errors. Remaining failures are documented below. |
| FAIL | `... .\gradlew.bat :app:lintDevDebug --no-daemon` (before resource fix) | Lint reached analysis and found 3 API-level errors in the default theme plus 34 warnings. |
| PASS | `... .\gradlew.bat :app:lintDevDebug --no-daemon` (after resource fix) | Lint completed successfully. Report: 0 errors, 34 warnings. |
| PASS | `... .\gradlew.bat :app:assembleDevDebug --no-daemon` (earlier same-revision run) | APK assembly completed. Artifact: `app/build/outputs/apk/dev/debug/app-dev-debug.apk` (13,754,318 bytes at the run). |
| BLOCKED_BY_ENVIRONMENT | `... .\gradlew.bat :app:assembleDevDebug --no-daemon` (final recovery rerun) | Android tooling reached `validateSigningDevDebug` but could not acquire `debug.keystore.lock` under the writable recovery home. This is a Windows execution-environment file-lock failure; the existing APK artifact remains from the earlier same-revision PASS. |
| NOT_EXECUTED | `adb devices` / connected DevDebug Android tests | ADB was available, but the device list was empty and no emulator process was present. |
| NOT_EXECUTED | Hosted GitHub Actions run for `.github/workflows/android-baseline.yml` | Hosted execution is unavailable from this session. The workflow remains configured but unexecuted. |

The final core execution result is mixed: wrapper/configuration, targeted assurance, lint, and an earlier same-revision assembly passed; the final assembly recovery rerun was blocked at signing by a Windows file-lock condition, and the full JVM suite failed on 29 tests. This is not a green baseline.

The recovery session also found that Android tooling derived `C:\.android` from the same `user.home=C:\` condition. Setting `ANDROID_USER_HOME` to a writable session-local path removed that lookup, but Windows then rejected the debug keystore lock file during the final assembly rerun. This is recorded as `BLOCKED_BY_ENVIRONMENT`; it did not change project configuration.

## Environment and command history

The original Phase 1A attempts remain historical environment evidence: the default wrapper home targeted `C:\.gradle`, offline mode lacked AGP `9.4.0`, and a fresh wrapper download was blocked. Phase 1B.1 recovered execution by setting `GRADLE_USER_HOME` in the shell to `.gradle-local`, downloading the declared Gradle 9.6.0 distribution, and resolving dependencies online from the repositories already declared by the project.

The first online configuration still failed dependency verification. The exact Guava parent POM and JUnit BOM module hashes were calculated from the downloaded artifacts and added to the existing verification metadata. Gradle's verification writer was then used while lint dependencies were resolved; the subsequent normal lint run passed. No repository was added and no source dependency version was changed.

## Historical evidence only

Existing ignored/local reports record earlier checkpoints, including 139 JVM tests with 4 failures in `AssuranceHandoffBoundaryTest`, a targeted five-test device XML pass, and older reports claiming 23, 75, or 95 JVM tests and prior device/lint/build passes. These artifacts have dates and different source/toolchain checkpoints. They are historical evidence only and do not establish the current worktree status.

## Current Phase 1B.1 failure classification

The historical four assurance failures were stale test-support behavior, not evidence that production authorization should be weakened. The role-aware `SessionCoordinator` correctly failed closed when the old workspace fixture omitted `membershipId` and `role`. `Fixtures.kt` now supplies the active membership and role. The assistant fixture also needed the existing synthetic demo credentials because the current dev fake backend rejects the no-argument sign-in path. Its session expiry job now runs on `Dispatchers.Default` so suspended MockWebServer calls do not let `runTest` advance the lifecycle job into the 12-hour expiry window.

Fresh same-revision result: `AssuranceHandoffBoundaryTest` PASS, 16 tests passed, 0 failed, 0 skipped, 0 errors. Production authorization and assertions were not changed.

The fresh full-suite result is separate: 139 tests executed, 110 passed, 29 failed, 0 skipped, 0 errors. The remaining failures are current-worktree contract drift across routes, session lifecycle timing, HTTP fixtures, and role/workspace expectations. They require a separately reviewed stabilization pass because they overlap pre-existing application changes. No assertions were weakened.

The first lint run also exposed three real API-level errors: API 31 splash attributes were in default `values/themes.xml` despite `minSdk 26`. They were moved to `values-v31/themes.xml`; the fresh lint rerun passed with 0 errors and 34 warnings.

## Historical Phase 1A failure classification (superseded by the current results above)

The current failures are a combination of repository fixture drift and environment blockage:

1. The four reported `AssuranceHandoffBoundaryTest` failures occur because the role-aware `SessionCoordinator` now requires validated `membershipId` and `role` in the workspace context, while the old `TestBackend.context()` fixture returned neither. Session validation therefore correctly failed closed; HTTP calls received `StaleScope` or `STEP_UP_UNVERIFIED`.
2. The fixture was corrected in `app/src/test/java/com/viora/mobile/testutil/Fixtures.kt` to return the active membership identity and role. This is the smallest test-support correction and does not weaken production authorization.
3. The correction could not be re-run through Gradle in this environment because plugin resolution stopped configuration before any test task. The fix is therefore not claimed as verified by a fresh test execution.

| Test | Expected behavior | Actual behavior in the historical 139-test report | Root cause | Production-code defect? | Test defect or stale support? | Environment-dependent? | Historical evidence status |
|---|---|---|---|---|---|---|---|
| `validAi08UsesAssuredHeadersExactBodyAndServerEvidence` | A valid assurance handoff returns `ApiResult.Success` and dispatches one exact HTTP request. | `ClassCastException`: `ApiResult.StaleScope` was cast to `ApiResult.Success` at line 161. | The fixture’s workspace context omitted the membership ID and role required by the role-aware session validation, leaving the session outside `READY`. | No defect established; the fail-closed production behavior is correct. | Stale test support data. | No; deterministic fixture contract drift. | Historical local report only; not a fresh current run. |
| `closeHasOriginalTimestampNoNewKeyAndAcceptsPending` | Operation close returns the server state and preserves the original operation timestamp without assurance/idempotency headers. | `ClassCastException`: `ApiResult.StaleScope` was cast to `ApiResult.Success` at line 212. | Same stale fixture context caused the authenticated executor to reject the expected session before HTTP dispatch. | No defect established. | Stale test support data. | No; deterministic fixture contract drift. | Historical local report only; not a fresh current run. |
| `lostApprovalResponseUsesLookupWithoutApprovalReplay` | A lost approval response returns `OutcomeUnknown`; recovery performs one lookup and never replays approval. | Expected `OutcomeUnknown`, received `StaleScope` at line 198. | Same session context validation failure occurred before the disconnect/recovery behavior could be exercised. | No defect established. | Stale test support data. | No; deterministic fixture contract drift. | Historical local report only; not a fresh current run. |
| `httpStepUpUsesSelfBearerAndNeverLoginOrAi08` | Step-up begin/exchange use the current SELF bearer session and never use login or approval endpoints. | `AuthCallbackException("STEP_UP_UNVERIFIED")` from `HttpStepUpGateway`; underlying executor result was `StaleScope` at line 260. | Same stale expected-session mismatch caused `HttpStepUpGateway.send()` to translate the rejected request into `STEP_UP_UNVERIFIED`. | No defect established. | Stale test support data. | No for the root cause; fresh rerun is environment-blocked. | Historical local report only; not a fresh current run. |

## Historical Phase 1A environment diagnosis

| Question | Finding |
|---|---|
| Repository source defect blocking startup? | Not established. Gradle stopped at wrapper/cache/plugin resolution before compiling project source. |
| Filesystem permission issue? | Yes. The wrapper could not create a lock under `C:\.gradle`; direct cached Gradle also reported access denied for an external cached JAR. |
| Gradle cache issue? | Yes, combined with the permission restriction; generated accessor compilation could not close/read an external cached artifact. |
| Network restriction? | Yes. Wrapper download was denied, and offline mode lacked the configured AGP `9.4.0` plugin marker. |
| External environment limitation? | Yes. These conditions are outside the repository workspace and prevent a fresh task result. |

## Evidence labels for future runs

- **PASS**: command completed on the current source revision with exit code 0 and raw result retained.
- **FAIL**: command reached the requested task on the current source revision and returned a task/test failure.
- **NOT_EXECUTED**: command was not attempted or could not reach its task because an earlier prerequisite was not run.
- **BLOCKED_BY_ENVIRONMENT**: execution was attempted but stopped by wrapper, cache, permission, SDK, or network conditions outside project source.

## Phase 1B.2 fresh baseline recovery (authoritative latest result)

Run date: 2026-09-15  
Revision context: observed commit `7bbec4b`; dirty preserved worktree containing pre-existing application changes and the Phase 1B.2 fixes.  
Gradle home: `C:\Users\LAPTOP\Viora-Mobile-App\.gradle-local` for the invoking PowerShell process.  
Android user home: `C:\Users\LAPTOP\Viora-Mobile-App\.android-recovery-5` for the final assembly attempt.  
Toolchain: Gradle 9.6.0, AGP 9.4.0, Kotlin 2.3.10, SDK 36, JBR/JDK 21.0.11 running source/Kotlin target 17.

| Status | Exact command | Result |
|---|---|---|
| PASS | `$env:GRADLE_USER_HOME='C:\Users\LAPTOP\Viora-Mobile-App\.gradle-local'; $env:ANDROID_USER_HOME='C:\Users\LAPTOP\Viora-Mobile-App\.android-recovery-4'; Remove-Item Env:ANDROID_SDK_HOME -ErrorAction SilentlyContinue; .\gradlew.bat :app:testDevDebugUnitTest --no-daemon` | Initial Phase 1B.2 inventory: 139 executed, 110 passed, 29 failed, 0 skipped, 0 errors. |
| PASS | Same recovered environment; `.\gradlew.bat :app:testDevDebugUnitTest --tests '*OperationalHttpTest' --tests '*OperationalStateTest' --no-daemon` | Shared setup correction verified: 15 passed, 0 failed, 0 skipped, 0 errors. |
| PASS | `$env:GRADLE_USER_HOME='C:\Users\LAPTOP\Viora-Mobile-App\.gradle-local'; $env:ANDROID_USER_HOME='C:\Users\LAPTOP\Viora-Mobile-App\.android-recovery-4'; Remove-Item Env:ANDROID_SDK_HOME -ErrorAction SilentlyContinue; .\gradlew.bat :app:testDevDebugUnitTest --tests '*AssuranceHandoffBoundaryTest' --no-daemon --stacktrace` | Final targeted assurance verification: 16 passed, 0 failed, 0 skipped, 0 errors; `BUILD SUCCESSFUL`. |
| PASS | Same recovered environment; `.\gradlew.bat :app:testDevDebugUnitTest --tests '*OperationalIntegrationTest' --tests '*AssistantContractTest' --tests '*ClinicalContextTest' --tests '*ClinicalRepositoryTest' --no-daemon` | Multi-workspace fake-backend correction verified; affected targeted classes passed. |
| PASS | Same recovered environment; `.\gradlew.bat :app:testDevDebugUnitTest --tests '*SessionCoordinatorTest' --no-daemon` | Session lifecycle correction verified: 10 passed, 0 failed, 0 skipped, 0 errors. |
| PASS | `$env:GRADLE_USER_HOME='C:\Users\LAPTOP\Viora-Mobile-App\.gradle-local'; $env:ANDROID_USER_HOME='C:\Users\LAPTOP\Viora-Mobile-App\.android-recovery-4'; Remove-Item Env:ANDROID_SDK_HOME -ErrorAction SilentlyContinue; .\gradlew.bat :app:testDevDebugUnitTest --no-daemon` | Final fresh full JVM suite: 139 passed, 0 failed, 0 skipped, 0 errors; `BUILD SUCCESSFUL`. |
| PASS | Same recovered environment; `.\gradlew.bat :app:lintDevDebug --no-daemon` | Lint completed with 0 errors and 34 existing warnings; `BUILD SUCCESSFUL`. |
| PASS | `$ks='C:\Users\LAPTOP\Viora-Mobile-App\.android-recovery-5\phase1b2-debug.keystore'; $env:GRADLE_USER_HOME='C:\Users\LAPTOP\Viora-Mobile-App\.gradle-local'; $env:ANDROID_USER_HOME='C:\Users\LAPTOP\Viora-Mobile-App\.android-recovery-5'; Remove-Item Env:ANDROID_SDK_HOME -ErrorAction SilentlyContinue; .\gradlew.bat :app:assembleDevDebug --no-daemon "-Pandroid.injected.signing.store.file=$ks" '-Pandroid.injected.signing.store.password=changeit' '-Pandroid.injected.signing.key.alias=androiddebugkey' '-Pandroid.injected.signing.key.password=changeit'` | Debug assembly completed with a temporary workspace-only debug keystore. APK: `app/build/outputs/apk/dev/debug/app-dev-debug.apk`, 13,754,318 bytes. Temporary keystore was removed after verification. |
| BLOCKED_BY_ENVIRONMENT | `.\gradlew.bat :app:assembleDevDebug --no-daemon` with the recovered Android user home and no injected temporary keystore | Normal debug signing could not acquire Windows `debug.keystore.lock`; this is an environment file-lock condition. |
| NOT_EXECUTED | `adb devices` and connected Android tests | No device or emulator was attached. |
| NOT_EXECUTED | Hosted run of `.github/workflows/android-baseline.yml` | GitHub Actions execution was unavailable from this session. |

The latest local core baseline is green: targeted assurance remained PASS at 16/16, the final JVM suite is PASS at 139/139, lint is PASS, and debug assembly is PASS using a temporary debug-only signing key. The normal local signing path still has a Windows lock blocker, and hosted CI/device evidence is not executed. This does not establish production readiness or full rubric completion.

The 29 initial JVM failures and their fixes are detailed in [JVM-FAILURE-TRIAGE.md](JVM-FAILURE-TRIAGE.md). No test was disabled or weakened, and production authorization remained fail closed.

### Dependency verification metadata review

The metadata contains the exact Guava parent and JUnit BOM hashes needed during recovery and no trusted/ignored bypass entries. The working-tree diff is larger than those two entries because Gradle rewrote resolved metadata: 1,232 added lines, 581 removed lines, 131 added component entries, and 59 removed component entries. No dependency version or repository change was found. This is retained as a separate owner-review item before any commit; it is not treated as automatically approved evidence.

## Phase 1C post-commit verification

Run date: 2026-09-16  
Branch: `chore/android-baseline-stabilization`  
Evidence commit: `4d6af89` (`chore: establish Android baseline evidence`). The commit contains only baseline evidence, CI, project-management templates, and local-artifact ignore rules; preserved application changes and dependency metadata remain outside the commit.

| Status | Exact command | Result |
|---|---|---|
| PASS | `$env:GRADLE_USER_HOME='C:\Users\LAPTOP\Viora-Mobile-App\.gradle-local'; $env:ANDROID_USER_HOME='C:\Users\LAPTOP\Viora-Mobile-App\.android-recovery-4'; Remove-Item Env:ANDROID_SDK_HOME -ErrorAction SilentlyContinue; .\gradlew.bat :app:testDevDebugUnitTest --no-daemon` | 139/139 tests passed, 0 failures, 0 skipped, 0 errors. |
| PASS | Same recovered environment; `.\gradlew.bat :app:lintDevDebug --no-daemon` | 0 lint errors, 34 warnings. |
| BLOCKED_BY_ENVIRONMENT | Same recovered environment; `.\gradlew.bat :app:assembleDevDebug --no-daemon` | Reached `validateSigningDevDebug` and failed to acquire `C:\Users\LAPTOP\Viora-Mobile-App\.android-recovery-4\debug.keystore.lock`. |
| PASS | Temporary workspace-only debug keystore with `.\gradlew.bat :app:assembleDevDebug --no-daemon` and injected debug signing properties | APK assembly completed; temporary keystore was removed immediately after the run. |

The final local baseline remains conditional rather than hosted-green: JVM, lint, and debug assembly are verified locally; ordinary Windows debug signing remains environment-limited; CI and device tests are not executed.
