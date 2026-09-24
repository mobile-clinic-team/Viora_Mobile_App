package com.viora.mobile.core.network

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.model.VersionToken
import com.viora.mobile.core.session.SessionSnapshot
import com.viora.mobile.core.session.AuthDiagnostics
import com.viora.mobile.core.session.AuthStage
import com.viora.mobile.core.session.AuthReason
import com.viora.mobile.core.time.AppClock
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.math.max

enum class RequestScope { PUBLIC, SELF, WORKSPACE_VALIDATION, WORKSPACE }
class ApiRequest(
    val method: String, val path: String, val scope: RequestScope,
    val body: String? = null, val ifMatch: String? = null,
    val operationId: String? = null, val operationCreatedAt: String? = null,
    val ai: Boolean = false, val workspaceId: String? = null,
    val assuranceToken: String? = null, val expectedSession: SessionSnapshot? = null,
) {
    val mutation: Boolean get() = method != "GET"
    val operationClose: Boolean get() = method == "POST" && path.matches(Regex("/v1/operations/[0-9a-fA-F-]{36}/close"))
    override fun toString(): String = "ApiRequest(REDACTED)"
}
class ApiPayload(
    val json: String,
    val etag: String?,
    val requestId: String?,
    val status: Int,
    val correlationId: String? = null,
) {
    override fun toString(): String = "ApiPayload(REDACTED)"
}
@Serializable private data class ErrorEnvelope(val error: WireError)
@Serializable private data class WireError(val code: String, val message: String, val details: ErrorDetails?, val requestId: String, val correlationId: String)
@Serializable private data class ErrorDetails(val fields: List<FieldError>, val decisionIds: List<String>)
@Serializable private data class FieldError(val path: String, val code: String)

class ApiClient(
    origin: String,
    private val clock: AppClock,
    private val networkEnabled: Boolean = true,
    allowTestLoopback: Boolean = false,
    connectTimeoutMillis: Long = 10_000,
    callTimeoutMillis: Long = 30_000,
    val authDiagnostics: AuthDiagnostics = AuthDiagnostics(),
) {
    private val base = origin.toHttpUrl().also {
        require(it.encodedPath == "/" && it.query == null && it.fragment == null && it.username.isEmpty() && it.password.isEmpty())
        require(it.isHttps || allowTestLoopback && it.host in setOf("localhost", "127.0.0.1", "::1"))
    }
    private val http = OkHttpClient.Builder().retryOnConnectionFailure(false).followRedirects(false)
        .followSslRedirects(false).connectTimeout(connectTimeoutMillis, TimeUnit.MILLISECONDS)
        .callTimeout(callTimeoutMillis, TimeUnit.MILLISECONDS)
        .cache(null).build()
    val json = Json { ignoreUnknownKeys = true; explicitNulls = true; encodeDefaults = true; isLenient = false }

    suspend fun execute(request: ApiRequest, snapshot: SessionSnapshot? = null): ApiResult<ApiPayload> {
        if (!networkEnabled) return ApiResult.Failure("FEATURE_UNAVAILABLE")
        validate(request, snapshot)
        repeat(2) { attempt ->
            val result = call(request, snapshot)
            val retryable = result.first is ApiResult.Failure && (result.first as ApiResult.Failure).let {
                it.code == "TRANSPORT_ERROR" || it.status in setOf(429, 502, 503, 504)
            }
            if (request.mutation || !retryable || attempt == 1) return result.first
            val wait = retryDelayMillis(result.second, clock)
            if (wait > 30000L) return result.first
            delay(wait)
        }
        error("Unreachable")
    }
    private fun validate(request: ApiRequest, snapshot: SessionSnapshot?) {
        require(request.method in setOf("GET", "POST", "PATCH"))
        require(request.path.startsWith("/v1/") && !request.path.contains("..") && !request.path.contains('#'))
        require(request.path.none { it.isISOControl() || it == '\\' })
        require((request.body?.toByteArray(Charsets.UTF_8)?.size ?: 0) <= 262144)
        require(request.method != "GET" || request.body == null)
        if (request.scope != RequestScope.PUBLIC) require(snapshot != null)
        request.expectedSession?.let { expected ->
            require(snapshot != null && com.viora.mobile.core.session.sameAssuranceSession(expected, snapshot))
        }
        when (request.scope) {
            RequestScope.PUBLIC, RequestScope.SELF -> require(request.workspaceId == null)
            RequestScope.WORKSPACE_VALIDATION -> {
                require(request.method == "GET")
                require(request.workspaceId?.let(Ids::valid) == true)
                require(snapshot != null)
                require(snapshot.workspace == null || snapshot.workspace.id == request.workspaceId)
            }
            RequestScope.WORKSPACE -> {
                require(snapshot?.workspace != null)
                require(request.workspaceId == null || request.workspaceId == snapshot.workspace.id)
            }
        }
        request.ifMatch?.let { require(VersionToken.valid(it)) }
        request.assuranceToken?.let {
            require(it.isNotBlank() && it.length <= 4096 && it.all { c -> c.code in 33..126 })
            require(request.scope == RequestScope.WORKSPACE && request.expectedSession != null && request.ifMatch != null)
            require(request.method == "POST" && request.path.matches(Regex("/v1/ai/drafts/[0-9a-fA-F-]{36}/approve")))
        }
        if (request.mutation && request.scope == RequestScope.WORKSPACE) {
            if (request.operationClose) {
                require(Ids.valid(request.path.split('/')[3]) && request.operationId == null && request.body == "{}")
                require(request.ifMatch == null && request.assuranceToken == null)
            } else require(request.operationId != null && Ids.valid(request.operationId))
            require(request.operationCreatedAt != null)
            com.viora.mobile.core.time.WireTime.parse(request.operationCreatedAt)
        }
    }
    private suspend fun call(request: ApiRequest, snapshot: SessionSnapshot?): Pair<ApiResult<ApiPayload>, String?> {
        val authStage = when (request.path) {
            "/v1/auth/register" -> AuthStage.REGISTER_HTTP
            "/v1/auth/login" -> AuthStage.LOGIN_HTTP
            "/v1/auth/refresh" -> AuthStage.REFRESH_HTTP
            "/v1/me" -> AuthStage.IDENTITY_HTTP
            else -> null
        }
        val requestId = Ids.newId()
        val correlationId = Ids.newId()
        val builder = Request.Builder().url(base.newBuilder().encodedPath(request.path.substringBefore('?'))
            .encodedQuery(request.path.substringAfter('?', "").ifEmpty { null }).build())
            .header("Accept", "application/json").header("X-Request-ID", requestId).header("X-Correlation-ID", correlationId)
        if (request.scope != RequestScope.PUBLIC) builder.header("Authorization", snapshot!!.tokenType + " " + snapshot.accessToken)
        if (request.scope == RequestScope.WORKSPACE_VALIDATION || request.scope == RequestScope.WORKSPACE) {
            val workspaceId = request.workspaceId ?: snapshot!!.workspace!!.id
            builder.header("X-Workspace-ID", workspaceId)
            if (request.scope == RequestScope.WORKSPACE) {
                builder.header("X-Permission-Revision", snapshot!!.workspace!!.permissionRevision)
            }
        }
        request.ifMatch?.let { builder.header("If-Match", it) }
        request.assuranceToken?.let { builder.header("X-Assurance-Token", it) }
        request.operationId?.let { builder.header("Idempotency-Key", it) }
        request.operationCreatedAt?.let { builder.header("X-Operation-Created-At", it) }
        if (request.mutation) builder.header("Content-Type", "application/json")
        builder.method(request.method, if (request.mutation) (request.body ?: "{}").toRequestBody("application/json".toMediaType()) else null)
        val client = if (request.ai) http.newBuilder().callTimeout(75, TimeUnit.SECONDS).build() else http
        return suspendCancellableCoroutine { continuation ->
            val call = client.newCall(builder.build())
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    authStage?.let { authDiagnostics.report(it, if (e is javax.net.ssl.SSLException) AuthReason.TLS_FAILURE else AuthReason.TRANSPORT_FAILURE) }
                    if (continuation.isActive) continuation.resume(
                        (if (request.mutation) ApiResult.OutcomeUnknown else ApiResult.Failure(
                            if (e is javax.net.ssl.SSLException) "TLS_ERROR" else "TRANSPORT_ERROR")) to null)
                }
                override fun onResponse(call: Call, response: Response) {
                    authStage?.let { authDiagnostics.report(it, if (response.isSuccessful) AuthReason.OK else AuthReason.HTTP_FAILURE,
                        response.code, response.header("X-Request-ID")) }
                    val result = response.use {
                        try {
                            val source = response.body?.source()
                            if (source?.request(1048577) == true) throw IOException("Response limit exceeded")
                            val body = source?.readUtf8().orEmpty()
                            val id = response.header("X-Request-ID")?.takeIf(Ids::valid)
                            val mapped: ApiResult<ApiPayload> = when {
                                response.isSuccessful && response.code != 202 -> {
                                    if (response.code != 204 || request.scope == RequestScope.WORKSPACE) {
                                        val envelope = json.decodeFromString<JsonObject>(body)
                                        require("data" in envelope)
                                        val data = envelope["data"]
                                        if (data is JsonObject && "versionToken" in data) {
                                            val version = requireNotNull(data["versionToken"]?.jsonPrimitive?.contentOrNull)
                                            require(VersionToken.valid(version) && version == response.header("ETag"))
                                        }
                                        if (request.mutation && request.scope == RequestScope.WORKSPACE && !request.operationClose) {
                                            require(data is JsonObject)
                                            require(data["operationId"]?.jsonPrimitive?.contentOrNull == request.operationId)
                                            require(data["state"]?.jsonPrimitive?.contentOrNull == "SUCCEEDED")
                                            require(data["primary"] is JsonObject && "related" in data && "handoff" in data)
                                        }
                                    }
                                    ApiResult.Success(ApiPayload(body, response.header("ETag"), id, response.code,
                                        response.header("X-Correlation-ID")?.takeIf(Ids::valid)))
                                }
                                response.code == 202 -> if (request.mutation) ApiResult.OutcomeUnknown else ApiResult.Failure("INVALID_RESPONSE")
                                else -> {
                                    val code = runCatching { json.decodeFromString<ErrorEnvelope>(body).error.code }
                                        .getOrNull()?.takeIf { it.matches(Regex("[A-Z_]{1,64}")) } ?: "HTTP_ERROR"
                                    if (request.mutation && response.code >= 500) ApiResult.OutcomeUnknown
                                    else ApiResult.Failure(code, response.code, id,
                                        response.header("X-Correlation-ID")?.takeIf(Ids::valid))
                                }
                            }
                            mapped to response.header("Retry-After")
                        } catch (_: Exception) {
                            authStage?.let { authDiagnostics.report(it, AuthReason.INVALID_RESPONSE, response.code, response.header("X-Request-ID")) }
                            (if (request.mutation) ApiResult.OutcomeUnknown else ApiResult.Failure("INVALID_RESPONSE")) to null
                        }
                    }
                    if (continuation.isActive) continuation.resume(result)
                }
            })
        }
    }
    companion object {
        fun retryDelayMillis(value: String?, clock: AppClock): Long {
            if (value == null) return 1000
            value.toLongOrNull()?.let { return if (it < 0) 1000 else it.coerceAtMost(Long.MAX_VALUE / 1000) * 1000 }
            return try { max(0, java.time.Duration.between(clock.now(),
                ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()).toMillis()) } catch (_: Exception) { 1000 }
        }
    }
}
