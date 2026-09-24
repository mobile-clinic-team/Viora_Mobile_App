package com.viora.mobile.feature.assistant

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.network.*
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.assistant.data.HttpAssistantRepository
import com.viora.mobile.feature.clinical.domain.ClinicalContent
import com.viora.mobile.testutil.*
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class HttpAssistantRepositoryTest {
    private val version = "\"9007199254740993\""
    private val operation = OperationReceipt(SESSION, USER, A, "2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z")
    private fun draftJson(status: String = "REVIEWING") = buildJsonObject {
        put("id", B); put("patientId", USER); put("encounterId", A); put("targetRecordId", SESSION)
        put("targetVersionToken", "\"9007199254740995\""); put("versionToken", version); put("status", status)
        put("createdBy", USER); put("reviewedBy", USER); put("approvedBy", JsonNull); put("rejectedBy", JsonNull)
        put("createdAt", operation.createdAt); put("updatedAt", operation.createdAt); put("expiresAt", operation.expiresAt)
        putJsonObject("content") { for (key in listOf("diagnosis", "symptoms", "clinicalNotes", "treatmentPlan")) put(key, "Reviewed content") }
        putJsonArray("provenance") { add(buildJsonObject {
            put("id", A); put("kind", "RECORD_VERSION"); put("sourceId", SESSION); put("sourceVersion", "\"9007199254740995\"")
            put("label", "Clinical record version"); put("excerpt", JsonNull)
        }) }
    }
    private fun receiptJson() = buildJsonObject {
        put("operationId", operation.operationId); put("state", "SUCCEEDED")
        putJsonObject("primary") { put("type", "AI_DRAFT"); put("id", B); put("parentId", JsonNull); put("versionToken", "\"9007199254740994\"") }
        put("related", JsonArray(emptyList())); put("handoff", JsonNull)
        put("committedAt", operation.createdAt); put("expiresAt", operation.expiresAt)
    }
    private fun payload(value: JsonObject, etag: String? = version) = ApiResult.Success(ApiPayload(buildJsonObject { put("data", value) }.toString(), etag, null, 200))
    private suspend fun TestScope.session(): SessionCoordinator {
        val clock = FakeClock(); val backend = TestBackend(clock)
        backend.workspaceAction = { backend.context(it).copy(permissions = WorkspaceContext.CLINICAL_PERMISSIONS) }
        return SessionCoordinator(backend, backend, FakeSecureStore(), clock, backgroundScope).also { it.startDemo() }
    }
    @Test fun draftReadsExactBigintVersionAndMapsCanonicalReviewState() = runTest {
        val port = FakeAuthenticatedRequestExecutor().apply { next = payload(draftJson()) }
        val session = session(); val repo = HttpAssistantRepository(port, session)
        val draft = (repo.draft(B) as ApiResult.Success).value
        assertEquals(version, draft.versionToken); assertEquals("IN_REVIEW", draft.status)
        assertEquals(A, draft.workspaceId); assertEquals(session.snapshot(), port.requests.single().expectedSession)
        port.next = payload(draftJson(), "\"1\""); assertTrue(repo.draft(B) is ApiResult.Failure)
    }
    @Test fun reviewRejectAndEditSerializeOnlyHumanIntentWithExactPreconditions() = runTest {
        val port = FakeAuthenticatedRequestExecutor().apply { next = payload(draftJson()) }
        val repo = HttpAssistantRepository(port, session()); val draft = (repo.draft(B) as ApiResult.Success).value
        port.requests.clear(); port.next = payload(receiptJson(), "\"9007199254740994\"")
        assertTrue(repo.review(draft, operation) is ApiResult.Success)
        assertTrue(repo.reject(draft, null, operation) is ApiResult.Success)
        assertTrue(repo.edit(draft, ClinicalContent("D", "S", "N", "P"), operation) is ApiResult.Success)
        assertEquals(listOf("POST", "POST", "PATCH"), port.requests.map { it.method })
        assertEquals(listOf(emptySet<String>(), setOf("reason"), setOf("content")), port.requests.map { Json.parseToJsonElement(it.body!!).jsonObject.keys })
        for (sent in port.requests) {
            assertEquals(version, sent.ifMatch); assertEquals(operation.operationId, sent.operationId)
            assertEquals(operation.createdAt, sent.operationCreatedAt)
            assertFalse(sent.body!!.contains("actor")); assertFalse(sent.body.contains("tenant"))
        }
    }
    @Test fun conflictDenialAndUnknownNeverBecomeSuccessOrRetry() = runTest {
        val port = FakeAuthenticatedRequestExecutor().apply { next = payload(draftJson()) }
        val repo = HttpAssistantRepository(port, session()); val draft = (repo.draft(B) as ApiResult.Success).value
        for (result in listOf(ApiResult.Failure("VERSION_CONFLICT",412), ApiResult.Failure("FORBIDDEN",403), ApiResult.Failure("TRANSPORT_ERROR"), ApiResult.OutcomeUnknown)) {
            port.requests.clear(); port.next = result
            assertEquals(result, repo.review(draft,operation)); assertEquals(1,port.requests.size)
        }
        port.next = payload(receiptJson(), "\"wrong\"")
        assertEquals(ApiResult.OutcomeUnknown, repo.review(draft,operation))
    }
    @Test fun operationRecoveryUsesOriginalIdentityWithoutResubmission() = runTest {
        val port = FakeAuthenticatedRequestExecutor(); val repo = HttpAssistantRepository(port,session())
        port.next = payload(buildJsonObject { put("operationId",SESSION); put("state","SUCCEEDED"); put("result",receiptJson()) })
        val outcome = (repo.outcome(operation) as ApiResult.Success).value
        assertEquals(B, outcome.receipt!!.resourceId)
        assertEquals("GET",port.requests.single().method); assertNull(port.requests.single().body)
        assertEquals("/v1/operations/$SESSION",port.requests.single().path)
        assertEquals(ApiResult.StaleScope, repo.outcome(operation.copy(ownerUserId=B)))
        assertEquals(1,port.requests.size)
    }
    @Test fun logoutRejectsReadAndCommandsWithoutTransport() = runTest {
        val port = FakeAuthenticatedRequestExecutor(); val session = session(); val repo = HttpAssistantRepository(port,session)
        session.logout(); assertEquals(ApiResult.StaleScope,repo.draft(B)); assertTrue(port.requests.isEmpty())
    }
}
