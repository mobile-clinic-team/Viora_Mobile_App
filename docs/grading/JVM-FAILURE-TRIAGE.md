# JVM failure triage

Audit date: 2026-09-15  
Project: `C:\Users\LAPTOP\Viora-Mobile-App`  
Evidence boundary: dirty working tree; preserved application work was not reverted.  
Initial command: `:app:testDevDebugUnitTest --no-daemon` using the recovered repository-local Gradle home.  
Initial result: 139 tests executed, 110 passed, 29 failed, 0 skipped, 0 errors.

## Initial failure inventory

The inventory below is the raw same-revision failure set captured before Phase 1B.2 fixes. Stack frames identify the first relevant test or production location; they are not claims that every frame is the ultimate root cause.

| Failure ID | Test class | Test method | Observed behavior | Expected behavior | Initial category | Suspected shared root cause | Top relevant frame |
|---|---|---|---|---|---|---|---|
| F01 | `OperationalIntegrationTest` | `clinicalHandoffChecksWorkspaceGrantAndContainsOnlyIds` | Received `ClinicalEntryPlaceholderRoute(patientId=63333333-3333-4333-8333-333333333333, appointmentId=null, encounterId=null)` where null was asserted | Handoff route should contain only the permitted identifier projection | workspace-context drift | Test context did not match the active membership/workspace contract | `OperationalIntegrationTest.kt:81` |
| F02 | `OperationalIntegrationTest` | `workspaceSwitchInvalidatesSnapshotAndProjectsDistinctFieldsAndLocations` | Workspace switch assertion failed | Selecting another authorized workspace invalidates the old snapshot and exposes the other workspace projection | membership/role drift | Dev fake backend exposed only one membership/workspace | `OperationalIntegrationTest.kt:43` |
| F03 | `ApiClientTest` | `second401SignsOutAnd403DoesNotRefresh` | Expected refresh count 1, observed 0 | First 401 may refresh once; the second 401 signs out and 403 does not refresh | stale test fixture | Shared login helper left the session signed out | `ApiClientTest.kt:127` |
| F04 | `OperationCoordinatorTest` | `metadataSurvivesRestartAndIsVisibleOnlyToOriginalWorkspace` | `IllegalArgumentException: Required value was null` | Operation metadata survives restart and remains scoped to its original workspace | session lifecycle drift | Shared session setup did not reach a validated ready context | `OperationCoordinator.kt:20` |
| F05 | `OperationCoordinatorTest` | `fullOrFailedStorePreventsAdmissionAndLogoutClearsMetadata` | `IllegalArgumentException: Required value was null` | Full/failed storage blocks admission and logout clears metadata | session lifecycle drift | Shared session setup did not reach a validated ready context | `OperationCoordinator.kt:20` |
| F06 | `PrivacyControllerTest` | `backgroundTimeoutClearsWorkspaceAndResumeRequiresSelection` | Assertion failed | Background timeout clears workspace and resume requires selection | session lifecycle drift | Shared login helper left the session signed out | `PrivacyControllerTest.kt:21` |
| F07 | `SessionCoordinatorTest` | `processRestartRefreshesButNeverRestoresWorkspaceOrBackStack` | Expected 1, observed 0 | Process restart refreshes identity but does not restore workspace/back stack | session lifecycle drift | Session setup did not authenticate; the implementation also persisted selection | `SessionCoordinatorTest.kt:92` |
| F08 | `SessionCoordinatorTest` | `oneMembershipAutoValidatesButZeroCannotUnlock` | Expected `SELECT_WORKSPACE`, observed `SIGNED_OUT` | Zero memberships remain locked at workspace selection | session lifecycle drift | Production zero-membership handling signed out instead of retaining a locked identity | `SessionCoordinatorTest.kt:107` |
| F09 | `SessionCoordinatorTest` | `lostRefreshResponseClearsAndNeverRetriesOldToken` | Expected 1, observed 0 | Lost refresh clears credentials and never retries the old token | session lifecycle drift | Shared session setup did not reach the refresh path | `SessionCoordinatorTest.kt:58` |
| F10 | `SessionCoordinatorTest` | `delayedWorkspaceResponseCannotCrossContextEpoch` | NullPointerException | Delayed response from an old context epoch is discarded | session lifecycle drift | Shared session setup did not reach a validated context | `SessionCoordinatorTest.kt:75` |
| F11 | `SessionCoordinatorTest` | `unknownPermissionNeverGrantsAnAction` | Assertion failed | Unknown permission does not grant an action | membership/role drift | Roleless test context was inconsistent with the role-aware authorization contract | `SessionCoordinatorTest.kt:133` |
| F12 | `SessionCoordinatorTest` | `concurrentRefreshIsSingleFlightAndDurableBeforePublication` | NullPointerException | Concurrent refresh is single-flight and durable before publication | session lifecycle drift | Shared session setup did not reach the refresh path | `SessionCoordinatorTest.kt:15` |
| F13 | `OperationalHttpTest` | `unresolvedPolicyDoesNotSendWritesOrAvailability` | Observed `UNAUTHENTICATED` | Unresolved policy returns `FEATURE_UNAVAILABLE` without writes or availability requests | HTTP fake/server fixture mismatch | Shared login helper left the session signed out | `OperationalHttpTest.kt:89` |
| F14 | `OperationalHttpTest` | `doctorRequiresExplicitNullableKeysAndUnknownStatusIsReadOnly` | `ApiResult.Failure` was cast to `Success` | Authorized doctor response preserves explicit nullable keys and unknown status is read-only | HTTP fake/server fixture mismatch | Shared login helper left the session signed out | `OperationalHttpTest.kt:68` |
| F15 | `OperationalHttpTest` | `appointmentReadValidatesCurrentTokenAndPreservesUnknownStateWithoutActions` | `ApiResult.Failure` was cast to `Success` | Appointment read validates token and unknown state does not enable actions | HTTP fake/server fixture mismatch | Shared login helper left the session signed out | `OperationalHttpTest.kt:82` |
| F16 | `OperationalHttpTest` | `patientOmissionNullProjectionAndDateOnlyRemainDistinct` | `ApiResult.Failure` was cast to `Success` | Omitted, null, and date-only patient fields remain distinct | HTTP fake/server fixture mismatch | Shared login helper left the session signed out | `OperationalHttpTest.kt:40` |
| F17 | `OperationalHttpTest` | `searchEncodesQueryAndMalformedPagesReject` | Observed `UNAUTHENTICATED` | Query is encoded and malformed pages are rejected as invalid responses | HTTP fake/server fixture mismatch | Shared login helper left the session signed out | `OperationalHttpTest.kt:60` |
| F18 | `OperationalHttpTest` | `missingGrantsCauseNoHttpAndCrossWorkspaceResponseIsDiscarded` | Expected 403, observed 401 | Missing grants prevent HTTP and cross-workspace data is discarded | HTTP fake/server fixture mismatch | Shared login helper left the session signed out | `OperationalHttpTest.kt:115` |
| F19 | `OperationalHttpTest` | `creationUsesExactAllowlistMetadataAndMalformedReceiptIsUnknown` | Expected `OutcomeUnknown`, observed `Failure(UNAUTHENTICATED,401)` | Exact allowlist metadata is sent and malformed receipt is unknown | HTTP fake/server fixture mismatch | Shared login helper left the session signed out | `OperationalHttpTest.kt:97` |
| F20 | `OperationalHttpTest` | `rescheduleCarriesExactVersionAndConflictIsNotRetried` | Expected 412, observed 401 | Reschedule carries the exact version and conflict is not retried | HTTP fake/server fixture mismatch | Shared login helper left the session signed out | `OperationalHttpTest.kt:108` |
| F21 | `OperationalStateTest` | `receiptFailurePreventsDispatchAndUnknownOutcomeLocksDuplicateTaps` | Assertion failed | Receipt failure prevents dispatch and unknown outcome locks duplicate taps | HTTP fake/server fixture mismatch | Shared login helper left the session signed out | `OperationalStateTest.kt:64` |
| F22 | `OperationalStateTest` | `loadingEmptyFailureRetryAndDeniedHaveDistinctStates` | Assertion failed | Loading, empty, failure, retry, and denied states remain distinct | HTTP fake/server fixture mismatch | Shared login helper left the session signed out | `OperationalStateTest.kt:27` |
| F23 | `OperationalStateTest` | `savedReceiptWithFailedFollowUpIsNotAnInvitationToResubmit` | Observed `AppointmentSubmitState.Unavailable` cast to `Saved` | Saved receipt remains visible and failed follow-up does not invite resubmission | HTTP fake/server fixture mismatch | Shared login helper left the session signed out | `OperationalStateTest.kt:83` |
| F24 | `OperationalStateTest` | `searchDebounces300msAndLatestQueryWinsEvenWhenOldReadIgnoresCancellation` | Expected 1, observed 0 | Latest debounced query wins even if the old read ignores cancellation | HTTP fake/server fixture mismatch | Shared login helper left the session signed out | `OperationalStateTest.kt:38` |
| F25 | `AssistantContractTest` | `contextRelationshipsAndWorkspaceAreChecked` | `ApiResult.Success` was cast to `Failure` after selecting workspace B | Context relationships and workspace are validated, with forbidden B access denied | workspace-context drift | Dev fake backend lacked the second workspace and role-aware B grants | `AssistantContractTest.kt:38` |
| F26 | `ClinicalContextTest` | `adapterUsesOnlyIdsAndRejectsMissingSessionOtherWorkspaceAndDeniedGrant` | Expected null, observed `ClinicalEntryRoute(PATIENT_A, APPOINTMENT)` | Adapter exposes only IDs and rejects missing session, other workspace, and denied grant | workspace-context drift | Dev fake backend lacked a distinct workspace and restricted B grants | `ClinicalContextTest.kt:64` |
| F27 | `ClinicalRepositoryTest` | `delayedHttpResponseCannotCrossWorkspaceEpoch` | Expected `StaleScope`, observed `Success(ClinicalRecord(REDACTED))` | Old workspace response is discarded as stale | workspace-context drift | Dev fake backend lacked a distinct workspace/epoch scenario | `ClinicalRepositoryTest.kt:119` |
| F28 | `ClinicalRepositoryTest` | `syntheticReadsRespectPermissionScopeMissingRecordsAndManualRetry` | Expected 403, observed 404 | Permission scope is enforced before hidden/missing-resource behavior | workspace-context drift | Dev fake backend lacked the role-aware restricted workspace setup | `ClinicalRepositoryTest.kt:130` |
| F29 | `ClinicalRepositoryTest` | `deniedSessionWorkspaceAndMalformedIdNeverDispatch` | Expected 403, observed null | Denied session/workspace/malformed ID never dispatches an HTTP request | workspace-context drift | Dev fake backend lacked a distinct workspace and restricted grants | `ClinicalRepositoryTest.kt:107` |

## Failure clusters

The clusters are disjoint and account for all 29 failures.

| Cluster | Count | Category | Shared cause | Resolution |
|---|---:|---|---|---|
| A | 19 | stale test fixture; session lifecycle setup; HTTP fake/server fixture mismatch | `startDemo()` tried a credentialed sign-in first. The dev `SessionCoordinator` correctly returned signed out for unavailable local auth, so the helper never reached the no-argument `TestBackend` sign-in. The operational fixture also used a membership ID that did not match the dev backend. | Fixed shared login flow and aligned the operational fixture to membership `A`. Targeted operational HTTP/state tests passed: 15/15. |
| B | 7 | workspace-context drift; membership/role drift | The dev `FakeBackend` exposed only workspace A, while current synthetic contracts and tests exercise two authorized workspaces with different grants. | Added synthetic workspace B with a distinct membership, location, and restricted role grants. No production server or authorization boundary was weakened. Affected integration, assistant, and clinical tests passed. |
| C | 3 | production session lifecycle defect plus stale role fixture | `SessionCoordinator` persisted workspace selection across process restart and signed out a valid identity with zero memberships. A roleless test context also conflicted with the current role-aware authorization rule. | Changed session persistence to retain credentials only; zero memberships remain at `SELECT_WORKSPACE`; made the test context explicitly a doctor membership. Session tests passed 10/10. |

No failure remained unclassified after the final full suite. There was no timing-only cluster among the 29 after the shared setup was corrected.

## Source-of-truth decisions

### Session lifecycle

`docs/AUTH-SECURITY.md` is the controlling contract for this decision: process restart refreshes the identity but workspace selection and back stack are in-memory, and no active workspace is a valid locked state requiring selection. The current `SessionCoordinator` implementation is therefore corrected to persist credentials without selected workspace or role. It continues to fail closed for missing, expired, stale, or invalid scope.

### Domain membership and authorization

`docs/DOMAIN-MODEL.md` defines a membership as the user/workspace/role relationship and defines `WorkspaceContext` as the selected workspace plus membership and server-derived allowlists. Unknown permissions cannot grant an action. The role-aware test context was corrected to contain a valid doctor membership; production authorization was not weakened.

### Synthetic workspaces and routes

The current `FakeBackend`, typed route/navigation code, and current feature tests establish the development contract for two synthetic workspaces. `docs/mobile/MOBILE-APP-SPEC.md` is treated as proposed/pilot documentation where it describes synthetic multi-tenant behavior; it is not evidence of a production backend. The production route contract was not changed in this phase. The failing clinical/assistant route cases were caused by missing workspace B context and restricted grants in the fake backend.

### HTTP behavior

The current repository interfaces, DTO mappers, `ApiClient`, and HTTP tests define the request/response boundary. The 19 HTTP/state failures did not reach those assertions because the shared session helper was signed out. Once the helper established a validated session, the existing HTTP behavior passed without changing expected assertions or error mapping.

### Documentation conflicts

Historical `docs/mobile` and report files remain historical/proposed where they conflict with the current Android tree. Phase 1A and 1B documentation updates explicitly separate current implementation, proposed architecture, and historical evidence. No historical document was silently used to override current security behavior.

## Preserved dirty work review

The following affected paths were already dirty before this phase unless noted. They remain preserved and are not committed by this work.

| Path | Dirty before Phase 1B.2? | Feature/purpose | Tests affected | Contract impact |
|---|---|---|---|---|
| `app/src/devDebug/java/com/viora/mobile/dev/FakeBackend.kt` | Yes | Synthetic dev authentication, memberships, workspace data, and role grants | B; integration, assistant, clinical | Defines the development-only multi-workspace fixture; B now reflects current tenant and grant boundaries |
| `app/src/main/java/com/viora/mobile/core/session/SessionCoordinator.kt` | Yes | Role-aware session, workspace selection, refresh, privacy, and persistence | C and all authenticated clusters | Two small production defects fixed: selection is memory-only and zero memberships remain locked |
| `app/src/main/java/com/viora/mobile/core/session/SessionModels.kt` | Yes | Session state and selected-context models | Session and route tests | Existing role-aware fields retained; no new change in this phase |
| `app/src/test/java/com/viora/mobile/testutil/Fixtures.kt` | Yes, from Phase 1A | Shared valid session/workspace fixture | Assurance and session tests | Supplies required membership and role; preserves fail-closed production behavior |
| `app/src/test/java/com/viora/mobile/feature/appointments/OperationalFixture.kt` | Yes, from Phase 1B.1 | Operational session/context fixture | Cluster A | Membership ID aligned to the current fake backend |
| `app/src/test/java/com/viora/mobile/feature/assistant/AssistantFixture.kt` | Yes | Assistant test setup | Cluster A/B | Uses the current synthetic login/session setup |
| `app/src/test/java/com/viora/mobile/feature/clinical/ClinicalFixture.kt` | Yes | Clinical test setup | Cluster A/B | Uses the current synthetic login/session setup |
| `app/src/test/java/com/viora/mobile/app/OperationalIntegrationTest.kt` | Yes | Integration test setup and workspace flows | Cluster A/B | Existing assertions retained; setup now reaches the intended contract |
| `app/src/test/java/com/viora/mobile/core/session/SessionCoordinatorTest.kt` | No before this phase; test-only change now dirty | Explicit role-aware context fixture | Cluster C | Makes the authorization precondition explicit; assertion was not weakened |

Other pre-existing application, UI, documentation, generated, and unknown entries remain listed in `WORKTREE-BASELINE.md` and `WORKTREE-REVIEW-PLAN.md`.

## Production defects found

| Defect | Violated contract | User flow/severity | Smallest fix | Security/clinical impact |
|---|---|---|---|---|
| Workspace selection was persisted and restored with credentials | `AUTH-SECURITY.md` requires process restart to refresh identity, then require workspace selection | Restart could reopen a previously selected workspace/back stack; medium lifecycle isolation risk | Persist credential bundle only; restore with no selected workspace | Improves scope isolation and preserves fail-closed selection gating |
| A valid identity with zero roles/memberships was signed out | Domain/session contract requires a workspace-empty locked state when no workspace can be selected | A user could not receive the intended workspace-empty state; medium access-flow defect | Keep verified identity, set `SELECT_WORKSPACE`, clear selected role/workspace/snapshot | No access is granted; the locked state remains fail closed |

The roleless `unknownPermissionNeverGrantsAnAction` failure was a test fixture defect, not a production defect.

## Astra-review-required issues

No unresolved defect from the 29 failures requires Astra review after the minimal fixes. Separate review remains appropriate before commit/merge for the pre-existing role-aware `FakeBackend` and `SessionCoordinator` work, the generated dependency verification metadata, hosted CI, and eventual device/release evidence. Those are review gates, not unresolved JVM failures.

## Test progression

| Iteration | Change | Tests run | Passed | Failed | Remaining clusters |
|---|---|---|---:|---:|---|
| Initial | Preserved worktree, before Phase 1B.2 fixes | Full JVM suite | 110 | 29 | A, B, C |
| 1 | Shared login helper and operational membership fixture | Operational HTTP/state targeted tests | 15 | 0 | B, C |
| 2 | Synthetic FakeBackend workspace B and restricted grants | Integration, assistant, clinical targeted tests | 26 | 0 | C |
| 3 | Session persistence/zero-membership fixes and explicit test role | `SessionCoordinatorTest` | 10 | 0 | None in targeted tests |
| Final | All Phase 1B.2 fixes | Full JVM suite | 139 | 0 | None |

## Final outcome

- `AssuranceHandoffBoundaryTest`: PASS, 16/16, 0 failures.
- Full JVM suite: PASS, 139/139, 0 failures, 0 skipped, 0 errors.
- No production authorization assertion was weakened.
- No tests were disabled, skipped, or rewritten to hide a failure.
- Lint and debug assembly were verified separately and are recorded in `VERIFICATION-BASELINE.md`.

## Verification metadata review

`gradle/verification-metadata.xml` contains exact hashes for the Guava parent and JUnit BOM artifacts resolved during Phase 1B.1. The current diff is larger than those two missing artifacts: it contains 1,232 added and 581 removed lines, including 131 added and 59 removed component entries, consistent with Gradle rewriting resolved verification metadata. No trusted-key, trusted-artifact, ignored-artifact, or ignored-key bypass was found, and no dependency version or repository was changed. Because the file was already dirty and was also written by Gradle during legitimate resolution, this phase does not claim that every generated entry is independently owner-approved; it remains a separate metadata review item before commit.

## Proposed commit groups

No commits were created and existing history was not rewritten.

1. `test: align shared fixtures with current workspace and login contract` — shared test fixtures and setup only.
2. `fix(dev): model synthetic multi-workspace access boundaries` — `FakeBackend.kt` only.
3. `fix(session): keep workspace selection in memory and preserve empty-workspace lock` — `SessionCoordinator.kt` only.
4. `test: make role-aware session context explicit` — `SessionCoordinatorTest.kt` only.
5. `fix(resources): move API31 splash attributes to versioned resources` — prior Phase 1B.1 resource fix.
6. `build: review dependency verification metadata` — `gradle/verification-metadata.xml`, after owner review.
7. `ci: add Android baseline checks` — `.github/workflows/android-baseline.yml`, hosted execution still pending.
8. `docs: record JVM failure triage and baseline evidence` — this report and the grading documents.

Pre-existing feature work remains separate from these groups. Generated `.gradle-local`, `.android-*`, APK, and crash-log artifacts remain worktree items for explicit cleanup/review; no destructive cleanup was performed.
