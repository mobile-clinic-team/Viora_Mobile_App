package com.viora.mobile.core.security

import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.core.time.AppClock
import kotlinx.coroutines.*

/** Application lifetime: rotation cannot reset the background retention deadline. */
class PrivacyController(private val session: SessionPort, private val clock: AppClock, private val scope: CoroutineScope) {
    private var backgroundAt: Long? = null
    private var timeout: Job? = null
    fun background() {
        if (backgroundAt != null) return
        backgroundAt = clock.elapsedMillis()
        timeout = scope.launch { delay(300000); session.chooseWorkspace() }
    }
    suspend fun foreground() {
        val since = backgroundAt ?: return
        backgroundAt = null
        timeout?.cancel()
        timeout = null
        if (clock.elapsedMillis() - since >= 300000) session.chooseWorkspace()
        else session.state.value.workspace?.id?.let { session.selectWorkspace(it) }
    }
}
