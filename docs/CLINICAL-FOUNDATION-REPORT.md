# Member C — Clinical Entry & Read Foundation Report

2026-09-12 · devDebug · Checkpoint JVM/API 26 retained; API 36 validation completed separately

## 1. Files Changed

The 27 maintained source, fixture, test and documentation files changed in this batch are listed below. Generated build outputs and ignored local emulator/evidence files are excluded. No Git, backend, dependency or core platform changes were made.

| File | Purpose |
|---|---|
| [app/src/main/java/com/viora/mobile/feature/clinical/domain/ClinicalModels.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/clinical/domain/ClinicalModels.kt) | Exact encounter, record, immutable version/content models and memory-only version reference |
| [app/src/main/java/com/viora/mobile/feature/clinical/domain/ClinicalReadRepository.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/clinical/domain/ClinicalReadRepository.kt) | Public CL02/CL06/CL14 read-only repository |
| [app/src/main/java/com/viora/mobile/feature/clinical/domain/ClinicalReader.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/clinical/domain/ClinicalReader.kt) | Authorized patient/appointment/encounter/record context composition |
| [app/src/main/java/com/viora/mobile/feature/clinical/data/dto/ClinicalDto.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/clinical/data/dto/ClinicalDto.kt) | Strict nullable/required DTO mapping and redacted representations |
| [app/src/main/java/com/viora/mobile/feature/clinical/data/HttpClinicalReadRepository.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/clinical/data/HttpClinicalReadRepository.kt) | Shared request boundary, version/identity checks and off-main decoding |
| [app/src/main/java/com/viora/mobile/feature/clinical/ui/ClinicalState.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/clinical/ui/ClinicalState.kt) | Destination ViewModel, distinct states, retry and epoch/sequence cancellation |
| [app/src/main/java/com/viora/mobile/feature/clinical/ui/ClinicalNavigation.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/clinical/ui/ClinicalNavigation.kt) | B's EncounterNavigation adapter and ID-only navigation contribution |
| [app/src/main/java/com/viora/mobile/feature/clinical/ui/ClinicalScreens.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/clinical/ui/ClinicalScreens.kt) | Read-only entry/history, encounter and record screens |
| [app/src/devDebug/java/com/viora/mobile/feature/clinical/data/SyntheticClinicalReadRepository.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/devDebug/java/com/viora/mobile/feature/clinical/data/SyntheticClinicalReadRepository.kt) | Fixed synthetic clinical data and deterministic failure/suspension hooks |
| [app/src/devDebug/java/com/viora/mobile/app/ClinicalBindings.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/devDebug/java/com/viora/mobile/app/ClinicalBindings.kt) | Select synthetic clinical repository |
| [app/src/staging/java/com/viora/mobile/app/ClinicalBindings.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/staging/java/com/viora/mobile/app/ClinicalBindings.kt) | Select HTTP read adapter behind existing live guard |
| [app/src/prod/java/com/viora/mobile/app/ClinicalBindings.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/prod/java/com/viora/mobile/app/ClinicalBindings.kt) | Select HTTP read adapter behind existing live guard |
| [app/src/main/java/com/viora/mobile/app/AppGraph.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/app/AppGraph.kt) | Necessary constructor wiring of clinical ports/screens/adapter |
| [app/src/main/java/com/viora/mobile/app/NavigationBindings.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/app/NavigationBindings.kt) | Register additional contribution through existing registry |
| [app/src/devDebug/java/com/viora/mobile/app/EnvironmentBindings.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/devDebug/java/com/viora/mobile/app/EnvironmentBindings.kt) | Seed one existing linked appointment for actual operational-to-clinical read validation |
| [app/src/devDebug/java/com/viora/mobile/dev/FakeBackend.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/devDebug/java/com/viora/mobile/dev/FakeBackend.kt) | Explicit clinical-read-demo-policy-2 revision; Willow record.read fixture grant |
| [app/src/test/java/com/viora/mobile/feature/clinical/ClinicalFixture.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/test/java/com/viora/mobile/feature/clinical/ClinicalFixture.kt) | Shared deterministic test setup |
| [app/src/test/java/com/viora/mobile/feature/clinical/ClinicalRepositoryTest.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/test/java/com/viora/mobile/feature/clinical/ClinicalRepositoryTest.kt) | 10 DTO/repository/security/version tests |
| [app/src/test/java/com/viora/mobile/feature/clinical/ClinicalContextTest.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/test/java/com/viora/mobile/feature/clinical/ClinicalContextTest.kt) | 5 relationship/navigation/redaction/late-result tests |
| [app/src/test/java/com/viora/mobile/feature/clinical/ClinicalStateTest.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/test/java/com/viora/mobile/feature/clinical/ClinicalStateTest.kt) | 5 state/ViewModel/retry/invalidation tests |
| [app/src/test/resources/fixtures/clinical/record.json](C:/Users/LAPTOP/Viora-Mobile-App/app/src/test/resources/fixtures/clinical/record.json) | Exact synthetic CL14 response fixture |
| [app/src/test/resources/fixtures/clinical/encounter.json](C:/Users/LAPTOP/Viora-Mobile-App/app/src/test/resources/fixtures/clinical/encounter.json) | Exact synthetic CL02 response fixture |
| [app/src/androidTest/java/com/viora/mobile/clinical/ClinicalNavigationTest.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/androidTest/java/com/viora/mobile/clinical/ClinicalNavigationTest.kt) | 5 integrated clinical Compose/device scenarios |
| [docs/CLINICAL-CONTRACTS.md](C:/Users/LAPTOP/Viora-Mobile-App/docs/CLINICAL-CONTRACTS.md) | Public interface, scope, policy and handoff contract |
| [docs/CLINICAL-FOUNDATION-REPORT.md](C:/Users/LAPTOP/Viora-Mobile-App/docs/CLINICAL-FOUNDATION-REPORT.md) | This evidence report |
| [docs/OPERATIONAL-CONTRACTS.md](C:/Users/LAPTOP/Viora-Mobile-App/docs/OPERATIONAL-CONTRACTS.md) | Addendum connecting B's public clinical handoff |
| [README.md](C:/Users/LAPTOP/Viora-Mobile-App/README.md) | Current demo behavior and evidence link |

Shared-file changes were necessary because the graph owns construction and the registration list owns feature activation. New source-set ClinicalBindings functions select the implementation without adding repositories to core or redesigning EnvironmentBindings. The only existing environment edits add an explicit synthetic read grant and linked appointment fixture. AppNavHost, AppViewModel, session/security/network internals, Gradle files and B's private implementation remain unchanged.

## 2. Clinical Entry

Patient → Open encounter entry → validated patient context and paginated encounter history → existing encounter → existing clinical record. B's existing public EncounterNavigation.Create intent opens read context only; it does not execute encounter creation.

Appointment → Open encounter entry follows Existing(encounterId) when AP03 supplies a link. Clinical entry re-reads the encounter and authorized patient/appointment, checking both link directions. An unlinked appointment opens its patient/appointment context and an explicit no-encounter state. Null Encounter.recordId shows no-record state. No read creates missing resources.

## 3. Clinical Read

ClinicalReadRepository implements CL02, CL06 and CL14 through SessionPort and AuthenticatedRequestPort. DTO/domain mapping preserves required nullable links, access, state, actor/time metadata, exact strong ETag and immutable content versions. The four ClinicalContent fields are exactly those defined in DOMAIN-MODEL. Unknown fields are ignored; malformed known fields, mismatched identities/relationships/ETags and invalid counters fail closed.

ClinicalReader consumes B's public patient and appointment read contracts to verify workspace, patient, optional appointment, encounter and current record before publication. No business policy is implemented in Compose. No local version is generated, no conflict is merged and no mutation method exists.

Initial, Loading, Loaded, Empty, PermissionDenied, NotFound, Error, RetriableFailure and Stale remain distinct. Null links and empty history carry validated parent context. Errors never become empty records. Manual retry refetches; context invalidation clears content and stale retry callbacks. Read sequence and epoch checks prevent old results replacing newer/current-workspace data.

The deterministic devDebug fixture includes a linked IN_PROGRESS encounter with an existing DRAFT record at content version 7, an OPEN encounter without a record and isolated Harbor references. The existing demo banner identifies synthetic mode. Willow has an explicit test-only record.read grant; Harbor remains denied. Failure/suspension hooks live only in devDebug. Real grants, clinical policy and provider registration are not inferred from fixtures.

## 4. Navigation

ClinicalEntryRoute(patientId, appointmentId?), ClinicalEncounterRoute(id), and ClinicalRecordRoute(id) contain opaque IDs only. ClinicalNavigationAdapter implements EncounterNavigation, checks session/context and grants, and dispatches through the existing application navigator. ClinicalNavigationContribution registers with A's registry. There is no new tab, deep link or central shell redesign. Missing/invalid IDs return a safe error before resource I/O. The old platform placeholder remains an unused safe fallback.

## 5. Security

Session snapshots and effective workspace grants precede clinical reads. HTTP adapters use only workspace-scoped GET requests through the existing authenticated boundary. They enforce header/body ETag equality and response workspace/resource identity. Composite readers additionally verify parent/child and optional appointment links. Hidden screen state clears on logout/workspace change; stale responses are discarded.

Clinical routes have no content, names, tokens, ETags or full records. Domain, DTO and screen context string representations are redacted. Static inspection found no clinical SecureStore/ApiClient/direct OkHttp/provider access, Android logging, println, stack-trace dumps, rememberSaveable, SavedStateHandle or selection-copy container. No database, disk cache, write queue, clipboard/export or analytics was added. Existing app privacy cover and secure-window behavior apply. This is client test evidence, not proof of deployed authorization or mandatory server read auditing.

## 6. Tests

| Suite | Verified result |
|---|---|
| JVM (retained checkpoint) | 95/95 passed; 0 failures/errors/skipped: 75 existing tests plus 20 clinical tests. |
| API 26 (retained checkpoint) | 17/17 passed; 0 failures/errors/skipped. |
| API 36 (current direct instrumentation) | 17/17 passed; 0 failures/skipped. AndroidJUnitRunner: `OK (17 tests)`. |
| Clinical Compose/integration subset | 5/5 passed on each API; included in the 17-test device totals. |

The API 26 and JVM suites were not rerun after the final continuation instruction. API 36 ran the complete existing application/test APK suite, including A/B foundation regression checks. Total retained/current device evidence is 34 passing executions across the two API levels. No ignored or disabled test was introduced.

New JVM tests cover strict success mapping/version preservation, missing/weak/mismatched ETags, malformed required/null fields, counters, timestamps, overlong content, duplicate access, pagination, empty history, null record link, denial/not-found/transport/conflict, explicit retry, invalid IDs, workspace mismatch, preflight denial, delayed results, cross-resource consistency, ID-only routes, redaction, all state branches and a real destination ViewModel.

Five new integrated Android/Compose tests exercise patient history→encounter→record, appointment→linked encounter→record, record display/rotation, logout, workspace switch, denied record access, loading gate, failure/retry, empty record, not-found, malformed context, conflict/refresh and scope change during loading. Existing A/B tests are retained and run in the same suite.

## 7. Validation

| Command / evidence | Result |
|---|---|
| `:app:lintDevDebug --offline` | Prior checkpoint PASS: 0 errors, 20 warnings (11 existing Composable naming notices, 9 dependency/version notices). Not rerun after the final continuation request. |
| `:app:testDevDebugUnitTest --offline` | Prior checkpoint PASS: 95 tests, 0 failures/errors/skipped. Not rerun after the final continuation request. |
| `:app:assembleDevDebug :app:assembleDevDebugAndroidTest --offline` | Prior checkpoint PASS; both existing APKs retained and installed on API 36. |
| `:app:connectedDevDebugAndroidTest --offline`, API 26 | Prior checkpoint PASS: 17 tests, 0 failures/errors/skipped at 360dp width. Not rerun. |
| `:app:connectedDevDebugAndroidTest --offline`, API 36 | Current attempt FAILED before tests: pinned `com.android.application:8.13.2` plugin could not be resolved from the current offline cache. |
| `:app:connectedDevDebugAndroidTest`, API 36 | Online retry FAILED before tests: dependency verification rejected `org.junit:junit-bom:5.10.2` artifact `junit-bom-5.10.2.module` from MavenRepo. Verification metadata was not altered and verification was not bypassed. |
| `adb -s emulator-5556 shell am instrument -w -r com.viora.mobile.dev.test/androidx.test.runner.AndroidJUnitRunner` | PASS — AndroidJUnitRunner reported `OK (17 tests)` in 62.149 seconds; 17 passed, 0 failed, 0 skipped. Five are the new integrated clinical tests. |

Both APK installations returned Success. API 36 is the verified device API level, with display density 480 on a 1080px screen (360dp). Direct AndroidJUnitRunner execution uses the already-built test APK containing the complete suite; this is actual device execution, not a substitute claim that the blocked Gradle commands passed. The final continuation changed no application/test source and did not rerun JVM or API 26.

Use explicit configured devDebug equivalents for the generic lintDebug/testDebugUnitTest commands, as authorized in the brief. The generic aliases are ambiguous in this multi-flavor project, already demonstrated in the prior Member A report. No build guard was weakened and no baseline or lint suppression was added. Dependency locks/checksums remained enforced; no upgrade or new library was introduced.

Evidence:

- `.tools/evidence/clinical-final-build.log`: completed checkpoint lint/JVM/APK build.
- `.tools/evidence/clinical-api26-first/results`: saved API 26 XML with 17 passing tests.
- `.tools/evidence/clinical-api36-tests.log`: offline Gradle task failure.
- `.tools/evidence/clinical-api36-online-tests.log`: dependency-verification failure.
- `.tools/evidence/clinical-api36-instrumentation.txt`: direct API 36 AndroidJUnitRunner output.
- `app/build/test-results/testDevDebugUnitTest`: existing JVM XML, 95/95.
- `app/build/reports/lint-results-devDebug.xml`: checkpoint lint evidence.

Installed application APK SHA-256: `B7DB2F02AE00258DE528B905472B5D90591AADAA52E081390CBFBB702724F0D6`.
Installed instrumentation APK SHA-256: `234246D845278DF2E72F8EC79AF3D3FF49012CA8CC5DAD8A39840C3D84145108`.

## 8. Blockers

- Product: BD-01 production role/relationship policy, BD-04 clinical review/completeness/sign-off/amendment/terminal encounter policy, and BD-06 environment/OIDC/signing remain unresolved. BD-05 also gates future AI/retention. Synthetic read grants do not close any decision.
- Backend: deployed CL02/CL06/CL14, authorized resource relationships, exact DTO/ETag contract, mandatory durable sensitive-read audit and real authentication still need integration evidence. Backend clinical integrity and future atomic writes/handoff remain separate gates.
- Environment: the current Gradle environment cannot complete a fresh connected task because of cache/plugin resolution and dependency-verification metadata; the existing APKs remain installable and API 36 instrumentation is executed directly. Restoring verified dependency resolution is a follow-up build reproducibility gate, not a source-code failure. Physical-device checks, live identity/backend tests, full large-font/accessibility and real process-kill privacy acceptance remain outside this batch's claim.

## 9. Member B Handoff

Consumed only public PatientDirectory, PatientReference, DirectoryPage/PageRequest, AppointmentLookup, AppointmentReference, EncounterEntry and EncounterNavigation. No B private repository/UI implementation was imported or modified. B's patient-detail history placeholder remains unchanged; the existing Open encounter entry now exposes real clinical history. B's appointment commands and coupled-clinical restrictions remain intact.

## 10. Member D Preparation

D can consume clinical domain ClinicalContent, ClinicalRecordReference, ClinicalRecord/RecordVersion, and ClinicalReadRepository through constructor injection. These are read schemas and version references, not write authority. D must re-read current authorized resources before future work and must follow the documented dual-version/assurance/atomic handoff evidence protocol. No AI draft review, provider adapter or AI08 handoff implementation is included; repository internals remain private.

## 11. Regression Assessment

No A/B regression was detected within executed coverage: all 75 existing JVM tests and 12 existing Android tests per API remain green alongside the new clinical tests. API 36 tested the already-built final APKs. API 26 and JVM evidence was retained from the accepted checkpoint, as requested; this report does not claim a new run of those suites.

Expected change: operational clinical handoffs reach read screens instead of placeholders; a new synthetic linked appointment and explicit Willow record.read fixture grant enable that demonstration. Four tabs, core session/storage/network controls, encrypted receipt behavior, live build guard and B's operational implementation are unchanged. No complete clinical lifecycle or production/pilot readiness is claimed.

## 12. Senior Engineering Verdict

CLINICAL FOUNDATION COMPLETE WITH VALIDATION GAP

The clinical implementation and all required device scenarios passed. The remaining gap is current Gradle connected-task reproducibility: dependency verification prevents a fresh Gradle invocation, so API 36 was verified directly from the previously built APKs. No verification rule was weakened.

VERDICT: CLINICAL FOUNDATION COMPLETE WITH VALIDATION GAP
NEXT BATCH: Member A — restore verified Gradle dependency resolution for reproducible connected-device validation.
