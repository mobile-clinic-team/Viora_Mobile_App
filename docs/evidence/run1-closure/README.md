# Expansion Run 1 closure evidence — 2026-09-23

## Scope and changes

This validation continues the existing dirty checkout. No application, backend, dependency, contract, or test source was changed. No tests were deleted, ignored, filtered out, or moved. No commit, push, or PR was created. Run 2 was not started.

Only this evidence directory was added to the repository. An isolated local Android 16/API 36 AVD was created outside the repository. The original Android 17 failure XML is preserved as `android17-before.xml`.

## Targeted configuration audit

| Setting | Observed value |
| --- | --- |
| compileSdk / targetSdk / minSdk | 36 / 36 / 26 |
| Android Gradle Plugin | 9.4.0 |
| Kotlin plugins | 2.3.10 |
| Compose BOM | 2025.12.00 |
| Compose ui-test, ui-test-android, ui-test-junit4, ui-test-junit4-android, ui-test-manifest | 1.10.0 |
| AndroidX Test runner | 1.6.2 |
| AndroidX Test rules | Not declared or resolved in app/gradle.lockfile |
| AndroidX Test core / monitor / ext:junit | 1.6.1 / 1.7.2 / 1.2.1 |
| Espresso core / idling-resource | 3.5.0 / 3.5.0 |
| Instrumentation runner | androidx.test.runner.AndroidJUnitRunner |
| Test options | animationsDisabled = true; no suite exclusion added |

The version catalog and dependency lockfile were inspected; no versions were changed. Existing `testDevDebug` and `androidTestDevDebug` boundaries remain intact.

## Root cause and additional blocker

The preserved Android 17 report has 9 tests: 3 passed, 6 failed, 0 errors, 0 skipped. The six UI failures contain `NoSuchMethodException: android.hardware.input.InputManager.getInstance []`, reached through Espresso synchronization. AndroidX documents replacement of that reflective call in Espresso 3.7.0: <https://developer.android.com/jetpack/androidx/releases/test#espresso-3.7.0>.

API 36 is the requested lowest-risk workaround; Android 17 certification is not required by the supplied Run 1 scope. An API 36 run still must pass its assertions before closure can be claimed.

Static inspection also found incompatible legacy expectations in two common suites:

- `FoundationNavigationTest`: two tests depend on `Enter demo workspace`, fictional clinics and `Synthetic Doctor A`.
- `PatientPhase1SmokeTest`: two tests depend on local demo credentials, `Explore local demo`, fictional Patient content, and a Patient Assistant tab. Patient AI is explicitly forbidden by accepted Run 1 requirements.

These are behavioral demo dependencies despite the absence of direct imports of the prohibited synthetic runtime classes. They cannot be satisfied by a real-only, unconfigured staging app. They were preserved without lowering assertions or replacing staging authentication.

## Security/persona audit

- Staging and prod `EnvironmentBindings` both instantiate `HttpPasswordGateway` with `synthetic = false`. Register/login call `/v1/auth/register` and `/v1/auth/login`. Registration sends only email, password and display name.
- `SessionCoordinator` selects the password gateway by type. Its local credential branch is not an exception fallback. HTTP/identity errors clear authority and stored credentials.
- Refresh uses `/v1/auth/refresh`, validates session/user and rotation, and reloads server identity. Revoke uses `/v1/auth/revoke`. Logout clears local protected state before asynchronous revocation. Restoration failures clear the session.
- `/v1/me` supplies persona and membership authority. Explicit mapping is CLINIC_ADMIN -> ADMIN, DOCTOR -> DOCTOR, NURSE -> NURSE, RECEPTIONIST -> RECEPTIONIST, PATIENT -> PATIENT; unknown wire roles throw.
- Android accepts Patient only with an explicit server Patient persona, empty memberships and no workspace. Backend persona resolution checks active user/session and expiry, successfully queries memberships, rejects unknown authority and invalid active tenants, and derives Patient only from zero active staff memberships. Exceptions do not return Patient. Suspended staff membership is distinct from a suspended user account; the accepted backend baseline covers this distinction.
- Multiple staff memberships produce server-directed workspace selection. Selected workspace identity and membership are validated against the server response.
- `WorkspaceContext.allows` intersects server permissions with persona restrictions. Nurse permissions exclude AI. Patient and Receptionist cannot enter clinical/assistant navigation. Doctor AI access still needs the backend grant; persona alone does not grant it. Backend resource checks remain unchanged.
- The prohibited Synthetic*/FakeBackend class scan returned no matches in main, staging, prod or common androidTest. Staging compiled Kotlin output also had no Synthetic*/FakeBackend classes. Common declarations of the dev gateway interface are not implementations or HTTP fallback paths.

## Real backend smoke

NOT EXECUTED. Generated staging `BuildConfig.BACKEND_BASE_URL` is empty. The user explicitly confirmed that no reachable HTTPS Run 1 backend/test-account configuration exists and prohibited substituting synthetic accounts. No credentials or backend URL were invented; no secrets were accessed or changed.

## Backend acceptance

Retained accepted baseline supplied by the user: quality PASS; 452 tests passed, 0 failed, 0 skipped; 52 projects / 0 boundary findings. Backend validation was not rerun: this task changed neither backend code nor contracts/DTO assumptions. This is prior accepted evidence, not a new execution claim.

## Remaining work

Provision a reachable HTTPS test backend and authorized persona accounts, then reconcile the legacy demo-dependent instrumentation with accepted Run 1 real-auth behavior while preserving meaningful coverage. Do not re-enable Patient AI or synthetic staging to satisfy old tests. Android 17 test-stack compatibility remains separate technical debt; Espresso 3.7.0 documents the relevant fix, but any upgrade needs its own compatible test-only dependency resolution and regression run.

Execution results and exact commands are recorded in `results.md` alongside the logs and XML evidence.
