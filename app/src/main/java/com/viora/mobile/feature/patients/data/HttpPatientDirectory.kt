package com.viora.mobile.feature.patients.data

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.network.*
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.patients.data.dto.*
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.net.URLEncoder

fun patientDirectory(requests: AuthenticatedRequestPort, session: SessionPort, decodeDispatcher: CoroutineDispatcher = Dispatchers.Default): PatientDirectory =
    HttpPatientDirectory(requests, session, decodeDispatcher)

internal class HttpPatientDirectory(private val requests: AuthenticatedRequestPort, private val session: SessionPort, private val decodeDispatcher: CoroutineDispatcher) : PatientDirectory {
    private val json = Json { ignoreUnknownKeys = true }
    override suspend fun search(query: PatientSearch): ApiResult<DirectoryPage<Patient>> {
        val path = "/v1/patients?q=${encode(query.query)}&limit=${query.page.limit}" +
            (query.page.cursor?.let { "&cursor=${encode(it)}" } ?: "")
        return read(path) { payload, context ->
            val dto = json.decodeFromString<PatientListDto>(payload.json)
            require(dto.page.hasMore == (dto.page.nextCursor != null))
            require(dto.data.size <= query.page.limit && dto.data.map { it.id }.distinct().size == dto.data.size)
            DirectoryPage(dto.data.map { it.domain(context.id, context.patientReadableFields) }, dto.page.nextCursor)
        }
    }
    override suspend fun patient(id: String): ApiResult<Patient> {
        if (!Ids.valid(id)) return ApiResult.Failure("INVALID_REQUEST", 400)
        return read("/v1/patients/$id") { payload, context ->
            val dto = json.decodeFromString<PatientReadDto>(payload.json).data
            require(dto.id == id && dto.versionToken == payload.etag)
            dto.domain(context.id, context.patientReadableFields)
        }
    }
    private suspend fun <T> read(path: String, decode: (ApiPayload, WorkspaceContext) -> T): ApiResult<T> {
        val snapshot = session.snapshot() ?: return ApiResult.Failure("UNAUTHENTICATED", 401)
        val context = requireNotNull(snapshot.workspace)
        if (!context.allows("patient.read")) return ApiResult.Failure("FORBIDDEN", 403)
        return try {
            val result = requests.execute(ApiRequest("GET", path, RequestScope.WORKSPACE, workspaceId = context.id))
            val mapped = when (result) {
                is ApiResult.Success -> withContext(decodeDispatcher) { ApiResult.Success(decode(result.value, context)) }
                is ApiResult.Failure -> result
                ApiResult.OutcomeUnknown -> ApiResult.Failure("INVALID_RESPONSE")
                ApiResult.StaleScope -> ApiResult.StaleScope
            }
            if (session.matches(snapshot)) mapped else ApiResult.StaleScope
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { if (session.matches(snapshot)) ApiResult.Failure("INVALID_RESPONSE") else ApiResult.StaleScope }
    }
    private fun encode(value: String) = URLEncoder.encode(value, "UTF-8")
}
