package com.viora.mobile.feature.appointments.data

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.network.ApiRequest
import com.viora.mobile.core.network.RequestScope
import com.viora.mobile.core.session.AuthenticatedRequestPort
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.feature.appointments.domain.PatientSelfAppointment
import com.viora.mobile.feature.appointments.domain.PatientSelfAppointmentPage
import com.viora.mobile.feature.appointments.domain.PatientSelfAppointmentRepository
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.URLEncoder
import java.time.Instant

@Serializable private data class SelfAppointmentDto(val id: String, val clinicName: String, val doctorName: String,
    val locationName: String, val startsAt: String, val endsAt: String, val status: String, val reason: String)
@Serializable private data class SelfPageDto(val hasMore: Boolean, val nextCursor: String?)
@Serializable private data class SelfListDto(val data: List<SelfAppointmentDto>, val page: SelfPageDto)

internal class HttpPatientSelfAppointmentRepository(private val requests: AuthenticatedRequestPort,
    private val session: SessionPort) : PatientSelfAppointmentRepository {
    private val json = Json { ignoreUnknownKeys = false }
    override suspend fun list(cursor: String?): ApiResult<PatientSelfAppointmentPage> {
        val snapshot = session.snapshot(false) ?: return ApiResult.Failure("UNAUTHENTICATED", 401)
        if (session.state.value.selectedRole != com.viora.mobile.core.session.AppRole.PATIENT)
            return ApiResult.Failure("FORBIDDEN", 403)
        val path = "/v1/me/appointments?limit=20" + (cursor?.let { "&cursor=${URLEncoder.encode(it, "UTF-8")}" } ?: "")
        return try {
            val response = requests.execute(ApiRequest("GET", path, RequestScope.SELF))
            val mapped = when (response) {
                is ApiResult.Success -> {
                    val dto = json.decodeFromString<SelfListDto>(response.value.json)
                    require(dto.data.size <= 20 && dto.page.hasMore == (dto.page.nextCursor != null))
                    require(dto.data.map { it.id }.distinct().size == dto.data.size)
                    ApiResult.Success(PatientSelfAppointmentPage(dto.data.map {
                        PatientSelfAppointment(it.id, it.clinicName, it.doctorName, it.locationName,
                            Instant.parse(it.startsAt), Instant.parse(it.endsAt), it.status, it.reason)
                    }, dto.page.nextCursor))
                }
                is ApiResult.Failure -> response
                ApiResult.StaleScope -> ApiResult.StaleScope
                ApiResult.OutcomeUnknown -> ApiResult.Failure("INVALID_RESPONSE")
            }
            if (session.matches(snapshot)) mapped else ApiResult.StaleScope
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { if (session.matches(snapshot)) ApiResult.Failure("INVALID_RESPONSE") else ApiResult.StaleScope }
    }
}
