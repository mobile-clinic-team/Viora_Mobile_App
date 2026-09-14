package com.viora.mobile.feature.clinical.data

import com.viora.mobile.core.model.*
import com.viora.mobile.core.network.*
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.clinical.data.dto.*
import com.viora.mobile.feature.clinical.domain.*
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.*
import kotlinx.serialization.json.Json
import java.net.URLEncoder

fun clinicalReadRepository(requests: AuthenticatedRequestPort, session: SessionPort,
    dispatcher: CoroutineDispatcher = Dispatchers.Default): ClinicalReadRepository = HttpClinicalReadRepository(requests, session, dispatcher)

internal class HttpClinicalReadRepository(private val requests: AuthenticatedRequestPort, private val session: SessionPort,
    private val dispatcher: CoroutineDispatcher) : ClinicalReadRepository {
    private val json = Json { ignoreUnknownKeys = true }
    override suspend fun encounter(id: String): ApiResult<Encounter> {
        if (!Ids.valid(id)) return ApiResult.Failure("INVALID_REQUEST", 400)
        return read("/v1/encounters/" + id, "encounter.read") { payload, workspace ->
            val dto = json.decodeFromString<EncounterReadDto>(payload.json).data
            require(dto.id == id && dto.versionToken == payload.etag)
            dto.domain(workspace)
        }
    }
    override suspend fun record(id: String): ApiResult<ClinicalRecord> {
        if (!Ids.valid(id)) return ApiResult.Failure("INVALID_REQUEST", 400)
        return read("/v1/records/" + id, "record.read") { payload, workspace ->
            val dto = json.decodeFromString<RecordReadDto>(payload.json).data
            require(dto.id == id && dto.versionToken == payload.etag)
            dto.domain(workspace)
        }
    }
    override suspend fun encounters(patient: PatientReference, page: PageRequest): ApiResult<DirectoryPage<Encounter>> {
        val path = "/v1/patients/" + patient.patientId + "/encounters?limit=" + page.limit +
            (page.cursor?.let { "&cursor=" + URLEncoder.encode(it, "UTF-8") } ?: "")
        return read(path, "encounter.read", patient.workspaceId) { payload, workspace ->
            val dto = json.decodeFromString<EncountersDto>(payload.json)
            require(dto.page.hasMore == (dto.page.nextCursor != null))
            require(dto.data.size <= page.limit && dto.data.map { it.id }.distinct().size == dto.data.size)
            DirectoryPage(dto.data.map { require(it.patientId == patient.patientId); it.domain(workspace) }, dto.page.nextCursor)
        }
    }
    private suspend fun <T> read(path: String, permission: String, expectedWorkspace: String? = null,
        decode: (ApiPayload, String) -> T): ApiResult<T> {
        val snapshot = session.snapshot() ?: return ApiResult.Failure("UNAUTHENTICATED", 401)
        val workspace = snapshot.workspace ?: return ApiResult.StaleScope
        if (expectedWorkspace != null && expectedWorkspace != workspace.id) return ApiResult.StaleScope
        if (!workspace.allows(permission)) return ApiResult.Failure("FORBIDDEN", 403)
        return try {
            val result = requests.execute(ApiRequest("GET", path, RequestScope.WORKSPACE, workspaceId = workspace.id))
            val mapped = when (result) {
                is ApiResult.Success -> withContext(dispatcher) { ApiResult.Success(decode(result.value, workspace.id)) }
                is ApiResult.Failure -> result
                ApiResult.StaleScope -> ApiResult.StaleScope
                ApiResult.OutcomeUnknown -> ApiResult.Failure("INVALID_RESPONSE")
            }
            if (session.matches(snapshot)) mapped else ApiResult.StaleScope
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { if (session.matches(snapshot)) ApiResult.Failure("INVALID_RESPONSE") else ApiResult.StaleScope }
    }
}
