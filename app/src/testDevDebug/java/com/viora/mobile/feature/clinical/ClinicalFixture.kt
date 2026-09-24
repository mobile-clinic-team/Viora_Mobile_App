package com.viora.mobile.feature.clinical

import com.viora.mobile.app.EnvironmentBindings
import com.viora.mobile.core.session.SessionCoordinator
import com.viora.mobile.feature.clinical.data.SyntheticClinicalReadRepository
import com.viora.mobile.feature.clinical.data.SyntheticClinicalData
import com.viora.mobile.feature.clinical.domain.ClinicalReader
import com.viora.mobile.testutil.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers

internal class ClinicalFixture(scope: CoroutineScope) {
    val clock = FakeClock()
    val bindings = EnvironmentBindings(clock)
    private val lifecycleScope = CoroutineScope(scope.coroutineContext + Dispatchers.Default)
    val session = SessionCoordinator(bindings.auth, bindings.workspaces, FakeSecureStore(), clock, lifecycleScope)
    val requests = FakeAuthenticatedRequestExecutor()
    val operational = bindings.operational(session, requests, clock)
    val repository = SyntheticClinicalReadRepository(session)
    val reader = ClinicalReader(repository, operational.patients, operational.appointments, session)
    suspend fun login() { session.startDemo() }
    fun json(name: String) = requireNotNull(javaClass.classLoader!!.getResource("fixtures/clinical/" + name + ".json")).readText()
}
