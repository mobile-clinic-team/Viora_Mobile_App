package com.viora.mobile.feature.patients.ui

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

/** Operational UI helper; cancellation plus epoch/sequence checks protect hidden destinations too. */
class ScopedRead<T>(private val session: SessionPort, private val scope: CoroutineScope,
    private val empty: (T) -> Boolean = { false }, private val onInvalidated: () -> Unit = {}) {
    private val mutable = MutableStateFlow<ReadState<T>>(ReadState.Initial)
    val state: StateFlow<ReadState<T>> = mutable.asStateFlow()
    private var sequence = 0L
    private var job: Job? = null
    private var action: (suspend () -> ApiResult<T>)? = null
    private val initialEpoch = session.state.value.let { it.authEpoch to it.contextEpoch }
    private var valid = true
    init {
        scope.launch {
            session.state.collect { value ->
                if ((value.authEpoch to value.contextEpoch) != initialEpoch || value.phase != SessionPhase.READY) {
                    valid = false; clear(); onInvalidated()
                }
            }
        }
    }
    fun clear() { sequence++; job?.cancel(); job = null; action = null; mutable.value = ReadState.Initial }
    fun load(debounceMillis: Long = 0, action: suspend () -> ApiResult<T>) {
        if (!valid) return
        val request = ++sequence
        job?.cancel(); this.action = action; mutable.value = ReadState.Loading
        job = scope.launch {
            if (debounceMillis > 0) delay(debounceMillis)
            val snapshot = session.snapshot() ?: run { if (request == sequence) mutable.value = ReadState.Unavailable; return@launch }
            val result = try { action() } catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { ApiResult.Failure("READ_FAILED") }
            if (request != sequence || !session.matches(snapshot) || !valid) return@launch
            mutable.value = when (result) {
                is ApiResult.Success -> if (empty(result.value)) ReadState.Empty else ReadState.Content(result.value)
                is ApiResult.Failure -> when {
                    result.status == 403 -> ReadState.PermissionDenied
                    result.status == 404 || result.code == "FEATURE_UNAVAILABLE" -> ReadState.Unavailable
                    else -> ReadState.Failure(result.code, result.requestId)
                }
                ApiResult.StaleScope -> ReadState.Initial
                ApiResult.OutcomeUnknown -> ReadState.Failure("INVALID_RESPONSE")
            }
        }
    }
    fun retry() { action?.let { load(action = it) } }
}
