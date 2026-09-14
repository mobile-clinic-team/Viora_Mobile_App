# Android foundation implementation

2026-09-09. Implementation evidence for the synthetic foundation; existing specifications continue to own product and API requirements.

## Delivered scope

| Area | Implementation |
|---|---|
| Gradle / devDebug / app module | One application module, pinned catalogue, verified Gradle 8.13 wrapper checksums, dependency locks and checksum metadata |
| Application graph | Constructor wiring of transport, environment gateways, session, storage, request and operation boundaries |
| Login / navigation | Synthetic sign-in, two workspaces, dashboard, four tabs, doctor-directory entry and account switch/logout; memory-only navigation survives rotation |
| ApiClient | HTTPS origin validation, explicit scope headers, cancellation, size limits, safe errors, bounded read retries, no mutation retry/redirect and malformed-success handling |
| SecureStore | AndroidKeyStore AES-256-GCM, fresh IV, purpose-bound envelope, AtomicFile, no-backup storage and corruption/key-loss handling |
| SessionCoordinator | Single-flight refresh, durable publication, absolute expiry, epoch rejection, logout races, restoration and workspace validation |
| Fake backend | devDebug-only fictional identity/workspaces; no clinical grants or outgoing network calls |
| Foundation tests | JVM concurrency/transport/contract tests and Android navigation/rotation/Keystore tests |

Patient, appointment, doctor and AI destinations are explanatory placeholders. No clinical payload, offline database, write queue or provider SDK exists.

## Verification

- Built with JDK 17, Gradle 8.13, AGP 8.13.2, Kotlin 2.3.10, compile/target SDK 36 and min SDK 26.
- devDebug application and instrumentation APKs build.
- 23 JVM tests pass.
- Five Android tests pass on each of API 26 and API 36: navigation/switch/logout, rotation, encryption, key loss and corrupted envelope (10 device test executions).
- Lint passes; deliberate dependency-version update notices remain.
- A normal build/test run without checksum-generation flags passed with recorded checksums and locks.
- The production pre-build guard was exercised and rejected the unconfigured live environment as intended.

Reports are generated under app/build/reports and app/build/outputs/androidTest-results. Machine-local emulator/evidence files are ignored under .tools. Use the [root README](../README.md) to reproduce; select ANDROID_SERIAL when several devices are attached.

## Explicit boundaries

Login starts the synthetic gateway. Live browser/OIDC initiation, callback registration, step-up and HTTP auth/workspace repositories are not implemented. Staging/prod build guards fail before packaging; BD-06 and real identity integration tests must close before enabling them.

OperationCoordinator implements durable metadata admission, owner/workspace-scoped local receipt discovery and acknowledgment after resolution. No clinical mutation caller exists. OP01/OP02/OP03 server adapters, correlated write dispatch and recovery UI must be implemented before the first live mutation.

TokenBundleDto validates the implemented token-envelope fixture. Other planned fixtures/adapters belong to their subsequent feature slices. The complete API specification is not claimed as implemented.

No sensitive forms exist. Background cover, timeout/context clearing and capture/input-platform restrictions are present. The offline sensitive-form matrix, detailed IME behavior, 200% font/accessibility coverage, real force-stop recovery, backup/device-transfer verification and physical-device checks remain applicable acceptance work.

Client fakes do not establish backend authorization, durable idempotency, clinical integrity, provider privacy or audit durability. BD-01 through BD-06 and B01 through B06 remain live-feature/release gates.

## Maintenance and scope

Dependency checksums were bootstrapped from resolved Google Maven/Maven Central artifacts and then enforced in a normal run. This detects later artifact changes; it is not an independent dependency security audit. Deliberate updates require checksum/lock review and compatibility tests.

No backend files, legacy documents, Git history or remote services were modified. SDK components and Gradle dependencies were installed/resolved for this Android foundation.

## Operational integration addendum

The subsequent Member A integration batch replaces patient/doctor/schedule placeholders with Member B's operational screens and one shared devDebug operational fixture backend. The synthetic context now exposes explicitly test-only operational/clinical-entry grants, distinct demographic masks and validated workspace locations. Clinical/Assistant remain placeholders and staging/prod remain guarded.

Operational writes now consume durable metadata receipts; a visible successful result can acknowledge its receipt. Full live outcome discovery/closure and recovery UI remain separate work. Dirty operational forms now exist, so the original statement that no sensitive forms exist describes only the foundation batch. See [Operational Integration Report](OPERATIONAL-INTEGRATION-REPORT.md) for the current tested scope and device counts; the historical results above are unchanged.
