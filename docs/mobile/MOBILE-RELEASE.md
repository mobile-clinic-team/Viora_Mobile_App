# Future mobile release and CI/CD

Status: **PROPOSED requirements only. No CI workflow, build configuration, artifact or signing credential created.** Kotlin/Compose/Android is conditional on ADR-M01. Distribution, application ID, supported devices, toolchain versions and signing custody are ADR-M16.

## Future pipeline

| Stage | Required behavior | Evidence / gate |
|---|---|---|
| Source/config verification | Trace approved task/contract versions; validate dependency resolution and no unintended backend imports | Scope review, approved mobile/API decisions, clean generated configuration |
| Build preparation | Pin mutually compatible JDK, Gradle/wrapper, Android Gradle Plugin, Kotlin, Compose and SDK versions after selection; verify wrapper/dependency integrity | Reproducible toolchain manifest/version catalogue; no floating production toolchain |
| Lint/static analysis | Run Android Lint plus selected Kotlin style/static checks and dependency/secret scanning; fail meaningful findings | Archived safe reports; rule exceptions explicit, never blanket disabled |
| Unit/state/API contract tests | Run relevant MT01–MT10 with fakes and published wire fixtures; check API compatibility | Test results linked to API contract revision |
| Device/UI tests | Run navigation/accessibility/lifecycle/privacy and approved real test-backend scenarios on the agreed device matrix | MT04/05/07–13 and backend integration evidence |
| Debug build | Installable debug artifact for synthetic test environment; debug signing only | Clearly distinguish app ID/name/environment; no production credentials/data |
| Release build | Optimized/non-debuggable configuration, correct API/issuer/redirect, restricted permissions and network policy | Artifact inspection; no test endpoints, logging bodies or insecure trust config |
| Signing | Use controlled CI/signing service with least privilege and separate signing custody | Verified signing identity and restricted environment; keys/passwords never printed or committed |
| Artifact generation | Produce approved signed APK for direct testing and/or AAB for store delivery; keep mapping/symbol files access-controlled as needed | Hash, version/build identity, signature verification, test report and change record |
| Promotion | Validate signed artifact on target environment/device before controlled rollout | Product/Clinical/Security/backend release gates closed; explicit release authorization in future task |
| Monitoring/recovery | Safe crash/error/latency monitoring, rollout halt and client/backend compatibility plan | No PHI/token telemetry; named operational owner, thresholds and response procedure |

Example future Gradle targets may include lint, unit tests, device tests, debug assembly and release bundle/assembly, but final target names depend on the approved module/variant structure. This documentation does not run or create them.

Android requires signing for installable application artifacts; store distribution may use Play App Signing and a separate upload key. Choose the actual distribution/signing model with the release owner; see [Android signing guidance](https://developer.android.com/studio/publish/app-signing). Do not provision keys or enroll a store account here. If Flutter or React Native is chosen, replace the build stages with its approved Android/iOS toolchains and signing; retain the same gates and secret isolation.

## Environment configuration and secrets

Public client configuration includes approved API base URL, OIDC issuer/client ID/audience and registered redirect, application identity, feature availability and build version. These values must be consistent per environment and validated on backend/native registration. Client IDs/base URLs are not authorization grants. Release users cannot enter arbitrary backend/provider URLs.

Development/test use synthetic data and isolated provider/test accounts. Staging is a separate reviewed environment, not production data copied to a phone. Production server/provider credentials, OAuth client secrets, database connection strings, KMS keys and signing private material never ship in the APK/AAB, source, CI annotations, test logs or screenshots. CI secret names may be referenced by configuration after approval, never their values. Runtime user refresh credentials are obtained after login and protected as specified in [auth/session](MOBILE-AUTH-SESSION.md).

Choose secret injection, signing custodian, key rotation/recovery, artifact access/retention, environment promotion and distribution access before release. No signing password, key file or store credential is included in these documents.

## Versioning and compatibility

PROPOSED Android scheme: user-visible version name and monotonically increasing build/version code, linked to source revision, contract revision and environment. Exact numbering policy is ADR-M16. Backend `/api/v1` remains the public boundary; incompatible API behavior needs explicit compatibility/version planning. Clients must tolerate additive optional fields, while unknown lifecycle/security states disable affected actions.

Keep a supported-client/backend compatibility matrix and a staged rollout/rollback plan. A rollback usually means halting rollout or issuing a newer compatible build, not assuming a store permits arbitrary binary downgrades. Any forced-upgrade mechanism is a future contract decision; do not invent an endpoint or cutoff policy.

## Release prerequisites

1. ADR-M01/M02/M07/M12–M17 decisions needed for the delivered scope are approved by their owners; G01–G10 needed by the MVP close with real integration evidence.
2. Correct auth, session revocation, tenant/resource policy, strong OCC, idempotency, safe command recovery and metadata audit are operational. Mobile UI cannot replace any missing backend control.
3. Clinic workflow is reachable: appointment confirmation/check-in, history/record discovery, safe clinical corrections and defined AMENDED continuation. Unknown commands/outcomes have safe recovery.
4. Integrated assistant passes backend clinical safety thresholds, provider evidence and human review/approval/handoff tests. AI failures preserve authorized manual work. Text/structured-data scope and tenant-only knowledge are retained.
5. Clinical retention, residency, export/deletion, audit, backup/recovery, SLOs, quotas and incident-response dependencies from R07/R23 are resolved for production. Existing AI retention values are not a substitute for broader policy.
6. Signed artifact passes accessibility, privacy, secure storage, TLS, no-secrets and environment checks on the approved device/OS matrix. No notification, camera, microphone or file permission is introduced without a feature requirement.

The current reference boundary validator reports 5 failures; this audit does not fix or waive them. Backend release readiness remains separately owned. No release date, CI pass, compliance approval or production readiness is claimed.
