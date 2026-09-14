package com.viora.mobile.core.session

import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.time.AppClock
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64

/** Environment-owned public configuration. Provider secrets never enter Android. */
data class AuthEnvironment(
    val issuer: String,
    val clientId: String,
    val redirectUri: String,
    val authorizationEndpoint: String,
) {
    fun validate() {
        val issuerUri = URI(issuer)
        val redirect = URI(redirectUri)
        val endpoint = URI(authorizationEndpoint)
        require(issuerUri.scheme == "https" && issuerUri.userInfo == null && issuerUri.query == null && issuerUri.fragment == null)
        require(redirect.scheme == "https" && redirect.userInfo == null && redirect.query == null && redirect.fragment == null)
        require(endpoint.scheme == "https" && endpoint.host == issuerUri.host && endpoint.userInfo == null)
        require(clientId.isNotBlank() && clientId.length <= 256)
    }
}

enum class AuthPurpose { LOGIN, STEP_UP }

data class AssuranceBinding(
    val action: String,
    val workspaceId: String,
    val resourceId: String,
    val versionToken: String,
    val targetVersionToken: String? = null,
) {
    fun validate() {
        require(action in setOf("record.finalize", "draft.approve"))
        require(Ids.valid(workspaceId) && Ids.valid(resourceId))
        require(com.viora.mobile.core.model.VersionToken.valid(versionToken))
        if (action == "draft.approve") require(com.viora.mobile.core.model.VersionToken.valid(requireNotNull(targetVersionToken)))
        else require(targetVersionToken == null)
    }
}

data class AuthStartRequest(
    val purpose: AuthPurpose,
    val codeChallenge: String,
    val challenge: AssuranceBinding? = null,
) {
    fun validate() {
        require(Base64Url.is43(codeChallenge))
        if (purpose == AuthPurpose.LOGIN) require(challenge == null)
        else requireNotNull(challenge).validate()
    }
    override fun toString(): String = "AuthStartRequest(REDACTED)"
}

data class AuthTransaction(
    val transactionId: String,
    val state: String,
    val expiresAt: Instant,
    val authorizationUrl: String,
    val redirectUri: String,
) {
    fun validate(environment: AuthEnvironment, now: Instant) {
        environment.validate()
        require(Ids.valid(transactionId))
        require(Base64Url.is43(state))
        require(expiresAt.isAfter(now) && !expiresAt.isAfter(now.plusSeconds(300)))
        val authorization = URI(authorizationUrl)
        require(authorization.scheme == "https" && authorization.userInfo == null && authorization.fragment == null)
        require(authorization.host == URI(environment.issuer).host)
        require(authorization.toString().length <= 4096)
        require(redirectUri.length <= 2048 && redirectUri == environment.redirectUri)
    }
    override fun toString(): String = "AuthTransaction(REDACTED)"
}

data class PendingAuthTransaction(
    val transaction: AuthTransaction,
    val codeVerifier: String,
    val codeChallenge: String,
) {
    fun validate(environment: AuthEnvironment, now: Instant) {
        transaction.validate(environment, now)
        require(Base64Url.is43(codeVerifier) && Base64Url.is43(codeChallenge))
        require(Pkce.challenge(codeVerifier) == codeChallenge)
        val authorization = URI(transaction.authorizationUrl)
        val query = authorization.rawQuery?.let(AuthCallbackParser::parseQuery) ?: error("Missing authorization query")
        require(query["client_id"] == environment.clientId)
        require(query["redirect_uri"] == environment.redirectUri)
        require(query["response_type"] == "code")
        require(query["state"] == transaction.state)
        require(query["code_challenge"] == codeChallenge)
        require(query["code_challenge_method"] == "S256")
    }
    override fun toString(): String = "PendingAuthTransaction(REDACTED)"
}

sealed interface AuthCallback {
    data class Success(val code: String, val state: String) : AuthCallback {
        override fun toString(): String = "AuthCallback.Success(REDACTED)"
    }
    data class Error(val code: String, val description: String?, val state: String) : AuthCallback {
        override fun toString(): String = "AuthCallback.Error(code=$code)"
    }
}

/** Exact callback parser. It deliberately does not exchange codes with a provider. */
object AuthCallbackParser {
    fun parse(uri: String, expectedRedirectUri: String, expectedState: String, now: Instant, expiresAt: Instant): AuthCallback {
        val parsed = URI(uri)
        val expected = URI(expectedRedirectUri)
        val rawQuery = parsed.rawQuery
        require(expected.scheme == "https" && expected.userInfo == null && expected.query == null && expected.fragment == null)
        require(parsed.scheme == expected.scheme && parsed.host == expected.host && parsed.port == expected.port && parsed.path == expected.path)
        require(parsed.userInfo == null && parsed.fragment == null && rawQuery != null)
        require(Base64Url.is43(expectedState) && now.isBefore(expiresAt))
        val values = parseQuery(rawQuery)
        val state = values.single("state")
        require(state == expectedState)
        val code = values["code"]
        val error = values["error"]
        require((code != null) xor (error != null))
        require(values.keys.all { it in setOf("code", "state", "error", "error_description") })
        return if (code != null) {
            require(values["error_description"] == null && code.length <= 4096 && code.isNotBlank())
            AuthCallback.Success(code, state)
        } else {
            require(error!!.length <= 128 && error.matches(Regex("[A-Za-z0-9._~-]+")))
            AuthCallback.Error(error, values["error_description"]?.takeIf { it.length <= 512 }, state)
        }
    }

    internal fun parseQuery(raw: String): Map<String, String> {
        require(raw.isNotEmpty())
        val values = linkedMapOf<String, String>()
        raw.split('&').forEach { pair ->
            val parts = pair.split('=', limit = 2)
            require(parts.size == 2 && parts[0].isNotBlank())
            val key = URLDecoder.decode(parts[0], StandardCharsets.UTF_8.name())
            val value = URLDecoder.decode(parts[1], StandardCharsets.UTF_8.name())
            require(key !in values)
            values[key] = value
        }
        return values
    }

    private fun Map<String, String>.single(key: String): String = get(key)?.also { require(it.isNotBlank()) }
        ?: error("Missing callback parameter: $key")
}

interface AuthTransactionGateway {
    suspend fun beginLogin(codeChallenge: String): AuthTransaction
    suspend fun exchangeLogin(transactionId: String, code: String, state: String, codeVerifier: String): TokenBundle

    /** STEP_UP remains an explicit boundary; provider/browser work is intentionally outside this batch. */
    suspend fun beginStepUp(request: AuthStartRequest): AuthTransaction = error("STEP_UP_UNAVAILABLE")
    suspend fun exchangeStepUp(transactionId: String, code: String, state: String, codeVerifier: String): AssuranceGrant =
        error("STEP_UP_UNAVAILABLE")
}

data class AssuranceGrant(
    val assuranceToken: String,
    val expiresAt: Instant,
    val binding: AssuranceBinding,
) {
    fun validate(now: Instant) {
        require(assuranceToken.isNotBlank() && assuranceToken.length <= 4096)
        require(expiresAt.isAfter(now) && !expiresAt.isAfter(now.plusSeconds(120)))
        binding.validate()
    }
    override fun toString(): String = "AssuranceGrant(REDACTED)"
}

/** Memory-only browser transaction coordinator for the documented broker/PKCE flow. */
class LoginController(
    private val environment: AuthEnvironment,
    private val gateway: AuthTransactionGateway,
    private val clock: AppClock,
    private val random: SecureRandom = SecureRandom(),
) {
    private val mutex = Mutex()
    private var pending: PendingAuthTransaction? = null

    suspend fun begin(): PendingAuthTransaction {
        val verifier = Pkce.verifier(random)
        val challenge = Pkce.challenge(verifier)
        AuthStartRequest(AuthPurpose.LOGIN, challenge).also { it.validate() }
        val transaction = gateway.beginLogin(challenge).also { it.validate(environment, clock.now()) }
        val value = PendingAuthTransaction(transaction, verifier, challenge)
        value.validate(environment, clock.now())
        mutex.withLock { pending = value }
        return value
    }

    suspend fun complete(callbackUri: String): TokenBundle {
        val current = mutex.withLock { pending }
            ?: throw IllegalStateException("No pending login transaction")
        val callback = AuthCallbackParser.parse(callbackUri, current.transaction.redirectUri,
            current.transaction.state, clock.now(), current.transaction.expiresAt)
        return when (callback) {
            is AuthCallback.Error -> {
                mutex.withLock { pending = null }
                throw AuthCallbackException(callback.code)
            }
            is AuthCallback.Success -> try {
                gateway.exchangeLogin(current.transaction.transactionId, callback.code, callback.state, current.codeVerifier)
                    .also(TokenBundle::validate)
            } finally {
                mutex.withLock { pending = null }
            }
        }
    }

    suspend fun cancel() = mutex.withLock { pending = null }
}

class AuthCallbackException(val code: String) : Exception(code)

object Pkce {
    fun verifier(random: SecureRandom = SecureRandom()): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return Base64Url.encode(bytes)
    }
    fun challenge(verifier: String): String {
        require(Base64Url.is43(verifier))
        return Base64Url.encode(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(StandardCharsets.US_ASCII)))
    }
}

private object Base64Url {
    private val pattern = Regex("[A-Za-z0-9_-]{43}")
    fun encode(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    fun is43(value: String): Boolean = pattern.matches(value)
}
