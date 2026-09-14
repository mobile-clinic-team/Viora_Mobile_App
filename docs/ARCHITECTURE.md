# Mobile architecture

Foundation Contract Closure — technical baseline. Retain one Android application module, Kotlin/Compose, feature packages and online-first operation. Product gates are in [PRODUCT-SPEC.md](PRODUCT-SPEC.md).

## Foundation decisions

These are pinned starting versions, not a claim to use the newest release. The synthetic foundation now builds with this combination; [implementation evidence](FOUNDATION-IMPLEMENTATION.md) records tests and remaining device/live-integration gates.

| Concern | Decision and reason |
|---|---|
| Android | minSdk 26 (Android 8); compileSdk 36; targetSdk 36. API 26 enables native java.time and a bounded modern device baseline. No preview SDKs |
| Compiler/build | Kotlin 2.3.10; Android Gradle Plugin 8.13.2; Gradle wrapper 8.13; JDK/JVM target 17. Kotlin Android, Compose compiler and serialization compiler plugins use the same Kotlin version |
| UI | Compose BOM 2025.12.00; Material 3; Activity Compose 1.11.0; Lifecycle runtime/viewmodel Compose and process 2.9.4 |
| Navigation | Navigation Compose and navigation-testing 2.9.5; typed serialized destination classes. One NavHost, no fragments or Safe Args |
| HTTP | OkHttp 4.12.0 with coroutine cancellation bridge; matching MockWebServer 4.12.0 in JVM tests. No Retrofit layer is needed for this bounded API |
| JSON | kotlinx.serialization-json 1.9.0; strict types, explicit nulls, unknown response fields ignored, unknown enum strings mapped safely. No polymorphic class names from the server |
| Concurrency | kotlinx-coroutines-android and coroutines-test 1.10.2; StateFlow; injected Clock/dispatchers |
| Browser | AndroidX Browser 1.9.0 Custom Tabs; external browser fallback via validated ACTION_VIEW. No embedded WebView; backend owns OAuth protocol exchange |
| Composition | Constructor injection and one explicit AppGraph. No Hilt, service locator, extra Gradle modules or universal base repository |
| Identity | Namespace/application ID com.viora.mobile; versionName 0.1.0, versionCode 1. Verify release ownership through BD-06 before distribution |
| Formatting/testing | Kotlin official IDE formatting; Android Lint; JUnit 4.13.2; AndroidX test runner 1.6.2, ext-junit 1.2.1; Compose UI test dependencies from the same BOM |
| Dependencies | Only Google Maven and Maven Central; exact pins, wrapper checksum, dependency verification metadata and locks created during bootstrap. No dynamic versions or automatic upgrades |

Version rationale is compatibility and a small stable dependency surface. Review security/compatibility notices before bootstrap; any required upgrade must update this table and run build/device tests, not silently float a dependency. Target/compile upgrades are deliberate compatibility changes; distribution eligibility is checked at release, not inferred from the baseline.

Primary references checked for these choices: [AGP 8.13 compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes), [Kotlin releases](https://kotlinlang.org/docs/releases.html), [Compose December baseline](https://developer.android.com/blog/posts/whats-new-in-the-jetpack-compose-december-release), [Navigation](https://developer.android.com/jetpack/androidx/releases/navigation), [Lifecycle](https://developer.android.com/jetpack/androidx/releases/lifecycle), [Activity](https://developer.android.com/jetpack/androidx/releases/activity), [Browser](https://developer.android.com/jetpack/androidx/releases/browser), [serialization](https://github.com/Kotlin/kotlinx.serialization/releases/tag/v1.9.0), [coroutines](https://github.com/Kotlin/kotlinx.coroutines/releases/tag/1.10.2).

## Data flow and dependency direction

~~~text
Compose UI -> destination ViewModel -> optional workflow use case
           -> feature repository interface -> HTTP repository -> ApiClient
Repository -> AuthenticatedRequestExecutor -> SessionCoordinator snapshot
AuthenticatedRequestExecutor -> ApiClient(explicit RequestContext) -> HTTPS API
Backend -> authorization/domain transactions/audit/controlled AI provider
~~~

ApiClient is a transport/serialization primitive with an explicit immutable RequestContext; it has no dependency on SessionCoordinator and no implicit refresh interceptor. AuthenticatedRequestExecutor owns session preflight, scoped headers and the one eligible GET refresh/replay, delegating refresh to SessionCoordinator. This prevents a dependency cycle. SessionCoordinator consumes core SessionAuthGateway and WorkspaceGateway interfaces; feature auth/workspace data adapters implement them using the raw ApiClient and explicitly supplied credentials, without recursive preflight. AppGraph creates transport, gateway adapters, coordinator, executor, then feature repositories in that order.

Feature domain models are plain Kotlin. DTOs live in feature/data/dto and never reach Compose. Repositories map DTOs, preserve opaque version metadata and return typed ApiResult values. ViewModels validate for feedback, coordinate intents and render server decisions. Use cases are justified for multi-call workflows (login, encounter creation/start, AI review/handoff); simple reads may call a repository directly.

Each feature depends on core and its own domain/data. Cross-feature use cases may consume only another feature's documented public domain repository interface or reference model through constructor injection. No private data/UI imports. The app composition root is the sole place that assembles implementations. Core has no feature imports.

## State ownership

| State | Owner and lifetime | Invalidation / persistence |
|---|---|---|
| Session, auth epoch, refresh mutex, clock offset | One application SessionCoordinator | Epoch changes on login replacement/logout/revocation, not routine successful refresh; encrypted credentials only as specified in storage |
| Active workspace, membership, grants, context epoch | SessionCoordinator, one request-scoped immutable snapshot | Increment context epoch on switch/permission invalidation; clear all protected feature state |
| Navigation | MainActivity's NavController, created after session gate | IDs only while process lives; never restore a protected back stack after process death |
| Screen read/form state | ViewModel scoped to its NavBackStackEntry | Survives configuration changes; cleared when entry is popped or global invalidation occurs |
| Repository data | No app-wide PHI cache; results owned by destination state | HTTP repositories are stateless except core operation coordination |
| Mutation in flight | Application OperationCoordinator keyed by operation ID, auth/context epoch | Continues across rotation/temporary screen hiding; scope change detaches UI and cancels transport, with recovery receipt retained per storage |
| Auth transaction / assurance challenge | SessionCoordinator memory, bound to initiating epoch and intent | No saved-state persistence; process death abandons and requires fresh browser flow |
| Transient feedback/navigation intent | ViewModel state with monotonic event ID and explicit UI acknowledgement | One RESUMED collector handles then acknowledges; no replay after acknowledgement, no Channel-only lost success |
| UI-only state | remember for focus/animation; ViewModel for inputs | No PHI in rememberSaveable or SavedStateHandle |

A screen stopping observation does not destroy its ViewModel. A back-stack ViewModel can remain alive; its sensitive state still observes global invalidation. Rotation retains ViewModels and application operations. Process death destroys all feature state and restarts the session gate; it does not replay any mutation. [Android ViewModel ownership](https://developer.android.com/topic/libraries/architecture/viewmodel)

## Concurrency and cancellation

Capture auth epoch, context epoch, workspaceId, resourceId and screen request sequence before I/O. Apply a result only if all still match; latest search/filter sequence wins. Session refresh may update credentials without changing workspace context. Do not attach a new workspace header to a request captured under an old one.

Use viewModelScope for reads and collectAsStateWithLifecycle for rendering. Cancel superseded reads; rethrow CancellationException. Dispatch a validated write through OperationCoordinator after persisting its receipt. UI cancellation never proves backend rollback. Success after destination exit is recorded for recovery, not navigated into a different screen. No automatic retry of a mutation.

Render Initial, Loading, Content, Empty, Stale, ValidationError, Failure, PermissionDenied and OutcomeUnknown as applicable. ApiResult distinguishes HTTP denial, conflict, transport failure, malformed success and unknown mutation outcome. [API-SPEC.md](API-SPEC.md) owns their exact mapping.

## Variants and environment

One environment flavor dimension: dev, staging, prod. Build types: debug and release. Enable only devDebug, stagingDebug and prodRelease. IDs: com.viora.mobile.dev, com.viora.mobile.staging, com.viora.mobile. The logical staging environment is a flavor, not a third build type.

devDebug uses fake repositories by default (visibly marked synthetic) and performs no network login. Explicit integration builds supply reviewed dev/staging HTTPS config. prodRelease rejects blank, placeholder, non-HTTPS or mismatched API/issuer/redirect configuration; no release signing key is checked in. The API base URL is an origin, with /v1 appended by ApiClient. One OIDC realm per environment serves all workspaces. BD-06 supplies real origins/client registration; no owner domain is fabricated.

Permissions: INTERNET and ACCESS_NETWORK_STATE only. No camera, microphone, storage, notification or biometric permission in this batch. Debuggable=false for release; cleartext disabled everywhere except test-manifest loopback override. UI uses edge-to-edge insets, 48dp targets, lazy paginated lists and no main-thread crypto/JSON work. No crash/analytics SDK, Room or WorkManager is selected.
