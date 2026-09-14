package com.viora.mobile.feature.clinical.domain

import com.viora.mobile.core.model.*
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.CancellationException

class ClinicalEntryContext(val patient: Patient, val appointment: AppointmentReference?, val encounters: DirectoryPage<Encounter>) {
    override fun toString() = "ClinicalEntryContext(REDACTED)"
}
class EncounterContext(val patient: Patient, val appointment: AppointmentReference?, val encounter: Encounter) {
    override fun toString() = "EncounterContext(REDACTED)"
}
class ClinicalRecordContext(val encounter: EncounterContext, val record: ClinicalRecord) {
    override fun toString() = "ClinicalRecordContext(REDACTED)"
}

/** Authorized read composition. No resource is created when a nullable link is absent. */
class ClinicalReader(private val repository: ClinicalReadRepository, private val patients: PatientDirectory,
    private val appointments: AppointmentLookup, private val session: SessionPort) {
    suspend fun entry(patientId: String, appointmentId: String? = null, page: PageRequest = PageRequest()): ApiResult<ClinicalEntryContext> = scoped { context ->
        require(Ids.valid(patientId) && (appointmentId == null || Ids.valid(appointmentId)))
        permit(context, "patient.read", "encounter.read")
        val patient = value(patients.patient(patientId)).also { require(it.id == patientId && it.workspaceId == context.id) }
        val appointment = appointmentId?.let { id ->
            permit(context, "appointment.read")
            value(appointments.appointment(id)).also { require(it.id == id && it.workspaceId == context.id && it.patientId == patient.id) }
        }
        val encounters = if (appointment == null) value(repository.encounters(patient.reference(), page))
            else DirectoryPage(appointment.encounterId?.let { id -> listOf(value(repository.encounter(id)).also {
                require(it.id == id && it.appointmentId == appointment.id && it.doctorId == appointment.doctorId)
            }) } ?: emptyList(), null)
        require(encounters.items.all { it.workspaceId == context.id && it.patientId == patientId })
        ClinicalEntryContext(patient, appointment?.reference(), encounters)
    }
    suspend fun encounter(id: String): ApiResult<EncounterContext> = scoped { context -> encounterContext(id, context) }
    suspend fun record(id: String): ApiResult<ClinicalRecordContext> = scoped { context ->
        require(Ids.valid(id)); permit(context, "record.read")
        val record = value(repository.record(id))
        require(record.id == id && record.workspaceId == context.id)
        val encounter = encounterContext(record.encounterId, context)
        require(encounter.encounter.recordId == record.id && encounter.patient.id == record.patientId)
        ClinicalRecordContext(encounter, record)
    }
    private suspend fun encounterContext(id: String, context: WorkspaceContext): EncounterContext {
        require(Ids.valid(id)); permit(context, "encounter.read", "patient.read")
        val encounter = value(repository.encounter(id))
        require(encounter.id == id && encounter.workspaceId == context.id)
        val patient = value(patients.patient(encounter.patientId))
        require(patient.id == encounter.patientId && patient.workspaceId == context.id)
        val appointment = encounter.appointmentId?.let { appointmentId ->
            permit(context, "appointment.read")
            value(appointments.appointment(appointmentId)).also {
                require(it.id == appointmentId && it.workspaceId == context.id && it.patientId == patient.id &&
                    it.encounterId == encounter.id && it.doctorId == encounter.doctorId)
            }.reference()
        }
        return EncounterContext(patient, appointment, encounter)
    }
    private fun permit(context: WorkspaceContext, vararg permissions: String) {
        if (!permissions.all(context::allows)) throw ReadFailure(ApiResult.Failure("FORBIDDEN", 403))
    }
    private fun <T> value(result: ApiResult<T>): T = when (result) {
        is ApiResult.Success -> result.value
        is ApiResult.Failure -> throw ReadFailure(result)
        ApiResult.StaleScope -> throw ReadFailure(ApiResult.StaleScope)
        ApiResult.OutcomeUnknown -> throw ReadFailure(ApiResult.Failure("INVALID_RESPONSE"))
    }
    private suspend fun <T> scoped(read: suspend (WorkspaceContext) -> T): ApiResult<T> {
        val snapshot = session.snapshot() ?: return ApiResult.Failure("UNAUTHENTICATED", 401)
        val context = snapshot.workspace ?: return ApiResult.StaleScope
        val result = try { ApiResult.Success(read(context)) }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: ReadFailure) { failure.result }
        catch (_: IllegalArgumentException) { ApiResult.Failure("INVALID_CLINICAL_CONTEXT") }
        catch (_: Exception) { ApiResult.Failure("READ_FAILED") }
        return if (session.matches(snapshot)) result else ApiResult.StaleScope
    }
    private class ReadFailure(val result: ApiResult<Nothing>) : Exception()
}
