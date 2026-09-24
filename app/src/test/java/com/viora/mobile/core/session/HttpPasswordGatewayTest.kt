package com.viora.mobile.core.session

import com.viora.mobile.app.Assistant
import com.viora.mobile.app.navigation.RouteAuthorization
import com.viora.mobile.core.network.ApiClient
import com.viora.mobile.feature.clinical.ui.ClinicalEntryRoute
import com.viora.mobile.testutil.*
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class HttpPasswordGatewayTest {
    @Test fun registrationClearsOldFailureAndSameCredentialsReachPatient() = runBlocking {
        MockWebServer().use { server ->
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            try {
                val clock = FakeClock(); val store = FakeSecureStore(); val gateway = gateway(server, clock)
                val session = SessionCoordinator(gateway, gateway, store, clock, scope)
                session.restore()
                server.reply("{}", 401)
                session.signIn("smoke@example.test", "wrong-password-123")
                assertNotNull(session.state.value.message)
                server.reply("""{"data":{"registered":true}}""", 201)
                session.register("smoke@example.test", "test-password-123", "Synthetic")
                assertNull(session.state.value.message)
                assertEquals(SessionPhase.SIGNED_OUT, session.state.value.phase)
                server.reply(tokens()); server.reply(identity()); server.reply(identity())
                session.signIn("smoke@example.test", "test-password-123")
                assertEquals(SessionPhase.READY, session.state.value.phase)
                assertEquals(AppRole.PATIENT, session.state.value.selectedRole)
                assertNull(session.state.value.message)
                assertNull(session.state.value.workspace)
                server.takeRequest()
                val registration = Json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
                val login = Json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
                assertEquals(registration["email"], login["email"])
                assertEquals(registration["password"], login["password"])
            } finally { scope.cancel() }
        }
    }

    @Test fun diagnosticsDistinguishHttpTokenIdentityPersonaAndWorkspaceWithoutSensitiveContent() = runBlocking {
        MockWebServer().use { server ->
            val events = java.util.concurrent.CopyOnWriteArrayList<AuthDiagnostic>()
            val diagnostics = AuthDiagnostics { events.add(it) }
            val gateway = HttpPasswordGateway(ApiClient(server.url("/").toString(), FakeClock(), allowTestLoopback = true, authDiagnostics = diagnostics))
            suspend fun rejected(action: suspend () -> Unit) {
                try { action(); fail("Expected fail-closed rejection") } catch (_: Exception) { }
            }
            server.reply("""{"error":{"message":"sensitive-server-body"}}""", 400)
            rejected { gateway.login("private@example.test", "private-password-123") }
            assertTrue(events.any { it.stage == AuthStage.LOGIN_HTTP && it.reason == AuthReason.HTTP_FAILURE && it.status == 400 })
            server.reply("""{"data":{"accessToken":"private-token"}}""")
            rejected { gateway.login("private@example.test", "private-password-123") }
            assertTrue(events.any { it.stage == AuthStage.TOKEN_CONTRACT })
            server.reply("{}", 403)
            rejected { gateway.identity(token) }
            assertTrue(events.any { it.stage == AuthStage.IDENTITY_HTTP && it.status == 403 })
            server.reply(identity("UNKNOWN"))
            rejected { gateway.identity(token) }
            assertTrue(events.any { it.stage == AuthStage.WORKSPACE })
            server.reply(identity().replace("\"persona\":\"PATIENT\"", "\"persona\":\"UNKNOWN\""))
            rejected { gateway.identity(token) }
            assertTrue(events.any { it.stage == AuthStage.PERSONA })
            diagnostics.report(AuthStage.LOGIN_HTTP, AuthReason.HTTP_FAILURE, 900, "private-token")
            assertNull(events.last().status); assertNull(events.last().requestId)
            assertFalse(events.toString().contains("private")); assertFalse(events.toString().contains("sensitive"))
            assertFalse(events.toString().contains(token))
        }
    }
    private val token = "viora_access_v1.$SESSION.${"a".repeat(43)}"
    private fun tokens(refresh: String = "refresh-1") = """{"data":{"accessToken":"$token","refreshToken":"$refresh","accessExpiresAt":"2026-09-09T00:10:00Z","refreshExpiresAt":"2026-09-09T12:00:00Z"}}"""
    private fun identity(role: String = "PATIENT"): String {
        val staff = role != "PATIENT"
        val memberships = if (staff) """[{"id":"$B","userId":"$USER","workspaceId":"$A","name":"Synthetic","role":"$role","active":true}]""" else "[]"
        val workspace = if (staff) """{"id":"$A","name":"Synthetic","timezone":"Asia/Ho_Chi_Minh","membershipId":"$B","role":"$role","permissionRevision":"\"1\"","permissions":["assistant.use","record.read"]}""" else "null"
        return """{"data":{"user":{"id":"$USER","displayName":"Synthetic"},"sessionId":"$SESSION","persona":"$role","memberships":$memberships,"workspace":$workspace,"requiresWorkspaceSelection":false}}"""
    }
    private fun MockWebServer.reply(body: String, status: Int = 200) = enqueue(MockResponse().setResponseCode(status).setBody(body))
    private fun gateway(server: MockWebServer, clock: FakeClock = FakeClock()) = HttpPasswordGateway(ApiClient(server.url("/").toString(), clock, allowTestLoopback = true))

    @Test fun registrationRequestContainsOnlyCredentialsAndNameAndErrorsAreSafe() = runBlocking {
        MockWebServer().use { server ->
            val gateway = gateway(server)
            server.reply("""{"data":{"registered":true}}""", 201)
            gateway.register("synthetic@example.test", "test-password-123", "Synthetic")
            val request = server.takeRequest()
            assertEquals("/v1/auth/register", request.path); assertNull(request.getHeader("Authorization"))
            assertEquals(setOf("email", "password", "displayName"), Json.parseToJsonElement(request.body.readUtf8()).jsonObject.keys)
            for (status in listOf(400, 409)) {
                server.reply("""{"error":{"code":"VALIDATION_ERROR","message":"Safe","details":null,"requestId":"$A","correlationId":"$B"}}""", status)
                try { gateway.register("x", "x", "x"); fail("Expected failure") } catch (_: com.viora.mobile.core.model.GatewayException) { }
            }
        }
    }

    @Test fun authoritativePersonasRouteAndUnknownRoleNeverBecomesPatient() = runBlocking {
        MockWebServer().use { server ->
            val gateway = gateway(server)
            for ((wire, role) in listOf("DOCTOR" to AppRole.DOCTOR, "NURSE" to AppRole.NURSE, "RECEPTIONIST" to AppRole.RECEPTIONIST,
                "CLINIC_ADMIN" to AppRole.ADMIN, "PATIENT" to AppRole.PATIENT)) {
                server.reply(identity(wire))
                val resolved = gateway.identity(token)
                assertEquals(role, resolved.persona)
                val state = SessionState(phase = SessionPhase.READY, user = resolved.user, memberships = resolved.memberships,
                    workspace = resolved.workspace, selectedRole = resolved.persona, serverAuthority = true)
                assertTrue(Authorization.canEnter(state, role))
                if (role != AppRole.DOCTOR) assertFalse(RouteAuthorization.allows(state, Assistant::class))
                if (role in setOf(AppRole.PATIENT, AppRole.RECEPTIONIST)) assertFalse(RouteAuthorization.allows(state, ClinicalEntryRoute::class))
            }
            for (unknown in listOf("ADMIN", "UNKNOWN")) {
                server.reply(identity(unknown))
                try { gateway.identity(token); fail("Unknown authority must fail") } catch (_: IllegalStateException) { }
            }
        }
    }

    @Test fun realGatewayCoordinatorPersistsRefreshRestoresPatientAndLogoutClearsAuthority() = runBlocking {
        MockWebServer().use { server ->
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            try {
                val clock = FakeClock(); val store = FakeSecureStore(); val gateway = gateway(server, clock)
                val session = SessionCoordinator(gateway, gateway, store, clock, scope)
                session.restore()
                server.reply(tokens()); server.reply(identity()); server.reply(identity())
                session.signIn("synthetic@example.test", "test-password-123")
                assertEquals(SessionPhase.READY, session.state.value.phase)
                assertTrue(Authorization.canEnter(session.state.value, AppRole.PATIENT))
                assertNull(session.state.value.workspace); assertTrue(session.state.value.memberships.isEmpty())
                assertEquals("refresh-1", store.credential!!.refreshToken)
                assertFalse(store.credential.toString().contains("test-password"))
                assertNull(session.snapshot(true)); assertNotNull(session.snapshot(false))
                val login = server.takeRequest(); assertEquals("/v1/auth/login", login.path)
                assertEquals(setOf("email", "password"), Json.parseToJsonElement(login.body.readUtf8()).jsonObject.keys)
                assertEquals("Bearer $token", server.takeRequest().getHeader("Authorization")); server.takeRequest()
                server.reply(tokens("refresh-2")); server.reply(identity()); server.reply(identity())
                val restoredGateway = gateway(server, clock)
                val restored = SessionCoordinator(restoredGateway, restoredGateway, store, clock, scope)
                restored.restore()
                assertEquals("/v1/auth/refresh", server.takeRequest().path)
                assertEquals("/v1/me", server.takeRequest().path); assertEquals("/v1/me", server.takeRequest().path)
                assertTrue(Authorization.canEnter(restored.state.value, AppRole.PATIENT))
                assertEquals("refresh-2", store.credential!!.refreshToken)
                server.reply("", 204)
                restored.logout()
                assertNull(store.credential); assertNull(restored.state.value.user); assertNull(restored.state.value.selectedRole)
                assertFalse(Authorization.canEnter(restored.state.value, AppRole.PATIENT))
                assertEquals("/v1/auth/revoke", server.takeRequest(5, java.util.concurrent.TimeUnit.SECONDS)?.path)
            } finally { scope.cancel() }
        }
    }

    @Test fun failedLoginAndPersonaLookupLeaveNoProtectedSession() = runBlocking {
        MockWebServer().use { server ->
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            try {
                val clock = FakeClock(); val store = FakeSecureStore(); val gateway = gateway(server, clock)
                val session = SessionCoordinator(gateway, gateway, store, clock, scope)
                session.restore()
                server.reply("""{"error":{"code":"INVALID_CREDENTIALS","message":"Safe","details":null,"requestId":"$A","correlationId":"$B"}}""", 401)
                session.signIn("missing@example.test", "wrong-password")
                assertEquals(SessionPhase.SIGNED_OUT, session.state.value.phase); assertNull(store.credential)
                server.reply(tokens()); server.reply("{}", 403)
                session.signIn("synthetic@example.test", "test-password-123")
                assertEquals(SessionPhase.SIGNED_OUT, session.state.value.phase); assertNull(store.credential)
                assertNull(session.state.value.selectedRole)
            } finally { scope.cancel() }
        }
    }
}
