package com.viora.mobile.core.session

import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.model.VersionToken
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.ZoneId

data class User(val id: String, val displayName: String) {
    fun validate() { require(Ids.valid(id) && displayName.isNotBlank() && displayName.length <= 200) }
}
data class Membership(val id: String, val userId: String, val workspaceId: String, val name: String, val role: String, val active: Boolean) {
    fun validate(expectedUserId: String) {
        require(userId == expectedUserId && Ids.valid(id) && Ids.valid(userId) && Ids.valid(workspaceId))
        require(name.isNotBlank() && name.length <= 200)
        require(role.isNotBlank() && role.length <= 64)
    }
}
data class WorkspaceLocation(val id: String, val name: String, val status: String) {
    fun validate() {
        require(Ids.valid(id) && name.isNotBlank() && name.length <= 200)
        require(status in setOf("ACTIVE", "INACTIVE"))
    }
}

data class WorkspaceContext(
    val id: String,
    val name: String,
    val timezone: String,
    val permissionRevision: String,
    val permissions: Set<String>,
    val patientReadableFields: Set<String> = emptySet(),
    val patientWritableFields: Set<String> = emptySet(),
    val membershipId: String? = null,
    val role: String? = null,
    val blockedDecisionIds: Set<String> = emptySet(),
    val locations: List<WorkspaceLocation> = emptyList(),
) {
    fun validate() {
        require(Ids.valid(id) && VersionToken.valid(permissionRevision))
        require(name.isNotBlank() && name.length <= 200)
        ZoneId.of(timezone)
        require(permissions.size <= 128 && patientReadableFields.size <= 128 && patientWritableFields.size <= 128 && blockedDecisionIds.size <= 32)
        require((permissions + patientReadableFields + patientWritableFields + blockedDecisionIds).all { it.isNotBlank() && it.length <= 128 })
        require(patientReadableFields.containsAll(patientWritableFields))
        require(locations.size <= 200 && locations.map { it.id }.distinct().size == locations.size)
        locations.forEach { it.validate() }
        membershipId?.let { require(Ids.valid(it)) }
        role?.let { require(it.isNotBlank() && it.length <= 64 && it.all { c -> c.isLetterOrDigit() || c == '_' || c == '-' }) }
    }
    fun allows(permission: String): Boolean = permission in KNOWN_PERMISSIONS && permission in permissions
    companion object {
        private val KNOWN_PERMISSIONS = setOf(
            "patient.read", "patient.create", "patient.update", "doctor.read",
            "appointment.read", "appointment.create", "appointment.reschedule", "appointment.confirm",
            "appointment.cancel", "appointment.checkIn", "appointment.start", "appointment.complete", "appointment.noShow",
            "encounter.read", "encounter.create", "encounter.start", "encounter.complete", "encounter.cancel",
            "record.read", "record.create", "record.edit", "record.review", "record.finalize", "record.amend",
            "assistant.use", "draft.generate", "draft.read", "draft.review", "draft.edit", "draft.approve", "draft.reject",
        )
    }
}

class TokenBundle(
    val sessionId: String,
    val userId: String,
    val accessToken: String,
    val accessExpiresAt: Instant,
    val refreshToken: String,
    val refreshExpiresAt: Instant,
    val serverTime: Instant,
    val tokenType: String = "Bearer",
) {
    fun validate() {
        require(Ids.valid(sessionId) && Ids.valid(userId))
        require(tokenType == "Bearer")
        require(accessToken.isNotBlank() && refreshToken.isNotBlank())
        require(accessToken.length <= 4096 && refreshToken.length <= 4096)
        require(accessToken.none { it.isWhitespace() || it.isISOControl() })
        require(accessExpiresAt > serverTime && refreshExpiresAt > serverTime)
        require(accessExpiresAt <= serverTime.plusSeconds(600))
        require(refreshExpiresAt <= serverTime.plusSeconds(43200))
    }
    fun credential(): StoredCredential = StoredCredential(1, sessionId, userId, refreshToken, com.viora.mobile.core.time.WireTime.format(refreshExpiresAt))
    override fun toString(): String = "TokenBundle(REDACTED)"
}

@Serializable
data class StoredCredential(
    val schemaVersion: Int,
    val sessionId: String,
    val userId: String,
    val refreshToken: String,
    val refreshExpiresAt: String,
) {
    fun validate() {
        require(schemaVersion == 1 && Ids.valid(sessionId) && Ids.valid(userId))
        require(refreshToken.isNotBlank() && refreshToken.length <= 4096)
        Instant.parse(refreshExpiresAt)
    }
    override fun toString(): String = "StoredCredential(REDACTED)"
}

enum class SessionPhase { RESTORING, SIGNED_OUT, SELECT_WORKSPACE, VALIDATING_WORKSPACE, READY }
data class SessionState(
    val phase: SessionPhase = SessionPhase.RESTORING,
    val authEpoch: Long = 0,
    val contextEpoch: Long = 0,
    val user: User? = null,
    val memberships: List<Membership> = emptyList(),
    val workspace: WorkspaceContext? = null,
    val message: String? = null,
)
class SessionSnapshot(
    val authEpoch: Long,
    val contextEpoch: Long,
    val userId: String,
    val accessToken: String,
    val workspace: WorkspaceContext?,
    val tokenType: String = "Bearer",
) {
    init {
        require(Ids.valid(userId) && accessToken.isNotBlank() && tokenType == "Bearer")
    }
    override fun toString(): String = "SessionSnapshot(REDACTED)"
}

interface SessionAuthGateway {
    suspend fun signIn(): TokenBundle
    suspend fun refresh(credential: StoredCredential): TokenBundle
    suspend fun revoke(credential: StoredCredential)
    suspend fun user(accessToken: String): User
}
interface WorkspaceGateway {
    suspend fun memberships(accessToken: String): List<Membership>
    suspend fun validate(accessToken: String, workspaceId: String): WorkspaceContext
}

/** Stable application-facing session contract consumed by feature code. */
interface SessionPort {
    val state: kotlinx.coroutines.flow.StateFlow<SessionState>
    suspend fun restore()
    suspend fun signIn()
    suspend fun acceptTokenBundle(bundle: TokenBundle)
    suspend fun snapshot(requireWorkspace: Boolean = true): SessionSnapshot?
    suspend fun refresh(rejectedAccessToken: String? = null): TokenBundle?
    suspend fun selectWorkspace(id: String)
    suspend fun chooseWorkspace()
    suspend fun invalidateContext()
    suspend fun matches(snapshot: SessionSnapshot): Boolean
    suspend fun <T> withCurrent(snapshot: SessionSnapshot, block: suspend () -> T): T
    suspend fun logout()
}
