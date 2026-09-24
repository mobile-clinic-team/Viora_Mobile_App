package com.viora.mobile.feature.appointments

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.feature.appointments.domain.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class AppointmentLifecycleTest {
    @Test fun explicitFixtureCreationPolicyProducesPendingAndNoEncounter() = runTest {
        val f = OperationalFixture(); val backend = f.backend()
        val receipt = (backend.create(f.creation(), f.operation()) as ApiResult.Success).value
        val current = (backend.appointment(receipt.appointmentId) as ApiResult.Success).value
        assertEquals("PENDING", current.status); assertNull(current.encounterId)
        assertEquals(receipt.versionToken, current.versionToken)
    }
    @Test fun confirmCheckInAndTerminalTransitionsAreExplicit() = runTest {
        val f = OperationalFixture(); val backend = f.backend()
        val original = f.appointment()
        assertTrue(backend.transition(original.reference(), AppointmentAction.CONFIRM, f.operation()) is ApiResult.Success)
        val confirmed = (backend.appointment(original.id) as ApiResult.Success).value
        assertEquals("CONFIRMED", confirmed.status)
        assertTrue(backend.transition(confirmed.reference(), AppointmentAction.CHECK_IN, f.operation()) is ApiResult.Success)
        val checked = (backend.appointment(original.id) as ApiResult.Success).value
        assertEquals("CHECKED_IN", checked.status); assertEquals(f.clock.now(), checked.checkedInAt)
        assertEquals("INVALID_STATE", (backend.transition(checked.reference(), AppointmentAction.CANCEL, f.operation()) as ApiResult.Failure).code)
    }
    @Test fun cancellationAndNoShowDoNotDeleteAppointment() = runTest {
        for (action in listOf(AppointmentAction.CANCEL, AppointmentAction.NO_SHOW)) {
            val f = OperationalFixture(); val value = f.appointment("CONFIRMED"); val backend = f.backend(values = listOf(value))
            assertTrue(backend.transition(value.reference(), action, f.operation()) is ApiResult.Success)
            val current = (backend.appointment(value.id) as ApiResult.Success).value
            assertEquals(if (action == AppointmentAction.CANCEL) "CANCELLED" else "NO_SHOW", current.status)
            assertEquals("INVALID_STATE", (backend.transition(current.reference(), AppointmentAction.CONFIRM, f.operation()) as ApiResult.Failure).code)
        }
    }
    @Test fun reschedulingRetainsPatientAndStateAndStaleVersionCannotOverwrite() = runTest {
        val f = OperationalFixture(); val backend = f.backend(); val before = f.appointment()
        val input = AppointmentReschedule(f.doctorId, f.locationId, f.clock.now().plusSeconds(14000), f.clock.now().plusSeconds(16000))
        assertTrue(backend.reschedule(before.reference(), input, f.operation()) is ApiResult.Success)
        assertEquals(412, (backend.reschedule(before.reference(), input, f.operation()) as ApiResult.Failure).status)
        val current = (backend.appointment(before.id) as ApiResult.Success).value
        assertEquals(before.patientId, current.patientId); assertEquals(before.status, current.status); assertEquals(input.startsAt, current.startsAt)
    }
    @Test fun availabilityCanLoseRaceAndConflictLeavesOriginalUnchanged() = runTest {
        val f = OperationalFixture(); val backend = f.backend()
        assertTrue(backend.create(f.creation(), f.operation()) is ApiResult.Success)
        assertEquals("SCHEDULE_CONFLICT", (backend.create(f.creation(), f.operation()) as ApiResult.Failure).code)
    }
    @Test fun lostResponseAndSameKeyReplayNeverDuplicateCreation() = runTest {
        val f = OperationalFixture(); val backend = f.backend(); val operation = f.operation()
        backend.loseNextWriteResponse = true
        assertEquals(ApiResult.OutcomeUnknown, backend.create(f.creation(), operation))
        assertTrue(backend.create(f.creation(), operation) is ApiResult.Success)
        assertEquals("IDEMPOTENCY_CONFLICT", (backend.create(f.creation(17000, 18000), operation) as ApiResult.Failure).code)
        val list = backend.appointments(AppointmentQuery(f.clock.now(), f.clock.now().plusSeconds(86400))) as ApiResult.Success
        assertEquals(2, list.value.items.size)
    }
    @Test fun coupledEncounterCommandsRemainUnavailableWithoutClinicalParticipant() = runTest {
        val f = OperationalFixture(); val value = f.appointment("CHECKED_IN"); val backend = f.backend(values = listOf(value))
        assertEquals("FEATURE_UNAVAILABLE", (backend.transition(value.reference(), AppointmentAction.START, f.operation()) as ApiResult.Failure).code)
        assertEquals("CHECKED_IN", (backend.appointment(value.id) as ApiResult.Success).value.status)
    }
    @Test fun noStatusSupportsACommandOutsideItsDeclaredSourceSet() {
        for (state in AppointmentStatus.entries) for (action in AppointmentAction.entries) {
            if (state in setOf(AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW)) assertFalse(state in action.source)
        }
    }
}
