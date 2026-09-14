package com.viora.mobile.feature.auth.data.dto

import com.viora.mobile.core.session.TokenBundle
import com.viora.mobile.core.time.WireTime
import kotlinx.serialization.Serializable

@Serializable
data class TokenBundleDto(
    val sessionId: String, val userId: String, val accessToken: String, val tokenType: String,
    val accessExpiresAt: String, val refreshToken: String, val refreshExpiresAt: String, val serverTime: String,
) {
    fun toDomain(): TokenBundle {
        require(tokenType == "Bearer")
        return TokenBundle(sessionId, userId, accessToken, WireTime.parse(accessExpiresAt),
            refreshToken, WireTime.parse(refreshExpiresAt), WireTime.parse(serverTime), tokenType).also(TokenBundle::validate)
    }
    override fun toString(): String = "TokenBundleDto(REDACTED)"
}
