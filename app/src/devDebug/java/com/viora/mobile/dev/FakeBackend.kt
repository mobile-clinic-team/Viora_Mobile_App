package com.viora.mobile.dev

import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.AppClock
import kotlinx.coroutines.delay
import java.time.Instant

internal object SyntheticIdentity {
    const val USER_ID = "11111111-1111-4111-8111-111111111111"
    const val WORKSPACE_A = "22222222-2222-4222-8222-222222222222"
    const val WORKSPACE_B = "33333333-3333-4333-8333-333333333333"
    const val LOCATION_A = "61111111-1111-4111-8111-111111111111"
    const val LOCATION_B = "62222222-2222-4222-8222-222222222222"
}

/** Synthetic-only fixture service. It neither contacts a provider nor approves role policy. */
class FakeBackend(private val clock: AppClock) : SessionAuthGateway, WorkspaceGateway {
    private val userId = SyntheticIdentity.USER_ID
    private val workspaceA = SyntheticIdentity.WORKSPACE_A
    private val workspaceB = SyntheticIdentity.WORKSPACE_B
    private val revoked = mutableSetOf<String>()
    override suspend fun signIn(): TokenBundle {
        delay(250)
        return issue(Ids.newId(), clock.now().plusSeconds(43200).truncatedTo(java.time.temporal.ChronoUnit.MILLIS))
    }
    override suspend fun refresh(credential: StoredCredential): TokenBundle {
        delay(100)
        require(credential.userId == userId && credential.sessionId !in revoked)
        require(credential.refreshToken.startsWith("synthetic-refresh-"))
        val expiry = Instant.parse(credential.refreshExpiresAt)
        require(expiry > clock.now())
        return issue(credential.sessionId, expiry)
    }
    private fun issue(sessionId: String, expiry: Instant): TokenBundle = TokenBundle(
        sessionId, userId, "synthetic-access-" + Ids.newId(), minOf(clock.now().plusSeconds(600), expiry),
        "synthetic-refresh-" + Ids.newId(), expiry, clock.now(), "Bearer")
    override suspend fun revoke(credential: StoredCredential) { revoked += credential.sessionId }
    override suspend fun user(accessToken: String): User {
        require(accessToken.startsWith("synthetic-access-"))
        return User(userId, "Demo clinician")
    }
    override suspend fun memberships(accessToken: String): List<Membership> {
        user(accessToken)
        return listOf(
            Membership("44444444-4444-4444-8444-444444444444", userId, workspaceA, "Willow Clinic · Demo", "DOCTOR", true),
            Membership("55555555-5555-4555-8555-555555555555", userId, workspaceB, "Harbor Clinic · Demo", "DOCTOR", true))
    }
    override suspend fun validate(accessToken: String, workspaceId: String): WorkspaceContext {
        delay(200)
        val membership = memberships(accessToken).single { it.workspaceId == workspaceId }
        // Explicit integration fixture policy. It does not close BD-01/02/03.
        val grants = setOf(
            "patient.read", "doctor.read", "appointment.read", "appointment.create", "appointment.reschedule",
            "appointment.confirm", "appointment.cancel", "appointment.checkIn", "appointment.noShow",
            "appointment.start", "appointment.complete", "encounter.read", "encounter.create", "record.read",
            "assistant.use", "draft.generate", "draft.read", "draft.review", "draft.edit", "draft.approve", "draft.reject", "record.edit",
        )
        return WorkspaceContext(workspaceId, membership.name, "Asia/Ho_Chi_Minh", "\"assistant-demo-policy-3\"",
            if (workspaceId == workspaceA) grants else grants - setOf("encounter.read", "encounter.create", "record.read",
                "assistant.use", "draft.generate", "draft.read", "draft.review", "draft.edit", "draft.approve", "draft.reject", "record.edit"),
            patientReadableFields = if (workspaceId == workspaceA)
                setOf("dateOfBirth", "sex", "phone", "email", "address", "emergencyContact", "status") else emptySet(),
            membershipId = membership.id, role = membership.role,
            locations = listOf(if (workspaceId == workspaceA) WorkspaceLocation(SyntheticIdentity.LOCATION_A, "Willow Clinic · Main", "ACTIVE")
                else WorkspaceLocation(SyntheticIdentity.LOCATION_B, "Harbor Clinic · Main", "ACTIVE")))
    }
}
