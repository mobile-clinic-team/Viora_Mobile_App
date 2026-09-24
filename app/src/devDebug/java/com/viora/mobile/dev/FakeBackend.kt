package com.viora.mobile.dev

import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.AppClock
import java.time.Instant
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

internal object SyntheticIdentity {
    const val USER_ID = "11111111-1111-4111-8111-111111111111"
    const val WORKSPACE_A = "22222222-2222-4222-8222-222222222222"
    const val WORKSPACE_B = "33333333-3333-4333-8333-333333333333"
    const val LOCATION_A = "61111111-1111-4111-8111-111111111111"
    const val LOCATION_B = "62222222-2222-4222-8222-222222222222"
}

/** Local fixture policy only. Credentials and signing material never enter other variants. */
class FakeBackend(private val clock: AppClock) : SessionAuthGateway, WorkspaceGateway, LocalCredentialGateway {
    private data class Identity(val account: DemoAccount, val user: User, val role: AppRole)
    private val identities = AppRole.entries.mapIndexed { index, role ->
        Identity(DemoAccount("${role.label} demo", "${role.name.lowercase()}@viora.demo", "VioraDemo1!"),
            User(if (role == AppRole.DOCTOR) SyntheticIdentity.USER_ID else "71111111-1111-4111-8111-11111111111$index",
                if (role == AppRole.PATIENT) "Alex Morgan" else "Demo ${role.label}"), role)
    }
    override val demoAccounts get() = identities.map { it.account }
    private val revoked = mutableSetOf<String>()
    private val access = mutableMapOf<String, Pair<String, Instant>>()
    override suspend fun signIn(): TokenBundle = error("Credentials required")
    override suspend fun authenticate(email: String, password: String): TokenBundle {
        val identity = identities.singleOrNull { it.account.email.equals(email.trim(), true) && it.account.password == password }
            ?: error("Invalid credentials")
        return issue(identity.user.id, Ids.newId(), clock.now().plusSeconds(43200).truncatedTo(java.time.temporal.ChronoUnit.MILLIS))
    }
    override suspend fun refresh(credential: StoredCredential): TokenBundle {
        credential.validate()
        require(credential.sessionId !in revoked && identities.any { it.user.id == credential.userId })
        val parts = credential.refreshToken.split('.')
        require(parts.size == 2)
        require(java.security.MessageDigest.isEqual(signature(parts[0]).toByteArray(), parts[1].toByteArray()))
        val payload = String(Base64.getUrlDecoder().decode(parts[0])).split('|')
        require(payload.size == 4 && payload[0] == credential.userId && payload[1] == credential.sessionId && payload[2] == credential.refreshExpiresAt)
        val expiry = Instant.parse(credential.refreshExpiresAt)
        require(expiry > clock.now())
        return issue(credential.userId, credential.sessionId, expiry)
    }
    private fun signature(payload: String): String = Base64.getUrlEncoder().withoutPadding().encodeToString(
        Mac.getInstance("HmacSHA256").apply {
            init(SecretKeySpec("viora-devDebug-local-fixtures-only-v1".toByteArray(), "HmacSHA256"))
        }.doFinal(payload.toByteArray()))
    private fun issue(userId: String, sessionId: String, expiry: Instant): TokenBundle {
        val accessToken = "local-access-${Ids.newId()}"
        val accessExpiry = minOf(clock.now().plusSeconds(600), expiry)
        access[accessToken] = userId to accessExpiry
        val payload = Base64.getUrlEncoder().withoutPadding().encodeToString(
            "$userId|$sessionId|${com.viora.mobile.core.time.WireTime.format(expiry)}|${Ids.newId()}".toByteArray())
        return TokenBundle(sessionId, userId, accessToken, accessExpiry, "$payload.${signature(payload)}", expiry, clock.now())
    }
    override suspend fun revoke(credential: StoredCredential) { revoked += credential.sessionId }
    override suspend fun user(accessToken: String): User {
        val (userId, expiry) = access[accessToken] ?: error("Unknown access token")
        require(expiry > clock.now())
        return identities.single { it.user.id == userId }.user
    }
    override suspend fun memberships(accessToken: String): List<Membership> {
        val authenticated = user(accessToken)
        val identity = identities.single { it.user == authenticated }
        val workspaceIds = if (identity.role == AppRole.PATIENT) listOf(SyntheticIdentity.WORKSPACE_A)
            else listOf(SyntheticIdentity.WORKSPACE_A, SyntheticIdentity.WORKSPACE_B)
        return workspaceIds.map { workspaceId ->
            val membershipId = if (workspaceId == SyntheticIdentity.WORKSPACE_A)
                "44444444-4444-4444-8444-444444444444" else "55555555-5555-4555-8555-555555555555"
            Membership(membershipId, identity.user.id, workspaceId,
                when {
                    identity.role == AppRole.PATIENT -> "Personal care"
                    identity.role == AppRole.ADMIN -> "Local administration"
                    workspaceId == SyntheticIdentity.WORKSPACE_A -> "Willow Clinic · Demo"
                    else -> "Harbor Clinic · Demo"
                }, identity.role.name, true)
        }
    }
    override suspend fun validate(accessToken: String, workspaceId: String): WorkspaceContext {
        val membership = memberships(accessToken).single { it.active && it.workspaceId == workspaceId }
        val role = requireNotNull(AppRole.parse(membership.role))
        val grants = when (role) {
            AppRole.PATIENT -> setOf("patient.self")
            AppRole.DOCTOR -> setOf("patient.read", "doctor.read", "appointment.read", "appointment.create", "appointment.reschedule",
                "appointment.confirm", "appointment.cancel", "appointment.checkIn", "appointment.noShow", "appointment.start",
                "appointment.complete", "encounter.read", "encounter.create", "record.read", "assistant.use", "draft.generate",
                "draft.read", "draft.review", "draft.edit", "draft.approve", "draft.reject", "record.edit")
            AppRole.NURSE -> setOf("patient.read", "doctor.read", "appointment.read", "encounter.read", "record.read")
            AppRole.ADMIN -> setOf("admin.users.read", "admin.workspaces.read", "admin.roles.read", "admin.audit.read")
            AppRole.RECEPTIONIST -> emptySet()
        }.let { if (workspaceId == SyntheticIdentity.WORKSPACE_A || role in setOf(AppRole.PATIENT, AppRole.ADMIN)) it
            else it - setOf("appointment.create", "appointment.reschedule", "appointment.confirm", "appointment.cancel",
                "appointment.checkIn", "appointment.noShow", "appointment.start", "appointment.complete", "encounter.read",
                "encounter.create", "record.read", "record.edit", "assistant.use", "draft.generate", "draft.read",
                "draft.review", "draft.edit", "draft.approve", "draft.reject") }
        return WorkspaceContext(workspaceId, membership.name, "Asia/Ho_Chi_Minh", "\"rbac-demo-1\"", grants,
            patientReadableFields = if (role in setOf(AppRole.DOCTOR, AppRole.NURSE))
                setOf("dateOfBirth", "sex", "phone", "email", "address", "emergencyContact", "status") else emptySet(),
            membershipId = membership.id, role = membership.role,
            locations = if (role in setOf(AppRole.DOCTOR, AppRole.NURSE)) listOf(
                if (workspaceId == SyntheticIdentity.WORKSPACE_A)
                    WorkspaceLocation(SyntheticIdentity.LOCATION_A, "Willow Clinic · Main", "ACTIVE")
                else WorkspaceLocation(SyntheticIdentity.LOCATION_B, "Harbor Clinic · Main", "ACTIVE")) else emptyList())
    }
}
