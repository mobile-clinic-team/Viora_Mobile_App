package com.viora.mobile.core.session

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.network.*
import com.viora.mobile.core.time.WireTime
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

/** A01/A02 SELF transport. It cannot perform LOGIN or replace the access/refresh token bundle. */
class HttpStepUpGateway(private val requests: AuthenticatedRequestPort) : StepUpGateway {
    private val json = Json { ignoreUnknownKeys = true }
    override suspend fun begin(request: AuthStartRequest, session: SessionSnapshot): AuthTransaction {
        request.validate(); require(request.purpose == AuthPurpose.STEP_UP)
        val b = requireNotNull(request.challenge)
        val body = buildJsonObject {
            put("purpose", "STEP_UP"); put("codeChallenge", request.codeChallenge)
            putJsonObject("challenge") {
                put("action", b.action); put("workspaceId", b.workspaceId); put("resourceId", b.resourceId)
                put("versionToken", b.versionToken); put("targetVersionToken", b.targetVersionToken)
            }
        }
        val payload = send("/v1/auth/transactions", body.toString(), session, 201)
        val dto = json.decodeFromJsonElement<TransactionDto>(json.parseToJsonElement(payload.json).jsonObject.getValue("data"))
        return AuthTransaction(dto.transactionId, dto.state, WireTime.parse(dto.expiresAt), dto.authorizationUrl, dto.redirectUri)
    }
    override suspend fun exchange(pending: PendingAuthTransaction, callback: AuthCallback.Success, session: SessionSnapshot): AssuranceGrant {
        val body = buildJsonObject {
            put("transactionId", pending.transaction.transactionId); put("code", callback.code)
            put("state", callback.state); put("codeVerifier", pending.codeVerifier)
        }
        val payload = send("/v1/auth/session", body.toString(), session, 200)
        val dto = json.decodeFromJsonElement<GrantDto>(json.parseToJsonElement(payload.json).jsonObject.getValue("data"))
        return AssuranceGrant(dto.assuranceToken, WireTime.parse(dto.expiresAt), dto.binding.let {
            AssuranceBinding(it.action, it.workspaceId, it.resourceId, it.versionToken, it.targetVersionToken)
        })
    }
    private suspend fun send(path: String, body: String, snapshot: SessionSnapshot, status: Int): ApiPayload {
        val result = requests.execute(ApiRequest("POST", path, RequestScope.SELF, body, expectedSession = snapshot))
        if (result !is ApiResult.Success) throw AuthCallbackException((result as? ApiResult.Failure)?.code ?: "STEP_UP_UNVERIFIED")
        require(result.value.status == status)
        return result.value
    }
    @Serializable private class TransactionDto(val transactionId: String, val state: String, val expiresAt: String, val authorizationUrl: String, val redirectUri: String)
    @Serializable private class BindingDto(val action: String, val workspaceId: String, val resourceId: String, val versionToken: String, val targetVersionToken: String?)
    @Serializable private class GrantDto(val assuranceToken: String, val expiresAt: String, val binding: BindingDto)
}
