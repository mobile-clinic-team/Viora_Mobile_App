package com.viora.mobile.feature.appointments.ui

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.feature.appointments.domain.PatientSelfAppointment
import com.viora.mobile.feature.appointments.domain.PatientSelfAppointmentRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

sealed interface PatientSelfAppointmentsState {
    data object Loading : PatientSelfAppointmentsState
    data class Loaded(val items: List<PatientSelfAppointment>, val nextCursor: String?) : PatientSelfAppointmentsState
    data class Error(val code: String, val items: List<PatientSelfAppointment> = emptyList()) : PatientSelfAppointmentsState
}

class PatientSelfAppointmentsViewModel(private val repository: PatientSelfAppointmentRepository,
    private val scope: CoroutineScope) {
    private val mutable = MutableStateFlow<PatientSelfAppointmentsState>(PatientSelfAppointmentsState.Loading)
    val state = mutable.asStateFlow()
    private var job: Job? = null
    private var inFlight = false
    private var generation = 0
    private var lastCursor: String? = null

    fun load() {
        job?.cancel()
        lastCursor = null
        mutable.value = PatientSelfAppointmentsState.Loading
        fetch(null, emptyList())
    }
    fun retry() {
        val error = mutable.value as? PatientSelfAppointmentsState.Error ?: return
        fetch(lastCursor, error.items)
    }
    fun loadMore() {
        if (inFlight) return
        val current = mutable.value as? PatientSelfAppointmentsState.Loaded ?: return
        val cursor = current.nextCursor ?: return
        lastCursor = cursor
        fetch(cursor, current.items)
    }
    private fun fetch(cursor: String?, prior: List<PatientSelfAppointment>) {
        val currentGeneration = ++generation
        inFlight = true
        job = scope.launch {
            try {
                when (val result = repository.list(cursor)) {
                    is ApiResult.Success -> mutable.value = PatientSelfAppointmentsState.Loaded(
                        prior + result.value.items, result.value.nextCursor)
                    is ApiResult.Failure -> mutable.value = PatientSelfAppointmentsState.Error(result.code, prior)
                    ApiResult.OutcomeUnknown -> mutable.value = PatientSelfAppointmentsState.Error("UNKNOWN_OUTCOME", prior)
                    ApiResult.StaleScope -> mutable.value = PatientSelfAppointmentsState.Error("SESSION_CHANGED", prior)
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { mutable.value = PatientSelfAppointmentsState.Error("READ_FAILED", prior) }
            finally { if (generation == currentGeneration) inFlight = false }
        }
    }
}
