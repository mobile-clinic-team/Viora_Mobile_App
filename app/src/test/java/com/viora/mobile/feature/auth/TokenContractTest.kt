package com.viora.mobile.feature.auth

import com.viora.mobile.feature.auth.data.dto.TokenBundleDto
import com.viora.mobile.core.time.WireTime
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class TokenContractTest {
    @Serializable private data class Envelope(val data: TokenBundleDto)
    private val json = Json { ignoreUnknownKeys = true }
    private fun fixture() = requireNotNull(javaClass.classLoader!!.getResource("fixtures/auth/token-bundle.json")).readText()

    @Test fun exactTokenFixtureMapsToOpaqueDomainBundle() {
        val dto = json.decodeFromString<Envelope>(fixture()).data
        val domain = dto.toDomain()
        assertEquals("Bearer", dto.tokenType)
        assertEquals("Bearer", domain.tokenType)
        assertEquals(Instant.parse("2026-09-09T00:10:00Z"), domain.accessExpiresAt)
        assertFalse(domain.toString().contains(domain.accessToken))
        assertFalse(dto.toString().contains(dto.refreshToken))
    }
    @Test fun missingNullOrWrongSecurityFieldsCannotPublishTokens() {
        val raw = fixture()
        for (bad in listOf(
            raw.replace("\"tokenType\": \"Bearer\",", ""),
            raw.replace("\"tokenType\": \"Bearer\"", "\"tokenType\": null"),
            raw.replace("\"tokenType\": \"Bearer\"", "\"tokenType\": \"JWT\""),
            raw.replace("2026-09-09T00:10:00.000Z", "2026-09-09T00:10:00+00:00")
        )) {
            assertThrows(Exception::class.java) { json.decodeFromString<Envelope>(bad).data.toDomain() }
        }
    }
    @Test fun wireTimestampHasExactlyThreeFractionalDigits() {
        assertEquals("2026-09-09T00:00:00.000Z", WireTime.format(Instant.parse("2026-09-09T00:00:00Z")))
        assertThrows(IllegalArgumentException::class.java) { WireTime.parse("2026-09-09") }
    }
}
