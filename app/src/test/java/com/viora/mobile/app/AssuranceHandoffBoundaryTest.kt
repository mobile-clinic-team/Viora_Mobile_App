package com.viora.mobile.app

import com.viora.mobile.core.model.*
import com.viora.mobile.core.network.*
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.WireTime
import com.viora.mobile.feature.assistant.AssistantFixture
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.clinical.data.handoff.*
import com.viora.mobile.feature.clinical.domain.*
import com.viora.mobile.testutil.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.*
import okhttp3.mockwebserver.*
import org.junit.Assert.*
import org.junit.Test
import java.net.URLEncoder

@OptIn(ExperimentalCoroutinesApi::class)
class AssuranceHandoffBoundaryTest {
    private val environment = AuthEnvironment("https://identity.example.test", "android-public",
        "https://mobile.example.test/callback", "https://identity.example.test/authorize")
    private fun encoded(s: String) = URLEncoder.encode(s, "UTF-8")
    private fun transaction(challenge: String, f: AssistantFixture): AuthTransaction {
        val state = "s".repeat(43)
        return AuthTransaction(Ids.newId(), state, f.clock.now().plusSeconds(300),
            environment.authorizationEndpoint + "?client_id=${environment.clientId}&redirect_uri=${encoded(environment.redirectUri)}" +
                "&response_type=code&state=$state&code_challenge=$challenge&code_challenge_method=S256", environment.redirectUri)
    }
    private inner class Rig(val f: AssistantFixture, scope: CoroutineScope, val requests: AuthenticatedRequestPort) {
        lateinit var binding: AssuranceBinding
        var exchangeCount = 0
        var grantChange: (AssuranceGrant) -> AssuranceGrant = { it }
        var browserAction: suspend (AuthTransaction) -> String = { "${it.redirectUri}?code=private-code&state=${it.state}" }
        val gateway = object : StepUpGateway {
            override suspend fun begin(request: AuthStartRequest, session: SessionSnapshot): AuthTransaction {
                assertEquals(AuthPurpose.STEP_UP, request.purpose); binding = request.challenge!!
                return transaction(request.codeChallenge, f)
            }
            override suspend fun exchange(pending: PendingAuthTransaction, callback: AuthCallback.Success, session: SessionSnapshot): AssuranceGrant {
                exchangeCount++; assertEquals("private-code", callback.code)
                return grantChange(AssuranceGrant("private-assurance", f.clock.now().plusSeconds(120), binding))
            }
        }
        val controller = StepUpController(environment, gateway, StepUpBrowser { browserAction(it) }, f.session, f.clock, scope)
        val adapter = ReviewedAssistantAssurance(controller, f.backend, f.reads, f.session, f.clock)
        val handoff = HttpClinicalHandoff(requests, f.session, controller, f.reads, f.clock)
        suspend fun intent(): ClinicalHandoffRequest {
            val draft = f.reviewed(); val target = f.target().reference(); val snapshot = f.session.snapshot()!!
            val binding = AssuranceBinding("draft.approve", target.workspaceId, draft.id, draft.versionToken, target.versionToken)
            val grant = (adapter.request(binding, snapshot) as ApiResult.Success).value
            return ClinicalHandoffRequest(draft.id, draft.versionToken, target, grant, f.ops.prepare(), snapshot)
        }
    }
    private fun receipt(r: ClinicalHandoffRequest): JsonObject = buildJsonObject {
        val versionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        val committed = WireTime.parse(r.operation.createdAt)
        put("operationId", r.operation.operationId); put("state", "SUCCEEDED")
        fun ref(type: String, id: String, parent: String?, token: String?) = buildJsonObject {
            put("type", type); put("id", id); put("parentId", parent); put("versionToken", token)
        }
        put("primary", ref("AI_DRAFT", r.draftId, null, "\"approved\""))
        put("related", JsonArray(listOf(ref("RECORD", r.target.recordId, null, "\"record-next\""),
            ref("RECORD_VERSION", versionId, r.target.recordId, null))))
        putJsonObject("handoff") {
            put("operationId", r.operation.operationId); put("recordId", r.target.recordId); put("recordVersionId", versionId)
            put("recordVersion", (r.target.currentVersion.toLong() + 1).toString()); put("recordVersionToken", "\"record-next\"")
            put("approvedDraftVersionToken", "\"approved\""); put("auditEventId", B); put("committedAt", WireTime.format(committed))
        }
        put("committedAt", WireTime.format(committed)); put("expiresAt", WireTime.format(committed.plusSeconds(86400)))
    }
    private fun envelope(data: JsonElement) = buildJsonObject { put("data", data) }.toString()
    private fun payload(data: JsonElement, etag: String? = "\"approved\"") = ApiPayload(envelope(data), etag, A, 200, B)
    private fun status(op: OperationReceipt, state: String, receipt: JsonObject? = null) = buildJsonObject {
        put("operationId", op.operationId); put("state", state); put("result", receipt ?: JsonNull)
        put("errorCode", when (state) { "FAILED" -> "AUDIT_UNAVAILABLE"; "CLOSED" -> "OPERATION_CLOSED"; else -> null })
        put("createdAt", op.createdAt)
        put("expiresAt", if (state in setOf("SUCCEEDED", "FAILED", "CLOSED")) op.expiresAt else null)
    }

    @Test fun stepUpOnlyReturnsEligibilityAndNeverDispatchesApproval() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val port = FakeAuthenticatedRequestExecutor()
        val rig = Rig(f, backgroundScope, port); val intent = rig.intent()
        assertEquals(1, rig.exchangeCount); assertTrue(port.requests.isEmpty()); assertEquals(0, f.backend.handoffCalls)
        assertTrue(rig.controller.consume(intent.assurance, intent.assurance.binding, intent.target.recordId, intent.session))
        assertFalse(rig.controller.consume(intent.assurance, intent.assurance.binding, intent.target.recordId, intent.session))
        assertFalse(intent.assurance.toString().contains("private-assurance"))
    }
    @Test fun assuranceRejectsEveryBindingAndSessionMismatch() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val rig = Rig(f, backgroundScope, FakeAuthenticatedRequestExecutor())
        val draft = f.reviewed(); val s = f.session.snapshot()!!; val target = f.target().id
        val binding = AssuranceBinding("draft.approve", A, draft.id, draft.versionToken, draft.targetVersionToken)
        val altered = listOf(binding.copy(action = "record.finalize", targetVersionToken = null), binding.copy(workspaceId = B),
            binding.copy(resourceId = B), binding.copy(versionToken = "\"other\""), binding.copy(targetVersionToken = "\"other\""))
        for (b in altered) {
            val grant = rig.controller.request(binding, target, s)
            assertFalse(rig.controller.consume(grant, b, target, s))
        }
        val snapshots = listOf(SessionSnapshot(s.authEpoch + 1, s.contextEpoch, s.userId, s.accessToken, s.workspace),
            SessionSnapshot(s.authEpoch, s.contextEpoch + 1, s.userId, s.accessToken, s.workspace),
            SessionSnapshot(s.authEpoch, s.contextEpoch, B, s.accessToken, s.workspace),
            SessionSnapshot(s.authEpoch, s.contextEpoch, s.userId, s.accessToken, s.workspace!!.copy(id = B)),
            SessionSnapshot(s.authEpoch, s.contextEpoch, s.userId, s.accessToken, s.workspace.copy(permissionRevision = "\"changed\"")))
        for (changed in snapshots) {
            val grant = rig.controller.request(binding, target, s)
            assertFalse(rig.controller.consume(grant, binding, target, changed))
        }
        val grant = rig.controller.request(binding, target, s)
        assertFalse(rig.controller.consume(grant, binding, B, s))
    }
    @Test fun forgedGrantAndExpiredGrantCannotDispatch() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val port = FakeAuthenticatedRequestExecutor(); val rig = Rig(f, backgroundScope, port)
        val intent = rig.intent()
        assertFalse(rig.controller.consume(intent.assurance.copy(), intent.assurance.binding, intent.target.recordId, intent.session))
        val renewed = rig.controller.request(intent.assurance.binding, intent.target.recordId, intent.session)
        f.clock.elapsed += 120000
        assertFalse(rig.controller.consume(renewed, renewed.binding, intent.target.recordId, intent.session))
        assertTrue(port.requests.isEmpty())
    }
    @Test fun invalidCallbackAndBindingResponseAreRejected() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val rig = Rig(f, backgroundScope, FakeAuthenticatedRequestExecutor())
        val d = f.reviewed(); val b = AssuranceBinding("draft.approve", A, d.id, d.versionToken, d.targetVersionToken)
        rig.browserAction = { "${it.redirectUri}?code=private-code&state=bad" }
        assertTrue(rig.adapter.request(b, f.session.snapshot()!!) is ApiResult.Failure); assertEquals(0, rig.exchangeCount)
        rig.browserAction = { "${it.redirectUri}?code=private-code&state=${it.state}" }
        rig.grantChange = { it.copy(binding = b.copy(resourceId = B)) }
        assertTrue(rig.adapter.request(b, f.session.snapshot()!!) is ApiResult.Failure)
    }
    @Test fun targetConflictAfterBrowserRequiresNewGeneration() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val rig = Rig(f, backgroundScope, FakeAuthenticatedRequestExecutor())
        val d = f.reviewed(); val b = AssuranceBinding("draft.approve", A, d.id, d.versionToken, d.targetVersionToken)
        rig.browserAction = { f.changeTarget(); "${it.redirectUri}?code=private-code&state=${it.state}" }
        assertTrue(rig.adapter.request(b, f.session.snapshot()!!) is ApiResult.Failure)
        assertEquals(1, f.backend.generationCalls); assertEquals(0, f.backend.handoffCalls)
    }
    @Test fun generatedAndExpiredDraftsCannotObtainAssurance() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val rig = Rig(f, backgroundScope, FakeAuthenticatedRequestExecutor())
        val d = f.generated(); val b = AssuranceBinding("draft.approve", A, d.id, d.versionToken, d.targetVersionToken)
        assertTrue(rig.adapter.request(b, f.session.snapshot()!!) is ApiResult.Failure)
        val reviewed = f.reviewed(); f.backend.expireDraft(reviewed.id)
        assertTrue(rig.adapter.request(b.copy(resourceId = reviewed.id, versionToken = reviewed.versionToken), f.session.snapshot()!!) is ApiResult.Failure)
        assertEquals(0, rig.exchangeCount)
    }
    @Test fun logoutDuringBrowserCancelsAndDiscardsOldEpoch() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val rig = Rig(f, backgroundScope, FakeAuthenticatedRequestExecutor())
        val d = f.reviewed(); val b = AssuranceBinding("draft.approve", A, d.id, d.versionToken, d.targetVersionToken)
        val entered = CompletableDeferred<Unit>()
        rig.browserAction = { entered.complete(Unit); awaitCancellation() }
        val request = async { rig.adapter.request(b, f.session.snapshot()!!) }
        entered.await(); f.session.logout(); runCurrent()
        assertTrue(request.isCancelled); assertEquals(0, rig.exchangeCount)
    }
    @Test fun validAi08UsesAssuredHeadersExactBodyAndServerEvidence() = runTest {
        val f = AssistantFixture(backgroundScope); f.login()
        MockWebServer().use { server ->
            server.start(); val requests = AuthenticatedRequestExecutor(ApiClient(server.url("/").toString(), f.clock, allowTestLoopback = true), f.session)
            val rig = Rig(f, backgroundScope, requests); val intent = rig.intent()
            server.enqueue(MockResponse().setBody(envelope(receipt(intent))).setHeader("ETag", "\"approved\""))
            val result = rig.handoff.request(intent) as ApiResult.Success
            assertEquals(B, result.value.auditEventId); assertEquals(intent.target.recordId, result.value.recordId)
            val sent = server.takeRequest()
            assertEquals("/v1/ai/drafts/${intent.draftId}/approve", sent.path)
            assertEquals("private-assurance", sent.getHeader("X-Assurance-Token"))
            assertEquals(intent.reviewedVersionToken, sent.getHeader("If-Match"))
            assertEquals(intent.operation.operationId, sent.getHeader("Idempotency-Key"))
            assertEquals(intent.operation.createdAt, sent.getHeader("X-Operation-Created-At"))
            assertEquals(A, sent.getHeader("X-Workspace-ID")); assertNotNull(sent.getHeader("Authorization"))
            assertEquals(intent.session.workspace!!.permissionRevision, sent.getHeader("X-Permission-Revision"))
            val body = Json.parseToJsonElement(sent.body.readUtf8()).jsonObject
            assertEquals(setOf("targetRecordId", "targetVersionToken"), body.keys)
            assertEquals(intent.target.versionToken, body.getValue("targetVersionToken").jsonPrimitive.content)
            assertTrue(rig.handoff.request(intent) is ApiResult.Failure); assertEquals(1, server.requestCount)
            assertEquals(intent.target.currentVersion, f.target().currentVersion)
        }
    }
    @Test fun malformedOrMissingCommitEvidenceIsUnknown() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val port = FakeAuthenticatedRequestExecutor(); val rig = Rig(f, backgroundScope, port)
        val initial = rig.intent()
        val valid = receipt(initial)
        val cases = listOf(valid - "handoff", valid + ("handoff" to JsonNull), valid + ("related" to JsonArray(emptyList())),
            valid + ("operationId" to JsonPrimitive(B)), valid + ("expiresAt" to JsonPrimitive(initial.operation.createdAt)),
            valid + ("handoff" to JsonObject(valid.getValue("handoff").jsonObject - "auditEventId")))
        for (bad in cases) {
            val grant = rig.controller.request(initial.assurance.binding, initial.target.recordId, initial.session)
            val request = ClinicalHandoffRequest(initial.draftId, initial.reviewedVersionToken, initial.target, grant, initial.operation, initial.session)
            port.next = ApiResult.Success(payload(JsonObject(bad)))
            assertEquals(ApiResult.OutcomeUnknown, rig.handoff.request(request))
        }
    }
    @Test fun lostApprovalResponseUsesLookupWithoutApprovalReplay() = runTest {
        val f = AssistantFixture(backgroundScope); f.login()
        MockWebServer().use { server ->
            server.start(); val port = AuthenticatedRequestExecutor(ApiClient(server.url("/").toString(), f.clock, allowTestLoopback = true), f.session)
            val rig = Rig(f, backgroundScope, port); val intent = rig.intent(); val recovery = HttpHandoffRecovery(port, f.session)
            server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
            assertEquals(ApiResult.OutcomeUnknown, rig.handoff.request(intent)); assertEquals("POST", server.takeRequest().method)
            server.enqueue(MockResponse().setBody(envelope(status(intent.operation, "SUCCEEDED", receipt(intent)))))
            val recovered = (recovery.lookup(intent.operation) as ApiResult.Success).value
            assertEquals("SUCCEEDED", recovered.state); assertEquals(intent.target.recordId, recovered.receipt!!.evidence.recordId)
            assertEquals("GET", server.takeRequest().method); assertEquals(2, server.requestCount)
        }
    }
    @Test fun closeHasOriginalTimestampNoNewKeyAndAcceptsPending() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val op = f.ops.prepare()
        MockWebServer().use { server ->
            server.start(); val port = AuthenticatedRequestExecutor(ApiClient(server.url("/").toString(), f.clock, allowTestLoopback = true), f.session)
            val recovery = HttpHandoffRecovery(port, f.session)
            for (state in listOf("PROCESSING", "INDETERMINATE", "CLOSED", "FAILED")) {
                server.enqueue(MockResponse().setBody(envelope(status(op, state))))
                assertEquals(state, (recovery.close(op) as ApiResult.Success).value.state)
                val request = server.takeRequest()
                assertEquals("/v1/operations/${op.operationId}/close", request.path)
                assertNull(request.getHeader("Idempotency-Key")); assertNull(request.getHeader("X-Assurance-Token"))
                assertEquals(op.createdAt, request.getHeader("X-Operation-Created-At")); assertEquals("{}", request.body.readUtf8())
            }
        }
    }
    @Test fun notFoundDoesNotBecomeClosedAndDiscoveryContainsNoCommandPayload() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val port = FakeAuthenticatedRequestExecutor(); val op = f.ops.prepare()
        val recovery = HttpHandoffRecovery(port, f.session)
        port.next = ApiResult.Failure("OPERATION_NOT_FOUND", 404)
        assertEquals(port.next, recovery.lookup(op)); assertEquals(1, port.requests.size)
        port.next = ApiResult.Success(ApiPayload(buildJsonObject {
            put("data", JsonArray(listOf(status(op, "PROCESSING"))))
            putJsonObject("page") { put("nextCursor", JsonNull); put("hasMore", false) }
        }.toString(), null, A, 200))
        val page = (recovery.discover() as ApiResult.Success).value
        assertEquals(op.operationId, page.items.single().operationId); assertNull(page.items.single().receipt)
        assertEquals("GET", port.requests.last().method); assertNull(port.requests.last().body)
    }
    @Test fun staleExpectedSessionIsRejectedBeforeNetworkDispatch() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val original = f.session.snapshot()!!
        MockWebServer().use { server ->
            server.start(); val executor = AuthenticatedRequestExecutor(ApiClient(server.url("/").toString(), f.clock, allowTestLoopback = true), f.session)
            val changed = SessionSnapshot(original.authEpoch + 1, original.contextEpoch, original.userId, original.accessToken, original.workspace)
            assertEquals(ApiResult.StaleScope, executor.execute(ApiRequest("POST", "/v1/auth/transactions", RequestScope.SELF, "{}", expectedSession = changed)))
            assertEquals(0, server.requestCount)
        }
    }
    @Test fun assuranceCannotLeakToAnotherEndpoint() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val s = f.session.snapshot()!!; val op = f.ops.prepare()
        MockWebServer().use { server ->
            server.start(); val api = ApiClient(server.url("/").toString(), f.clock, allowTestLoopback = true)
            val outcome = runCatching { api.execute(ApiRequest("POST", "/v1/patients", RequestScope.WORKSPACE, "{}", "\"v1\"",
                op.operationId, op.createdAt, assuranceToken = "private-assurance", expectedSession = s), s) }
            assertTrue(outcome.isFailure); assertEquals(0, server.requestCount)
        }
    }
    @Test fun absentOrInvalidIdentityConfigurationFailsClosed() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val port = FakeAuthenticatedRequestExecutor()
        for (env in listOf(null, environment.copy(issuer = "http://identity.example.test"), environment.copy(redirectUri = "https:///callback"))) {
            assertTrue(ProductionAssuranceHandoff.create(env, StepUpBrowser { error("must not launch") }, port, f.session,
                f.backend, f.reads, f.clock, backgroundScope) is ApiResult.Failure)
        }
        assertTrue(ProductionAssuranceHandoff.create(environment, null, port, f.session, f.backend, f.reads, f.clock, backgroundScope) is ApiResult.Failure)
        assertTrue(port.requests.isEmpty())
    }
    @Test fun httpStepUpUsesSelfBearerAndNeverLoginOrAi08() = runTest {
        val f = AssistantFixture(backgroundScope); f.login(); val s = f.session.snapshot()!!
        MockWebServer().use { server ->
            server.start(); val executor = AuthenticatedRequestExecutor(ApiClient(server.url("/").toString(), f.clock, allowTestLoopback = true), f.session)
            val gateway = HttpStepUpGateway(executor); val verifier = Pkce.verifier(); val challenge = Pkce.challenge(verifier)
            val t = transaction(challenge, f); val b = AssuranceBinding("draft.approve", A, B, "\"draft\"", "\"record\"")
            server.enqueue(MockResponse().setResponseCode(201).setBody(envelope(buildJsonObject {
                put("transactionId", t.transactionId); put("state", t.state); put("expiresAt", WireTime.format(t.expiresAt))
                put("authorizationUrl", t.authorizationUrl); put("redirectUri", t.redirectUri)
            })))
            gateway.begin(AuthStartRequest(AuthPurpose.STEP_UP, challenge, b), s)
            val begin = server.takeRequest(); assertNotNull(begin.getHeader("Authorization")); assertNull(begin.getHeader("X-Workspace-ID"))
            assertEquals("STEP_UP", Json.parseToJsonElement(begin.body.readUtf8()).jsonObject.getValue("purpose").jsonPrimitive.content)
            server.enqueue(MockResponse().setBody(envelope(buildJsonObject {
                put("assuranceToken", "server-only"); put("expiresAt", WireTime.format(f.clock.now().plusSeconds(120)))
                putJsonObject("binding") { put("action", b.action); put("workspaceId", A); put("resourceId", B)
                    put("versionToken", b.versionToken); put("targetVersionToken", b.targetVersionToken) }
            })))
            val grant = gateway.exchange(PendingAuthTransaction(t, verifier, challenge), AuthCallback.Success("code", t.state), s)
            assertEquals(b, grant.binding); val exchange = server.takeRequest(); assertEquals("/v1/auth/session", exchange.path)
            assertEquals(setOf("transactionId", "code", "state", "codeVerifier"), Json.parseToJsonElement(exchange.body.readUtf8()).jsonObject.keys)
            assertEquals(2, server.requestCount); assertTrue(sameAssuranceSession(s, f.session.snapshot()!!))
        }
    }
}
