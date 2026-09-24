package com.viora.mobile.feature.clinical

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.feature.clinical.ui.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ClinicalStateTest {
    @Test fun initialLoadingLoadedAndEmptyAreDistinct() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val loader = ClinicalStateLoader<List<String>>(f.session, backgroundScope, List<String>::isEmpty)
        assertEquals(ClinicalState.Initial, loader.state.value)
        loader.load { ApiResult.Success(listOf("fixture")) }
        assertEquals(ClinicalState.Loading, loader.state.value); runCurrent()
        assertEquals(listOf("fixture"), (loader.state.value as ClinicalState.Loaded).value)
        loader.load { ApiResult.Success(emptyList()) }; runCurrent()
        assertTrue(loader.state.value is ClinicalState.Empty)
    }
    @Test fun validGenericReadErrorCanRetryWithoutChangingStateContract() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val loader = ClinicalStateLoader<String>(f.session, backgroundScope)
        var response: ApiResult<String> = ApiResult.Failure("READ_REJECTED", 409)
        loader.load { response }; runCurrent()
        assertEquals(ClinicalState.Error("READ_REJECTED"), loader.state.value)
        response = ApiResult.Success("current"); loader.retry(); runCurrent()
        assertEquals("current", (loader.state.value as ClinicalState.Loaded).value)
    }
    @Test fun denialNotFoundErrorRetryAndConflictAreNotCollapsed() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val loader = ClinicalStateLoader<String>(f.session, backgroundScope)
        val cases = listOf(
            ApiResult.Failure("FORBIDDEN", 403) to ClinicalState.PermissionDenied,
            ApiResult.Failure("RESOURCE_NOT_FOUND", 404) to ClinicalState.NotFound,
            ApiResult.Failure("INVALID_RESPONSE") to ClinicalState.Error("INVALID_RESPONSE"),
            ApiResult.Failure("TRANSPORT_ERROR") to ClinicalState.RetriableFailure("TRANSPORT_ERROR"),
            ApiResult.Failure("AUDIT_UNAVAILABLE", 503) to ClinicalState.RetriableFailure("AUDIT_UNAVAILABLE"),
            ApiResult.Failure("VERSION_CONFLICT", 412) to ClinicalState.Stale,
            ApiResult.StaleScope to ClinicalState.Stale,
        )
        for ((result, expected) in cases) { loader.load { result }; runCurrent(); assertEquals(expected, loader.state.value) }
        var response: ApiResult<String> = ApiResult.Failure("TRANSPORT_ERROR")
        var calls = 0
        loader.load { calls++; response }; runCurrent()
        response = ApiResult.Success("recovered"); loader.retry(); runCurrent()
        assertEquals("recovered", (loader.state.value as ClinicalState.Loaded).value); assertEquals(2, calls)
    }
    @Test fun hiddenDestinationDropsLateResultAfterWorkspaceSwitchAndCannotRetryOldScope() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val loader = ClinicalStateLoader<String>(f.session, backgroundScope)
        val gate = CompletableDeferred<Unit>(); var calls = 0
        loader.load { calls++; withContext(NonCancellable) { gate.await(); ApiResult.Success("obsolete") } }; runCurrent()
        f.session.chooseWorkspace(); runCurrent(); gate.complete(Unit); runCurrent()
        assertEquals(ClinicalState.Initial, loader.state.value)
        loader.retry(); runCurrent(); assertEquals(1, calls)
    }
    @Test fun newerReadWinsEvenIfOldReadIgnoresCancellation() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val loader = ClinicalStateLoader<String>(f.session, backgroundScope)
        val gate = CompletableDeferred<Unit>()
        loader.load { withContext(NonCancellable) { gate.await(); ApiResult.Success("old") } }; runCurrent()
        loader.load { ApiResult.Success("new") }; runCurrent(); gate.complete(Unit); runCurrent()
        assertEquals("new", (loader.state.value as ClinicalState.Loaded).value)
        f.session.logout(); runCurrent(); assertEquals(ClinicalState.Initial, loader.state.value)
    }
    @Test fun viewModelLoadsRetriesAndClearsOnLogout() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val owner = androidx.lifecycle.ViewModelStore()
        try {
            val f = ClinicalFixture(backgroundScope); f.login()
            var result: ApiResult<String> = ApiResult.Failure("TRANSPORT_ERROR")
            val model = ClinicalViewModel(f.session, { _: String -> false }) { result }
            owner.put("clinical", model)
            assertEquals(ClinicalState.Loading, model.state.value); runCurrent()
            assertTrue(model.state.value is ClinicalState.RetriableFailure)
            result = ApiResult.Success("read"); model.retry(); runCurrent()
            assertTrue(model.state.value is ClinicalState.Loaded)
            f.session.logout(); runCurrent(); assertEquals(ClinicalState.Initial, model.state.value)
        } finally { owner.clear(); Dispatchers.resetMain() }
    }
}
