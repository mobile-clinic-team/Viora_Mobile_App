# Authentication, authorization and audit

This is the authority for trust and session rules. [API-SPEC.md](API-SPEC.md) owns exact HTTP shapes; [DATA-STORAGE.md](DATA-STORAGE.md) owns device retention and cryptographic storage. Numeric session settings below are explicit engineering defaults, not inherited policy.

## One login sequence

The backend is an OIDC broker and issues its own opaque application session tokens. Provider access/refresh/ID tokens and client secrets never reach Android. There is one configured issuer/client/redirect per environment, known before workspace selection. BD-06 supplies real registrations.

1. LoginController asks SessionCoordinator to begin LOGIN in the current auth epoch. Android creates 32 cryptographically random bytes as a base64url PKCE verifier and its SHA-256 S256 challenge; both stay in memory.
2. Android sends A01 (unauthenticated) with purpose LOGIN and challenge. Backend creates a five-minute transaction, a random state and OIDC nonce, bound to challenge, configured redirect/client/issuer, purpose and creation time. A01 returns transactionId, state, expiresAt and the complete authorizationUrl.
3. Android verifies the URL is HTTPS on its environment issuer's allowed authorization endpoint, with the expected client, redirect, state and S256 challenge; launches a Custom Tab or external browser. No arbitrary issuer selection or WebView.
4. Provider authenticates. The registered redirect is a verified Android HTTPS App Link whose exact origin/path is supplied by configuration. The callback accepts exactly code+state OR error+state; rejects duplicate parameters, fragments, unexpected URI, state mismatch, no pending transaction or expired transaction. No callback data is logged.
5. Android matches URI/state to its memory transaction, then calls A02 with transactionId, code, state and verifier. The app does not exchange the code with the provider. The backend verifies stored transaction/purpose/expiry/state/challenge and exchanges the code once with its registered provider client. It validates provider ID-token signature, issuer, audience, nonce and token timing.
6. In one durable session/audit result, backend consumes the transaction and issues the TokenBundle defined in API-SPEC. Android atomically stores its refresh credential, then publishes authenticated state. Persistence failure discards tokens, attempts revocation and requires login; it never publishes a memory-only durable session.
7. A05 loads the current user, A06 lists memberships/workspaces, and W01 validates the selected workspace. The app is protected by the neutral session gate until completion.

A01/A02 have no bearer token for LOGIN. A03 refresh uses the refresh credential rather than an expired bearer. A04 revoke authenticates using its refresh credential. A01/A02 for STEP_UP require the current bearer in addition to their bound transaction. No auth endpoint enters the generic refresh interceptor.

A lost exchange response abandons that transaction; restart login rather than replaying an authorization code. Backend expires the inaccessible session normally if it cannot be revoked. Replayed/expired transaction is 400 AUTH_TRANSACTION_INVALID. Process death discards pending state/verifier; an old callback cannot restore a session.

Browser state/redirect binding follows [native OAuth guidance](https://www.rfc-editor.org/info/rfc8252/). The broker topology above is this project's explicit choice.

## Session lifecycle

Application access and refresh tokens are opaque high-entropy strings. Android never decodes them as JWT claims. TokenBundle contains sessionId, userId, accessToken, tokenType=Bearer, accessExpiresAt, refreshToken, refreshExpiresAt and serverTime. Access expires after 10 minutes; refresh family has a fixed 12-hour absolute expiry from login. Rotation does not extend that absolute deadline. Revocation and user/membership changes are enforced by the server on each protected request.

Use serverTime anchored to elapsedRealtime for expiry checks; wall-clock changes never extend a session. Restart uses a network refresh before showing protected data. Expiring within 60 seconds triggers a single refresh before a new request. A protected GET that receives 401 may refresh and replay once in the same scope. A second 401 terminates the session. Mutations never replay automatically.

| Event | Deterministic result |
|---|---|
| Concurrent refresh demand | One shared in-flight refresh per auth epoch; register it under the mutex, perform network I/O outside the mutex, and let other callers await its result; recheck token freshness before registration |
| Successful rotation | Persist entire replacement refresh bundle atomically under the session mutex; only then expose the new access token and release waiters |
| Lost response, timeout, invalid/revoked refresh or invalid bundle | Do not reuse the old refresh token. Terminate local session and require interactive login; lost provider/backend rotation can be unrecoverable |
| Secure-store read/write/key failure | Erase unreadable state, no plaintext fallback, require login; writes cannot proceed |
| Logout races with refresh | Under the same mutex increment auth epoch, mark SignedOut and remove durable credentials before further publication. Later refresh/exchange results with old epoch are discarded; if a replacement refresh token arrived, best-effort revoke it |
| Logout online | Clear locally immediately; A04 best-effort, bounded by ordinary timeout. Report whether server revocation was confirmed |
| Logout offline | Clear locally; report remote revocation unconfirmed. Do not retain credentials just to retry revocation |
| Forced revocation/user disabled/absolute session expiry | Epoch invalidation, transport cancellation, all protected memory/navigation cleared; login required |
| Membership/permission invalidation | Context epoch invalidation, clear protected data, reload membership selection; revoke the entire session only for identity/session invalidity |
| Routine access-token expiry | Refresh policy above, not automatically a clinical approval or a new auth epoch |

Never hold the session/storage mutex across network I/O or browser interaction. Logout invalidates state in a short critical section immediately; an in-flight refresh must reacquire the mutex and recheck its captured epoch before any durable write or publication.

Backend refresh atomically invalidates the old token and returns a replacement; replay revokes that family. This follows the rotation properties in [OAuth security BCP](https://www.rfc-editor.org/info/rfc9700/). Backend A04 revokes the family even when supplied an already-rotated token from that family, subject to token authenticity and expiry.

Application logout does not erase provider browser cookies. Subsequent LOGIN requires provider account selection/fresh authentication (prompt=login) to reduce shared-device reuse; global provider SSO logout is not part of MVP. Local biometrics are not implemented and would not constitute server assurance.

## Workspace context and permissions

**Workspace ID is context, never proof of authorization.**

A05 User has no global clinical permission list. A06 returns Membership plus WorkspaceSummary. Each membership has one userId, workspaceId, role, status and permissionRevision; W01 returns the effective permission codes and field visibility for that membership.

Workspace-scoped calls require X-Workspace-ID and X-Permission-Revision from W01. Backend validates the active user/session, active workspace, active membership, permission revision, operation grant and resource relationships independently on every request. There is no server-global selected workspace to race between devices. Identity/membership/auth requests have no workspace header.

Zero active memberships -> workspace-empty screen. One -> revalidate through W01 and select. Several -> explicit choice. Selection is held in memory only. Switch increments context epoch first, clears protected navigation/state and cancels old reads; only W01 success under the new snapshot enables protected requests. An unresolved old mutation remains bound to its original workspace and may be recovered only after reselecting it.

Permission revision mismatch -> 409 CONTEXT_STALE, invalidate/refetch context and require renewed confirmation. Revoked membership -> 403 WORKSPACE_ACCESS_REVOKED. Cross-workspace resource lookup -> 404 RESOURCE_NOT_FOUND regardless of existence. Same-workspace known action denial -> 403 FORBIDDEN.

Permission vocabulary (exact strings): patient.read, patient.create, patient.update; doctor.read; appointment.read, appointment.create, appointment.reschedule, appointment.confirm, appointment.cancel, appointment.checkIn, appointment.start, appointment.complete, appointment.noShow; encounter.read, encounter.create, encounter.start, encounter.complete, encounter.cancel; record.read, record.create, record.edit, record.review, record.finalize, record.amend; assistant.use, draft.generate, draft.read, draft.review, draft.edit, draft.approve, draft.reject. No wildcard/admin bypass.

BD-01 owns role assignment and relationship rules. Until resolved, backend denies unapproved grants. Hard ceilings remain: Receptionist cannot obtain record-content/draft clinical approval access; ClinicAdmin has no implicit clinical grant; Nurse draft.approve is disabled until explicit exception policy is approved. A signed-in human is identified by the verified server session, not a body actorType.

W01 provides patientReadableFields/patientWritableFields (subsets of the domain allowlist). Patient responses omit unauthorized optional fields; a missing field means not supplied, not clinically absent. Mandatory display identifiers/name must be authorized or the whole patient read is denied. Record/draft content is all-or-denied in MVP, avoiding misleading partial clinical narratives. Backend authorization is decisive even if stale/malicious mobile UI displays an action.

## Step-up

Record finalization and draft approval require a fresh one-use AssuranceToken. A01 purpose STEP_UP binds transaction to current session/user/workspace, action, resourceId, reviewed ETag and (for draft approval) target record ETag. Provider must perform MFA; backend verifies its configured accepted amr/acr evidence and auth_time within five minutes. Insufficient provider evidence -> 403 ASSURANCE_REQUIRED; never downgrade to password-only or local biometrics.

A02 STEP_UP returns only AssuranceGrant, not a new TokenBundle. The opaque grant expires after two minutes and cannot outlive the session. Android holds it in memory and sends X-Assurance-Token only for the bound command. Backend consumes it on successful commit; mismatched/expired grant fails. A failed conflict requires re-review and a fresh challenge. Idempotent replay of an already committed command returns its receipt under current authorization without creating another approval.

No browser return automatically approves/finalizes. Revalidate context and both reviewed versions, show confirmation again, then send the bound command. This is a technical control; BD-01/BD-04 still decide who may sign and what clinical completeness means.

## Audit contract (server-owned)

AuditEvent fields: eventId UUID, occurredAt InstantUTC (server), action string from catalogue, actorUserId UUID|null, sessionId UUID|null, workspaceId UUID|null, resourceType string, resourceId UUID|null, resourceVersion OpaqueETag|null, outcome SUCCESS|DENIED|FAILURE, requestId UUID, correlationId UUID, operationId UUID|null, provenanceIds UUID[] (possibly empty), metadata object containing only allowlisted bounded primitives. Null actor/workspace is valid for pre-authentication failure; never fabricate a tenant/user for it.

| Required event family | Trigger / attribution |
|---|---|
| auth.transaction, auth.login, auth.refresh, auth.logout | Success/failure/replay/revocation; opaque transaction/session references only, never credentials |
| authorization.denied, workspace.selected, permission.changed | Denial/context change; permission changes are server administration outside mobile scope |
| patient.read, patient.search, patient.created, patient.updated; doctor.read | Sensitive access and operations; no names, search text or contact values |
| operation.replayed, operation.closed | Receipt replay/close attribution; never duplicate the original clinical mutation event |
| appointment.read, appointment.create, appointment.reschedule, appointment.confirm, appointment.cancel, appointment.checkIn, appointment.start, appointment.complete, appointment.noShow | Resource, resulting version, actor and outcome |
| encounter.read/create/start/complete/cancel; record.read/create/edit/review/reopen/finalize/amend | Record/encounter and immutable revision references; old/new version references only |
| ai.request, ai.contextAccess, ai.generation, ai.failure | Authorized context references, source/provenance identifiers and bounded counts; no prompts/content |
| draft.review/edit/reject/approve; clinical.aiHandoff | Reviewed and target versions, human identity and resulting record/revision; approval/handoff share correlation and operation |

Clinical/patient/scheduling mutations commit state, durable operation result and mandatory audit atomically; otherwise none commits. AI approval/handoff is one such transaction. Read audit must be durable before returning sensitive content; failure returns 503 AUDIT_UNAVAILABLE without content. AI provider dispatch requires durable ai.request metadata first. Provider failure cannot roll back a remote call; final results are never published as successful if required result audit/persistence failed.

Slash notation in the event catalogue expands to dotted action names (record.read/create means record.read and record.create). Allowed metadata keys are previousVersion and targetVersion (OpaqueETag), recordVersionId and targetRecordId (UUID), reasonCode (server-defined enum string, at most 64 characters), fieldNames (authorized field-name array, at most 32), and sourceCount (integer 0..8). Keys absent for an event are omitted; no arbitrary extension fields. Lists/search audit a resource type with null resourceId when no single resource exists. Replay/close audit failure prevents a successful receipt response but cannot undo an already committed domain result.

Audit is append-only and excludes PHI/free text, tokens, full URLs, prompt/output copies and arbitrary client metadata. Server enriches trusted actor/workspace/time; client-supplied IDs are correlation only. Retention/hold rules are BD-05. No mobile audit endpoint or local audit database is required. Denial events remain best-effort when audit storage itself is down, while the underlying denial still applies and protected success fails closed.
