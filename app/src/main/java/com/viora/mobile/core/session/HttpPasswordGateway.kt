package com.viora.mobile.core.session

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.model.GatewayException
import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.network.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/** Passwords exist only in the caller and request body; persistence remains in SessionCoordinator. */
class HttpPasswordGateway(private val api: ApiClient) : SessionAuthGateway, PasswordAuthGateway, WorkspaceGateway {
    private val diagnostics get() = api.authDiagnostics
    private val access = ConcurrentHashMap<String, TokenBundle>()
    override suspend fun signIn(): TokenBundle = error("Email and password required")
    override suspend fun register(email: String, password: String, displayName: String) {
        val body = buildJsonObject { put("email", email); put("password", password); put("displayName", displayName) }
        val response = execute(ApiRequest("POST", "/v1/auth/register", RequestScope.PUBLIC, body.toString()))
        require(response.status == 201 && api.json.parseToJsonElement(response.json).jsonObject["data"]?.jsonObject?.get("registered")?.jsonPrimitive?.boolean == true)
    }
    override suspend fun login(email: String, password: String): TokenBundle = tokens(execute(ApiRequest(
        "POST", "/v1/auth/login", RequestScope.PUBLIC,
        buildJsonObject { put("email", email); put("password", password) }.toString())))

    override suspend fun refresh(credential: StoredCredential): TokenBundle = tokens(execute(ApiRequest(
        "POST", "/v1/auth/refresh", RequestScope.PUBLIC,
        buildJsonObject { put("refreshToken", credential.refreshToken) }.toString()))).also {
        require(it.sessionId == credential.sessionId && it.userId == credential.userId)
    }
    override suspend fun revoke(credential: StoredCredential) {
        val bundle = access[credential.sessionId] ?: refresh(credential)
        try { execute(ApiRequest("POST", "/v1/auth/revoke", RequestScope.SELF, "{}"), snapshot(bundle.accessToken)) }
        finally { access.remove(credential.sessionId) }
    }
    private suspend fun tokens(payload: ApiPayload): TokenBundle {
        val wire = diagnostics.validate(AuthStage.TOKEN_CONTRACT) { api.json.decodeFromString<TokenEnvelope>(payload.json).data }
        val identity = identity(wire.accessToken)
        return diagnostics.validate(AuthStage.TOKEN_CONTRACT) {
        val expires = Instant.parse(wire.accessExpiresAt)
        // SessionService issues a fixed ten-minute access lifetime. No device clock is trusted here.
        TokenBundle(identity.sessionId, identity.user.id, wire.accessToken, expires, wire.refreshToken,
            Instant.parse(wire.refreshExpiresAt), expires.minusSeconds(600)).also {
            it.validate(); access[it.sessionId] = it
        }
        }
    }
    private fun snapshot(token: String): SessionSnapshot {
        val parts = token.split('.')
        require(parts.size == 3 && parts[0] == "viora_access_v1" && Ids.valid(parts[1]))
        // SELF requests send only the bearer; this placeholder never becomes a user identity.
        return SessionSnapshot(0, 0, parts[1], token, null)
    }
    private suspend fun readIdentity(token: String, workspaceId: String? = null): ServerIdentity {
        val request = ApiRequest("GET", "/v1/me", if (workspaceId == null) RequestScope.SELF else RequestScope.WORKSPACE_VALIDATION, workspaceId = workspaceId)
        val snapshot = diagnostics.validate(AuthStage.TOKEN_CONTRACT) { snapshot(token) }
        val payload = execute(request, snapshot)
        return diagnostics.validate(AuthStage.IDENTITY_CONTRACT) {
        val wire = api.json.decodeFromString<IdentityEnvelope>(payload.json).data
        require(Ids.valid(wire.sessionId) && wire.sessionId == token.split('.')[1])
        val user = User(wire.user.id, wire.user.displayName).also { it.validate() }
        val memberships = diagnostics.validate(AuthStage.WORKSPACE) { wire.memberships.map {
            val role = serverRole(it.role); require(role != AppRole.PATIENT && it.active)
            Membership(it.id, it.userId, it.workspaceId, it.name, role.name, it.active).also { member -> member.validate(user.id) }
        } }
        require(memberships.map { it.id }.distinct().size == memberships.size && memberships.map { it.workspaceId }.distinct().size == memberships.size)
        val persona = diagnostics.validate(AuthStage.PERSONA) { wire.persona?.let(::serverRole) }
        val workspace = diagnostics.validate(AuthStage.WORKSPACE) { wire.workspace?.let {
            WorkspaceContext(it.id, it.name, it.timezone, it.permissionRevision, it.permissions.toSet(),
                membershipId = it.membershipId, role = serverRole(it.role).name).also { context ->
                context.validate()
                require(memberships.any { member -> member.id == context.membershipId && member.workspaceId == context.id && member.role == context.role })
            }
        } }
        diagnostics.validate(AuthStage.PERSONA) {
        when {
            wire.requiresWorkspaceSelection -> require(persona == null && workspace == null && memberships.size > 1 && workspaceId == null)
            persona == AppRole.PATIENT -> require(memberships.isEmpty() && workspace == null && workspaceId == null)
            else -> require(persona != null && workspace != null && AppRole.parse(workspace.role) == persona)
        }
        }
        if (workspaceId != null) require(workspace?.id == workspaceId)
        ServerIdentity(user, wire.sessionId, persona, memberships, workspace, wire.requiresWorkspaceSelection)
        }
    }
    override suspend fun identity(accessToken: String) = readIdentity(accessToken)
    override suspend fun user(accessToken: String) = identity(accessToken).user
    override suspend fun memberships(accessToken: String) = identity(accessToken).memberships
    override suspend fun validate(accessToken: String, workspaceId: String) = requireNotNull(readIdentity(accessToken, workspaceId).workspace)
    private suspend fun execute(request: ApiRequest, snapshot: SessionSnapshot? = null): ApiPayload = when (val result = api.execute(request, snapshot)) {
        is ApiResult.Success -> result.value
        is ApiResult.Failure -> throw GatewayException(result.code)
        else -> throw GatewayException("AUTH_UNAVAILABLE")
    }
}

@Serializable private data class TokenEnvelope(val data: PasswordTokens)
@Serializable private data class PasswordTokens(val accessToken: String, val refreshToken: String, val accessExpiresAt: String, val refreshExpiresAt: String)
@Serializable private data class IdentityEnvelope(val data: IdentityWire)
@Serializable private data class UserWire(val id: String, val displayName: String)
@Serializable private data class MembershipWire(val id: String, val userId: String, val workspaceId: String, val name: String, val role: String, val active: Boolean)
@Serializable private data class WorkspaceWire(val id: String, val name: String, val timezone: String, val membershipId: String, val role: String, val permissionRevision: String, val permissions: List<String>)
@Serializable private data class IdentityWire(val user: UserWire, val sessionId: String, val persona: String?, val memberships: List<MembershipWire>, val workspace: WorkspaceWire?, val requiresWorkspaceSelection: Boolean)
