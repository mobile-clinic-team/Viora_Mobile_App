# Testing and acceptance contract

This owns acceptance requirements. No mobile tests, source or framework were created in the earlier Foundation Contract Closure batch. Subsequent foundation tests and results are recorded in [implementation evidence](FOUNDATION-IMPLEMENTATION.md). Synthetic tests cannot certify deployed authorization, clinical integrity, durable idempotency or AI safety.

## Source sets and dependencies

- app/src/test: JUnit4, coroutines-test, injected FakeClock/MainDispatcherRule, fake repositories/SecureStore, MockWebServer request/response tests. No live provider or database.
- app/src/androidTest: AndroidX runner/ext-junit, Compose UI tests and navigation-testing; actual Keystore/AtomicFile and manifest/privacy/device behavior. Use test-only loopback cleartext override only for local MockWebServer, never production config.
- app/src/devDebug: synthetic demo implementations; visible fake-mode banner, no production network. Production source cannot import them.
- Clock exposes server-adjusted wall time for protocol timestamps and monotonic elapsed time for timers/expiry; fake tests independently advance each. Never use sleep to test timeouts.

Exact core versions/source paths are in [ARCHITECTURE.md](ARCHITECTURE.md) and [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md). APIs, schemas and expected errors are owned by API-SPEC.

## Foundation fixture manifest (future files)

Under app/src/test/resources/fixtures, create these exact synthetic JSON fixtures during implementation:

- auth/transaction-login.json, auth/token-bundle.json, auth/assurance-grant.json, auth/refresh-rejected.json.
- workspace/memberships-two.json, workspace/context-a.json, workspace/context-b.json, workspace/context-stale.json.
- operations/processing.json, operations/succeeded.json, operations/closed.json, operations/indeterminate.json.
- errors/validation.json, errors/version-conflict.json, errors/feature-unavailable.json.

Use fixed UUIDs, serverTime, explicit expiry and distinct workspace/user IDs; no real names, emails, URLs, tokens or notes. Dummy token strings never authenticate outside the fake server. Context A/B fixtures have distinct grants and masks, explicitly test-only policies, not BD-01 approval. Validate fixture required fields/types and use negative fixtures for missing/null/wrong enum/security fields. Do not merely snapshot whatever an implementation happens to return.

## Automated scenarios and expected outcomes

| Test ID | Layer and scenario | Required assertion |
|---|---|---|
| T01 | JVM + device login transaction | URI/state/challenge/purpose/expiry match; duplicate parameters, unexpected origin, expired transaction and callback after process death reject without token publication |
| T02 | JVM broker/serializer boundary | A01/A02 exact schemas and no bearer on LOGIN; STEP_UP bearer retained; provider tokens never accepted as app session |
| T03 | JVM concurrent refresh | 20 expired-token reads cause one A03; replacement persisted before waiters proceed; later demand rechecks fresh token |
| T04 | JVM logout race | Pause refresh, logout, release refresh response; auth epoch mismatch prevents durable/memory session restoration and new authenticated calls |
| T05 | JVM rotation failure | Lost response, rejected refresh, failed atomic store and key loss clear session; no retry of old refresh token or plaintext fallback |
| T06 | JVM HTTP behavior | Header scopes correct; 401 read refresh/replay at most once; 403 no refresh; auth endpoints excluded; redirects/retryOnConnectionFailure cannot duplicate mutation |
| T07 | JVM workspace switch | Delay A response, select B then deliver A; no A data/event navigation in B; W01 required before protected calls, permission revision mismatch invalidates |
| T08 | JVM permission/field projection | Missing/unknown grants deny controls; omit unauthorized patient fields; absent clinical permission yields no record/draft UI content even from an overbroad fake response |
| T09 | JVM HTTP mapping | Every schema, explicit null/omission, enum and size bound; required mismatch fails; date-only unchanged across zones; clinic DST gaps/overlaps handled deterministically |
| T10 | JVM error/retry | Map all API errors; parse Retry-After seconds/date; no early retry beyond allowed window; malformed command success becomes OutcomeUnknown |
| T11 | JVM operation recovery | Persist receipt before dispatch; timeout then OP02 success opens reference once; OPERATION_NOT_FOUND followed by OP03 CLOSED proves no admission; pending/indeterminate cannot trigger new key |
| T12 | JVM process restart simulation | Recreate app graph with only encrypted receipt metadata/refresh bundle; reauthenticate/reselect owner context and check outcome; no body reconstructed, no POST replay |
| T13 | JVM OCC | Wrong/missing/malformed validators map to 412/428/400; header/body mismatch disables action; history counter never used as If-Match; related-resource conflict changes neither UI resource to success; linked CL01 carries appointmentVersionToken and refetches both resources |
| T14 | JVM clinical state | Test every domain transition and forbidden edge using explicit fixture policy; review invalidation, reopen, amendment lineage and currentVersion versus ETag behavior |
| T15 | JVM AI context/generation | AI13 discovers permitted target drafts after restart; new context creates new conversation; only USER/ASSISTANT public messages; no provider/tool parameters; 202/partial/malformed/provenance-invalid output rejected |
| T16 | JVM + UI AI review | GENERATED cannot approve; explicit review, edited version, missing source, target conflict, rejected/expired draft and step-up failure handled; no automatic submit after browser return |
| T17 | JVM handoff result | AI08 receipt must match draft/target/version references and contain HandoffEvidence; missing evidence -> recovery; resulting record remains DRAFT |
| T18 | Device navigation | S00 startup, four tabs, doctor toolbar entry, Back/Home/dirty discard, ID-only routes and epoch-aware events; no stale success redirect |
| T19 | Device lifecycle/privacy | Rotate retains form; background covers immediately; five-minute background clears forms; offline 60-second cover retains concealed fields; valid reconnect refetches and checks ETag |
| T20 | Device storage | Keystore encrypt/decrypt, fresh IV, AtomicFile replacement/recovery, wrong key/tag/schema forces login; credential/receipt files excluded from backup/transfer |
| T21 | Device process death | Force-stop/kill and relaunch test build; only credential/receipt metadata survives; old callback rejected; no restored protected back stack or saved clinical text |
| T22 | Device accessibility/input | 48dp controls, TalkBack semantics, error focus, 200% font, landscape/insets, keyboard/autofill/content-capture restrictions, capture/recents privacy |
| T23 | Artifact/static | prodRelease has no fake imports, debug HTTP exception, credentials, PHI logs, unapproved permissions, arbitrary deep links or dynamic dependency versions |

Minimum device matrix: API 26 and API 36 emulators with Google APIs/system browser, plus one physical Android device before a real pilot. Exercise both 360dp-width phone and large font. Foundation may pass JVM/UI fake tests before BD-06 browser registration; verified App Link/provider tests remain explicitly pending.

## Backend evidence — separate release gates

| Gate | Backend must demonstrate | Client fake evidence cannot establish |
|---|---|---|
| B01 Auth and workspace | Actual OIDC transaction verification, family rotation/replay revocation, step-up, current membership/field/relationship enforcement with two users/workspaces | Token authenticity, IDOR prevention, privilege boundaries |
| B02 Scheduling | Concurrent create/reschedule races, same-workspace related references, approved timing/state/availability policy, coupled appointment/encounter transitions | Database atomicity or authoritative slot availability |
| B03 Clinical | Immutable versions, one logical record/encounter, approved review/finalization/amendment constraints and related resource OCC | Clinical integrity or sign-off governance |
| B04 Idempotency/recovery | Same-key same/different payload, crash before/after commit, close/admission race, expiry, restart recovery, no duplicate side effect | Durable exactly-once application result for one admitted intent |
| B05 AI/handoff | Authorized bounded context, provider isolation, output/provenance validation, both-version conflict, step-up binding, single atomic handoff and expiry | Medical appropriateness, provider privacy, clinical safety |
| B06 Audit/lifecycle | Mandatory audit with state/result commit, sensitive read audit outage, pre-auth event nullability, metadata redaction and approved retention/holds | Audit durability, operational recovery and retention compliance |

Approved BD policies and actual environment/provider contracts are inputs to these tests, not inferred from fakes. No real-patient integrated release until applicable B01–B06 and BD-01–BD-06 gates pass.

## Future validation commands

Run in the project root after a separately authorized bootstrap; on Windows:
~~~text
.\gradlew.bat --version
.\gradlew.bat :app:lintDevDebug :app:testDevDebugUnitTest :app:assembleDevDebug
.\gradlew.bat :app:connectedDevDebugAndroidTest
.\gradlew.bat :app:lintProdRelease :app:assembleProdRelease
~~~
Last command requires owner-supplied valid production configuration; otherwise it must fail rather than emit a misconfigured release. Run instrumentation once with each required API-level emulator as the sole selected device. Tests use synthetic environments; no service install, migration or production traffic is part of ordinary Android unit tests.

Foundation acceptance is T01–T13 and T18–T23 as applicable to implemented shell/state/network/storage, with UI/session fake tests passing and real OIDC clearly separated. Clinical/AI tests T14–T17 become mandatory when those feature implementations begin; do not add empty placeholder tests and call them coverage.

Test results record build/contract revision, environment, API level, test IDs, outcome and pending gates. Lint has no unexplained errors; all changed behavior has assertions, no disabled failing security tests. No arbitrary percentage or “tests green” label substitutes for the listed behavior.
