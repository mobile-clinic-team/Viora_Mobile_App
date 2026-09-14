# Local storage and privacy

This document owns device data lifetimes. Online-first means no durable patient/clinical/message content and no payload-bearing write queue. Outcome receipts below support verification only; they cannot execute an operation.

## Storage inventory

| Data | Storage / lifetime |
|---|---|
| Access token, assurance token, OAuth verifier/state | Memory only; session/transaction lifetime defined in authentication |
| Refresh credential | Encrypted private credential file: schemaVersion=1, sessionId, userId, refreshToken, refreshExpiresAt; replaced atomically on rotation |
| Recovery receipts | Separate encrypted private file; array of at most 16 {operationId, ownerUserId, workspaceId, createdAt, expiresAt}; no route, resource ID, method/body, ETag, patient text or credential |
| Current membership/workspace/permission revision | Memory only, revalidated after restart; no last-workspace preference |
| Patient/doctor/appointment/clinical/AI content and form inputs | ViewModel memory only; no network disk cache, Room, files, saved-state serialization or worker |
| Safe filters | In-process date/status/tab only; search text and patient identifiers never persisted; nothing restored from disk |
| Diagnostics | Bounded error category, duration, app version, validated request ID; no analytics/crash SDK and no persistent app log file |

The local receipt createdAt is the original server-adjusted operation timestamp; expiresAt is createdAt plus 24 hours, the local verification window. All five fields are required (IDs are UUID strings; times are InstantUTC). This local expiry differs from the server's terminal receipt retention; OP01 can still discover server nonterminal operations after local expiry.

A receipt is persisted before any retry-sensitive request leaves Android. It survives process death, but contains no request payload and never triggers resubmission. Terminal receipts are deleted after the user sees the reconciled result. At expiry they are removed and the client reports unresolved verification if needed; expiry never permits replay. Logout clears credentials and receipts. Backend-owned operation discovery after login is defined in API-SPEC; neither absence nor expiry is represented as clinical failure. Before voluntary logout with unresolved work, disclose that local verification references will be removed; retain no payload or credential for recovery. OP01 discovers admitted work only: it cannot prove that a delayed, not-yet-admitted request never existed. Never claim global duplicate prevention across deliberately new human intents or cleared metadata.

If 16 unresolved receipts exist, new writes are disabled until reconciliation; do not silently evict one. Storage failure prevents dispatch. Workspace switch clears feature memory, but retains encrypted receipts for the original workspace; they are invisible until the same owner reselects it.

## Keystore adapter

Implement SecureStore with standard AndroidKeyStore AES-256/GCM/NoPadding, generated randomized 96-bit IV and 128-bit tag for every write. No custom cipher or password-derived key. Each file envelope is {schemaVersion:1, iv:base64, ciphertext:base64}; bind package ID, schema version and file purpose as authenticated associated data. Use separate file-purpose values for credentials and receipts; no tokens/PHI in filenames. Keystore alias viora.storage.v1 is app-private. StrongBox is optional; unsupported hardware is not a plaintext fallback.

SessionCoordinator serializes credential publication/global clearing under its state mutex; SecureStore serializes file operations under its own mutex. Lock order is session, operation coordinator when needed, then store; never call back into session while holding the store lock, and never hold a lock across network I/O. This avoids re-entering a non-reentrant mutex while preserving atomic publication. Write ciphertext with Android AtomicFile (finishWrite only after success); readers see the previous complete generation or the new complete generation. Credential publication follows durable replacement. AES key invalidation, decryption/authentication failure or unsupported envelope version clears both stores and forces login. Erase memory copies when practical; do not claim guaranteed JVM memory zeroization.

Store files in noBackupFilesDir. Set allowBackup=false, exclude app data from legacy backup rules and Android 12+ cloud/device-transfer extraction rules, and verify on API 26 and 36. OIDC config/client IDs are public build configuration; provider and signing secrets never enter these files.

Platform references: [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [AtomicFile](https://developer.android.com/reference/android/util/AtomicFile). Platform primitives are selected to avoid an unchosen “encrypted preferences” dependency.

## Visibility and lifecycle matrix

A foreground session is an unlocked protected activity at RESUMED with a validated session/context. In-flight short interruptions do not create an offline session.

| Event | Visible UI | Memory / recovery |
|---|---|---|
| Rotation/configuration change | Retain screen through its ViewModel | Keep form/read state; no duplicate request or write |
| Network loss while foreground and access token valid | Stale indicator; disable writes and context-dependent AI submission; manual form editing can continue for at most 60 seconds | Retain unsaved sensitive fields in memory. Network failure alone never deletes clinical input |
| More than 60 seconds disconnected, or access token expires offline | Neutral privacy/connection cover; no protected content shown | Keep unsaved fields concealed in memory until valid reconnect, background timeout, forced logout or process death; do not claim they are saved |
| Any backgrounding / device lock | Immediate privacy cover; FLAG_SECURE on protected window and no PHI in recents | Keep memory for less than five minutes; operations may complete but cannot reveal/navigation-trigger while hidden |
| Background reaches five minutes | Remain covered | Increment context epoch, clear all feature/form state; credentials/receipts remain encrypted. Next resume requires session/context revalidation and refetch |
| Resume or reconnect | Neutral gate until session and W01 revalidate | Within retained lifetime, refetch current resource/version; keep unsaved edit only for same owner/workspace. Changed ETag requires explicit review, never merge/submit automatically |
| Process death | Fresh session gate; no protected back-stack restoration | All forms/content/OAuth/assurance gone; refresh credential and receipt metadata only survive |
| Logout, identity revocation, key failure or absolute expiry | Login screen | Clear all feature/navigation state, credentials and receipts; backend operation outcomes still exist subject to authorized recovery |
| Workspace/permission change | Workspace gate | Clear all sensitive forms/data even if user had unsaved edits; old results fail epoch checks |

Voluntary Back/switch/logout asks whether to discard unsaved edits before taking the action. Forced revocation/expiry does not wait for confirmation. Background timeout can lose unsaved work; explain this before editing and mark changes “not saved” until a server result arrives. The cover timing is an engineering privacy default and is testable with injected monotonic time.

## Platform leakage restrictions

Set FLAG_SECURE for all protected destinations, remove it only for the neutral login shell, and verify snapshot behavior on the device matrix. Render no PHI in destination titles, activity labels, notification text or saved navigation state.

Sensitive fields use no personalized IME learning, no autofill/content-capture eligibility and no auto-correction suggestions for clinical text where Android permits those controls. Disable clinical/AI copy/share/export actions and selection-copy menus. Never automatically write clipboard contents. A third-party keyboard or external camera cannot be fully controlled; no stronger guarantee is claimed. Test the flags and avoid adding keyboard/analytics SDKs.

Disable OkHttp disk caching/body logging, response persistence and WebView storage. App logs never include raw exception bodies, request URLs with queries, state objects or headers. A failed write/read remains visible through safe UI error categories and request IDs only.
