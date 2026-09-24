package com.viora.mobile.feature.appointments.data

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.network.*
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.WireTime
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.appointments.data.dto.AppointmentWriteEnvelope
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.Instant

@Serializable private data class BookingOptionDto(val doctorId: String, val locationId: String,
    val doctorName: String, val locationName: String, val clinicName: String, val startsAt: String)
@Serializable private data class BookingOptionsDto(val data: List<BookingOptionDto>, val durationMinutes: Int)
@Serializable private data class BookingIntentDto(val doctorId: String, val locationId: String,
    val startsAt: String, val reason: String)

internal class HttpPatientBookingRepository(private val requests: AuthenticatedRequestPort,
    private val session: SessionPort) : PatientBookingRepository {
    private val json = Json { ignoreUnknownKeys = false }
    override suspend fun options(): ApiResult<List<PatientBookingOption>> = execute(null, false,
        ApiRequest("GET", "/v1/me/appointments/options", RequestScope.SELF)) { payload ->
        require(payload.status == 200)
        val dto = json.decodeFromString<BookingOptionsDto>(payload.json)
        require(dto.durationMinutes == 30 && dto.data.size <= 200)
        dto.data.map { PatientBookingOption(it.doctorId, it.locationId, it.doctorName,
            it.locationName, it.clinicName, Instant.parse(it.startsAt)) }
    }

    override suspend fun create(intent: PatientBookingIntent, operation: OperationReceipt): ApiResult<AppointmentWrite> =
        execute(operation, true, ApiRequest("POST", "/v1/me/appointments", RequestScope.SELF,
            body = json.encodeToString(BookingIntentDto(intent.option.doctorId, intent.option.locationId,
                WireTime.format(intent.option.startsAt), intent.reason)),
            operationId = operation.operationId, operationCreatedAt = operation.createdAt)) { payload ->
            require(payload.status == 201)
            json.decodeFromString<AppointmentWriteEnvelope>(payload.json).data.domain(operation.operationId, null, payload.etag, null)
        }

    override suspend fun recover(operation: OperationReceipt): ApiResult<AppointmentWrite> =
        execute(operation, false, ApiRequest("GET", "/v1/me/appointment-operations/${operation.operationId}", RequestScope.SELF)) { payload ->
            require(payload.status == 200)
            json.decodeFromString<AppointmentWriteEnvelope>(payload.json).data.domain(operation.operationId, null, payload.etag, null)
        }

    private suspend fun <T> execute(operation: OperationReceipt?, mutation: Boolean, request: ApiRequest,
        decode: (ApiPayload) -> T): ApiResult<T> {
        val snapshot = session.snapshot(false) ?: return ApiResult.Failure("UNAUTHENTICATED", 401)
        if (session.state.value.selectedRole != AppRole.PATIENT) return ApiResult.Failure("FORBIDDEN", 403)
        try {
            operation?.let {
                it.validate()
                require(it.scope == "SELF" && it.workspaceId == null && it.ownerUserId == snapshot.userId)
            }
        } catch (_: IllegalArgumentException) { return ApiResult.Failure("INVALID_REQUEST", 400) }
        if (!session.matches(snapshot)) return ApiResult.StaleScope
        return try {
            // Bind dispatch to the same authenticated session checked above.
            val bound = ApiRequest(request.method, request.path, request.scope, request.body,
                operationId = request.operationId, operationCreatedAt = request.operationCreatedAt, expectedSession = snapshot)
            val result = when (val response = requests.execute(bound)) {
                is ApiResult.Success -> ApiResult.Success(decode(response.value))
                is ApiResult.Failure -> response
                ApiResult.OutcomeUnknown -> ApiResult.OutcomeUnknown
                ApiResult.StaleScope -> ApiResult.StaleScope
            }
            if (session.matches(snapshot)) result else ApiResult.StaleScope
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) {
            if (!session.matches(snapshot)) ApiResult.StaleScope
            else if (mutation) ApiResult.OutcomeUnknown else ApiResult.Failure("INVALID_RESPONSE")
        }
    }
}
