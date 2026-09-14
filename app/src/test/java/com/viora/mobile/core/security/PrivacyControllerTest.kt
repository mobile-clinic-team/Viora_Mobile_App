package com.viora.mobile.core.security

import com.viora.mobile.core.session.*
import com.viora.mobile.testutil.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PrivacyControllerTest {
    @Test fun backgroundTimeoutClearsWorkspaceAndResumeRequiresSelection() = runTest {
        val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
        val session = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        session.startDemo()
        val privacy = PrivacyController(session, clock, backgroundScope)
        privacy.background()
        clock.elapsed = 300001
        advanceTimeBy(300001); runCurrent()
        assertNull(session.state.value.workspace)
        assertNotNull(store.credential)
        privacy.foreground()
        assertEquals(SessionPhase.SELECT_WORKSPACE, session.state.value.phase)
    }
}
