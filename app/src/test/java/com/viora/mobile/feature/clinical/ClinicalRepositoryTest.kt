package com.viora.mobile.feature.clinical

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.network.*
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.clinical.data.clinicalReadRepository
import com.viora.mobile.feature.clinical.data.SyntheticClinicalData as Data
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ClinicalRepositoryTest {
    private fun payload(json: String, etag: String? = "\"clinical-demo-record-7\"") = ApiResult.Success(ApiPayload(json, etag, null, 200))
    @Test fun exactRecordReadPreservesContentVersionAndUsesOnlyWorkspaceGet() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        f.requests.next = payload(f.json("record"))
        val repository = clinicalReadRepository(f.requests, f.session, StandardTestDispatcher(testScheduler))
        val record = (repository.record(Data.RECORD) as ApiResult.Success).value
        assertEquals("7", record.currentVersion); assertEquals("7", record.current.version)
        assertEquals("\"clinical-demo-record-7\"", record.reference().versionToken)
        assertEquals("Synthetic note\nSecond line", record.current.content.clinicalNotes)
        assertEquals("", record.current.content.treatmentPlan)
        assertNull(record.reviewedVersion)
        val request = f.requests.requests.single()
        assertEquals("GET", request.method); assertEquals("/v1/records/" + Data.RECORD, request.path)
        assertEquals(RequestScope.WORKSPACE, request.scope); assertEquals(Data.WORKSPACE_A, request.workspaceId)
        assertNull(request.body); assertNull(request.operationId); assertNull(request.ifMatch)
    }
    @Test fun mutableReadsRejectMissingWeakOrMismatchedValidators() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val repository = clinicalReadRepository(f.requests, f.session, StandardTestDispatcher(testScheduler))
        for (etag in listOf(null, "W/\"clinical-demo-record-7\"", "\"other\"")) {
            f.requests.next = payload(f.json("record"), etag)
            assertEquals("INVALID_RESPONSE", (repository.record(Data.RECORD) as ApiResult.Failure).code)
        }
    }
    @Test fun malformedOrOverbroadKnownRecordFieldsFailClosed() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val repository = clinicalReadRepository(f.requests, f.session, StandardTestDispatcher(testScheduler))
        val root = Json.parseToJsonElement(f.json("record")).jsonObject["data"]!!.jsonObject
        val wrong = listOf(
            JsonObject(root - "reviewedVersion"),
            JsonObject(root + ("workspaceId" to JsonPrimitive(Data.WORKSPACE_B))),
            JsonObject(root + ("currentVersion" to JsonPrimitive("8"))),
            JsonObject(root + ("currentVersion" to JsonPrimitive("07"))),
            JsonObject(root + ("currentVersion" to JsonPrimitive("9223372036854775808"))),
            JsonObject(root + ("reviewedVersion" to JsonPrimitive("9"))),
            JsonObject(root + ("access" to Json.parseToJsonElement("{\"allowedActions\":[\"record.read\",\"record.read\"]}"))),
            JsonObject(root + ("createdAt" to JsonPrimitive("2026-09-09T00:00:00+01:00"))),
            JsonObject(root + ("current" to JsonObject(root["current"]!!.jsonObject + ("recordId" to JsonPrimitive(Data.RECORD_B))))),
            JsonObject(root + ("current" to JsonObject(root["current"]!!.jsonObject + ("content" to JsonObject(
                root["current"]!!.jsonObject["content"]!!.jsonObject + ("diagnosis" to JsonPrimitive("x".repeat(16001)))))))),
        )
        for (data in wrong) {
            f.requests.next = payload(JsonObject(mapOf("data" to data)).toString())
            assertEquals("INVALID_RESPONSE", (repository.record(Data.RECORD) as ApiResult.Failure).code)
        }
    }
    @Test fun unknownResponseFieldsAreIgnoredAndUnknownStateDoesNotEnableActions() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        f.requests.next = payload(f.json("record").replace("\"status\":\"DRAFT\"", "\"status\":\"FUTURE\",\"futureProperty\":true"))
        val repository = clinicalReadRepository(f.requests, f.session, StandardTestDispatcher(testScheduler))
        assertFalse((repository.record(Data.RECORD) as ApiResult.Success).value.supported)
    }
    @Test fun encounterNullableLinksAndEmptyHistoryAreDistinctFromNotFound() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val repository = clinicalReadRepository(f.requests, f.session, StandardTestDispatcher(testScheduler))
        f.requests.next = payload(f.json("encounter").replace("\"recordId\":\"" + Data.RECORD + "\"", "\"recordId\":null"), "\"clinical-demo-enc-1\"")
        assertNull((repository.encounter(Data.ENCOUNTER) as ApiResult.Success).value.recordId)
        f.requests.next = payload("{\"data\":[],\"page\":{\"nextCursor\":null,\"hasMore\":false}}", null)
        assertTrue((repository.encounters(PatientReference(Data.PATIENT_A, Data.WORKSPACE_A)) as ApiResult.Success).value.items.isEmpty())
        f.requests.next = ApiResult.Failure("RESOURCE_NOT_FOUND", 404)
        assertEquals(404, (repository.record(Data.RECORD) as ApiResult.Failure).status)
    }
    @Test fun historyValidatesPageRelationshipAndUsesBoundedPublicQuery() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val repository = clinicalReadRepository(f.requests, f.session, StandardTestDispatcher(testScheduler))
        val encounter = Json.parseToJsonElement(f.json("encounter")).jsonObject["data"]!!
        f.requests.next = payload("{\"data\":[" + encounter + "],\"page\":{\"nextCursor\":null,\"hasMore\":false}}", null)
        assertEquals(1, (repository.encounters(PatientReference(Data.PATIENT_A, Data.WORKSPACE_A), PageRequest(10, "opaque+cursor")) as ApiResult.Success).value.items.size)
        assertEquals("/v1/patients/" + Data.PATIENT_A + "/encounters?limit=10&cursor=opaque%2Bcursor", f.requests.requests.last().path)
        f.requests.next = payload("{\"data\":[" + encounter + "],\"page\":{\"nextCursor\":null,\"hasMore\":true}}", null)
        assertTrue(repository.encounters(PatientReference(Data.PATIENT_A, Data.WORKSPACE_A)) is ApiResult.Failure)
    }
    @Test fun failuresRemainTypedAndRetryIsAnExplicitNewRead() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val repository = clinicalReadRepository(f.requests, f.session, StandardTestDispatcher(testScheduler))
        for (failure in listOf(ApiResult.Failure("FORBIDDEN", 403), ApiResult.Failure("TRANSPORT_ERROR"),
            ApiResult.Failure("VERSION_CONFLICT", 412), ApiResult.Failure("AUDIT_UNAVAILABLE", 503))) {
            f.requests.next = failure; assertSame(failure, repository.record(Data.RECORD))
        }
        f.requests.next = payload(f.json("record")); assertTrue(repository.record(Data.RECORD) is ApiResult.Success)
        assertEquals(5, f.requests.requests.size)
    }
    @Test fun deniedSessionWorkspaceAndMalformedIdNeverDispatch() = runTest {
        val f = ClinicalFixture(backgroundScope)
        val repository = clinicalReadRepository(f.requests, f.session, StandardTestDispatcher(testScheduler))
        assertEquals(401, (repository.record(Data.RECORD) as ApiResult.Failure).status)
        f.login()
        assertEquals(ApiResult.StaleScope, repository.encounters(PatientReference(Data.PATIENT_B, Data.WORKSPACE_B)))
        assertEquals(400, (repository.record("missing") as ApiResult.Failure).status)
        f.session.selectWorkspace(Data.WORKSPACE_B)
        assertEquals(403, (repository.record(Data.RECORD_B) as ApiResult.Failure).status)
        assertTrue(f.requests.requests.isEmpty())
    }
    @Test fun delayedHttpResponseCannotCrossWorkspaceEpoch() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val gate = CompletableDeferred<Unit>()
        val requests = object : AuthenticatedRequestPort {
            override suspend fun execute(request: ApiRequest): ApiResult<ApiPayload> { gate.await(); return payload(f.json("record")) }
        }
        val repository = clinicalReadRepository(requests, f.session, StandardTestDispatcher(testScheduler))
        val pending = async { repository.record(Data.RECORD) }; runCurrent()
        f.session.selectWorkspace(Data.WORKSPACE_B); gate.complete(Unit)
        assertEquals(ApiResult.StaleScope, pending.await())
    }
    @Test fun syntheticReadsRespectPermissionScopeMissingRecordsAndManualRetry() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        assertEquals("7", (f.repository.record(Data.RECORD) as ApiResult.Success).value.currentVersion)
        assertNull((f.repository.encounter(Data.EMPTY_ENCOUNTER) as ApiResult.Success).value.recordId)
        assertEquals(404, (f.repository.record(Data.RECORD_B) as ApiResult.Failure).status)
        f.repository.nextFailure = ApiResult.Failure("TRANSPORT_ERROR")
        assertTrue(f.repository.record(Data.RECORD) is ApiResult.Failure)
        assertTrue(f.repository.record(Data.RECORD) is ApiResult.Success)
        f.session.selectWorkspace(Data.WORKSPACE_B)
        assertEquals(403, (f.repository.record(Data.RECORD_B) as ApiResult.Failure).status)
        f.session.logout(); assertEquals(401, (f.repository.record(Data.RECORD) as ApiResult.Failure).status)
    }
}
