package com.viora.mobile.core.operations

import com.viora.mobile.core.session.SessionCoordinator
import com.viora.mobile.testutil.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class OperationCoordinatorTest {
    @Test fun metadataSurvivesRestartAndIsVisibleOnlyToOriginalWorkspace() = runTest {
        val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
        val session = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        session.startDemo()
        val operations = OperationCoordinator(session, store, clock)
        val receipt = operations.prepare()
        assertEquals(receipt, store.receipts.single())
        session.selectWorkspace(B)
        assertTrue(operations.outstanding().isEmpty())
        session.selectWorkspace(A)
        assertEquals(receipt, OperationCoordinator(session, store, clock).outstanding().single())
        operations.acknowledgeResolved(receipt.operationId)
        assertTrue(store.receipts.isEmpty())
        assertEquals(0, backend.refreshCalls)
    }
    @Test fun fullOrFailedStorePreventsAdmissionAndLogoutClearsMetadata() = runTest {
        val clock = FakeClock(); val store = FakeSecureStore(); val backend = TestBackend(clock)
        val session = SessionCoordinator(backend, backend, store, clock, backgroundScope)
        session.startDemo()
        val operations = OperationCoordinator(session, store, clock)
        repeat(16) { operations.prepare() }
        try { operations.prepare(); fail("Admission should be blocked") } catch (_: IllegalStateException) { }
        assertEquals(16, store.receipts.size)
        session.logout()
        assertTrue(store.receipts.isEmpty())
        session.signIn(); session.selectWorkspace(A); store.rejectWrites = true
        try { operations.prepare(); fail("Storage must be durable") } catch (_: IllegalStateException) { }
        assertTrue(store.receipts.isEmpty())
    }
}
