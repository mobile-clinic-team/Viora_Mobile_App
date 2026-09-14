package com.viora.mobile.core.model

sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>
    data class Failure(
        val code: String,
        val status: Int? = null,
        val requestId: String? = null,
        val correlationId: String? = null,
    ) : ApiResult<Nothing>
    data object OutcomeUnknown : ApiResult<Nothing>
    data object StaleScope : ApiResult<Nothing>
}

class GatewayException(val code: String) : Exception(code)
