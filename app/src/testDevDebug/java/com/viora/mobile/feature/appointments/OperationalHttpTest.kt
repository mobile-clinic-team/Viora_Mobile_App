package com.viora.mobile.feature.appointments

import com.viora.mobile.core.model.*
import com.viora.mobile.core.network.*
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.appointments.data.appointmentRepository
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.doctors.data.doctorDirectory
import com.viora.mobile.feature.doctors.domain.DoctorQuery
import com.viora.mobile.feature.patients.data.patientDirectory
import com.viora.mobile.feature.patients.domain.*
import com.viora.mobile.testutil.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class OperationalHttpTest {
    private val f = OperationalFixture()
    private lateinit var dispatcher: CoroutineDispatcher
    private fun patientDirectory(requests: AuthenticatedRequestPort, session: SessionPort) = com.viora.mobile.feature.patients.data.patientDirectory(requests, session, dispatcher)
    private fun doctorDirectory(requests: AuthenticatedRequestPort, session: SessionPort) = com.viora.mobile.feature.doctors.data.doctorDirectory(requests, session, dispatcher)
    private fun appointmentRepository(requests: AuthenticatedRequestPort, session: SessionPort, capability: SchedulingCapability = SchedulingCapability.Unavailable) =
        com.viora.mobile.feature.appointments.data.appointmentRepository(requests, session, capability, dispatcher)
    private fun fixture(path: String) = requireNotNull(javaClass.classLoader!!.getResource("fixtures/$path")).readText()
    private suspend fun session(scope: CoroutineScope, fields: Set<String> = emptySet()): SessionCoordinator {
        dispatcher = scope.coroutineContext[kotlin.coroutines.ContinuationInterceptor] as CoroutineDispatcher
        val backend = TestBackend(f.clock)
        backend.workspaceAction = { f.context.copy(patientReadableFields = fields) }
        return SessionCoordinator(backend, backend, FakeSecureStore(), f.clock, scope).also { it.startDemo() }
    }
    private fun transport(body: String, etag: String? = null) = FakeAuthenticatedRequestExecutor().apply {
        next = ApiResult.Success(ApiPayload(body, etag, A, 200, B))
    }
    @Test fun patientOmissionNullProjectionAndDateOnlyRemainDistinct() = runTest {
        val session = session(backgroundScope, setOf("dateOfBirth", "phone"))
        val http = transport(fixture("patients/patient.json"), "\"patient-1\"")
        val value = (patientDirectory(http, session).patient(f.patientId) as ApiResult.Success).value
        assertEquals(PatientField.Withheld, value.sex)
        assertNull((value.phone as PatientField.Disclosed).value)
        assertEquals(LocalDate.parse("1990-01-01"), (value.dateOfBirth as PatientField.Disclosed).value)
        assertEquals(RequestScope.WORKSPACE, http.requests.single().scope)
        assertEquals(A, http.requests.single().workspaceId)
        http.next = ApiResult.Success(ApiPayload(fixture("patients/patient.json").replace(",\"phone\":null", ""), "\"patient-1\"", A, 200))
        assertEquals("INVALID_RESPONSE", (patientDirectory(http, session).patient(f.patientId) as ApiResult.Failure).code)
    }
    @Test fun patientMandatoryFieldsWrongWorkspaceAndEtagsFailClosed() = runTest {
        val session = session(backgroundScope)
        val original = fixture("patients/patient.json")
        for (bad in listOf(original.replace("\"fullName\":\"Synthetic Patient\",", ""), original.replace(A, B), original.replace("patient-1", "patient-2"))) {
            val http = transport(bad, "\"patient-1\"")
            assertTrue(patientDirectory(http, session).patient(f.patientId) is ApiResult.Failure)
        }
    }
    @Test fun searchEncodesQueryAndMalformedPagesReject() = runTest {
        val session = session(backgroundScope); val http = transport("""{"data":[],"page":{"nextCursor":null,"hasMore":true}}""")
        val repo = patientDirectory(http, session)
        assertEquals("INVALID_RESPONSE", (repo.search(PatientSearch("A & B")) as ApiResult.Failure).code)
        assertTrue(http.requests.single().path.contains("q=A+%26+B"))
        http.next = ApiResult.Success(ApiPayload("""{"data":[],"page":{"nextCursor":null,"hasMore":false}}""", null, A, 200))
        assertTrue((repo.search(PatientSearch("aa")) as ApiResult.Success).value.items.isEmpty())
    }
    @Test fun doctorRequiresExplicitNullableKeysAndUnknownStatusIsReadOnly() = runTest {
        val session = session(backgroundScope); val raw = fixture("doctors/doctor.json")
        val http = transport(raw.replace("ACTIVE", "FUTURE_STATUS"))
        assertFalse((doctorDirectory(http, session).doctor(f.doctorId) as ApiResult.Success).value.supported)
        http.next = ApiResult.Success(ApiPayload(raw.replace("\"bio\":null,", ""), null, A, 200))
        assertTrue(doctorDirectory(http, session).doctor(f.doctorId) is ApiResult.Failure)
    }
    @Test fun unsupportedFiltersAndWrongResourceIdsNeverReachTransport() = runTest {
        val session = session(backgroundScope); val http = transport("{}")
        assertThrows(IllegalArgumentException::class.java) { DoctorQuery(status = "invented") }
        assertEquals(400, (doctorDirectory(http, session).doctor("bad") as ApiResult.Failure).status)
        assertEquals(400, (patientDirectory(http, session).patient("bad") as ApiResult.Failure).status)
        assertTrue(http.requests.isEmpty())
    }
    @Test fun appointmentReadValidatesCurrentTokenAndPreservesUnknownStateWithoutActions() = runTest {
        val session = session(backgroundScope); val raw = fixture("appointments/appointment.json")
        val http = transport(raw.replace("PENDING", "FUTURE_STATUS"), "\"appointment-1\"")
        assertNull((appointmentRepository(http, session).appointment(f.appointmentId) as ApiResult.Success).value.knownStatus)
        http.next = ApiResult.Success(ApiPayload(raw, "\"other\"", A, 200))
        assertTrue(appointmentRepository(http, session).appointment(f.appointmentId) is ApiResult.Failure)
    }
    @Test fun unresolvedPolicyDoesNotSendWritesOrAvailability() = runTest {
        val session = session(backgroundScope); val http = transport("{}")
        val repo = appointmentRepository(http, session)
        assertEquals("FEATURE_UNAVAILABLE", (repo.create(f.creation(), f.operation()) as ApiResult.Failure).code)
        assertEquals("FEATURE_UNAVAILABLE", (repo.availability(f.doctorId, f.locationId, f.clock.now(), f.clock.now().plusSeconds(3600)) as ApiResult.Failure).code)
        assertTrue(http.requests.isEmpty())
    }
    @Test fun creationUsesExactAllowlistMetadataAndMalformedReceiptIsUnknown() = runTest {
        val session = session(backgroundScope); val http = transport("{\"data\":{}}")
        val repo = appointmentRepository(http, session, SchedulingCapability(true, emptySet()))
        val operation = f.operation()
        assertEquals(ApiResult.OutcomeUnknown, repo.create(f.creation(), operation))
        val request = http.requests.single()
        val body = Json.parseToJsonElement(requireNotNull(request.body)).jsonObject
        assertEquals(setOf("patientId", "doctorId", "locationId", "startsAt", "endsAt", "reason", "notes"), body.keys)
        assertEquals(operation.operationId, request.operationId); assertEquals(operation.createdAt, request.operationCreatedAt)
        assertNull(request.ifMatch); assertFalse(body.containsKey("status"))
    }
    @Test fun rescheduleCarriesExactVersionAndConflictIsNotRetried() = runTest {
        val session = session(backgroundScope); val http = FakeAuthenticatedRequestExecutor().apply { next = ApiResult.Failure("VERSION_CONFLICT", 412) }
        val repo = appointmentRepository(http, session, SchedulingCapability(true, emptySet()))
        val input = AppointmentReschedule(f.doctorId, f.locationId, f.creation().startsAt, f.creation().endsAt)
        assertEquals(412, (repo.reschedule(f.appointment().reference(), input, f.operation()) as ApiResult.Failure).status)
        assertEquals(1, http.requests.size); assertEquals("\"appointment-1\"", http.requests.single().ifMatch)
        assertFalse(Json.parseToJsonElement(http.requests.single().body!!).jsonObject.containsKey("patientId"))
    }
    @Test fun missingGrantsCauseNoHttpAndCrossWorkspaceResponseIsDiscarded() = runTest {
        val session = session(backgroundScope); val http = transport(fixture("appointments/appointment.json"), "\"appointment-1\"")
        f.context = f.context.copy(permissions = emptySet()); session.selectWorkspace(A)
        assertEquals(403, (appointmentRepository(http, session).appointment(f.appointmentId) as ApiResult.Failure).status)
        assertTrue(http.requests.isEmpty())
    }
}
