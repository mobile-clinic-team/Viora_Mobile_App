# Issue: Stabilize Android baseline and establish reproducible verification

## Background

The Android project has a substantial synthetic Compose foundation, but the preserved worktree previously reported 29 JVM failures and had environment-specific Gradle and signing problems. The baseline must be reproducible and reviewable before backend, database, authentication, or AI implementation begins.

## Known failures and risks

- Historical full JVM run: 110/139 passed with 29 failures.
- Failures clustered around stale shared fixtures, missing synthetic workspace context, and session lifecycle semantics.
- Gradle required a repository-local user home because the default environment targeted `C:\.gradle`.
- Dependency verification metadata has a large generated diff requiring owner review.
- Hosted CI and connected-device tests have not executed.

## Acceptance criteria

- Assurance boundary test passes 16/16.
- Full `testDevDebugUnitTest` passes 139/139 with no failures, errors, or skipped tests.
- `lintDevDebug` completes with 0 errors.
- `assembleDevDebug` produces an APK without changing production signing configuration.
- Dependency verification remains enabled and has no wildcard trust or ignored artifacts.
- Preserved feature work is separated from baseline commits.
- CI workflow is configured truthfully and hosted status is recorded.

## Verification commands

```powershell
.\gradlew.bat :app:testDevDebugUnitTest --no-daemon
.\gradlew.bat :app:lintDevDebug --no-daemon
.\gradlew.bat :app:assembleDevDebug --no-daemon
```

Use the documented repository-local Gradle and Android homes when the machine defaults are not writable. Do not commit those paths.

## Current result

The local JVM suite, lint, and debug assembly are PASS. Hosted CI and device tests are NOT_EXECUTED. Dependency metadata is OWNER REVIEW REQUIRED. See the grading verification baseline for the command-level record.
