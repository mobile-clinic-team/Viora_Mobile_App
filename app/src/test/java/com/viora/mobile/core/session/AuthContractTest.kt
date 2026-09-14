package com.viora.mobile.core.session

import com.viora.mobile.testutil.FakeClock
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class AuthContractTest {
    private val environment = AuthEnvironment(
        issuer = "https://issuer.example.com",
        clientId = "viora-mobile",
        redirectUri = "https://app.example.com/oauth/callback",
        authorizationEndpoint = "https://issuer.example.com/authorize",
    )
    private val now = Instant.parse("2026-09-09T00:00:00Z")
    private val transaction = AuthTransaction(
        "66666666-6666-4666-8666-666666666666",
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        now.plusSeconds(300),
        "https://issuer.example.com/authorize?client_id=viora-mobile&redirect_uri=https%3A%2F%2Fapp.example.com%2Foauth%2Fcallback&response_type=code&state=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge_method=S256",
        environment.redirectUri,
    )

    @Test fun callbackAcceptsExactlyCodeAndState() {
        val callback = AuthCallbackParser.parse(
            "${environment.redirectUri}?code=one-time-code&state=${transaction.state}",
            environment.redirectUri, transaction.state, now, transaction.expiresAt,
        )
        assertEquals(AuthCallback.Success("one-time-code", transaction.state), callback)
    }

    @Test fun callbackRejectsDuplicatesFragmentsUnexpectedParametersAndExpiredState() {
        val invalid = listOf(
            "${environment.redirectUri}?code=a&code=b&state=${transaction.state}",
            "${environment.redirectUri}?code=a&state=${transaction.state}#fragment",
            "${environment.redirectUri}?code=a&state=${transaction.state}&extra=x",
            "${environment.redirectUri}?code=a&error=denied&state=${transaction.state}",
        )
        invalid.forEach { value -> assertThrows(IllegalArgumentException::class.java) {
            AuthCallbackParser.parse(value, environment.redirectUri, transaction.state, now, transaction.expiresAt)
        } }
        assertThrows(IllegalArgumentException::class.java) {
            AuthCallbackParser.parse(
                "${environment.redirectUri}?code=a&state=${transaction.state}",
                environment.redirectUri, transaction.state, now.plusSeconds(301), transaction.expiresAt,
            )
        }
    }

    @Test fun loginControllerKeepsVerifierInMemoryAndUsesExplicitExchangeBoundary() = runBlocking {
        val clock = FakeClock()
        val gateway = object : AuthTransactionGateway {
            var verifier: String? = null
            override suspend fun beginLogin(codeChallenge: String): AuthTransaction = transaction.copy(
                authorizationUrl = transaction.authorizationUrl.replace(
                    "code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "code_challenge=$codeChallenge"))
            override suspend fun exchangeLogin(transactionId: String, code: String, state: String, codeVerifier: String): TokenBundle {
                verifier = codeVerifier
                return TokenBundle("66666666-6666-4666-8666-666666666666", "11111111-1111-4111-8111-111111111111",
                    "access", now.plusSeconds(600), "refresh", now.plusSeconds(3600), now)
            }
        }
        val controller = LoginController(environment, gateway, clock)
        val pending = controller.begin()
        assertEquals(Pkce.challenge(pending.codeVerifier), pending.codeChallenge)
        val bundle = controller.complete("${environment.redirectUri}?code=one-time-code&state=${transaction.state}")
        assertEquals("access", bundle.accessToken)
        assertEquals(pending.codeVerifier, gateway.verifier)
        assertThrows(IllegalStateException::class.java) {
            runBlocking { controller.complete("${environment.redirectUri}?code=again&state=${transaction.state}") }
        }
        Unit
    }

    @Test fun browserAndAssuranceSecretsAreRedactedFromStrings() {
        val pending = PendingAuthTransaction(transaction, Pkce.verifier(), Pkce.verifier())
        assertFalse(pending.toString().contains(pending.codeVerifier))
        assertFalse(AuthCallback.Success("authorization-code", transaction.state).toString().contains("authorization-code"))
    }
}
