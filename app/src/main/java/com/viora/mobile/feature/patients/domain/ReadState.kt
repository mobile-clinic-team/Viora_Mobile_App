package com.viora.mobile.feature.patients.domain

/** Safe states shared by the operational discovery contracts. No raw error body is retained. */
sealed interface ReadState<out T> {
    data object Initial : ReadState<Nothing>
    data object Loading : ReadState<Nothing>
    data object Empty : ReadState<Nothing>
    data object PermissionDenied : ReadState<Nothing>
    data object Unavailable : ReadState<Nothing>
    class Content<T>(val value: T) : ReadState<T> { override fun toString() = "Content(REDACTED)" }
    data class Failure(val code: String, val requestId: String? = null) : ReadState<Nothing>
}
