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
        catch (_: Exception) { fail(epoch, "Please sign in again.") }
    }

    override suspend fun signIn() {
        val epoch = beginAuthenticationEpoch() ?: return
        try {
            val bundle = auth.signIn()
            if (install(epoch, bundle)) loadIdentity(epoch, bundle)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { fail(epoch, "Sign-in unavailable. Try again.") }
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
        bundle.validate()
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
            revokeLater(bundle.credential())
            throw failure
        }
        if (!accepted) revokeLater(bundle.credential())
        return accepted
    }

    private suspend fun loadIdentity(epoch: Long, bundle: TokenBundle) {
        val user = auth.user(bundle.accessToken)
        user.validate()
        require(user.id == bundle.userId)
        val memberships = workspaces.memberships(bundle.accessToken)
        memberships.forEach { it.validate(user.id) }
        require(memberships.map { it.workspaceId }.distinct().size == memberships.size)
        val accepted = mutex.withLock {
            if (mutableState.value.authEpoch != epoch) false else {
                mutableState.value = mutableState.value.copy(phase = SessionPhase.SELECT_WORKSPACE, user = user, memberships = memberships)
                true
            }
        }
        val active = memberships.filter { it.active }
        if (accepted && active.size == 1) selectWorkspace(active.single().workspaceId)
    }

    override suspend fun snapshot(requireWorkspace: Boolean): SessionSnapshot? {
        if (refresh() == null) return null
        return mutex.withLock {
            val state = mutableState.value
            val token = tokens ?: return@withLock null
            val user = state.user ?: return@withLock null
            if (requireWorkspace && state.phase != SessionPhase.READY) return@withLock null
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
                    if (install(epoch, replacement)) replacement else null
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
            if (current.memberships.none { it.workspaceId == id && it.active }) return
            mutableState.value = current.copy(phase = SessionPhase.VALIDATING_WORKSPACE,
                workspace = null, contextEpoch = current.contextEpoch + 1, message = null)
            mutableState.value
        }
        try {
            val snapshot = snapshot(false) ?: return
            if (snapshot.contextEpoch != pending.contextEpoch) return
            val membership = pending.memberships.single { it.workspaceId == id }
            val context = workspaces.validate(snapshot.accessToken, id).also {
                it.validate()
                require(it.id == id)
                require(it.membershipId == null || it.membershipId == membership.id)
                require(it.role == null || it.role == membership.role)
            }
            mutex.withLock {
                if (mutableState.value.authEpoch == pending.authEpoch && mutableState.value.contextEpoch == pending.contextEpoch) {
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
        if (tokens != null) mutableState.value = mutableState.value.copy(
            phase = SessionPhase.SELECT_WORKSPACE, workspace = null, contextEpoch = mutableState.value.contextEpoch + 1, message = null)
    }

    override suspend fun invalidateContext() {
        chooseWorkspace()
        val snapshot = snapshot(false) ?: return
        try {
            val memberships = workspaces.memberships(snapshot.accessToken)
            require(memberships.all { it.userId == snapshot.userId && Ids.valid(it.workspaceId) })
            mutex.withLock {
                if (matchesLocked(snapshot)) mutableState.value = mutableState.value.copy(memberships = memberships)
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
