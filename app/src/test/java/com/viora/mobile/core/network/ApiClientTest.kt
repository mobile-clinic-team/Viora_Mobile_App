package com.viora.mobile.core.network

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.model.VersionToken
import com.viora.mobile.core.session.*
import com.viora.mobile.testutil.*
import kotlinx.coroutines.*
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.*
import org.junit.Test

class ApiClientTest {
    private fun error(code: String) = """{"error":{"code":"$code","message":"Safe error","details":{"fields":[],"decisionIds":[]},"requestId":"$A","correlationId":"$B"}}"""
    @Test fun workspaceHeadersAreExplicitAndPublicRequestsHaveNoBearer() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            val clock = FakeClock()
            val api = ApiClient(server.url("/").toString(), clock, allowTestLoopback = true)
            val snapshot = SessionSnapshot(1, 2, USER, "access", TestBackend(clock).context(A))
            server.enqueue(MockResponse().setBody("""{"data":{}}"""))
            assertTrue(api.execute(ApiRequest("GET", "/v1/patients?q=ab", RequestScope.WORKSPACE), snapshot) is ApiResult.Success)
            val request = server.takeRequest()
            assertEquals(A, request.getHeader("X-Workspace-ID"))
            assertEquals("\"policy-1\"", request.getHeader("X-Permission-Revision"))
            assertEquals("Bearer access", request.getHeader("Authorization"))
            server.enqueue(MockResponse().setBody("""{"data":{}}"""))
            api.execute(ApiRequest("POST", "/v1/auth/refresh", RequestScope.PUBLIC, """{"refreshToken":"dummy"}"""), snapshot)
            assertNull(server.takeRequest().getHeader("Authorization"))
        }
    }

    @Test fun workspaceValidationCarriesContextWithoutPermissionRevision() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            val api = ApiClient(server.url("/").toString(), FakeClock(), allowTestLoopback = true)
            server.enqueue(MockResponse().setBody("""{"data":{}}"""))
            val snapshot = SessionSnapshot(1, 2, USER, "access", null)
            assertTrue(api.execute(ApiRequest("GET", "/v1/workspaces/$A", RequestScope.WORKSPACE_VALIDATION,
                workspaceId = A), snapshot) is ApiResult.Success)
            val request = server.takeRequest()
            assertEquals(A, request.getHeader("X-Workspace-ID"))
            assertNull(request.getHeader("X-Permission-Revision"))
        }
    }

    @Test fun requestAndCorrelationIdsAreDistinct() = runBlocking {
        MockWebServer().use { server ->
            server.start(); server.enqueue(MockResponse().setBody("""{"data":{}}"""))
            val api = ApiClient(server.url("/").toString(), FakeClock(), allowTestLoopback = true)
            api.execute(ApiRequest("GET", "/v1/me", RequestScope.PUBLIC))
            val request = server.takeRequest()
            assertNotEquals(request.getHeader("X-Request-ID"), request.getHeader("X-Correlation-ID"))
        }
    }

    @Test fun mutationDisconnectIsUnknownAndNeverReplayed() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
            val clock = FakeClock()
            val api = ApiClient(server.url("/").toString(), clock, allowTestLoopback = true)
            val snapshot = SessionSnapshot(1, 1, USER, "access", TestBackend(clock).context(A))
            val result = api.execute(ApiRequest("POST", "/v1/patients", RequestScope.WORKSPACE, "{}",
                operationId = B, operationCreatedAt = "2026-09-09T00:00:00.000Z"), snapshot)
            assertEquals(ApiResult.OutcomeUnknown, result)
            assertEquals(1, server.requestCount)
        }
    }

    @Test fun timeoutMapsToTransportFailureForReads() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
            server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
            val result = ApiClient(server.url("/").toString(), FakeClock(), allowTestLoopback = true, callTimeoutMillis = 50)
                .execute(ApiRequest("GET", "/v1/me", RequestScope.PUBLIC))
            assertEquals("TRANSPORT_ERROR", (result as ApiResult.Failure).code)
            assertEquals(2, server.requestCount)
        }
    }

    @Test fun mutationCarriesIdempotencyAndStrongVersionMetadata() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            val clock = FakeClock()
            val api = ApiClient(server.url("/").toString(), clock, allowTestLoopback = true)
            val snapshot = SessionSnapshot(1, 1, USER, "access", TestBackend(clock).context(A))
            server.enqueue(MockResponse().setBody("""{"data":{"operationId":"$B","state":"SUCCEEDED","primary":{},"related":[],"handoff":null}}""").addHeader("ETag", "\"v1\""))
            api.execute(ApiRequest("PATCH", "/v1/patients/$B", RequestScope.WORKSPACE, "{}", "\"v1\"", B,
                "2026-09-09T00:00:00.000Z"), snapshot)
            val request = server.takeRequest()
            assertEquals(B, request.getHeader("Idempotency-Key"))
            assertEquals("2026-09-09T00:00:00.000Z", request.getHeader("X-Operation-Created-At"))
            assertEquals("\"v1\"", request.getHeader("If-Match"))
            assertTrue(request.getHeader("Content-Type")!!.startsWith("application/json"))
        }
    }

    @Test fun invalidMutationSuccessIsUnknownAndRedirectIsNotFollowed() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            val api = ApiClient(server.url("/").toString(), FakeClock(), allowTestLoopback = true)
            server.enqueue(MockResponse().setBody("not-json"))
            assertEquals(ApiResult.OutcomeUnknown, api.execute(ApiRequest("POST", "/v1/auth/session", RequestScope.PUBLIC, "{}")))
            server.enqueue(MockResponse().setResponseCode(302).addHeader("Location", server.url("/other")))
            assertTrue(api.execute(ApiRequest("GET", "/v1/me", RequestScope.PUBLIC)) is ApiResult.Failure)
            assertEquals(2, server.requestCount)
        }
    }

    @Test fun second401SignsOutAnd403DoesNotRefresh() = runBlocking {
        MockWebServer().use { server ->
            server.start()
            val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            try {
                val session = SessionCoordinator(backend, backend, store, clock, scope)
                session.startDemo()
                val executor = AuthenticatedRequestExecutor(ApiClient(server.url("/").toString(), clock, allowTestLoopback = true), session)
                server.enqueue(MockResponse().setResponseCode(403).setBody(error("FORBIDDEN")))
                executor.execute(ApiRequest("GET", "/v1/patients?q=ab", RequestScope.WORKSPACE))
                assertEquals(0, backend.refreshCalls)
                repeat(2) { server.enqueue(MockResponse().setResponseCode(401).setBody(error("UNAUTHENTICATED"))) }
                executor.execute(ApiRequest("GET", "/v1/patients?q=ab", RequestScope.WORKSPACE))
                assertEquals(1, backend.refreshCalls)
                assertEquals(SessionPhase.SIGNED_OUT, session.state.value.phase)
                assertEquals(3, server.requestCount)
            } finally { scope.cancel() }
        }
    }

    @Test fun longRetryAfterIsRespectedWithoutAutomaticEarlyRetry() = runBlocking {
        MockWebServer().use { server ->
            server.start(); server.enqueue(MockResponse().setResponseCode(429).setBody(error("RATE_LIMITED")).addHeader("Retry-After", "120"))
            val result = ApiClient(server.url("/").toString(), FakeClock(), allowTestLoopback = true)
                .execute(ApiRequest("GET", "/v1/me", RequestScope.PUBLIC))
            assertEquals("RATE_LIMITED", (result as ApiResult.Failure).code)
            assertEquals(1, server.requestCount)
        }
    }

    @Test fun validatorsAndRetryDatesAreDeterministic() {
        assertTrue(VersionToken.valid("\"record-1\""))
        listOf("*", "W/\"record-1\"", "7", "\"a\",\"b\"").forEach { assertFalse(VersionToken.valid(it)) }
        val clock = FakeClock()
        assertEquals(1000L, ApiClient.retryDelayMillis("garbage", clock))
        assertEquals(120000L, ApiClient.retryDelayMillis("Wed, 09 Sep 2026 00:02:00 GMT", clock))
        assertEquals(0L, ApiClient.retryDelayMillis("0", clock))
    }
    @Test fun cleartextOutsideTestLoopbackAndOriginPathsAreRejected() {
        for (origin in listOf("http://example.com", "https://example.com/v1", "https://user:password@example.com")) {
            assertThrows(IllegalArgumentException::class.java) { ApiClient(origin, FakeClock(), allowTestLoopback = true) }
        }
    }

    @Test fun requestLoggingIsRedacted() {
        val request = ApiRequest("POST", "/v1/patients", RequestScope.PUBLIC, "secret patient payload")
        assertFalse(request.toString().contains("secret patient payload"))
    }
}
