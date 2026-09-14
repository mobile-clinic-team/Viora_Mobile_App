package com.viora.mobile.feature.patients.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.flow.*

class PatientListViewModel(private val repository: PatientDirectory, session: SessionPort) : ViewModel() {
    private val mutableQuery = MutableStateFlow("")
    val query = mutableQuery.asStateFlow()
    private val read = ScopedRead<DirectoryPage<Patient>>(session, viewModelScope, { it.items.isEmpty() }, { mutableQuery.value = "" })
    val state = read.state
    fun search(value: String) {
        mutableQuery.value = value
        val normalized = value.trim()
        if (normalized.codePointCount(0, normalized.length) !in 2..100) { read.clear(); return }
        val query = try { PatientSearch(normalized) } catch (_: IllegalArgumentException) { read.clear(); return }
        read.load(300) { repository.search(query) }
    }
    fun next() {
        val current = (state.value as? ReadState.Content)?.value ?: return
        val cursor = current.nextCursor ?: return
        val query = PatientSearch(mutableQuery.value, PageRequest(cursor = cursor))
        read.load { repository.search(query) }
    }
    fun retry() {
        if ((state.value as? ReadState.Failure)?.code == "INVALID_CURSOR") search(mutableQuery.value) else read.retry()
    }
}

class PatientDetailViewModel(repository: PatientDirectory, session: SessionPort, id: String) : ViewModel() {
    private val read = ScopedRead<Patient>(session, viewModelScope)
    val state = read.state
    init { read.load { repository.patient(id) } }
    fun retry() = read.retry()
}
