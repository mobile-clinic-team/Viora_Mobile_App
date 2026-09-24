package com.viora.mobile.feature.appointments

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.network.ApiPayload
import com.viora.mobile.core.network.RequestScope
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.appointments.data.HttpPatientSelfAppointmentRepository
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.appointments.ui.*
import com.viora.mobile.testutil.FakeAuthenticatedRequestExecutor
import com.viora.mobile.testutil.USER
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class PatientSelfAppointmentsTest {
    private val session = object : SessionPort {
        override val state = MutableStateFlow(SessionState(phase = SessionPhase.READY,
            user = User(USER, "Patient"), selectedRole = AppRole.PATIENT, serverAuthority = true))
        private val snapshot = SessionSnapshot(1, 1, USER, "token", null)
        override suspend fun snapshot(requireWorkspace: Boolean) = if (requireWorkspace) null else snapshot
        override suspend fun matches(snapshot: SessionSnapshot) = snapshot === this.snapshot
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

    @Test fun repositoryUsesSelfScopeAndMapsMultiClinicPage() = runTest {
        val requests = FakeAuthenticatedRequestExecutor()
        requests.next = ApiResult.Success(ApiPayload("""{"data":[{"id":"11111111-1111-4111-8111-111111111111","clinicName":"Clinic A","doctorName":"Dr A","locationName":"Room 1","startsAt":"2026-10-01T08:00:00.000000Z","endsAt":"2026-10-01T08:30:00.000000Z","status":"PENDING","reason":"Visit"}],"page":{"hasMore":true,"nextCursor":"opaque"}}""", null, null, 200))
        val repository = HttpPatientSelfAppointmentRepository(requests, session)
        val result = repository.list() as ApiResult.Success
        assertEquals("Clinic A", result.value.items.single().clinicName)
        assertEquals("opaque", result.value.nextCursor)
        assertEquals(RequestScope.SELF, requests.requests.single().scope)
        assertEquals("/v1/me/appointments?limit=20", requests.requests.single().path)
        assertNull(requests.requests.single().workspaceId)
        assertFalse(requests.requests.single().path.contains("patientId"))
        assertFalse(requests.requests.single().path.contains("userId"))
        assertFalse(requests.requests.single().path.contains("tenantId"))
        repository.list("opaque")
        assertEquals("/v1/me/appointments?limit=20&cursor=opaque", requests.requests.last().path)
    }

    @Test fun viewModelHandlesEmptyErrorRetryAndPagination() = runTest {
        var attempts = 0
        val appointment = PatientSelfAppointment(USER, "Clinic B", "Dr B", "Room 2",
            Instant.parse("2026-10-01T08:00:00Z"), Instant.parse("2026-10-01T08:30:00Z"), "PENDING", "Visit")
        val repository = object : PatientSelfAppointmentRepository {
            override suspend fun list(cursor: String?): ApiResult<PatientSelfAppointmentPage> {
                attempts++
                return when (attempts) {
                    1 -> ApiResult.Success(PatientSelfAppointmentPage(emptyList(), null))
                    2 -> ApiResult.Failure("TRANSPORT_ERROR")
                    3 -> ApiResult.Success(PatientSelfAppointmentPage(listOf(appointment), "next"))
                    else -> ApiResult.Success(PatientSelfAppointmentPage(listOf(appointment.copy(id = "22222222-2222-4222-8222-222222222222")), null))
                }
            }
        }
        val model = PatientSelfAppointmentsViewModel(repository, this)
        model.load(); runCurrent()
        assertTrue((model.state.value as PatientSelfAppointmentsState.Loaded).items.isEmpty())
        model.load(); runCurrent()
        assertEquals("TRANSPORT_ERROR", (model.state.value as PatientSelfAppointmentsState.Error).code)
        model.retry(); runCurrent()
        assertEquals(1, (model.state.value as PatientSelfAppointmentsState.Loaded).items.size)
        model.loadMore(); runCurrent()
        assertEquals(2, (model.state.value as PatientSelfAppointmentsState.Loaded).items.size)
    }
}
