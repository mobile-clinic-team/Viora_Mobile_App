# Member D — Assistant & AI Draft Foundation Report

Completed: 2026-09-13. Scope: the synthetic Assistant & AI Draft Foundation, F15–F18 / S17–S19, S26 and simulated step-up / T15–T17. This report separates new D validation from historical evidence.

## 1. Files Changed

The complete batch changed or added these 18 maintained files. The final continuation made no further application changes after validation passed; this report is its only new maintained file. Generated logs, APKs and test reports are build evidence, not additional application sources.

| File | Change |
| --- | --- |
| [AssistantModels.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/assistant/domain/AssistantModels.kt) | New context, conversation, public message, provenance, draft and receipt/outcome projections |
| [AssistantRepository.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/assistant/domain/AssistantRepository.kt) | New assistant repository, assurance seam and authorized public context reads |
| [AssistantDependencies.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/assistant/domain/AssistantDependencies.kt) | New dependency bundle and unavailable live implementation |
| [AssistantState.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/assistant/ui/AssistantState.kt) | New destination ViewModel, review, recovery and handoff verification |
| [AssistantNavigation.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/assistant/ui/AssistantNavigation.kt) | New ID-only routes and navigation contribution |
| [AssistantScreens.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/assistant/ui/AssistantScreens.kt) | New Assistant, context, conversation and review UI with private text inputs |
| [ClinicalHandoff.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/feature/clinical/domain/ClinicalHandoff.kt) | New minimal public handoff/evidence/readback and record-navigation contracts; no repository implementation |
| [SyntheticAssistantBackend.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/devDebug/java/com/viora/mobile/feature/assistant/data/SyntheticAssistantBackend.kt) | New deterministic synthetic service, fault hooks, assurance and handoff simulator |
| [devDebug AssistantBindings.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/devDebug/java/com/viora/mobile/app/AssistantBindings.kt) | New synthetic composition |
| [staging AssistantBindings.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/staging/java/com/viora/mobile/app/AssistantBindings.kt) | New unavailable live composition |
| [prod AssistantBindings.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/prod/java/com/viora/mobile/app/AssistantBindings.kt) | New unavailable live composition |
| [AppGraph.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/main/java/com/viora/mobile/app/AppGraph.kt) | Minimal constructor wiring, contribution registration and checked clinical navigation callback |
| [FakeBackend.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/devDebug/java/com/viora/mobile/dev/FakeBackend.kt) | Explicit synthetic assistant grants in Willow, denied in Harbor; fixture revision updated |
| [AssistantFixture.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/test/java/com/viora/mobile/feature/assistant/AssistantFixture.kt) | New shared D test fixture |
| [AssistantContractTest.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/test/java/com/viora/mobile/feature/assistant/AssistantContractTest.kt) | New 14 contract tests |
| [AssistantStateTest.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/test/java/com/viora/mobile/feature/assistant/AssistantStateTest.kt) | New 14 state/review/recovery tests |
| [AssistantNavigationTest.kt](C:/Users/LAPTOP/Viora-Mobile-App/app/src/androidTest/java/com/viora/mobile/assistant/AssistantNavigationTest.kt) | New five executed Android/Compose tests |
| [ASSISTANT-FOUNDATION-REPORT.md](C:/Users/LAPTOP/Viora-Mobile-App/docs/ASSISTANT-FOUNDATION-REPORT.md) | This report |

Failure-driven completion fixes in `AssistantScreens.kt`:

- Corrected the content-capture setter guard from API 29 to API 30. The earlier lint run reported the same issue twice.
- Captured the conversation/draft destination from the receipt before acknowledgment clears ViewModel receipt state. The original device run timed out in all five tests after conversation creation; the corrected navigation passed all five.

## 2. Assistant Implementation

The existing Assistant tab now reaches conversation discovery, explicit context creation, conversations, draft generation and review. GENERAL, PATIENT and ENCOUNTER contexts are immutable per conversation; context changes create a separately confirmed conversation. Patient and encounter selection consumes B/C public read interfaces. Routes carry only IDs and the bounded context discriminator, never text, ETags, tokens or full references.

Destination ViewModels represent loading, empty, ready, access denial, unavailable/error, stale/expired context, generation, saved receipt and unresolved outcome states. Retry is explicit. Messages permit only USER and ASSISTANT roles; system/tool payloads are rejected. Replies are plain text and visibly advisory.

Generation is a bounded synchronous call with a 75-second client timeout. The devDebug service returns deterministic synthetic content and supports timeout, failure, output rejection, lost response and unknown outcomes. No provider, 202, streaming, AI job, provider selection or background worker was added.

## 3. AI Draft

AI drafts remain separate from clinical records. They retain identity, workspace/patient/encounter, exact draft ETag, target record and target ETag, four-field `ClinicalContent`, lifecycle actors/times, expiry and authorized provenance. Provenance is bounded and requires at least one source for a clinical draft. The UI displays source references, version relation, generation/expiry times and the synthetic generator label; it adds no provider/model selection.

Only an existing DRAFT target can generate a draft. Missing records are never created implicitly. Target mismatch, version conflict and server-reported expiry stop the relevant action. A changed target requires new generation after review; no rebasing or silent merge is implemented.

## 4. Human Review

Opening a draft performs a read. A separate human action moves GENERATED to IN_REVIEW; GENERATED cannot approve. Review displays the current and proposed values for all four content fields. Editing changes the draft version and invalidates prior confirmation/assurance. Rejection is explicit and applies only in review; approval confirmation can be cancelled.

The approval flow requests a simulated, version-bound assurance grant using A's existing binding/grant types. It then refetches and revalidates the draft and target and requires a second explicit confirmation. Completing step-up does not submit AI08. Live browser/MFA step-up remains unimplemented.

## 5. Clinical Handoff

C's pre-existing public seam contained reads and references, but no AI08 method. The permitted minimal addition is `ClinicalHandoffPort`, with `ClinicalHandoffRequest`, `HandoffEvidence`, authorized readback and a record-navigation interface. D consumes that boundary; C's clinical repositories were not modified.

The request preserves draft identity, reviewed ETag, exact target reference, assurance, durable operation metadata and session snapshot. Success requires matching operation, draft/target versions, audit reference, actor, resulting version identity, target relationships, AI_HANDOFF source-draft linkage and exact reviewed content. The verified result must remain DRAFT with no reviewed-version marker. Mere request acceptance does not show handoff success.

The devDebug adapter returns a clearly labeled simulated commit/readback projection. It never writes C's record storage. Device validation follows the simulated handoff back to the unchanged clinical record at version 7; the synthetic projection reports version 8. This is neither a real clinical write nor finalization.

Duplicate taps are blocked while an intent is active/unresolved. Operation metadata is prepared through A's `OperationPort` before dispatch. Unknown outcomes use receipt/operation lookup and close-if-not-admitted checks; stopping the transport wait does not prove backend cancellation and does not replay generation. Foreground bounded reconciliation is operation recovery, not an AI polling-job API.

## 6. Security / Privacy

Assistant state and inputs stay in ViewModel memory. Workspace/logout invalidation clears protected feature state and assurance; epoch checks reject late results. Rotation retains review state in the same ViewModel. No AI/clinical payload is stored in SavedState, files, an offline queue or a database. Only the existing encrypted, payload-free operation receipts use durable storage.

Private input views disable saved view state, autofill, personalized IME learning and selection/clipboard menus, and apply content-capture exclusion on supported API levels. Existing platform privacy coverage and secure-window behavior remain in force. Domain/state debug strings are redacted; no content logger, analytics SDK, arbitrary URL rendering or provider secret was introduced.

## 7. Tests

New D evidence:

| Suite/run | Exact result |
| --- | --- |
| Initial D-only JVM run | 28/28 PASS |
| Final `AssistantContractTest` | 14 tests, 0 failures, 0 errors, 0 skipped |
| Final `AssistantStateTest` | 14 tests, 0 failures, 0 errors, 0 skipped |
| Initial targeted API 36 run | 5 tests executed, 5 failed on the D receipt/navigation defect; not counted as passes |
| Final targeted `AssistantNavigationTest`, API 36 / Android 16 | **5/5 PASS**, 0 failures, 0 errors, 0 skipped; Gradle BUILD SUCCESSFUL in 1m 10s |

JVM coverage includes context/public-role validation, generation and provenance, timeout/failure/rejection, lost-response recovery, cancellation/unknown outcome distinction, review/expiry, exact handoff projection, target conflicts, duplicate prevention, storage-before-dispatch, edited-version confirmation invalidation and workspace/logout clearing.

Actually executed device coverage: Assistant home and patient/encounter context selection; conversation and synthetic response; draft generation/provenance; explicit review and rotation; simulated step-up plus final confirmation; handoff evidence and navigation back to unchanged clinical content; expiry and injected version-conflict state; workspace/logout clearing; timeout recovery and explicit rejection.

Evidence: [final API 36 XML](C:/Users/LAPTOP/Viora-Mobile-App/.tools/evidence/assistant-api36-final.xml), [successful device log](C:/Users/LAPTOP/Viora-Mobile-App/.tools/evidence/assistant-api36-retry.log), [final validation log](C:/Users/LAPTOP/Viora-Mobile-App/.tools/evidence/assistant-final-validation.log).

## 8. Validation

Final JVM/lint/build command, completed and reused by the final continuation:

```powershell
$env:GRADLE_USER_HOME='C:\Users\LAPTOP\.gradle'
.\gradlew.bat -g .tools/gradle-repro-fresh-home :app:testDevDebugUnitTest --tests 'com.viora.mobile.feature.assistant.*' :app:lintDevDebug :app:assembleDevDebug :app:assembleDevDebugAndroidTest --offline
```

**PASS — BUILD SUCCESSFUL in 1m 24s; 84 actionable tasks, 11 executed and 73 up to date.** Final D JVM result is 28/28. Lint: **0 errors, 31 warnings**. Both app and instrumentation assembly tasks passed with validated existing outputs; they were up to date in this last command. The connected test invocation had rebuilt the final UI fix. No Gradle/dependency/version/verification-policy change was made by D.

Targeted device command:

```powershell
$env:ANDROID_SERIAL='emulator-5556'
.\gradlew.bat -g .tools/gradle-repro-fresh-home :app:connectedDevDebugAndroidTest '-Pandroid.testInstrumentationRunnerArguments.class=com.viora.mobile.assistant.AssistantNavigationTest' --offline
```

APKs: [devDebug application](C:/Users/LAPTOP/Viora-Mobile-App/app/build/outputs/apk/dev/debug/app-dev-debug.apk), [instrumentation APK](C:/Users/LAPTOP/Viora-Mobile-App/app/build/outputs/apk/androidTest/dev/debug/app-dev-debug-androidTest.apk). [Recorded APK hashes](C:/Users/LAPTOP/Viora-Mobile-App/.tools/evidence/assistant-apk-hashes.json).

Historical evidence only: A/B/C JVM 95/95; API 26 17/17; prior API 36 17/17 and Member A fresh-cache 39-task build. No full historical JVM/device suite or API 26 suite was rerun in D. These historical passes are not recast as regression tests against the new D APK.

## 9. Blockers

- **Product/release gates:** BD-01 authorization/relationships, BD-05 clinical AI safety, approved context/provider/retention policy and BD-06 live authentication/environment remain open. Fixture grants and expiry are explicitly synthetic demonstrations, not decisions on those policies.
- **Backend gates:** real AI transport/provider, server-authorized context, complete wire receipt adapters, durable operation discovery/recovery, real assurance and transactional clinical handoff/audit remain separate owner work. The small feature-facing receipt/evidence projections do not claim a completed production AI08 transport implementation.
- **Environment:** no remaining blocker for executed local D validation on API 36. D-specific API 26, physical-device, real browser/MFA, full process-death and complete accessibility/privacy matrix were not executed in this batch.

Synthetic/client tests do **not** prove backend authorization, durable server idempotency, provider privacy, clinical safety or production readiness. Applicable BD and B-series backend gates must be satisfied before real clinical use.

## 10. Shared Files Touched

Existing A-owned files: `AppGraph.kt` for necessary constructor/contribution wiring, and devDebug `FakeBackend.kt` for the test-only grant set. New app composition files: devDebug/staging/prod `AssistantBindings.kt`. New clinical public contract file: `ClinicalHandoff.kt`.

AppNavHost, NavigationBindings, core session/security/network/operations implementations, B's implementation and C's clinical repositories were unchanged. No dependency, module, infrastructure, branch, commit, push or PR was added.

## 11. Regression Assessment

No regression was observed in the executed D flows, which exercise existing login/workspace/navigation and C record reads. The two observed D failures were fixed and their relevant validation passed. Broader A/B/C regression coverage remains historical, not newly executed; this report makes no full-suite regression claim. Application edits stopped once final D JVM, device and lint/build evidence was green.

## 12. Senior Engineering Verdict

**ASSISTANT FOUNDATION VERIFIED** for the bounded synthetic flow and executed D test scope. Real AI, real step-up and durable clinical handoff remain unavailable; no clinical repository mutation or finalization was implemented.

VERDICT: ASSISTANT FOUNDATION VERIFIED
NEXT BATCH: Member A/C — close the live assurance and transactional clinical handoff contracts before production AI integration.
