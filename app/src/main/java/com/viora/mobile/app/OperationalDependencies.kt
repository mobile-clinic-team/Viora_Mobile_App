package com.viora.mobile.app

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.session.AuthenticatedRequestPort
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.core.session.WorkspaceContext
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.feature.appointments.domain.AppointmentRepository
import com.viora.mobile.feature.appointments.domain.EncounterNavigation
import com.viora.mobile.feature.appointments.domain.SchedulingCapability
import com.viora.mobile.feature.appointments.ui.AppointmentLocationOption
import com.viora.mobile.feature.doctors.domain.DoctorDirectory
import com.viora.mobile.feature.patients.domain.DirectoryPage
import com.viora.mobile.feature.patients.domain.PageRequest
import com.viora.mobile.feature.patients.domain.Patient
import com.viora.mobile.feature.patients.domain.PatientDirectory
import com.viora.mobile.feature.patients.domain.PatientSearch
import com.viora.mobile.feature.doctors.domain.DoctorQuery
import com.viora.mobile.feature.doctors.domain.Shift
import com.viora.mobile.feature.appointments.domain.Appointment
import com.viora.mobile.feature.appointments.domain.AppointmentAction
import com.viora.mobile.feature.appointments.domain.AppointmentCreate
import com.viora.mobile.feature.appointments.domain.AppointmentQuery
import com.viora.mobile.feature.appointments.domain.AppointmentReference
import com.viora.mobile.feature.appointments.domain.AppointmentReschedule
import com.viora.mobile.core.operations.OperationReceipt
import java.time.Instant

/** Application-scoped operational ports selected by the active build environment. */
data class OperationalDependencies(
    val patients: PatientDirectory,
    val doctors: DoctorDirectory,
    val appointments: AppointmentRepository,
    val capability: SchedulingCapability,
    val locations: (WorkspaceContext) -> List<AppointmentLocationOption>,
    val clinical: EncounterNavigation? = null,
)

/** Safe fallback for staging/prod until their verified live environment is enabled. */
internal object UnavailableOperationalRepositories : PatientDirectory, DoctorDirectory, AppointmentRepository {
    private fun unavailable(): ApiResult<Nothing> = ApiResult.Failure("FEATURE_UNAVAILABLE", 503)

    override suspend fun search(query: PatientSearch): ApiResult<DirectoryPage<Patient>> = unavailable()
    override suspend fun patient(id: String): ApiResult<Patient> = unavailable()
    override suspend fun doctors(query: DoctorQuery): ApiResult<DirectoryPage<com.viora.mobile.feature.doctors.domain.Doctor>> = unavailable()
    override suspend fun doctor(id: String): ApiResult<com.viora.mobile.feature.doctors.domain.Doctor> = unavailable()
    override suspend fun shifts(id: String, from: Instant, to: Instant, locationId: String?, page: PageRequest): ApiResult<DirectoryPage<Shift>> = unavailable()
    override suspend fun appointments(query: AppointmentQuery): ApiResult<DirectoryPage<Appointment>> = unavailable()
    override suspend fun appointment(id: String): ApiResult<Appointment> = unavailable()
    override suspend fun availability(doctorId: String, locationId: String, from: Instant, to: Instant): ApiResult<com.viora.mobile.feature.appointments.domain.Availability> = unavailable()
    override suspend fun create(input: AppointmentCreate, operation: OperationReceipt): ApiResult<com.viora.mobile.feature.appointments.domain.AppointmentWrite> = unavailable()
    override suspend fun reschedule(current: AppointmentReference, input: AppointmentReschedule, operation: OperationReceipt): ApiResult<com.viora.mobile.feature.appointments.domain.AppointmentWrite> = unavailable()
    override suspend fun transition(current: AppointmentReference, action: AppointmentAction, operation: OperationReceipt,
        encounter: com.viora.mobile.feature.appointments.domain.EncounterLink?): ApiResult<com.viora.mobile.feature.appointments.domain.AppointmentWrite> = unavailable()
}

/** Environment-specific constructor for operational dependencies. */
interface OperationalEnvironmentBindings {
    val synthetic: Boolean
    fun operational(session: SessionPort, requests: AuthenticatedRequestPort, clock: AppClock): OperationalDependencies
}
