package com.viora.mobile.feature.appointments.ui

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.operations.OperationPort
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.feature.appointments.domain.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PatientBookingState(val loading: Boolean = true, val busy: Boolean = false,
    val options: List<PatientBookingOption> = emptyList(), val outstanding: List<OperationReceipt> = emptyList(),
    val message: String? = null, val success: AppointmentWrite? = null)

class PatientBookingViewModel(private val repository: PatientBookingRepository, private val operations: OperationPort,
    private val scope: CoroutineScope, private val refreshAppointments: () -> Unit) {
    private val mutable = MutableStateFlow(PatientBookingState())
    val state = mutable.asStateFlow()
    private var active = false
    fun load() = run {
        mutable.value = mutable.value.copy(loading = true, message = null)
        val outstanding = operations.outstanding()
        mutable.value = mutable.value.copy(outstanding = outstanding)
        when (val result = repository.options()) {
            is ApiResult.Success -> mutable.value = mutable.value.copy(options = result.value, loading = false)
            is ApiResult.Failure -> mutable.value = mutable.value.copy(loading = false, message = result.code)
            else -> mutable.value = mutable.value.copy(loading = false, message = "READ_FAILED")
        }
    }

    fun submit(option: PatientBookingOption?, reason: String) {
        if (active || state.value.loading || state.value.outstanding.isNotEmpty()) return
        if (option == null || option !in state.value.options || reason.isBlank() || reason.length > 1000) {
            mutable.value = mutable.value.copy(message = "VALIDATION_ERROR"); return
        }
        run {
            val receipt = operations.prepare()
            mutable.value = mutable.value.copy(outstanding = listOf(receipt), success = null)
            settle(repository.create(PatientBookingIntent(option, reason.trim()), receipt), receipt, recovering = false)
        }
    }

    fun recover(receipt: OperationReceipt) {
        if (receipt !in state.value.outstanding) return
        run { settle(repository.recover(receipt), receipt, recovering = true) }
    }

    private suspend fun settle(result: ApiResult<AppointmentWrite>, receipt: OperationReceipt, recovering: Boolean) {
        when (result) {
            is ApiResult.Success -> {
                operations.acknowledgeResolved(receipt.operationId)
                mutable.value = mutable.value.copy(success = result.value, message = null,
                    outstanding = state.value.outstanding.filterNot { it.operationId == receipt.operationId })
                refreshAppointments()
            }
            is ApiResult.Failure -> {
                // Recovery errors such as 404/403 do not prove that an earlier write failed.
                val terminal = result.code in setOf("CONFLICT", "VALIDATION_ERROR", "OPERATION_CLOSED") ||
                    !recovering && result.code in setOf("INVALID_REQUEST", "FORBIDDEN", "UNAUTHENTICATED", "FEATURE_UNAVAILABLE")
                if (terminal) {
                    operations.acknowledgeResolved(receipt.operationId)
                    mutable.value = mutable.value.copy(outstanding = state.value.outstanding.filterNot { it.operationId == receipt.operationId })
                }
                mutable.value = mutable.value.copy(message = result.code)
            }
            ApiResult.OutcomeUnknown -> mutable.value = mutable.value.copy(message = "UNKNOWN_OUTCOME")
            ApiResult.StaleScope -> mutable.value = mutable.value.copy(message = "SESSION_CHANGED")
        }
    }

    private fun run(block: suspend () -> Unit) {
        if (active) return
        active = true
        mutable.value = mutable.value.copy(busy = true)
        scope.launch {
            try { block() }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { mutable.value = mutable.value.copy(loading = false, message = "RECOVERY_REQUIRED") }
            finally { active = false; mutable.value = mutable.value.copy(busy = false) }
        }
    }
}
