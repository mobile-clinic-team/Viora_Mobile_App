package com.viora.mobile.feature.appointments

import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.WorkspaceContext
import com.viora.mobile.feature.appointments.data.*
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.doctors.domain.*
import com.viora.mobile.feature.patients.domain.*
import com.viora.mobile.testutil.*

/** Deliberately fictional test values, not BD-01/02/03 approval. */
class OperationalFixture {
    val clock = FakeClock()
    val patientId = "71111111-1111-4111-8111-111111111111"
    val doctorId = "72222222-2222-4222-8222-222222222222"
    val locationId = "73333333-3333-4333-8333-333333333333"
    val appointmentId = "74444444-4444-4444-8444-444444444444"
    val grants = setOf("patient.read", "doctor.read", "appointment.read", "appointment.create", "appointment.reschedule",
        "appointment.confirm", "appointment.cancel", "appointment.checkIn", "appointment.noShow", "appointment.start", "appointment.complete")
    var context = WorkspaceContext(A, "Fixture clinic", "Asia/Ho_Chi_Minh", "\"fixture-policy\"", grants)
    val patient = Patient(patientId, A, "\"patient-1\"", setOf("patient.read"), clock.now(), clock.now(), "FIXTURE-001", "Synthetic Patient")
    val doctor = Doctor(doctorId, A, "Synthetic Doctor", null, null, setOf(locationId), "ACTIVE", null, setOf("doctor.read"))
    val shift = Shift("75555555-5555-4555-8555-555555555555", A, doctorId, locationId,
        clock.now().plusSeconds(3600), clock.now().plusSeconds(36000), "ACTIVE")
    val testPolicy = SyntheticSchedulingPolicy(AppointmentStatus.PENDING,
        setOf(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED), setOf(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED),
        eligible = { _, _ -> true }, actionAllowed = { _, _, _ -> true })
    fun appointment(status: String = "PENDING") = Appointment(appointmentId, A, "\"appointment-1\"", grants,
        clock.now(), clock.now(), patientId, doctorId, locationId, clock.now().plusSeconds(7200), clock.now().plusSeconds(9000),
        status, null, null, null, null)
    fun backend(policy: SyntheticSchedulingPolicy? = testPolicy, values: List<Appointment> = listOf(appointment()),
        shiftValues: List<Shift> = listOf(shift)) = SyntheticOperationalBackend({ context }, clock, policy, listOf(patient), listOf(doctor), shiftValues, values, { USER })
    fun operation() = OperationReceipt(Ids.newId(), USER, A, "2026-09-09T00:00:00.000Z", "2026-09-10T00:00:00.000Z")
    fun creation(start: Long = 10800, end: Long = 12600) = AppointmentCreate(patientId, doctorId, locationId,
        clock.now().plusSeconds(start), clock.now().plusSeconds(end))
}
