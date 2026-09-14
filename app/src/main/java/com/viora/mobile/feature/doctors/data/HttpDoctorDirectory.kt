package com.viora.mobile.feature.doctors.data

import com.viora.mobile.core.model.*
import com.viora.mobile.core.network.*
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.WireTime
import com.viora.mobile.feature.doctors.domain.*
import com.viora.mobile.feature.doctors.data.dto.*
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.*
import kotlinx.serialization.json.Json
import java.net.URLEncoder
import java.time.Instant

fun doctorDirectory(requests: AuthenticatedRequestPort, session: SessionPort, decodeDispatcher: CoroutineDispatcher = Dispatchers.Default): DoctorDirectory = HttpDoctorDirectory(requests, session, decodeDispatcher)

internal class HttpDoctorDirectory(private val requests: AuthenticatedRequestPort, private val session: SessionPort, private val decodeDispatcher: CoroutineDispatcher) : DoctorDirectory {
    private val json = Json { ignoreUnknownKeys = true }
    override suspend fun doctors(query: DoctorQuery): ApiResult<DirectoryPage<Doctor>> = read(
        "/v1/doctors" + query(listOf("q" to query.query, "locationId" to query.locationId, "status" to query.status,
            "limit" to query.page.limit.toString(), "cursor" to query.page.cursor))) { payload, workspace ->
        val dto = json.decodeFromString<DoctorListDto>(payload.json)
        require(dto.page.hasMore == (dto.page.nextCursor != null) && dto.data.size <= query.page.limit)
        require(dto.data.map { it.id }.distinct().size == dto.data.size)
        DirectoryPage(dto.data.map { it.domain(workspace) }, dto.page.nextCursor)
    }
    override suspend fun doctor(id: String): ApiResult<Doctor> {
        if (!Ids.valid(id)) return ApiResult.Failure("INVALID_REQUEST", 400)
        return read("/v1/doctors/$id") { payload, workspace ->
            json.decodeFromString<DoctorReadDto>(payload.json).data.also { require(it.id == id) }.domain(workspace)
        }
    }
    override suspend fun shifts(id: String, from: Instant, to: Instant, locationId: String?, page: PageRequest): ApiResult<DirectoryPage<Shift>> {
        if (!Ids.valid(id) || from >= to || to > from.plusSeconds(7 * 86400) || locationId != null && !Ids.valid(locationId))
            return ApiResult.Failure("INVALID_QUERY", 400)
        return read("/v1/doctors/$id/shifts" + query(listOf("from" to WireTime.format(from), "to" to WireTime.format(to),
            "locationId" to locationId, "limit" to page.limit.toString(), "cursor" to page.cursor))) { payload, workspace ->
            val dto = json.decodeFromString<ShiftListDto>(payload.json)
            require(dto.page.hasMore == (dto.page.nextCursor != null) && dto.data.size <= page.limit)
            require(dto.data.map { it.id }.distinct().size == dto.data.size)
            DirectoryPage(dto.data.map { it.domain(workspace, id).also { value -> require(locationId == null || value.locationId == locationId) } }, dto.page.nextCursor)
        }
    }
    private suspend fun <T> read(path: String, decode: (ApiPayload, String) -> T): ApiResult<T> {
        val snapshot = session.snapshot() ?: return ApiResult.Failure("UNAUTHENTICATED", 401)
        val context = requireNotNull(snapshot.workspace)
        if (!context.allows("doctor.read")) return ApiResult.Failure("FORBIDDEN", 403)
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
    private fun query(values: List<Pair<String, String?>>) = values.filter { it.second != null }
        .joinToString("&", prefix = "?") { "${it.first}=${URLEncoder.encode(it.second, "UTF-8")}" }
}
