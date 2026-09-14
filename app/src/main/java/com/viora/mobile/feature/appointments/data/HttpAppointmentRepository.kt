package com.viora.mobile.feature.appointments.data

import com.viora.mobile.core.model.*
import com.viora.mobile.core.network.*
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.WireTime
import com.viora.mobile.feature.appointments.data.dto.*
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.net.URLEncoder
import java.time.Instant

/** Live command capability stays unavailable until policy and platform dispatch/recovery are integrated. */
fun appointmentRepository(requests: AuthenticatedRequestPort, session: SessionPort,
    capability: SchedulingCapability = SchedulingCapability.Unavailable, decodeDispatcher: CoroutineDispatcher = Dispatchers.Default): AppointmentRepository =
    HttpAppointmentRepository(requests, session, capability, decodeDispatcher)

internal class HttpAppointmentRepository(private val requests: AuthenticatedRequestPort,
    private val session: SessionPort, private val capability: SchedulingCapability, private val decodeDispatcher: CoroutineDispatcher) : AppointmentRepository {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = true }
    override suspend fun appointments(query: AppointmentQuery): ApiResult<DirectoryPage<Appointment>> = read(
        "/v1/appointments" + query(listOf("from" to WireTime.format(query.from), "to" to WireTime.format(query.to),
            "doctorId" to query.doctorId, "patientId" to query.patientId, "locationId" to query.locationId,
            "status" to query.status?.name, "limit" to query.page.limit.toString(), "cursor" to query.page.cursor))) { payload, workspace ->
        val dto = json.decodeFromString<AppointmentListDto>(payload.json)
        require(dto.page.hasMore == (dto.page.nextCursor != null) && dto.data.size <= query.page.limit)
        require(dto.data.map { it.id }.distinct().size == dto.data.size)
        DirectoryPage(dto.data.map { it.domain(workspace) }, dto.page.nextCursor)
    }
    override suspend fun appointment(id: String): ApiResult<Appointment> {
        if (!Ids.valid(id)) return ApiResult.Failure("INVALID_REQUEST", 400)
        return read("/v1/appointments/$id") { payload, workspace ->
            json.decodeFromString<AppointmentReadDto>(payload.json).data.also {
                require(it.id == id && it.versionToken == payload.etag)
            }.domain(workspace)
        }
    }
    override suspend fun availability(doctorId: String, locationId: String, from: Instant, to: Instant): ApiResult<Availability> {
        if (!Ids.valid(doctorId) || !Ids.valid(locationId) || from >= to || to > from.plusSeconds(7 * 86400))
            return ApiResult.Failure("INVALID_QUERY", 400)
        return read("/v1/appointments/availability" + query(listOf("doctorId" to doctorId, "locationId" to locationId,
            "from" to WireTime.format(from), "to" to WireTime.format(to))), availability = true) { payload, _ ->
            val dto = json.decodeFromString<AvailabilityReadDto>(payload.json).data
            val windows = dto.windows.map {
                require(it.doctorId == doctorId && it.locationId == locationId)
                AvailabilityWindow(it.doctorId, it.locationId, WireTime.parse(it.startsAt), WireTime.parse(it.endsAt)).also { value ->
                    require(value.startsAt >= from && value.endsAt <= to)
                }
            }
            require(windows.zipWithNext().all { (a, b) -> a.endsAt < b.startsAt })
            Availability(windows, WireTime.parse(dto.checkedAt))
        }
    }
    override suspend fun create(input: AppointmentCreate, operation: OperationReceipt): ApiResult<AppointmentWrite> =
        write("POST", "/v1/appointments", "appointment.create", operation, null, null,
            json.encodeToString(AppointmentCreateDto(input.patientId, input.doctorId, input.locationId,
                WireTime.format(input.startsAt), WireTime.format(input.endsAt), input.reason, input.notes)))

    override suspend fun reschedule(current: AppointmentReference, input: AppointmentReschedule,
        operation: OperationReceipt): ApiResult<AppointmentWrite> = write("PATCH", "/v1/appointments/${current.appointmentId}",
        "appointment.reschedule", operation, current, null, json.encodeToString(AppointmentRescheduleDto(
            input.doctorId, input.locationId, WireTime.format(input.startsAt), WireTime.format(input.endsAt))))

    override suspend fun transition(current: AppointmentReference, action: AppointmentAction, operation: OperationReceipt,
        encounter: EncounterLink?): ApiResult<AppointmentWrite> {
        if (action.source.none { it.name == current.status }) return ApiResult.Failure("INVALID_STATE", 409)
        val linked = action == AppointmentAction.START || action == AppointmentAction.COMPLETE
        if (linked != (encounter != null) || linked && current.encounterId != encounter?.encounterId)
            return ApiResult.Failure("RELATIONSHIP_CONFLICT", 409)
        return write("POST", "/v1/appointments/${current.appointmentId}/${action.path}", action.permission,
            operation, current, encounter, encounter?.let { json.encodeToString(EncounterLinkDto(it.encounterId, it.encounterVersionToken)) } ?: "{}")
    }
    private suspend fun <T> read(path: String, availability: Boolean = false, decode: (ApiPayload, String) -> T): ApiResult<T> {
        val snapshot = session.snapshot() ?: return ApiResult.Failure("UNAUTHENTICATED", 401)
        val context = requireNotNull(snapshot.workspace)
        if (!context.allows("appointment.read") || availability && !context.allows("doctor.read")) return ApiResult.Failure("FORBIDDEN", 403)
        if (availability && (!capability.available || capability.blockedDecisionIds.isNotEmpty() || "BD-03" in context.blockedDecisionIds))
            return ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
        return try {
            val result = requests.execute(ApiRequest("GET", path, RequestScope.WORKSPACE, workspaceId = context.id))
            val mapped = when (result) {
                is ApiResult.Success -> withContext(decodeDispatcher) { ApiResult.Success(decode(result.value, context.id)) }
                is ApiResult.Failure -> result
                ApiResult.StaleScope -> ApiResult.StaleScope
                ApiResult.OutcomeUnknown -> ApiResult.Failure("INVALID_RESPONSE")
            }
            if (session.matches(snapshot)) mapped else ApiResult.StaleScope
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { if (session.matches(snapshot)) ApiResult.Failure("INVALID_RESPONSE") else ApiResult.StaleScope }
    }
    private suspend fun write(method: String, path: String, permission: String, operation: OperationReceipt,
        current: AppointmentReference?, linked: EncounterLink?, body: String): ApiResult<AppointmentWrite> {
        val snapshot = session.snapshot() ?: return ApiResult.Failure("UNAUTHENTICATED", 401)
        val context = requireNotNull(snapshot.workspace)
        if (!context.allows(permission) || permission == "appointment.start" && !context.allows("encounter.start") ||
            permission == "appointment.complete" && !context.allows("encounter.complete")) return ApiResult.Failure("FORBIDDEN", 403)
        if (!capability.available || capability.blockedDecisionIds.isNotEmpty() ||
            context.blockedDecisionIds.any { it == "BD-01" || it == "BD-03" || it == "BD-04" && permission == "appointment.complete" })
            return ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
        try {
            operation.validate()
            require(operation.ownerUserId == snapshot.userId && operation.workspaceId == context.id)
            current?.let { require(it.workspaceId == context.id && Ids.valid(it.appointmentId) && VersionToken.valid(it.appointmentVersionToken)) }
        } catch (_: IllegalArgumentException) { return ApiResult.Failure("INVALID_REQUEST", 400) }
        if (!session.matches(snapshot)) return ApiResult.StaleScope
        return try {
            val result = requests.execute(ApiRequest(method, path, RequestScope.WORKSPACE, body, current?.appointmentVersionToken,
                operation.operationId, operation.createdAt, workspaceId = context.id))
            val mapped = when (result) {
                is ApiResult.Success -> withContext(decodeDispatcher) {
                    require(result.value.status == if (current == null) 201 else 200)
                    ApiResult.Success(json.decodeFromString<AppointmentWriteEnvelope>(result.value.json)
                    .data.domain(operation.operationId, current?.appointmentId, result.value.etag, linked)) }
                is ApiResult.Failure -> result
                ApiResult.OutcomeUnknown -> ApiResult.OutcomeUnknown
                ApiResult.StaleScope -> ApiResult.StaleScope
            }
            if (session.matches(snapshot)) mapped else ApiResult.StaleScope
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { ApiResult.OutcomeUnknown }
    }
    private fun query(values: List<Pair<String, String?>>) = values.filter { it.second != null }
        .joinToString("&", prefix = "?") { "${it.first}=${URLEncoder.encode(it.second, "UTF-8")}" }
}
