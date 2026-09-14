package com.viora.mobile.feature.doctors.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.feature.doctors.domain.*
import com.viora.mobile.feature.patients.domain.*
import com.viora.mobile.feature.patients.ui.ScopedRead
import kotlinx.coroutines.flow.*
import java.time.Instant

class DoctorListViewModel(private val repository: DoctorDirectory, session: SessionPort) : ViewModel() {
    private val mutableQuery = MutableStateFlow("")
    val query = mutableQuery.asStateFlow()
    private var filter = DoctorQuery()
    private val read = ScopedRead<DirectoryPage<Doctor>>(session, viewModelScope, { it.items.isEmpty() }, { mutableQuery.value = ""; filter = DoctorQuery() })
    val state = read.state
    init { load() }
    fun search(value: String, locationId: String? = null, status: String? = null) {
        mutableQuery.value = value
        filter = try { DoctorQuery(value.trim().ifEmpty { null }, locationId, status) }
            catch (_: IllegalArgumentException) { read.clear(); return }
        load(300)
    }
    private fun load(delay: Long = 0) { val query = filter; read.load(delay) { repository.doctors(query) } }
    fun next() {
        val cursor = (state.value as? ReadState.Content)?.value?.nextCursor ?: return
        filter = DoctorQuery(filter.query, filter.locationId, filter.status, PageRequest(cursor = cursor)); load()
    }
    fun retry() {
        if ((state.value as? ReadState.Failure)?.code == "INVALID_CURSOR") {
            filter = DoctorQuery(filter.query, filter.locationId, filter.status); load()
        } else read.retry()
    }
}

class DoctorDetailViewModel(repository: DoctorDirectory, session: SessionPort, id: String, from: Instant, to: Instant) : ViewModel() {
    private val detail = ScopedRead<Doctor>(session, viewModelScope)
    private val shifts = ScopedRead<DirectoryPage<Shift>>(session, viewModelScope, { it.items.isEmpty() })
    val state = detail.state
    val schedule = shifts.state
    init { detail.load { repository.doctor(id) }; shifts.load { repository.shifts(id, from, to) } }
    fun retry() = detail.retry()
    fun retryShifts() = shifts.retry()
}
