package com.viora.mobile.core.session

import com.viora.mobile.core.model.GatewayException
import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.security.SecureStore
import com.viora.mobile.core.time.AppClock
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class SessionCoordinator(
    private val auth: SessionAuthGateway,
    private val workspaces: WorkspaceGateway,
    private val store: SecureStore,
    private val clock: AppClock,
    private val scope: CoroutineScope,
    private val diagnostics: AuthDiagnostics = AuthDiagnostics(),
) : SessionPort {
    private val mutex = Mutex()
    private val mutableState = MutableStateFlow(SessionState())
    override val state = mutableState.asStateFlow()
    private var tokens: TokenBundle? = null
    private var refreshFlight: Deferred<TokenBundle?>? = null
    private var expiryJob: Job? = null
    private var restored = false

    override suspend fun restore() {
        val epoch = mutex.withLock {
            if (restored) return
            restored = true
            mutableState.value.authEpoch
        }
        try {
            val credential = store.readCredential()
            if (credential == null) { fail(epoch, null); return }
            val bundle = auth.refresh(credential)
            require(bundle.sessionId == credential.sessionId && bundle.userId == credential.userId)
            require(bundle.refreshExpiresAt == java.time.Instant.parse(credential.refreshExpiresAt))
            if (install(epoch, bundle)) loadIdentity(epoch, bundle)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { diagnostics.report(AuthStage.RESTORE, AuthReason.VALIDATION_FAILURE); fail(epoch, "Please sign in again.") }
    }

    override suspend fun register(email: String, password: String, displayName: String) {
        val epoch = mutex.withLock {
            check(mutableState.value.phase == SessionPhase.SIGNED_OUT)
            mutableState.value.authEpoch
        }
        (auth as? PasswordAuthGateway)?.register(email, password, displayName) ?: error("Registration unavailable")
        mutex.withLock {
            if (mutableState.value.authEpoch == epoch && mutableState.value.phase == SessionPhase.SIGNED_OUT)
                mutableState.value = mutableState.value.copy(message = null)
        }
    }

    override suspend fun signIn() {
        val epoch = beginAuthenticationEpoch() ?: return
        try {
            val bundle = auth.signIn()
            if (install(epoch, bundle)) loadIdentity(epoch, bundle)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { fail(epoch, "Sign-in unavailable. Try again.") }
    }

    override suspend fun signIn(email: String, password: String) {
        val epoch = beginAuthenticationEpoch() ?: return
        try {
            val bundle = if (auth is PasswordAuthGateway) auth.login(email, password)
                else (auth as? LocalCredentialGateway)?.authenticate(email, password) ?: error("Authentication unavailable")
            if (install(epoch, bundle)) loadIdentity(epoch, bundle)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { fail(epoch, "Sign-in or account access could not be verified. Check your details and retry.") }
    }

    override suspend fun acceptTokenBundle(bundle: TokenBundle) {
        val epoch = beginAuthenticationEpoch() ?: run {
            revokeLater(bundle.credential())
            return
        }
        try {
            if (install(epoch, bundle)) loadIdentity(epoch, bundle)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { fail(epoch, "Sign-in unavailable. Try again.") }
    }

    private suspend fun beginAuthenticationEpoch(): Long? = mutex.withLock {
        if (mutableState.value.phase != SessionPhase.SIGNED_OUT) return@withLock null
        restored = true
        val next = mutableState.value.authEpoch + 1
        mutableState.value = SessionState(SessionPhase.RESTORING, next, mutableState.value.contextEpoch + 1)
        next
    }

    private suspend fun install(epoch: Long, bundle: TokenBundle): Boolean {
        diagnostics.validate(AuthStage.TOKEN_CONTRACT) { bundle.validate() }
        val accepted = try { mutex.withLock {
            if (mutableState.value.authEpoch != epoch) false
            else {
                store.writeCredential(bundle.credential())
                clock.synchronize(bundle.serverTime)
                tokens = bundle
                expiryJob?.cancel()
                val remainingMillis = java.time.Duration.between(clock.now(), bundle.refreshExpiresAt).toMillis().coerceAtLeast(0L)
                expiryJob = scope.launch {
                    delay(remainingMillis)
                    fail(epoch, "Session expired. Please sign in.")
                }
                true
            }
        } } catch (failure: Exception) {
            diagnostics.report(AuthStage.SESSION_INSTALL, if (failure is com.viora.mobile.core.security.SecureStoreException) AuthReason.STORAGE_FAILURE else AuthReason.VALIDATION_FAILURE)
            revokeLater(bundle.credential())
            throw failure
        }
        if (!accepted) revokeLater(bundle.credential())
        return accepted
    }

    private suspend fun loadIdentity(epoch: Long, bundle: TokenBundle) {
        if (auth is PasswordAuthGateway) {
            val identity = auth.identity(bundle.accessToken)
            diagnostics.validate(AuthStage.SESSION_IDENTITY) {
            identity.user.validate()
            require(identity.user.id == bundle.userId && identity.sessionId == bundle.sessionId)
            identity.memberships.forEach { it.validate(bundle.userId) }
            }
            mutex.withLock {
                if (mutableState.value.authEpoch == epoch) mutableState.value = mutableState.value.copy(
                    contextEpoch = mutableState.value.contextEpoch + 1,
                    phase = if (identity.requiresWorkspaceSelection) SessionPhase.SELECT_WORKSPACE else SessionPhase.READY,
                    user = identity.user, memberships = identity.memberships, workspace = identity.workspace,
                    selectedRole = identity.persona, serverAuthority = true, message = null)
            }
            return
        }
        val user = auth.user(bundle.accessToken)
        user.validate()
        require(user.id == bundle.userId)
        val memberships = workspaces.memberships(bundle.accessToken)
        memberships.forEach { it.validate(user.id) }
        require(memberships.map { it.id }.distinct().size == memberships.size)
        require(memberships.map { it.workspaceId to it.role }.distinct().size == memberships.size)
        val accepted = mutex.withLock {
            if (mutableState.value.authEpoch != epoch) false else {
                mutableState.value = mutableState.value.copy(phase = SessionPhase.SELECT_ROLE, user = user, memberships = memberships,
                    workspace = null, selectedRole = null)
                true
            }
        }
        if (!accepted) return
        val roles = state.value.roles
        val role = roles.singleOrNull()
        if (role != null) resolveRole(role, null)
        else if (roles.isEmpty()) mutex.withLock {
            if (mutableState.value.authEpoch == epoch) mutableState.value = mutableState.value.copy(
                phase = SessionPhase.SELECT_WORKSPACE, workspace = null, selectedRole = null,
                message = "No authorized workspace is available.")
        }
    }

    override suspend fun selectRole(role: AppRole) = resolveRole(role, null)

    private suspend fun resolveRole(role: AppRole, savedWorkspace: String?) {
        val next = mutex.withLock {
            val current = mutableState.value
            if (current.phase != SessionPhase.SELECT_ROLE || role !in current.roles) return
            current.copy(phase = SessionPhase.SELECT_WORKSPACE, selectedRole = role,
                workspace = null, contextEpoch = current.contextEpoch + 1).also { mutableState.value = it }
        }
        val choices = next.authorizedMemberships
        val target = choices.firstOrNull { it.workspaceId == savedWorkspace } ?: choices.singleOrNull()
        if (target != null) selectWorkspace(target.workspaceId)
    }

    override suspend fun snapshot(requireWorkspace: Boolean): SessionSnapshot? {
        if (refresh() == null) return null
        return mutex.withLock {
            val state = mutableState.value
            val token = tokens ?: return@withLock null
            val user = state.user ?: return@withLock null
            if (requireWorkspace && (state.phase != SessionPhase.READY || state.workspace == null)) return@withLock null
            SessionSnapshot(state.authEpoch, state.contextEpoch, user.id, token.accessToken, state.workspace, token.tokenType)
        }
    }

    suspend fun snapshot(): SessionSnapshot? = snapshot(true)

    override suspend fun refresh(rejectedAccessToken: String?): TokenBundle? {
        val deferred = mutex.withLock {
            val current = tokens ?: return null
            if (current.refreshExpiresAt <= clock.now()) { clearLocked("Session expired. Please sign in."); return null }
            if (rejectedAccessToken != null && rejectedAccessToken != current.accessToken) return current
            if (rejectedAccessToken == null && current.accessExpiresAt > clock.now().plusSeconds(60)) return current
            refreshFlight?.let { return@withLock it }
            val epoch = mutableState.value.authEpoch
            scope.async(start = CoroutineStart.LAZY) {
                try {
                    val replacement = auth.refresh(current.credential())
                    require(replacement.sessionId == current.sessionId && replacement.userId == current.userId)
                    require(replacement.refreshExpiresAt == current.refreshExpiresAt)
                    require(replacement.refreshToken != current.refreshToken)
                    if (install(epoch, replacement)) {
                        if (auth is PasswordAuthGateway) loadIdentity(epoch, replacement)
                        replacement
                    } else null
                } catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { fail(epoch, "Session could not be renewed. Please sign in."); null }
                finally { mutex.withLock { if (mutableState.value.authEpoch == epoch) refreshFlight = null } }
            }.also { refreshFlight = it; it.start() }
        }
        return deferred.await()
    }

    suspend fun refresh(): TokenBundle? = refresh(null)

    override suspend fun selectWorkspace(id: String) {
        val pending = mutex.withLock {
            val current = mutableState.value
            if (current.phase !in setOf(SessionPhase.SELECT_WORKSPACE, SessionPhase.READY, SessionPhase.VALIDATING_WORKSPACE) ||
                current.authorizedMemberships.none { it.workspaceId == id }) return
            mutableState.value = current.copy(phase = SessionPhase.VALIDATING_WORKSPACE,
                selectedRole = AppRole.parse(current.authorizedMemberships.single { it.workspaceId == id }.role),
                workspace = null, contextEpoch = current.contextEpoch + 1, message = null)
            mutableState.value
        }
        try {
            val snapshot = snapshot(false) ?: return
            if (snapshot.contextEpoch != pending.contextEpoch) return
            val membership = pending.authorizedMemberships.single { it.workspaceId == id }
            val context = workspaces.validate(snapshot.accessToken, id, requireNotNull(pending.selectedRole)).also {
                it.validate()
                require(it.id == id)
                require(it.membershipId == membership.id)
                require(it.role == membership.role && AppRole.parse(it.role) == pending.selectedRole)
            }
            mutex.withLock {
                if (mutableState.value.authEpoch == pending.authEpoch && mutableState.value.contextEpoch == pending.contextEpoch) {
                    store.writeCredential(requireNotNull(tokens).credential())
                    mutableState.value = mutableState.value.copy(phase = SessionPhase.READY, workspace = context, message = null)
                }
            }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) {
            mutex.withLock {
                if (mutableState.value.authEpoch == pending.authEpoch && mutableState.value.contextEpoch == pending.contextEpoch) {
                    mutableState.value = mutableState.value.copy(phase = SessionPhase.SELECT_WORKSPACE, message = "Workspace unavailable. Choose again.")
                }
            }
        }
    }

    override suspend fun chooseWorkspace() = mutex.withLock {
        if (mutableState.value.serverAuthority && mutableState.value.selectedRole == AppRole.PATIENT) return@withLock
        if (tokens != null && mutableState.value.selectedRole != null) mutableState.value = mutableState.value.copy(
            selectedRole = if (mutableState.value.serverAuthority) null else mutableState.value.selectedRole,
            phase = SessionPhase.SELECT_WORKSPACE, workspace = null, contextEpoch = mutableState.value.contextEpoch + 1, message = null)
    }

    override suspend fun invalidateContext() {
        if (auth is PasswordAuthGateway) {
            val current = mutex.withLock {
                val bundle = tokens ?: return
                mutableState.value = mutableState.value.copy(phase = SessionPhase.RESTORING, workspace = null,
                    selectedRole = null, serverAuthority = false, contextEpoch = mutableState.value.contextEpoch + 1)
                mutableState.value.authEpoch to bundle
            }
            try { loadIdentity(current.first, current.second) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { fail(current.first, "Account access could not be verified. Sign in to retry.") }
            return
        }
        chooseWorkspace()
        val snapshot = snapshot(false) ?: return
        try {
            val memberships = workspaces.memberships(snapshot.accessToken)
            memberships.forEach { it.validate(snapshot.userId) }
            require(memberships.map { it.workspaceId to it.role }.distinct().size == memberships.size)
            mutex.withLock {
                if (matchesLocked(snapshot)) {
                    val next = mutableState.value.copy(memberships = memberships)
                    mutableState.value = if (next.selectedRole in next.roles) next else next.copy(
                        phase = SessionPhase.SELECT_ROLE, selectedRole = null, workspace = null)
                }
            }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) {
            mutex.withLock { if (matchesLocked(snapshot)) mutableState.value = mutableState.value.copy(memberships = emptyList(), message = "Cannot verify workspace access.") }
        }
    }

    override suspend fun matches(snapshot: SessionSnapshot): Boolean = mutex.withLock { matchesLocked(snapshot) }
    private fun matchesLocked(snapshot: SessionSnapshot): Boolean = tokens != null &&
        mutableState.value.authEpoch == snapshot.authEpoch && mutableState.value.contextEpoch == snapshot.contextEpoch

    // Lock ordering: session -> SecureStore. Never wait for a network call with either lock held.
    override suspend fun <T> withCurrent(snapshot: SessionSnapshot, block: suspend () -> T): T = mutex.withLock {
        if (!matchesLocked(snapshot)) throw GatewayException("STALE_SCOPE")
        block()
    }

    override suspend fun logout() {
        val credential = mutex.withLock { val saved = tokens?.credential(); clearLocked("Signed out. Server revocation pending."); saved }
        if (credential != null) revokeLater(credential)
    }
    private fun revokeLater(credential: StoredCredential) {
        val logoutEpoch = mutableState.value.authEpoch
        scope.launch {
            val confirmed = try { auth.revoke(credential); true } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { false }
            mutex.withLock {
                if (mutableState.value.authEpoch == logoutEpoch && mutableState.value.phase == SessionPhase.SIGNED_OUT) {
                    mutableState.value = mutableState.value.copy(message =
                        if (confirmed) "Signed out. Server revocation confirmed." else "Signed out locally. Server revocation unconfirmed.")
                }
            }
        }
    }
    private suspend fun fail(epoch: Long, message: String?) = mutex.withLock {
        if (mutableState.value.authEpoch == epoch) clearLocked(message)
    }
    private suspend fun clearLocked(message: String?) {
        tokens = null
        refreshFlight = null
        expiryJob?.cancel()
        expiryJob = null
        mutableState.value = SessionState(SessionPhase.SIGNED_OUT, mutableState.value.authEpoch + 1,
            mutableState.value.contextEpoch + 1, message = message)
        try { withContext(NonCancellable) { store.clear() } } catch (_: Exception) {
            mutableState.value = mutableState.value.copy(message = "Secure storage unavailable. Close the app and try again.")
        }
    }
}
