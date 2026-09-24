package com.viora.mobile.feature.appointments

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.network.*
import com.viora.mobile.core.operations.*
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.appointments.data.HttpPatientBookingRepository
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.appointments.ui.*
import com.viora.mobile.testutil.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import okhttp3.mockwebserver.*
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class PatientBookingTest {
    private val session = object : SessionPort {
        override val state = MutableStateFlow(SessionState(phase = SessionPhase.READY,
            user = User(USER, "Patient"), selectedRole = AppRole.PATIENT, serverAuthority = true))
        val current = SessionSnapshot(1, 1, USER, "token", null)
        var valid = true
        override suspend fun snapshot(requireWorkspace: Boolean) = if (requireWorkspace) null else current
        override suspend fun matches(snapshot: SessionSnapshot) = valid && snapshot === current
        override suspend fun <T> withCurrent(snapshot: SessionSnapshot, block: suspend () -> T) = block()
        override suspend fun restore() {}
        override suspend fun signIn() {}
        override suspend fun acceptTokenBundle(bundle: TokenBundle) {}
        override suspend fun refresh(rejectedAccessToken: String?) = null
        override suspend fun selectWorkspace(id: String) {}
        override suspend fun chooseWorkspace() {}
        override suspend fun invalidateContext() {}
        override suspend fun logout() {}
    }
    private val option = PatientBookingOption(A, B, "Dr A", "Main", "Clinic A", Instant.parse("2026-10-01T08:00:00Z"))
    private val receipt = OperationReceipt(SESSION, USER, null, "2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z", "SELF")
    private val write = AppointmentWrite(SESSION, A, "\"1\"", null, Instant.parse(receipt.createdAt), Instant.parse(receipt.expiresAt))
    private val response = """{"data":{"operationId":"$SESSION","state":"SUCCEEDED","primary":{"type":"APPOINTMENT","id":"$A","parentId":null,"versionToken":"\"1\""},"related":[],"handoff":null,"committedAt":"${receipt.createdAt}","expiresAt":"${receipt.expiresAt}"}}"""
    private val optionsJson = """{"data":[{"doctorId":"$A","locationId":"$B","doctorName":"Dr A","locationName":"Main","clinicName":"Clinic A","startsAt":"2026-10-01T08:00:00.000000Z"}],"durationMinutes":30}"""

    @Test fun bookingSerializesOnlyEditableIntentAndReusesOperationHeaders() = runTest {
        val requests = FakeAuthenticatedRequestExecutor().apply { next = ApiResult.Success(ApiPayload(response, "\"1\"", null, 201)) }
        val result = HttpPatientBookingRepository(requests, session).create(PatientBookingIntent(option, "Visit"), receipt)
        assertEquals(write, (result as ApiResult.Success).value)
        val sent = requests.requests.single()
        assertEquals(setOf("doctorId", "locationId", "startsAt", "reason"), Json.parseToJsonElement(sent.body!!).jsonObject.keys)
        for (field in listOf("patientId", "userId", "tenantId", "status", "role", "persona", "endsAt")) assertFalse(sent.body.contains(field))
        assertEquals(RequestScope.SELF, sent.scope); assertNull(sent.workspaceId)
        assertEquals(SESSION, sent.operationId); assertEquals(receipt.createdAt, sent.operationCreatedAt)
        assertEquals(session.current, sent.expectedSession)
    }

    @Test fun optionsUseServerThirtyMinuteSlotsAndRejectDifferentDuration() = runTest {
        val requests = FakeAuthenticatedRequestExecutor().apply { next = ApiResult.Success(ApiPayload(optionsJson, null, null, 200)) }
        val repo = HttpPatientBookingRepository(requests, session)
        val slots = (repo.options() as ApiResult.Success).value
        assertEquals(option, slots.single()); assertEquals(option.startsAt.plusSeconds(1800), slots.single().endsAt)
        requests.next = ApiResult.Success(ApiPayload(optionsJson.replace(":30}", ":60}"), null, null, 200))
        assertTrue(repo.options() is ApiResult.Failure)
    }

    @Test fun conflictTransportAndUnknownAreNotMappedToSuccess() = runTest {
        val requests = FakeAuthenticatedRequestExecutor()
        val repo = HttpPatientBookingRepository(requests, session)
        for (error in listOf(ApiResult.Failure("CONFLICT", 409), ApiResult.Failure("TRANSPORT_ERROR"), ApiResult.OutcomeUnknown)) {
            requests.next = error
            assertEquals(error, repo.create(PatientBookingIntent(option, "Visit"), receipt))
        }
        requests.next = ApiResult.Success(ApiPayload(response.replace("SUCCEEDED", "PROCESSING"), "\"1\"", null, 201))
        assertEquals(ApiResult.OutcomeUnknown, repo.create(PatientBookingIntent(option, "Visit"), receipt))
    }

    @Test fun recoveryRequiresMatchingReceiptResourceVersionAndOwner() = runTest {
        val requests = FakeAuthenticatedRequestExecutor().apply { next = ApiResult.Success(ApiPayload(response, "\"1\"", null, 200)) }
        val repo = HttpPatientBookingRepository(requests, session)
        assertEquals(write, (repo.recover(receipt) as ApiResult.Success).value)
        assertEquals("GET", requests.requests.single().method)
        assertEquals("/v1/me/appointment-operations/$SESSION", requests.requests.single().path)
        requests.next = ApiResult.Success(ApiPayload(response, "\"2\"", null, 200))
        assertTrue(repo.recover(receipt) is ApiResult.Failure)
        assertTrue(repo.recover(receipt.copy(ownerUserId = B)) is ApiResult.Failure)
        assertEquals(2, requests.requests.size)
    }

    @Test fun patientRouteGuardRejectsStaffAndStaleSession() = runTest {
        val requests = FakeAuthenticatedRequestExecutor()
        val repo = HttpPatientBookingRepository(requests, session)
        session.state.value = session.state.value.copy(selectedRole = AppRole.DOCTOR)
        assertEquals("FORBIDDEN", (repo.options() as ApiResult.Failure).code)
        assertEquals("FORBIDDEN", (repo.create(PatientBookingIntent(option, "Visit"), receipt) as ApiResult.Failure).code)
        assertTrue(requests.requests.isEmpty())
        session.state.value = session.state.value.copy(selectedRole = AppRole.PATIENT); session.valid = false
        assertEquals(ApiResult.StaleScope, repo.create(PatientBookingIntent(option, "Visit"), receipt))
        assertTrue(requests.requests.isEmpty())
    }

    private class BookingStub(val option: PatientBookingOption, var result: ApiResult<AppointmentWrite>) : PatientBookingRepository {
        var creates = 0; var reads = 0; var recovering = 0
        override suspend fun options(): ApiResult<List<PatientBookingOption>> { reads++; return ApiResult.Success(listOf(option)) }
        override suspend fun create(intent: PatientBookingIntent, operation: OperationReceipt): ApiResult<AppointmentWrite> { creates++; return result }
        override suspend fun recover(operation: OperationReceipt): ApiResult<AppointmentWrite> { recovering++; return result }
    }
    private fun coordinator(store: FakeSecureStore) = OperationCoordinator(session, store, FakeClock(), selfScope = true)

    @Test fun successRefreshesServerListWithPendingAndClearsReceipt() = runTest {
        val store = FakeSecureStore(); val repo = BookingStub(option, ApiResult.Success(write))
        var listReads = 0
        val list = PatientSelfAppointmentsViewModel(object : PatientSelfAppointmentRepository {
            override suspend fun list(cursor: String?): ApiResult<PatientSelfAppointmentPage> {
                listReads++
                return ApiResult.Success(PatientSelfAppointmentPage(listOf(PatientSelfAppointment(A, option.clinicName,
                    option.doctorName, option.locationName, option.startsAt, option.endsAt, "PENDING", "Visit")), null))
            }
        }, this)
        val model = PatientBookingViewModel(repo, coordinator(store), this, list::load)
        model.load(); runCurrent(); model.submit(option, "Visit"); model.submit(option, "Visit"); runCurrent()
        assertEquals(1, repo.creates); assertEquals(1, listReads); assertTrue(store.receipts.isEmpty())
        assertEquals("PENDING", (list.state.value as PatientSelfAppointmentsState.Loaded).items.single().status)
    }

    @Test fun unknownSurvivesNewModelAndOnlyRecoveryCanResolveIt() = runTest {
        val store = FakeSecureStore(); val repo = BookingStub(option, ApiResult.OutcomeUnknown)
        var refreshed = 0
        val first = PatientBookingViewModel(repo, coordinator(store), this) { refreshed++ }
        first.load(); runCurrent(); first.submit(option, "Visit"); runCurrent()
        assertEquals("UNKNOWN_OUTCOME", first.state.value.message); assertEquals(1, store.receipts.size)
        first.submit(option, "Visit"); runCurrent(); assertEquals(1, repo.creates); assertEquals(0, refreshed)
        val restored = PatientBookingViewModel(repo, coordinator(store), this) { refreshed++ }
        restored.load(); runCurrent(); assertEquals(store.receipts, restored.state.value.outstanding)
        repo.result = ApiResult.Failure("NOT_FOUND", 404)
        restored.recover(store.receipts.single()); runCurrent(); assertEquals(1, store.receipts.size)
        repo.result = ApiResult.Success(write)
        restored.recover(store.receipts.single()); runCurrent()
        assertTrue(store.receipts.isEmpty()); assertEquals(1, repo.creates); assertEquals(1, refreshed)
    }

    @Test fun conflictAndValidationAllowExplicitRetryWithFreshOperation() = runTest {
        val store = FakeSecureStore(); val repo = BookingStub(option, ApiResult.Failure("CONFLICT", 409))
        val model = PatientBookingViewModel(repo, coordinator(store), this) {}
        model.load(); runCurrent(); model.submit(null, ""); runCurrent(); assertEquals(0, repo.creates)
        model.submit(option, "Visit"); runCurrent(); assertEquals("CONFLICT", model.state.value.message)
        assertTrue(store.receipts.isEmpty()); model.load(); runCurrent(); assertEquals(2, repo.reads)
        model.submit(option, "Visit"); runCurrent(); assertEquals(2, repo.creates)
    }

    @Test fun receiptStorageFailurePreventsDispatchAndSelfReceiptsAreOwnerScoped() = runTest {
        val store = FakeSecureStore().apply { rejectWrites = true }
        val repo = BookingStub(option, ApiResult.Success(write))
        val model = PatientBookingViewModel(repo, coordinator(store), this) {}
        model.load(); runCurrent(); model.submit(option, "Visit"); runCurrent(); assertEquals(0, repo.creates)
        store.rejectWrites = false
        store.receipts = listOf(receipt, receipt.copy(ownerUserId = B), receipt.copy(workspaceId = A, scope = "WORKSPACE"))
        assertEquals(listOf(receipt), coordinator(store).outstanding())
    }

    @Test fun realHttpUsesBearerWithoutAuthorityHeadersAndNeverFallsBack() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(201).setHeader("ETag", "\"1\"").setBody(response))
            val client = ApiClient(server.url("/").toString(), FakeClock(), allowTestLoopback = true)
            val repo = HttpPatientBookingRepository(AuthenticatedRequestExecutor(client, session), session)
            assertTrue(repo.create(PatientBookingIntent(option, "Visit"), receipt) is ApiResult.Success)
            val sent = server.takeRequest()
            assertEquals("Bearer token", sent.getHeader("Authorization")); assertEquals(SESSION, sent.getHeader("Idempotency-Key"))
            assertNull(sent.getHeader("X-Workspace-ID")); assertNull(sent.getHeader("X-Patient-ID"))
            server.enqueue(MockResponse().setResponseCode(503))
            assertEquals(ApiResult.OutcomeUnknown, repo.create(PatientBookingIntent(option, "Visit"), receipt))
            assertEquals(2, server.requestCount)
        }
    }
}
