package com.viora.mobile.feature.appointments.data

import com.viora.mobile.core.model.*
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.WorkspaceContext
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.doctors.domain.*
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant

/** Explicit fixture policy, never shipped in staging/prod and never inferred from a role. */
class SyntheticSchedulingPolicy(
    val creationState: AppointmentStatus,
    val rescheduleStates: Set<AppointmentStatus>,
    val occupancyStates: Set<AppointmentStatus>,
    val eligible: (AppointmentCreate, Instant) -> Boolean,
    val actionAllowed: (AppointmentAction, Appointment, Instant) -> Boolean,
) {
    init { require(creationState in setOf(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED)) }
}

/** In-memory simulated server. Uses only domain ports; no HTTP, disk, clinical or AI dependencies. */
class SyntheticOperationalBackend(
    private val context: () -> WorkspaceContext?, private val clock: AppClock,
    private val policy: SyntheticSchedulingPolicy?,
    private val patients: List<Patient>, private val doctors: List<Doctor>,
    private val shifts: List<Shift>, appointments: List<Appointment>,
    private val ownerUserId: () -> String,
) : PatientDirectory, DoctorDirectory, AppointmentRepository {
    private val mutex = Mutex()
    private val appointments = appointments.associateBy { it.id }.toMutableMap()
    private val settled = mutableMapOf<String, Pair<String, ApiResult<AppointmentWrite>>>()
    var failNextRead = false
    var loseNextWriteResponse = false

    private fun scope(vararg permissions: String): WorkspaceContext? = context()?.takeIf { value -> permissions.all(value::allows) }
    private fun <T> read(permission: String, block: (WorkspaceContext) -> ApiResult<T>): ApiResult<T> {
        val workspace = scope(permission) ?: return ApiResult.Failure("FORBIDDEN", 403)
        if (failNextRead) { failNextRead = false; return ApiResult.Failure("TRANSPORT_ERROR") }
        return block(workspace)
    }
    private fun <T> page(items: List<T>, request: PageRequest, identity: String): ApiResult<DirectoryPage<T>> {
        // Fixture cursors bind the exact query and workspace; never a production cursor algorithm.
        val prefix = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(identity.toByteArray()) + ":"
        val offset = request.cursor?.let { if (!it.startsWith(prefix)) return ApiResult.Failure("INVALID_CURSOR", 400)
            it.removePrefix(prefix).toIntOrNull() ?: return ApiResult.Failure("INVALID_CURSOR", 400) } ?: 0
        if (offset !in 0..items.size) return ApiResult.Failure("INVALID_CURSOR", 400)
        val selected = items.drop(offset).take(request.limit)
        val next = offset + selected.size
        return ApiResult.Success(DirectoryPage(selected, if (next < items.size) prefix + next else null))
    }
    override suspend fun search(query: PatientSearch): ApiResult<DirectoryPage<Patient>> = read("patient.read") { workspace ->
        page(patients.filter { it.workspaceId == workspace.id && (it.fullName.contains(query.query, true) || it.medicalRecordNumber.contains(query.query, true)) }
            .sortedWith(compareBy<Patient> { it.fullName }.thenBy { it.id }).map { it.project(workspace.patientReadableFields) }, query.page,
            "${workspace.id}|${workspace.permissionRevision}|patient|${query.query}|${query.page.limit}")
    }
    override suspend fun patient(id: String): ApiResult<Patient> = read("patient.read") { workspace ->
        patients.find { it.id == id && it.workspaceId == workspace.id }?.let { ApiResult.Success(it.project(workspace.patientReadableFields)) }
            ?: ApiResult.Failure("RESOURCE_NOT_FOUND", 404)
    }
    override suspend fun doctors(query: DoctorQuery): ApiResult<DirectoryPage<Doctor>> = read("doctor.read") { workspace ->
        page(doctors.filter { it.workspaceId == workspace.id && (query.query == null || it.displayName.contains(query.query, true)) &&
            (query.locationId == null || query.locationId in it.locationIds) && (query.status == null || it.status == query.status) }
            .sortedWith(compareBy<Doctor> { it.displayName }.thenBy { it.id }), query.page,
            "${workspace.id}|${workspace.permissionRevision}|doctor|${query.query}|${query.locationId}|${query.status}|${query.page.limit}")
    }
    override suspend fun doctor(id: String): ApiResult<Doctor> = read("doctor.read") { workspace ->
        doctors.find { it.id == id && it.workspaceId == workspace.id }?.let { ApiResult.Success(it) }
            ?: ApiResult.Failure("RESOURCE_NOT_FOUND", 404)
    }
    override suspend fun shifts(id: String, from: Instant, to: Instant, locationId: String?, page: PageRequest): ApiResult<DirectoryPage<Shift>> = read("doctor.read") { workspace ->
        if (!Ids.valid(id) || from >= to || to > from.plusSeconds(7 * 86400)) return@read ApiResult.Failure("INVALID_QUERY", 400)
        page(shifts.filter { it.workspaceId == workspace.id && it.doctorId == id && it.startsAt < to && it.endsAt > from &&
            (locationId == null || it.locationId == locationId) }.sortedWith(compareBy<Shift> { it.startsAt }.thenBy { it.id }), page,
            "${workspace.id}|${workspace.permissionRevision}|shift|$id|$from|$to|$locationId|${page.limit}")
    }
    override suspend fun appointments(query: AppointmentQuery): ApiResult<DirectoryPage<Appointment>> = mutex.withLock {
        read("appointment.read") { workspace -> page(appointments.values.filter { it.workspaceId == workspace.id && it.startsAt < query.to && it.endsAt > query.from &&
            (query.patientId == null || it.patientId == query.patientId) && (query.doctorId == null || it.doctorId == query.doctorId) &&
            (query.locationId == null || it.locationId == query.locationId) && (query.status == null || it.status == query.status.name) }
            .sortedWith(compareBy<Appointment> { it.startsAt }.thenBy { it.id }), query.page,
            "${workspace.id}|${workspace.permissionRevision}|appointment|${query.from}|${query.to}|${query.patientId}|${query.doctorId}|${query.locationId}|${query.status}|${query.page.limit}") }
    }
    override suspend fun appointment(id: String): ApiResult<Appointment> = mutex.withLock { read("appointment.read") { workspace ->
        appointments[id]?.takeIf { it.workspaceId == workspace.id }?.let { ApiResult.Success(it) } ?: ApiResult.Failure("RESOURCE_NOT_FOUND", 404)
    } }
    override suspend fun availability(doctorId: String, locationId: String, from: Instant, to: Instant): ApiResult<Availability> = mutex.withLock {
        val workspace = scope("appointment.read", "doctor.read") ?: return@withLock ApiResult.Failure("FORBIDDEN", 403)
        if (policy == null || "BD-03" in workspace.blockedDecisionIds) return@withLock ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
        if (!Ids.valid(doctorId) || !Ids.valid(locationId) || from >= to || to > from.plusSeconds(7 * 86400)) return@withLock ApiResult.Failure("INVALID_QUERY", 400)
        if (doctors.none { it.id == doctorId && it.workspaceId == workspace.id && it.status == "ACTIVE" && locationId in it.locationIds })
            return@withLock ApiResult.Failure("RESOURCE_NOT_FOUND", 404)
        val free = free(workspace.id, doctorId, locationId, from, to, null)
        if (free.size > 200) ApiResult.Failure("VALIDATION_ERROR", 422)
        else ApiResult.Success(Availability(free.map { AvailabilityWindow(doctorId, locationId, it.first, it.second) }, clock.now()))
    }
    private fun free(workspace: String, doctor: String, location: String, from: Instant, to: Instant, excluding: String?): List<Pair<Instant, Instant>> {
        val merged = mutableListOf<Pair<Instant, Instant>>()
        shifts.filter { it.workspaceId == workspace && it.doctorId == doctor && it.locationId == location && it.status == "ACTIVE" && it.startsAt < to && it.endsAt > from }
            .map { maxOf(from, it.startsAt) to minOf(to, it.endsAt) }.sortedBy { it.first }.forEach { interval ->
                val previous = merged.lastOrNull()
                if (previous != null && interval.first <= previous.second) merged[merged.lastIndex] = previous.first to maxOf(previous.second, interval.second)
                else merged += interval
            }
        var free = merged.toList()
        appointments.values.filter { it.id != excluding && it.workspaceId == workspace && it.doctorId == doctor && it.knownStatus in requireNotNull(policy).occupancyStates }
            .forEach { busy -> free = free.flatMap { window ->
                if (busy.startsAt >= window.second || busy.endsAt <= window.first) listOf(window)
                else listOfNotNull(if (busy.startsAt > window.first) window.first to busy.startsAt else null,
                    if (busy.endsAt < window.second) busy.endsAt to window.second else null)
            } }
        return free
    }
    private fun eligible(workspace: String, input: AppointmentCreate, excluding: String?): Boolean =
        patients.any { it.id == input.patientId && it.workspaceId == workspace } &&
        doctors.any { it.id == input.doctorId && it.workspaceId == workspace && it.status == "ACTIVE" && input.locationId in it.locationIds } &&
        input.startsAt > clock.now() && requireNotNull(policy).eligible(input, clock.now()) &&
        free(workspace, input.doctorId, input.locationId, input.startsAt, input.endsAt, excluding).any { it.first <= input.startsAt && it.second >= input.endsAt }

    private suspend fun command(operation: OperationReceipt, permission: String, fingerprint: String,
        block: (WorkspaceContext) -> ApiResult<AppointmentWrite>): ApiResult<AppointmentWrite> = mutex.withLock {
        val workspace = scope(permission) ?: return@withLock ApiResult.Failure("FORBIDDEN", 403)
        if (operation.workspaceId != workspace.id) return@withLock ApiResult.StaleScope
        if (operation.ownerUserId != ownerUserId()) return@withLock ApiResult.Failure("FORBIDDEN", 403)
        try { operation.validate() } catch (_: Exception) { return@withLock ApiResult.Failure("INVALID_REQUEST", 400) }
        val identity = "${operation.ownerUserId}|${workspace.id}|${operation.operationId}"
        settled[identity]?.let { return@withLock if (it.first == fingerprint) it.second else ApiResult.Failure("IDEMPOTENCY_CONFLICT", 409) }
        if (policy == null || workspace.blockedDecisionIds.any { it in setOf("BD-01", "BD-03") })
            return@withLock ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
        val result = block(workspace)
        settled[identity] = fingerprint to result
        if (loseNextWriteResponse && result is ApiResult.Success) { loseNextWriteResponse = false; ApiResult.OutcomeUnknown } else result
    }
    override suspend fun create(input: AppointmentCreate, operation: OperationReceipt): ApiResult<AppointmentWrite> =
        command(operation, "appointment.create", "create|${input.patientId}|${input.doctorId}|${input.locationId}|${input.startsAt}|${input.endsAt}|${input.reason}|${input.notes}|${operation.createdAt}") { workspace ->
            if (!eligible(workspace.id, input, null)) return@command ApiResult.Failure("SCHEDULE_CONFLICT", 409)
            val value = Appointment(Ids.newId(), workspace.id, token(), workspace.permissions, clock.now(), clock.now(), input.patientId,
                input.doctorId, input.locationId, input.startsAt, input.endsAt, requireNotNull(policy).creationState.name, null, input.reason, input.notes, null)
            appointments[value.id] = value; receipt(value, operation)
        }
    override suspend fun reschedule(current: AppointmentReference, input: AppointmentReschedule, operation: OperationReceipt): ApiResult<AppointmentWrite> =
        command(operation, "appointment.reschedule", "reschedule|${current.appointmentId}|${current.appointmentVersionToken}|${input.doctorId}|${input.locationId}|${input.startsAt}|${input.endsAt}|${operation.createdAt}") { workspace ->
            val old = appointments[current.appointmentId]?.takeIf { it.workspaceId == workspace.id } ?: return@command ApiResult.Failure("RESOURCE_NOT_FOUND", 404)
            if (old.versionToken != current.appointmentVersionToken) return@command ApiResult.Failure("VERSION_CONFLICT", 412)
            if (old.knownStatus !in requireNotNull(policy).rescheduleStates) return@command ApiResult.Failure("INVALID_STATE", 409)
            val creation = AppointmentCreate(old.patientId, input.doctorId, input.locationId, input.startsAt, input.endsAt, old.reason, old.notes)
            if (!eligible(workspace.id, creation, old.id)) return@command ApiResult.Failure("SCHEDULE_CONFLICT", 409)
            val value = Appointment(old.id, old.workspaceId, token(), old.allowedActions, old.createdAt, clock.now(), old.patientId,
                input.doctorId, input.locationId, input.startsAt, input.endsAt, old.status, old.checkedInAt, old.reason, old.notes, old.encounterId)
            appointments[value.id] = value; receipt(value, operation)
        }
    override suspend fun transition(current: AppointmentReference, action: AppointmentAction, operation: OperationReceipt,
        encounter: EncounterLink?): ApiResult<AppointmentWrite> = command(operation, action.permission,
        "${action.name}|${current.appointmentId}|${current.appointmentVersionToken}|${encounter?.encounterId}|${encounter?.encounterVersionToken}|${operation.createdAt}") { workspace ->
        val old = appointments[current.appointmentId]?.takeIf { it.workspaceId == workspace.id } ?: return@command ApiResult.Failure("RESOURCE_NOT_FOUND", 404)
        if (old.versionToken != current.appointmentVersionToken) return@command ApiResult.Failure("VERSION_CONFLICT", 412)
        if (action.permission !in old.allowedActions) return@command ApiResult.Failure("FORBIDDEN", 403)
        if (old.knownStatus !in action.source) return@command ApiResult.Failure("INVALID_STATE", 409)
        // Coupled clinical effects require Member C's server fixture and are never simulated as a one-sided success.
        if (action in setOf(AppointmentAction.START, AppointmentAction.COMPLETE)) return@command ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
        if (encounter != null) return@command ApiResult.Failure("RELATIONSHIP_CONFLICT", 409)
        if (!requireNotNull(policy).actionAllowed(action, old, clock.now())) return@command ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
        val target = when (action) { AppointmentAction.CONFIRM -> "CONFIRMED"; AppointmentAction.CANCEL -> "CANCELLED"
            AppointmentAction.CHECK_IN -> "CHECKED_IN"; AppointmentAction.NO_SHOW -> "NO_SHOW"; else -> error("Unsupported") }
        val value = Appointment(old.id, old.workspaceId, token(), old.allowedActions, old.createdAt, clock.now(), old.patientId,
            old.doctorId, old.locationId, old.startsAt, old.endsAt, target,
            if (action == AppointmentAction.CHECK_IN) clock.now() else old.checkedInAt, old.reason, old.notes, old.encounterId)
        appointments[value.id] = value; receipt(value, operation)
    }
    private fun token() = "\"fixture-${Ids.newId()}\""
    private fun receipt(value: Appointment, operation: OperationReceipt) = ApiResult.Success(AppointmentWrite(
        operation.operationId, value.id, value.versionToken, null, clock.now(), clock.now().plusSeconds(86400)))
}
