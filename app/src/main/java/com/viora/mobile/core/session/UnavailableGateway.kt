package com.viora.mobile.core.session

import com.viora.mobile.core.model.GatewayException

class UnavailableGateway : SessionAuthGateway, WorkspaceGateway {
    private fun unavailable(): Nothing = throw GatewayException("FEATURE_UNAVAILABLE")
    override suspend fun signIn(): TokenBundle = unavailable()
    override suspend fun refresh(credential: StoredCredential): TokenBundle = unavailable()
    override suspend fun revoke(credential: StoredCredential): Unit = unavailable()
    override suspend fun user(accessToken: String): User = unavailable()
    override suspend fun memberships(accessToken: String): List<Membership> = unavailable()
    override suspend fun validate(accessToken: String, workspaceId: String): WorkspaceContext = unavailable()
}
