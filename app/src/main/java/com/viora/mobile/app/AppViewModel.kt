package com.viora.mobile.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import com.viora.mobile.core.session.SessionPhase
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue

class AppViewModel(val graph: AppGraph) : ViewModel() {
    var operationalFormDirty by androidx.compose.runtime.mutableStateOf(false)
        private set
    fun updateOperationalFormDirty(dirty: Boolean) { operationalFormDirty = dirty }
    private var navigationState: android.os.Bundle? = null
    private var navigationEpoch: Pair<Long, Long>? = null
    fun restoreNavigation(auth: Long, context: Long): android.os.Bundle? =
        navigationState.takeIf { navigationEpoch == (auth to context) }
    fun retainNavigation(auth: Long, context: Long, value: android.os.Bundle?) {
        if (session.value.authEpoch == auth && session.value.contextEpoch == context) {
            navigationEpoch = auth to context
            navigationState = value
        }
    }
    val session = graph.session.state
    var signingIn by androidx.compose.runtime.mutableStateOf(false)
        private set
    init {
        graph.scope.launch { graph.session.restore() }
        viewModelScope.launch {
            var previousEpoch = session.value.let { it.authEpoch to it.contextEpoch }
            session.collect { state ->
                val epoch = state.authEpoch to state.contextEpoch
                if (previousEpoch != epoch) {
                    operationalFormDirty = false
                    previousEpoch = epoch
                }
                if (navigationEpoch != (state.authEpoch to state.contextEpoch)) {
                    navigationState = null
                    navigationEpoch = null
                }
            }
        }
    }
    fun signIn(email: String, password: String) {
        if (signingIn || session.value.phase != SessionPhase.SIGNED_OUT) return
        signingIn = true
        graph.scope.launch {
            try { delay(450); graph.session.signIn(email, password) }
            finally { signingIn = false }
        }
    }
    suspend fun register(email: String, password: String, displayName: String) = graph.register(email, password, displayName)
    fun selectRole(role: com.viora.mobile.core.session.AppRole) { graph.scope.launch { graph.session.selectRole(role) } }
    fun selectWorkspace(id: String) { graph.scope.launch { graph.session.selectWorkspace(id) } }
    fun switchWorkspace() { graph.scope.launch { graph.session.chooseWorkspace() } }
    fun logout() { graph.scope.launch { graph.session.logout() } }
    class Factory(private val graph: AppGraph) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass == AppViewModel::class.java)
            @Suppress("UNCHECKED_CAST")
            return AppViewModel(graph) as T
        }
    }
}
