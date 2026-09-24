package com.viora.mobile.app

import com.viora.mobile.core.session.AuthenticatedRequestPort
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.core.session.WorkspaceContext
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.dev.FakeBackend
import com.viora.mobile.dev.SyntheticIdentity
import com.viora.mobile.feature.appointments.data.SyntheticOperationalBackend
import com.viora.mobile.feature.clinical.data.SyntheticClinicalData
import com.viora.mobile.feature.appointments.domain.Appointment
import com.viora.mobile.feature.appointments.domain.AppointmentAction
import com.viora.mobile.feature.appointments.domain.AppointmentStatus
import com.viora.mobile.feature.appointments.domain.SchedulingCapability
import com.viora.mobile.feature.appointments.ui.AppointmentLocationOption
import com.viora.mobile.feature.doctors.domain.Doctor
import com.viora.mobile.feature.doctors.domain.Shift
import com.viora.mobile.feature.patients.domain.EmergencyContact
import com.viora.mobile.feature.patients.domain.Patient
import com.viora.mobile.feature.patients.domain.PatientField
import java.time.LocalDate

class EnvironmentBindings(private val clock: AppClock, @Suppress("UNUSED_PARAMETER") api: com.viora.mobile.core.network.ApiClient? = null) : OperationalEnvironmentBindings {
    private val backend = FakeBackend(clock)
    override val synthetic = true
    val auth = backend
    val workspaces = backend
    private var operationalDependencies: OperationalDependencies? = null

    @Suppress("UNUSED_PARAMETER")
    override fun operational(session: SessionPort, requests: AuthenticatedRequestPort, clock: AppClock): OperationalDependencies =
        synchronized(this) {
            operationalDependencies ?: createOperationalDependencies(session, clock).also { operationalDependencies = it }
        }

    private fun createOperationalDependencies(session: SessionPort, clock: AppClock): OperationalDependencies {
        val now = clock.now()
        val willowLocation = SyntheticIdentity.LOCATION_A
        val harborLocation = SyntheticIdentity.LOCATION_B
        val today = now.atZone(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDate()
            .atTime(10, 0).atZone(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).toInstant()
        val patientA = Patient("63333333-3333-4333-8333-333333333333", SyntheticIdentity.WORKSPACE_A, "\"patient-a-1\"",
            setOf("patient.read", "appointment.create", "encounter.create"), now, now, "DEMO-001", "Synthetic Patient A",
            PatientField.Disclosed(LocalDate.of(1984, 4, 12)), PatientField.Disclosed("UNSPECIFIED"),
            PatientField.Disclosed("+84 900 000 001"), PatientField.Disclosed("patient-a@example.invalid"),
            PatientField.Disclosed("Willow Clinic demo address"),
            PatientField.Disclosed(EmergencyContact("Synthetic Contact", "+84 900 000 099", null)),
            PatientField.Disclosed("ACTIVE"))
        val patientB = Patient("64444444-4444-4444-8444-444444444444", SyntheticIdentity.WORKSPACE_B, "\"patient-b-1\"",
            setOf("patient.read", "appointment.create", "encounter.create"), now, now, "DEMO-002", "Synthetic Patient B")
        val doctorA = Doctor("65555555-5555-4555-8555-555555555555", SyntheticIdentity.WORKSPACE_A, "Synthetic Doctor A",
            "General practice", null, setOf(willowLocation), "ACTIVE", "Synthetic directory profile", setOf("doctor.read"))
        val doctorB = Doctor("66666666-6666-4666-8666-666666666666", SyntheticIdentity.WORKSPACE_B, "Synthetic Doctor B",
            "Family medicine", null, setOf(harborLocation), "ACTIVE", "Synthetic directory profile", setOf("doctor.read"))
        val shifts = listOf(
            Shift("67777777-7777-4777-8777-777777777777", SyntheticIdentity.WORKSPACE_A, doctorA.id, willowLocation,
                now.plusSeconds(3600), now.plusSeconds(43200), "ACTIVE"),
            Shift("68888888-8888-4888-8888-888888888888", SyntheticIdentity.WORKSPACE_B, doctorB.id, harborLocation,
                now.plusSeconds(3600), now.plusSeconds(43200), "ACTIVE"),
        )
        val actions = setOf("appointment.reschedule", "appointment.confirm", "appointment.cancel", "appointment.checkIn", "appointment.noShow",
            "appointment.start", "appointment.complete", "encounter.create", "encounter.read")
        val appointments = listOf(
            // Existing linked clinical fixture; no lifecycle command is enabled by this seed.
            Appointment(SyntheticClinicalData.APPOINTMENT, SyntheticIdentity.WORKSPACE_A, "\"clinical-demo-appointment-1\"", actions,
                now, now, patientA.id, doctorA.id, willowLocation, today.plusSeconds(3600), today.plusSeconds(5400), "IN_PROGRESS",
                now, "Synthetic clinical visit", null, SyntheticClinicalData.ENCOUNTER),
            Appointment("69999999-9999-4999-8999-999999999999", SyntheticIdentity.WORKSPACE_A, "\"appointment-a-1\"", actions,
                now, now, patientA.id, doctorA.id, willowLocation, today, today.plusSeconds(1800), "PENDING", null,
                "Synthetic appointment", null, null),
            Appointment("60000000-0000-4000-8000-000000000000", SyntheticIdentity.WORKSPACE_B, "\"appointment-b-1\"", actions,
                now, now, patientB.id, doctorB.id, harborLocation, today, today.plusSeconds(1800), "PENDING", null,
                "Synthetic appointment", null, null),
        )
        val policy = com.viora.mobile.feature.appointments.data.SyntheticSchedulingPolicy(
            creationState = AppointmentStatus.PENDING,
            rescheduleStates = setOf(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED),
            occupancyStates = setOf(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED),
            eligible = { _, _ -> true },
            actionAllowed = { action, appointment, _ ->
                when (action) {
                    AppointmentAction.CONFIRM -> appointment.knownStatus == AppointmentStatus.PENDING
                    AppointmentAction.CANCEL -> appointment.knownStatus in setOf(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED)
                    AppointmentAction.CHECK_IN -> appointment.knownStatus == AppointmentStatus.CONFIRMED
                    AppointmentAction.NO_SHOW -> appointment.knownStatus == AppointmentStatus.CONFIRMED
                    else -> false
                }
            },
        )
        val synthetic = SyntheticOperationalBackend(
            context = { session.state.value.workspace }, clock = clock, policy = policy,
            patients = listOf(patientA, patientB), doctors = listOf(doctorA, doctorB), shifts = shifts,
            appointments = appointments, ownerUserId = { session.state.value.user?.id.orEmpty() })
        val locations: (WorkspaceContext) -> List<AppointmentLocationOption> = { context ->
            if (!context.allows("appointment.read") && !context.allows("appointment.create")) emptyList()
            else context.locations.filter { it.status == "ACTIVE" }.map { AppointmentLocationOption(it.id, it.name) }
        }
        return OperationalDependencies(synthetic, synthetic, synthetic, SchedulingCapability(true, emptySet()), locations)
    }
}
