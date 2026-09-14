package com.viora.mobile.testutil

import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.network.ApiPayload
import com.viora.mobile.core.network.ApiRequest
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.security.SecureStore
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.AppClock
import java.time.Instant

const val USER = "11111111-1111-4111-8111-111111111111"
const val SESSION = "66666666-6666-4666-8666-666666666666"
const val A = "22222222-2222-4222-8222-222222222222"
const val B = "33333333-3333-4333-8333-333333333333"

class FakeClock : AppClock {
    var elapsed = 0L
    private var anchor = Instant.parse("2026-09-09T00:00:00.000Z")
    private var anchoredAt = 0L
    override fun now(): Instant = anchor.plusMillis(elapsed - anchoredAt)
    override fun elapsedMillis(): Long = elapsed
    override fun synchronize(serverTime: Instant) { anchor = serverTime; anchoredAt = elapsed }
}

class FakeSecureStore : SecureStore {
    var credential: StoredCredential? = null
    var receipts: List<OperationReceipt> = emptyList()
    var rejectWrites = false
    override suspend fun readCredential() = credential
    override suspend fun writeCredential(value: StoredCredential) {
        check(!rejectWrites)
        credential = value
    }
    override suspend fun readReceipts() = receipts
    override suspend fun writeReceipts(values: List<OperationReceipt>) {
        check(!rejectWrites)
        receipts = values
    }
    override suspend fun clear() { credential = null; receipts = emptyList() }
}

class TestBackend(val clock: FakeClock) : SessionAuthGateway, WorkspaceGateway {
    var refreshCalls = 0
    var revokeCalls = 0
    var loginCalls = 0
    val initialExpiry = clock.now().plusSeconds(43200)
    var refreshAction: suspend (StoredCredential) -> TokenBundle = { bundle(it.sessionId) }
    var workspaceAction: suspend (String) -> WorkspaceContext = { context(it) }
    var membershipValues = listOf(
        Membership(A, USER, A, "Demo A", "DOCTOR", true),
        Membership(B, USER, B, "Demo B", "DOCTOR", true))
    fun bundle(session: String = SESSION) = TokenBundle(session, USER, "access-" + Ids.newId(),
        clock.now().plusSeconds(600), "refresh-" + Ids.newId(), initialExpiry, clock.now())
    fun context(id: String) = WorkspaceContext(id, if (id == A) "Demo A" else "Demo B",
        "Asia/Ho_Chi_Minh", "\"policy-1\"", if (id == A) setOf("patient.read") else emptySet())
    override suspend fun signIn(): TokenBundle { loginCalls++; return bundle() }
    override suspend fun refresh(credential: StoredCredential): TokenBundle { refreshCalls++; return refreshAction(credential) }
    override suspend fun revoke(credential: StoredCredential) { revokeCalls++ }
    override suspend fun user(accessToken: String) = User(USER, "Synthetic clinician")
    override suspend fun memberships(accessToken: String) = membershipValues
    override suspend fun validate(accessToken: String, workspaceId: String) = workspaceAction(workspaceId)
}

class FakeSessionGateway(private val backend: TestBackend) : SessionAuthGateway by backend
class FakeWorkspaceGateway(private val backend: TestBackend) : WorkspaceGateway by backend

/** Feature-test boundary: records requests and never reaches a real transport. */
class FakeAuthenticatedRequestExecutor : AuthenticatedRequestPort {
    val requests = mutableListOf<ApiRequest>()
    var next: ApiResult<ApiPayload> = ApiResult.Failure("FEATURE_UNAVAILABLE")
    override suspend fun execute(request: ApiRequest): ApiResult<ApiPayload> {
        requests += request
        return next
    }
}

suspend fun SessionCoordinator.startDemo() { restore(); signIn(); selectWorkspace(A) }
