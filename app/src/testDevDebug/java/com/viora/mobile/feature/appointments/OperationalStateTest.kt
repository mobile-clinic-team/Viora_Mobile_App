package com.viora.mobile.feature.appointments

import com.viora.mobile.core.model.*
import com.viora.mobile.core.operations.OperationPort
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.appointments.ui.*
import com.viora.mobile.feature.patients.domain.*
import com.viora.mobile.feature.patients.ui.ScopedRead
import com.viora.mobile.testutil.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OperationalStateTest {
    private suspend fun session(scope: CoroutineScope): SessionCoordinator {
        val clock = FakeClock(); val backend = TestBackend(clock)
        return SessionCoordinator(backend, backend, FakeSecureStore(), clock, scope).also { it.startDemo() }
    }
    @Test fun loadingEmptyFailureRetryAndDeniedHaveDistinctStates() = runTest {
        val session = session(backgroundScope)
        val read = ScopedRead<List<String>>(session, backgroundScope, { it.isEmpty() })
        var response: ApiResult<List<String>> = ApiResult.Failure("TRANSPORT_ERROR")
        read.load { response }; assertEquals(ReadState.Loading, read.state.value); runCurrent()
        assertTrue(read.state.value is ReadState.Failure)
        response = ApiResult.Success(emptyList()); read.retry(); runCurrent(); assertEquals(ReadState.Empty, read.state.value)
        response = ApiResult.Success(listOf("synthetic")); read.retry(); runCurrent(); assertTrue(read.state.value is ReadState.Content)
        response = ApiResult.Failure("FORBIDDEN", 403); read.retry(); runCurrent(); assertEquals(ReadState.PermissionDenied, read.state.value)
    }
    @Test fun searchDebounces300msAndLatestQueryWinsEvenWhenOldReadIgnoresCancellation() = runTest {
        val session = session(backgroundScope); val read = ScopedRead<String>(session, backgroundScope)
        var calls = 0
        read.load(300) { calls++; ApiResult.Success("old") }
        advanceTimeBy(299); runCurrent(); assertEquals(0, calls)
        read.load(300) { calls++; ApiResult.Success("latest") }
        advanceTimeBy(300); runCurrent(); assertEquals(1, calls)
        assertEquals("latest", (read.state.value as ReadState.Content).value)
        val gate = CompletableDeferred<Unit>()
        read.load { withContext(NonCancellable) { gate.await(); ApiResult.Success("obsolete") } }; runCurrent()
        read.load { ApiResult.Success("current") }; runCurrent(); gate.complete(Unit); runCurrent()
        assertEquals("current", (read.state.value as ReadState.Content).value)
    }
    @Test fun hiddenDestinationClearsOnWorkspaceInvalidationAndRejectsLateResults() = runTest {
        val session = session(backgroundScope); var cleared = false
        val read = ScopedRead<String>(session, backgroundScope, onInvalidated = { cleared = true })
        val gate = CompletableDeferred<Unit>()
        read.load { withContext(NonCancellable) { gate.await(); ApiResult.Success("old workspace content") } }; runCurrent()
        session.chooseWorkspace(); runCurrent(); gate.complete(Unit); runCurrent()
        assertTrue(cleared); assertEquals(ReadState.Initial, read.state.value)
        read.retry(); runCurrent(); assertEquals(ReadState.Initial, read.state.value)
    }
    @Test fun receiptFailurePreventsDispatchAndUnknownOutcomeLocksDuplicateTaps() = runTest {
        val session = session(backgroundScope); val f = OperationalFixture(); var admissions = 0
        val operations = object : OperationPort {
            var fail = true
            override suspend fun prepare() = f.operation().also { admissions++; check(!fail) }
            override suspend fun outstanding() = emptyList<com.viora.mobile.core.operations.OperationReceipt>()
            override suspend fun acknowledgeResolved(operationId: String) = Unit
        }
        val backend = f.backend()
        val failed = AppointmentSubmitter(backend, session, operations, SchedulingCapability(true, emptySet()), backgroundScope)
        failed.create(f.creation()); runCurrent(); assertTrue(failed.state.value is AppointmentSubmitState.Rejected)
        assertEquals(1, (backend.appointments(AppointmentQuery(f.clock.now(), f.clock.now().plusSeconds(86400))) as ApiResult.Success).value.items.size)
        operations.fail = false; backend.loseNextWriteResponse = true
        val unknown = AppointmentSubmitter(backend, session, operations, SchedulingCapability(true, emptySet()), backgroundScope)
        unknown.create(f.creation()); unknown.create(f.creation()); runCurrent()
        assertTrue(unknown.state.value is AppointmentSubmitState.CheckOutcome)
        unknown.create(f.creation()); runCurrent(); assertEquals(2, admissions)
        session.chooseWorkspace(); runCurrent(); assertEquals(AppointmentSubmitState.Unavailable, unknown.state.value)
    }
    @Test fun savedReceiptWithFailedFollowUpIsNotAnInvitationToResubmit() = runTest {
        val session = session(backgroundScope); val f = OperationalFixture(); val backend = f.backend()
        val operations = object : OperationPort {
            override suspend fun prepare() = f.operation()
            override suspend fun outstanding() = emptyList<com.viora.mobile.core.operations.OperationReceipt>()
            override suspend fun acknowledgeResolved(operationId: String) = Unit
        }
        backend.failNextRead = true
        val submitter = AppointmentSubmitter(backend, session, operations, SchedulingCapability(true, emptySet()), backgroundScope)
        submitter.create(f.creation()); runCurrent()
        assertNull((submitter.state.value as AppointmentSubmitState.Saved).appointment)
        submitter.create(f.creation(16000, 18000)); runCurrent()
        assertEquals(2, (backend.appointments(AppointmentQuery(f.clock.now(), f.clock.now().plusSeconds(86400))) as ApiResult.Success).value.items.size)
    }
}
