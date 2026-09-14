package com.viora.mobile.core.session

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.network.ApiClient
import com.viora.mobile.core.network.ApiPayload
import com.viora.mobile.core.network.ApiRequest
import com.viora.mobile.core.network.RequestScope

interface AuthenticatedRequestPort {
    suspend fun execute(request: ApiRequest): ApiResult<ApiPayload>
}

class AuthenticatedRequestExecutor(private val api: ApiClient, private val session: SessionPort) : AuthenticatedRequestPort {
    override suspend fun execute(request: ApiRequest): ApiResult<ApiPayload> {
        require(request.scope != RequestScope.PUBLIC)
        val snapshot = session.snapshot(request.scope == RequestScope.WORKSPACE) ?: return ApiResult.Failure("UNAUTHENTICATED", 401)
        request.expectedSession?.let { if (!sameAssuranceSession(it, snapshot)) return ApiResult.StaleScope }
        var result = api.execute(request, snapshot)
        if (!session.matches(snapshot)) return ApiResult.StaleScope
        if (result is ApiResult.Failure && result.code == "SESSION_REVOKED") {
            session.logout()
            return result
        }
        if (result is ApiResult.Failure && result.status == 401 && !request.mutation) {
            if (session.refresh(snapshot.accessToken) == null) return ApiResult.Failure("UNAUTHENTICATED", 401)
            if (!session.matches(snapshot)) return ApiResult.StaleScope
            val fresh = session.snapshot(request.scope == RequestScope.WORKSPACE) ?: return ApiResult.StaleScope
            request.expectedSession?.let { if (!sameAssuranceSession(it, fresh)) return ApiResult.StaleScope }
            result = api.execute(request, fresh)
            if (!session.matches(snapshot)) return ApiResult.StaleScope
            if (result is ApiResult.Failure && result.status == 401) session.logout()
        }
        if (result is ApiResult.Failure && result.code in setOf("CONTEXT_STALE", "WORKSPACE_ACCESS_REVOKED")) session.invalidateContext()
        return result
    }
}
