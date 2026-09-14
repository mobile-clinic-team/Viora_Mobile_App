# Development guide

This is an implementation handoff for the documentation contract. The synthetic foundation now exists; [implementation evidence](FOUNDATION-IMPLEMENTATION.md) identifies delivered and remaining scope. [ARCHITECTURE.md](ARCHITECTURE.md) owns exact versions/variants; [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md) owns placement. Do not initialize a second nested repository or reinterpret server responsibilities as mobile business logic.

## Foundation batch scope

Implement the single application module and devDebug synthetic shell in a separately authorized implementation batch. Scope: build configuration and version catalogue; AppGraph; neutral session gate; typed navigation shell; SessionCoordinator and workspace epoch handling; ApiClient/DTO/error boundaries; Keystore SecureStore and metadata-only OperationCoordinator; fake login/workspace and deterministic foundation tests. Feature destinations may be disabled placeholders. Do not implement patient/clinical workflows or live AI in this first batch.

The synthetic mode uses visibly fictional fixtures and has no production network. Fake grant sets exercise allow/deny behavior; they do not approve BD-01 role policy. Real environment and verified app-link registration remain BD-06. Keep owner-gated controls unavailable until their decisions and backend integration evidence exist.

First verify the pinned compiler/Gradle/SDK combination, resolve exact dependencies, record wrapper checksum and dependency verification/locks, and prove devDebug builds. If incompatible or affected by a security issue, document the concrete failure and smallest required version change in ARCHITECTURE before continuing. A pinned list is not build evidence.

## Implementing a contract slice

1. Identify the product gate, flow ID, screen ID, endpoint ID and owning domain schema.
2. Implement exact request/response DTOs in the owning feature data/dto package and map into domain types. Reject missing security/version fields. Preserve omitted-versus-null patient fields and opaque quoted validators.
3. Add the repository interface and HTTP adapter. Core owns session, headers, safe errors, time and operation admission/recovery; a feature cannot independently refresh credentials or retry a write.
4. Use a destination-owned ViewModel with immutable UiState and explicit intents. Add a use case only for a workflow spanning calls or repositories.
5. Capture auth/context epochs and request sequence. Dispatch writes through the application OperationCoordinator after secure receipt persistence; follow a successful receipt with the resource read.
6. Implement all applicable SCREEN-SPEC states, unsaved-exit behavior, accessibility and privacy invalidation. No PHI in routes, saved state, logs or fixture screenshots.
7. Implement the relevant TESTING cases with deterministic fakes and MockWebServer; use device tests for platform behavior. Do not label backend invariants proven by a client fake.
8. Update the authoritative owner document and fixtures when a contract changes. Review the effect on related flows without duplicating the rule in every document.

## Engineering conventions

Use official Kotlin formatting, explicit public interfaces, immutable value types, sealed results/intents where useful and descriptive command names. Composables render state and emit intents; authorization remains server-owned. Repositories return typed results, never raw HTTP bodies to UI. Rethrow coroutine cancellation. Dispatch blocking file/crypto work off the main thread.

Session/store critical sections protect state publication and disk replacement; network waits do not hold the mutex. A shared in-flight refresh result supplies single-flight behavior while logout can invalidate its epoch immediately. Tests must exercise this timing, not merely mock a sequential success.

Navigation consumes acknowledged state events only when RESUMED. Never assume invisibility destroys a ViewModel. Backend state can commit after transport cancellation; safe UI cancellation returns to operation verification.

Do not infer permission from role names, workspace IDs, a successful read or a cached allowedActions list. BD policies are declared in [PRODUCT-SPEC.md](PRODUCT-SPEC.md); unresolved owner choices cannot be converted into technical defaults during implementation.

## Validation workflow

Run these Windows PowerShell commands from the project root with the JDK/SDK defined in ARCHITECTURE:

~~~powershell
.\gradlew.bat --version
.\gradlew.bat :app:lintDevDebug :app:testDevDebugUnitTest :app:assembleDevDebug
.\gradlew.bat :app:connectedDevDebugAndroidTest
~~~

TESTING owns device/API coverage and test acceptance. A production build needs reviewed environment/signing inputs and release checks; synthetic debug success does not establish release readiness. Never place secrets in source or docs.

For documentation-only changes: validate local Markdown targets, check endpoint/route/decision references and JSON examples, review lifecycle/error/ownership consistency, and compare the changed-file inventory against authorized scope. Do not run nonexistent Gradle commands or report them as passing.

## Review and completion evidence

A feature handoff identifies changed behavior and contract IDs, tests actually executed, any untested device/backend assumptions, and the product gates still active. Use synthetic examples only. A future implementation change is complete when its bounded acceptance cases pass; live backend claims require the separate B-series integration evidence.

This batch creates no commits, pushes or PRs. Any later publication follows that batch's authorization; this guide does not grant it.
