package com.viora.mobile.core.session

import com.viora.mobile.core.model.Ids
import kotlinx.coroutines.CancellationException

enum class AuthStage { REGISTER_HTTP, LOGIN_HTTP, REFRESH_HTTP, IDENTITY_HTTP, TOKEN_CONTRACT, IDENTITY_CONTRACT, PERSONA, WORKSPACE, SESSION_INSTALL, SESSION_IDENTITY, RESTORE }
enum class AuthReason { OK, HTTP_FAILURE, TLS_FAILURE, TRANSPORT_FAILURE, INVALID_RESPONSE, VALIDATION_FAILURE, STORAGE_FAILURE }

/** Only closed enums, HTTP status and validated correlation IDs may cross this boundary. */
data class AuthDiagnostic(val stage: AuthStage, val reason: AuthReason, val status: Int?, val requestId: String?)
class AuthDiagnostics(private val sink: (AuthDiagnostic) -> Unit = {}) {
    fun report(stage: AuthStage, reason: AuthReason, status: Int? = null, requestId: String? = null) {
        // Diagnostics must never change authentication behavior.
        runCatching { sink(AuthDiagnostic(stage, reason, status?.takeIf { it in 100..599 }, requestId?.takeIf(Ids::valid))) }
    }
    suspend fun <T> validate(stage: AuthStage, block: suspend () -> T): T = try { block() }
    catch (cancelled: CancellationException) { throw cancelled }
    catch (failure: Exception) {
        report(stage, if (failure is com.viora.mobile.core.security.SecureStoreException) AuthReason.STORAGE_FAILURE else AuthReason.VALIDATION_FAILURE)
        throw failure
    }
}
