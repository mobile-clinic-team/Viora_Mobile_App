package com.viora.mobile.feature.appointments.domain

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.model.VersionToken
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.feature.patients.domain.*
import java.time.Instant

enum class AppointmentStatus { PENDING, CONFIRMED, CHECKED_IN, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW }

class Appointment(
    val id: String, val workspaceId: String, val versionToken: String, val allowedActions: Set<String>,
    val createdAt: Instant, val updatedAt: Instant, val patientId: String, val doctorId: String,
    val locationId: String, val startsAt: Instant, val endsAt: Instant, val status: String,
    val checkedInAt: Instant?, val reason: String?, val notes: String?, val encounterId: String?,
) {
    init {
        require(listOf(id, workspaceId, patientId, doctorId, locationId).all(Ids::valid))
        require(VersionToken.valid(versionToken) && startsAt < endsAt && allowedActions.size <= 128)
        encounterId?.let { require(Ids.valid(it)) }; text(status, 64)
        reason?.let { text(it, 1000) }; notes?.let { text(it, 4000, true) }
    }
    val knownStatus get() = AppointmentStatus.entries.find { it.name == status }
    fun reference() = AppointmentReference(id, workspaceId, patientId, doctorId, versionToken, encounterId, status)
    override fun toString() = "Appointment(REDACTED)"
}

/** Member C must re-read this reference before CL01 and send its exact appointmentVersionToken. */
data class AppointmentReference(val appointmentId: String, val workspaceId: String, val patientId: String,
    val doctorId: String, val appointmentVersionToken: String, val encounterId: String?, val status: String)

sealed interface EncounterEntry {
    data class Create(val patient: PatientReference, val appointmentId: String? = null) : EncounterEntry
    data class Existing(val encounterId: String) : EncounterEntry
}

/** Navigation request only. Clinical owns CL01/CL02 and all clinical effects. */
fun interface EncounterNavigation { fun open(entry: EncounterEntry) }

data class AppointmentQuery(val from: Instant, val to: Instant, val doctorId: String? = null,
    val patientId: String? = null, val locationId: String? = null, val status: AppointmentStatus? = null,
    val page: PageRequest = PageRequest()) {
    init { validateRange(from, to, 31); listOfNotNull(doctorId, patientId, locationId).forEach { require(Ids.valid(it)) } }
}

class AppointmentCreate(val patientId: String, val doctorId: String, val locationId: String,
    val startsAt: Instant, val endsAt: Instant, val reason: String? = null, val notes: String? = null) {
    init {
        require(listOf(patientId, doctorId, locationId).all(Ids::valid)); require(startsAt < endsAt)
        reason?.let { text(it, 1000) }; notes?.let { text(it, 4000, true) }
    }
    override fun toString() = "AppointmentCreate(REDACTED)"
}

/** Rescheduling never changes patient, status or ownership. */
class AppointmentReschedule(val doctorId: String, val locationId: String, val startsAt: Instant, val endsAt: Instant) {
    init { require(Ids.valid(doctorId) && Ids.valid(locationId) && startsAt < endsAt) }
    override fun toString() = "AppointmentReschedule(REDACTED)"
}

enum class AppointmentAction(val path: String, val permission: String, val source: Set<AppointmentStatus>) {
    CONFIRM("confirm", "appointment.confirm", setOf(AppointmentStatus.PENDING)),
    CANCEL("cancel", "appointment.cancel", setOf(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED)),
    CHECK_IN("check-in", "appointment.checkIn", setOf(AppointmentStatus.CONFIRMED)),
    NO_SHOW("no-show", "appointment.noShow", setOf(AppointmentStatus.CONFIRMED)),
    START("start", "appointment.start", setOf(AppointmentStatus.CHECKED_IN)),
    COMPLETE("complete", "appointment.complete", setOf(AppointmentStatus.IN_PROGRESS)),
}

data class EncounterLink(val encounterId: String, val encounterVersionToken: String) {
    init { require(Ids.valid(encounterId) && VersionToken.valid(encounterVersionToken)) }
}

data class AppointmentWrite(val operationId: String, val appointmentId: String, val versionToken: String,
    val encounter: EncounterLink?, val committedAt: Instant, val expiresAt: Instant)

data class AvailabilityWindow(val doctorId: String, val locationId: String, val startsAt: Instant, val endsAt: Instant) {
    init { require(Ids.valid(doctorId) && Ids.valid(locationId) && startsAt < endsAt) }
}
data class Availability(val windows: List<AvailabilityWindow>, val checkedAt: Instant) {
    init { require(windows.size <= 200) }
}

interface AppointmentLookup {
    suspend fun appointments(query: AppointmentQuery): ApiResult<DirectoryPage<Appointment>>
    suspend fun appointment(id: String): ApiResult<Appointment>
}
interface AppointmentRepository : AppointmentLookup {
    suspend fun availability(doctorId: String, locationId: String, from: Instant, to: Instant): ApiResult<Availability>
    suspend fun create(input: AppointmentCreate, operation: OperationReceipt): ApiResult<AppointmentWrite>
    suspend fun reschedule(current: AppointmentReference, input: AppointmentReschedule, operation: OperationReceipt): ApiResult<AppointmentWrite>
    suspend fun transition(current: AppointmentReference, action: AppointmentAction, operation: OperationReceipt,
        encounter: EncounterLink? = null): ApiResult<AppointmentWrite>
}

fun validateRange(from: Instant, to: Instant, days: Long) {
    require(from < to && to <= from.plusSeconds(days * 86400))
}
