package com.viora.mobile.core.session

import com.viora.mobile.testutil.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionCoordinatorTest {
    @Test fun concurrentRefreshIsSingleFlightAndDurableBeforePublication() = runTest {
        val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
        val session = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        session.startDemo()
        val old = store.credential!!.refreshToken
        val gate = CompletableDeferred<Unit>()
        backend.refreshAction = { gate.await(); backend.bundle() }
        clock.elapsed = 601000
        val reads = (1..20).map { async { session.snapshot() } }
        runCurrent()
        assertEquals(1, backend.refreshCalls)
        gate.complete(Unit)
        val snapshots = reads.awaitAll()
        assertEquals(1, snapshots.map { it!!.accessToken }.distinct().size)
        assertNotEquals(old, store.credential!!.refreshToken)
        assertEquals(1, backend.refreshCalls)
        assertNotNull(session.snapshot())
        assertEquals(1, backend.refreshCalls)
    }

    @Test fun logoutDoesNotWaitForRefreshOrAllowLateCredentialRevival() = runTest {
        val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
        val session = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        session.startDemo()
        val gate = CompletableDeferred<Unit>()
        backend.refreshAction = { gate.await(); backend.bundle() }
        clock.elapsed = 601000
        val refresh = async { session.snapshot() }
        runCurrent()
        session.logout()
        assertEquals(SessionPhase.SIGNED_OUT, session.state.value.phase)
        assertNull(store.credential)
        gate.complete(Unit)
        assertNull(refresh.await())
        assertNull(store.credential)
        assertNull(session.snapshot())
    }

    @Test fun lostRefreshResponseClearsAndNeverRetriesOldToken() = runTest {
        val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
        val session = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        session.startDemo()
        backend.refreshAction = { throw java.io.IOException("Synthetic failure") }
        clock.elapsed = 601000
        assertNull(session.snapshot())
        assertNull(session.snapshot())
        assertNull(store.credential)
        assertEquals(1, backend.refreshCalls)
        assertEquals(SessionPhase.SIGNED_OUT, session.state.value.phase)
    }

    @Test fun failedCredentialReplacementNeverPublishesSession() = runTest {
        val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
        val session = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        session.restore(); store.rejectWrites = true; session.signIn()
        assertEquals(SessionPhase.SIGNED_OUT, session.state.value.phase)
        assertNull(store.credential)
        assertNull(session.snapshot(false))
    }

    @Test fun delayedWorkspaceResponseCannotCrossContextEpoch() = runTest {
        val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
        val session = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        session.startDemo()
        val old = session.snapshot()!!
        val gate = CompletableDeferred<Unit>()
        backend.workspaceAction = { if (it == A) gate.await(); backend.context(it) }
        val a = async { session.selectWorkspace(A) }; runCurrent()
        session.selectWorkspace(B)
        gate.complete(Unit); a.await()
        assertEquals(B, session.state.value.workspace!!.id)
        assertFalse(session.state.value.workspace!!.allows("patient.read"))
        assertFalse(session.matches(old))
    }

    @Test fun processRestartRefreshesButNeverRestoresWorkspaceOrBackStack() = runTest {
        val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
        val original = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        original.startDemo()
        val restored = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        restored.restore()
        assertEquals(1, backend.refreshCalls)
        assertEquals(SessionPhase.SELECT_WORKSPACE, restored.state.value.phase)
        assertNull(restored.state.value.workspace)
        assertNull(restored.snapshot())
    }

    @Test fun oneMembershipAutoValidatesButZeroCannotUnlock() = runTest {
        val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
        backend.membershipValues = backend.membershipValues.take(1)
        val session = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        session.restore(); session.signIn()
        assertEquals(A, session.state.value.workspace!!.id)
        session.logout()
        backend.membershipValues = emptyList()
        session.signIn()
        assertEquals(SessionPhase.SELECT_WORKSPACE, session.state.value.phase)
        assertNull(session.snapshot())
    }

    @Test fun absoluteExpirySignsOutWithoutExtendingFamily() = runTest {
        val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
        val session = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        session.startDemo(); clock.elapsed = 43200001
        assertNull(session.snapshot())
        assertEquals(0, backend.refreshCalls)
        assertNull(store.credential)
    }

    @Test fun idleAbsoluteDeadlineAlsoClearsSession() = runTest {
        val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
        val session = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        session.startDemo()
        clock.elapsed = 43200001
        advanceTimeBy(43200001); runCurrent()
        assertEquals(SessionPhase.SIGNED_OUT, session.state.value.phase)
        assertNull(store.credential)
    }

    @Test fun unknownPermissionNeverGrantsAnAction() {
        val context = WorkspaceContext(A, "Demo", "Asia/Ho_Chi_Minh", "\"policy-1\"",
            setOf("patient.read", "superuser.everything"))
        assertTrue(context.allows("patient.read"))
        assertFalse(context.allows("superuser.everything"))
        assertFalse(context.allows("draft.approve"))
    }
}
