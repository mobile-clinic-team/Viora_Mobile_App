package com.viora.mobile.feature.appointments.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.operations.OperationPort
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.patients.domain.*
import com.viora.mobile.feature.patients.ui.ScopedRead
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

class AgendaViewModel(private val repository: AppointmentLookup, session: SessionPort,
    initial: AppointmentQuery) : ViewModel() {
    private var query: AppointmentQuery? = initial
    private val mutableFilters = MutableStateFlow<AppointmentQuery?>(initial)
    val filters = mutableFilters.asStateFlow()
    private val read = ScopedRead<DirectoryPage<Appointment>>(session, viewModelScope, { it.items.isEmpty() }, { query = null; mutableFilters.value = null })
    val state = read.state
    init { filter(initial) }
    fun filter(value: AppointmentQuery) { query = value; mutableFilters.value = value; read.load { repository.appointments(value) } }
    fun next() { val cursor = (state.value as? ReadState.Content)?.value?.nextCursor ?: return
        query?.let { filter(it.copy(page = PageRequest(cursor = cursor))) } }
    fun retry() {
        if ((state.value as? ReadState.Failure)?.code == "INVALID_CURSOR") query?.let { filter(it.copy(page = PageRequest())) } else read.retry()
    }
}

class AppointmentDetailViewModel(repository: AppointmentLookup, session: SessionPort, id: String) : ViewModel() {
    private val read = ScopedRead<Appointment>(session, viewModelScope)
    val state = read.state
    init { read.load { repository.appointment(id) } }
    fun retry() = read.retry()
}

sealed interface AppointmentSubmitState {
    data object Idle : AppointmentSubmitState
    data object Submitting : AppointmentSubmitState
    data object Unavailable : AppointmentSubmitState
    data class CheckOutcome(val operationId: String, val failureCode: String? = null) : AppointmentSubmitState
    class Saved(val appointment: Appointment?, val operationId: String? = null) : AppointmentSubmitState { override fun toString() = "Saved(REDACTED)" }
    data class Rejected(val code: String) : AppointmentSubmitState
}

/** One live intent. Ambiguous/denied results remain locked until platform outcome recovery proves settlement. */
class AppointmentSubmitter(private val repository: AppointmentRepository, private val session: SessionPort,
    private val operations: OperationPort, private val capability: SchedulingCapability, private val scope: CoroutineScope) {
    private val mutable = MutableStateFlow<AppointmentSubmitState>(AppointmentSubmitState.Idle)
    val state = mutable.asStateFlow()
    private var started = false
    private var job: Job? = null
    private val epoch = session.state.value.let { it.authEpoch to it.contextEpoch }
    init { scope.launch { session.state.collect { current ->
        if ((current.authEpoch to current.contextEpoch) != epoch) {
            started = true; job?.cancel(); mutable.value = AppointmentSubmitState.Unavailable
        }
    } } }
    fun create(input: AppointmentCreate) = submit { operation -> repository.create(input, operation) }
    fun reschedule(current: AppointmentReference, input: AppointmentReschedule) = submit { operation -> repository.reschedule(current, input, operation) }
    fun transition(current: AppointmentReference, action: AppointmentAction, encounter: EncounterLink? = null) =
        submit { operation -> repository.transition(current, action, operation, encounter) }
    fun resetForNewIntent() {
        val outcome = mutable.value as? AppointmentSubmitState.CheckOutcome ?: return
        if (outcome.failureCode != null) {
            started = false; job?.cancel(); job = null; mutable.value = AppointmentSubmitState.Idle
        }
    }
    /** The visible destination acknowledges a verified result before leaving or starting another intent. */
    fun acknowledgeSaved(acknowledged: (Appointment?) -> Unit) {
        val saved = mutable.value as? AppointmentSubmitState.Saved ?: return
        scope.launch {
            val snapshot = session.snapshot() ?: return@launch
            if ((snapshot.authEpoch to snapshot.contextEpoch) != epoch) return@launch
            try { saved.operationId?.let { operations.acknowledgeResolved(it) } }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { return@launch }
            if (session.matches(snapshot) && mutable.value === saved) {
                started = false; mutable.value = AppointmentSubmitState.Idle
                acknowledged(saved.appointment)
            }
        }
    }
    private fun submit(command: suspend (com.viora.mobile.core.operations.OperationReceipt) -> ApiResult<AppointmentWrite>) {
        if (started) return
        if (!capability.available || capability.blockedDecisionIds.isNotEmpty()) { mutable.value = AppointmentSubmitState.Unavailable; return }
        started = true; mutable.value = AppointmentSubmitState.Submitting
        job = scope.launch {
            val snapshot = session.snapshot() ?: run { mutable.value = AppointmentSubmitState.Unavailable; return@launch }
            val receipt = try { operations.prepare() } catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { mutable.value = AppointmentSubmitState.Rejected("STORAGE_UNAVAILABLE"); return@launch }
            if (!session.matches(snapshot) || receipt.workspaceId != snapshot.workspace?.id || receipt.ownerUserId != snapshot.userId) return@launch
            val result = try { command(receipt) } catch (cancelled: CancellationException) {
                if (session.state.value.authEpoch == epoch.first && session.state.value.contextEpoch == epoch.second)
                    mutable.value = AppointmentSubmitState.CheckOutcome(receipt.operationId)
                throw cancelled
            } catch (_: Exception) { ApiResult.OutcomeUnknown }
            if (!session.matches(snapshot)) return@launch
            if (result is ApiResult.Success) {
                val updated = try { repository.appointment(result.value.appointmentId) }
                    catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { ApiResult.Failure("READ_FAILED") }
                if (session.matches(snapshot)) mutable.value = AppointmentSubmitState.Saved((updated as? ApiResult.Success)?.value, receipt.operationId)
            } else mutable.value = AppointmentSubmitState.CheckOutcome(receipt.operationId, (result as? ApiResult.Failure)?.code)
        }
    }
}
