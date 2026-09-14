package com.viora.mobile.feature.appointments.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.feature.appointments.domain.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.*

class AppointmentFormState(val patientId: String? = null, val doctorId: String? = null, val locationId: String? = null,
    val date: String = "", val start: String = "", val end: String = "", val reason: String = "", val notes: String = "",
    val startOffset: ZoneOffset? = null, val endOffset: ZoneOffset? = null, val dirty: Boolean = false, val error: String? = null) {
    override fun toString() = "AppointmentFormState(REDACTED)"
}

class AppointmentFormViewModel(session: SessionPort, private val zone: ZoneId,
    initial: AppointmentFormState = AppointmentFormState()) : ViewModel() {
    private val mutable = MutableStateFlow(initial)
    val state = mutable.asStateFlow()
    private val epoch = session.state.value.let { it.authEpoch to it.contextEpoch }
    private var valid = true
    init { viewModelScope.launch { session.state.collect {
        if ((it.authEpoch to it.contextEpoch) != epoch) { valid = false; mutable.value = AppointmentFormState() }
    } } }
    fun change(value: AppointmentFormState) { if (valid) mutable.value = AppointmentFormState(value.patientId, value.doctorId,
        value.locationId, value.date, value.start, value.end, value.reason, value.notes, value.startOffset, value.endOffset, true) }
    fun offsets(start: Boolean): List<ZoneOffset> = try {
        Scheduling.offsets(LocalDate.parse(state.value.date).atTime(LocalTime.parse(if (start) state.value.start else state.value.end)), zone)
    } catch (_: Exception) { emptyList() }
    fun validate(): AppointmentCreate? {
        if (!valid) return null
        val value = state.value
        return try {
            val date = LocalDate.parse(value.date)
            val start = Scheduling.instant(date.atTime(LocalTime.parse(value.start)), zone, value.startOffset)
            val end = Scheduling.instant(date.atTime(LocalTime.parse(value.end)), zone, value.endOffset)
            AppointmentCreate(requireNotNull(value.patientId), requireNotNull(value.doctorId), requireNotNull(value.locationId),
                start, end, value.reason.trim().ifEmpty { null }, value.notes.ifEmpty { null })
        } catch (_: Exception) {
            mutable.value = AppointmentFormState(value.patientId, value.doctorId, value.locationId, value.date, value.start, value.end,
                value.reason, value.notes, value.startOffset, value.endOffset, value.dirty,
                "Choose patient, doctor, location and a valid time interval. Ambiguous local times require an offset choice.")
            null
        }
    }
}
