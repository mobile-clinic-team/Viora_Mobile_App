package com.viora.mobile.feature.clinical.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.session.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

sealed interface ClinicalState<out T> {
    data object Initial : ClinicalState<Nothing>
    data object Loading : ClinicalState<Nothing>
    class Loaded<T>(val value: T) : ClinicalState<T> { override fun toString() = "Loaded(REDACTED)" }
    class Empty<T>(val value: T) : ClinicalState<T> { override fun toString() = "Empty(REDACTED)" }
    data object PermissionDenied : ClinicalState<Nothing>
    data object NotFound : ClinicalState<Nothing>
    data object Stale : ClinicalState<Nothing>
    data class Error(val code: String) : ClinicalState<Nothing>
    data class RetriableFailure(val code: String) : ClinicalState<Nothing>
}

/** No saved-state persistence or logging. Hidden destinations clear and reject late results too. */
internal class ClinicalStateLoader<T>(private val session: SessionPort, private val scope: CoroutineScope,
    private val empty: (T) -> Boolean = { false }) {
    private val mutable = MutableStateFlow<ClinicalState<T>>(ClinicalState.Initial)
    val state = mutable.asStateFlow()
    private val epoch = session.state.value.let { it.authEpoch to it.contextEpoch }
    private var valid = session.state.value.phase == SessionPhase.READY
    private var sequence = 0L
    private var job: Job? = null
    private var read: (suspend () -> ApiResult<T>)? = null
    init { scope.launch { session.state.collect { current ->
        if (current.phase != SessionPhase.READY || epoch != (current.authEpoch to current.contextEpoch)) {
            valid = false; sequence++; job?.cancel(); read = null; mutable.value = ClinicalState.Initial
        }
    } } }
    fun load(action: suspend () -> ApiResult<T>) {
        if (!valid) return
        val request = ++sequence
        job?.cancel(); read = action; mutable.value = ClinicalState.Loading
        job = scope.launch {
            val snapshot = session.snapshot() ?: run { mutable.value = ClinicalState.PermissionDenied; return@launch }
            val result = try { action() }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { ApiResult.Failure("READ_FAILED") }
            if (!valid || request != sequence || !session.matches(snapshot)) return@launch
            mutable.value = when (result) {
                is ApiResult.Success -> if (empty(result.value)) ClinicalState.Empty(result.value) else ClinicalState.Loaded(result.value)
                ApiResult.StaleScope -> ClinicalState.Stale
                ApiResult.OutcomeUnknown -> ClinicalState.Error("INVALID_RESPONSE")
                is ApiResult.Failure -> when {
                    result.status in setOf(401, 403) -> ClinicalState.PermissionDenied
                    result.status in setOf(404, 410) -> ClinicalState.NotFound
                    result.status == 412 || result.code in setOf("CONTEXT_STALE", "RELATIONSHIP_CONFLICT", "VERSION_CONFLICT") -> ClinicalState.Stale
                    result.status == 429 || result.status in 500..599 || result.code in setOf("TRANSPORT_ERROR", "READ_FAILED") -> ClinicalState.RetriableFailure(result.code)
                    else -> ClinicalState.Error(result.code)
                }
            }
        }
    }
    fun retry() { read?.let(::load) }
}

internal class ClinicalViewModel<T>(session: SessionPort, empty: (T) -> Boolean,
    action: suspend () -> ApiResult<T>) : ViewModel() {
    private val loader = ClinicalStateLoader(session, viewModelScope, empty)
    val state = loader.state
    init { loader.load(action) }
    fun retry() = loader.retry()
    fun load(action: suspend () -> ApiResult<T>) = loader.load(action)
}
