# PR: Android baseline stabilization and reproducible verification

## Summary

Stabilize the preserved Android worktree so the synthetic dev baseline has current, same-revision JVM, lint, and assembly evidence before later backend and service phases.

## Root causes

- Shared test login and membership fixtures did not reach the current validated session contract.
- The synthetic backend did not expose the second workspace and its restricted grants.
- Session persistence restored workspace selection and signed out a valid zero-membership identity, contrary to the documented lifecycle contract.

## Changes

- Aligned shared fixtures with current workspace and role contracts.
- Added synthetic multi-workspace coverage in the dev fake backend.
- Preserved in-memory workspace selection and the locked empty-workspace state.
- Recorded the dependency metadata review and preserved it as a separate owner-review group.
- Added baseline gate and issue evidence.

## Verification

- 139/139 JVM tests: PASS.
- 16/16 assurance tests: PASS.
- `lintDevDebug`: PASS, 0 errors, 34 warnings.
- `assembleDevDebug`: PASS with a temporary workspace-only debug keystore.
- Hosted CI: CONFIGURED — NOT EXECUTED.
- Instrumented tests: NOT_EXECUTED — no device/emulator.

## Risk

The preserved worktree contains unrelated UI/application changes that must remain separate. Normal Windows debug signing has a local lock issue. The runtime remains synthetic-only and no production service behavior is claimed.

## Reviewer checklist

- [ ] Confirm preserved feature files are not mixed into baseline commits.
- [ ] Review `SessionCoordinator` against `docs/AUTH-SECURITY.md`.
- [ ] Review synthetic workspace and role grants in `FakeBackend`.
- [ ] Review `gradle/verification-metadata.xml` separately.
- [ ] Run or observe hosted CI.
- [ ] Confirm no secrets, real patient data, temporary caches, or debug keystores are committed.
