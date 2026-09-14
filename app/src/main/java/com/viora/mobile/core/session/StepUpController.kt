package com.viora.mobile.core.session

import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.time.AppClock
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Local epochs identify the authenticated session; server session binding is checked by A01/A02/AI08. */
fun sameAssuranceSession(a: SessionSnapshot, b: SessionSnapshot): Boolean =
    a.userId == b.userId && a.authEpoch == b.authEpoch && a.contextEpoch == b.contextEpoch &&
        a.workspace?.id == b.workspace?.id && a.workspace?.permissionRevision == b.workspace?.permissionRevision

interface StepUpGateway {
    suspend fun begin(request: AuthStartRequest, session: SessionSnapshot): AuthTransaction
    suspend fun exchange(pending: PendingAuthTransaction, callback: AuthCallback.Success, session: SessionSnapshot): AssuranceGrant
}

/** Environment-owned browser/App Link adapter. Callback and transaction must remain memory-only. */
fun interface StepUpBrowser { suspend fun authenticate(transaction: AuthTransaction): String }

/** No clinical command is reachable from this controller. A returned grant still requires a new confirmation. */
class StepUpController(
    private val environment: AuthEnvironment, private val gateway: StepUpGateway,
    private val browser: StepUpBrowser, private val session: SessionPort, private val clock: AppClock,
    scope: CoroutineScope,
) {
    private class Lease(val grant: AssuranceGrant, val targetId: String, val snapshot: SessionSnapshot)
    private val mutex = Mutex()
    private val requestMutex = Mutex()
    private var lease: Lease? = null
    init {
        environment.validate()
        scope.launch {
            session.state.collect { state ->
                mutex.withLock {
                    lease?.let { if (!current(state, it.snapshot)) lease = null }
                }
            }
        }
    }

    suspend fun request(binding: AssuranceBinding, targetId: String, snapshot: SessionSnapshot): AssuranceGrant {
        binding.validate()
        require(binding.action == "draft.approve" && Ids.valid(targetId) && snapshot.workspace?.id == binding.workspaceId)
        check(requestMutex.tryLock()) { "STEP_UP_IN_PROGRESS" }
        try {
          mutex.withLock { lease = null }
          return coroutineScope {
            val owner = currentCoroutineContext().job
            val watcher = launch(start = CoroutineStart.UNDISPATCHED) {
                session.state.first { !current(it, snapshot) }
                owner.cancel(CancellationException("STALE_ASSURANCE_SESSION"))
            }
            try {
                requireCurrent(snapshot)
                val verifier = Pkce.verifier()
                val challenge = Pkce.challenge(verifier)
                val transaction = gateway.begin(AuthStartRequest(AuthPurpose.STEP_UP, challenge, binding), snapshot)
                val pending = PendingAuthTransaction(transaction, verifier, challenge)
                pending.validate(environment, clock.now())
                // Exact configured endpoint, including port and path, not merely the issuer host.
                val actual = java.net.URI(transaction.authorizationUrl)
                val expected = java.net.URI(environment.authorizationEndpoint)
                require(actual.scheme == expected.scheme && actual.host == expected.host && actual.port == expected.port && actual.path == expected.path)
                requireCurrent(snapshot)
                val callback = AuthCallbackParser.parse(browser.authenticate(transaction), transaction.redirectUri,
                    transaction.state, clock.now(), transaction.expiresAt)
                requireCurrent(snapshot)
                if (callback is AuthCallback.Error) throw AuthCallbackException(callback.code)
                val grant = gateway.exchange(pending, callback as AuthCallback.Success, snapshot)
                grant.validate(clock.now())
                require(grant.binding == binding)
                requireCurrent(snapshot)
                mutex.withLock { lease = Lease(grant, targetId, snapshot) }
                grant
            } finally { watcher.cancel() }
          }
        } finally { requestMutex.unlock() }
    }

    /** Consume local eligibility before dispatch, even if the HTTP outcome later becomes unknown. */
    suspend fun consume(grant: AssuranceGrant, binding: AssuranceBinding, targetId: String, snapshot: SessionSnapshot): Boolean = mutex.withLock {
        val issued = lease
        lease = null
        issued != null && issued.grant === grant && issued.targetId == targetId && issued.grant.binding == binding &&
            sameAssuranceSession(issued.snapshot, snapshot) && current(session.state.value, snapshot) &&
            runCatching { grant.validate(clock.now()) }.isSuccess
    }

    suspend fun invalidate() = mutex.withLock { lease = null }
    private suspend fun requireCurrent(snapshot: SessionSnapshot) {
        require(current(session.state.value, snapshot) && session.snapshot()?.let { sameAssuranceSession(snapshot, it) } == true)
    }
    private fun current(state: SessionState, snapshot: SessionSnapshot) = state.phase == SessionPhase.READY &&
        state.user?.id == snapshot.userId && state.authEpoch == snapshot.authEpoch && state.contextEpoch == snapshot.contextEpoch &&
        state.workspace?.id == snapshot.workspace?.id && state.workspace?.permissionRevision == snapshot.workspace?.permissionRevision
}
