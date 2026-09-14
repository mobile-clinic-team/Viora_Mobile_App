package com.viora.mobile.feature.clinical

import com.viora.mobile.app.EnvironmentBindings
import com.viora.mobile.core.session.SessionCoordinator
import com.viora.mobile.feature.clinical.data.SyntheticClinicalReadRepository
import com.viora.mobile.feature.clinical.data.SyntheticClinicalData
import com.viora.mobile.feature.clinical.domain.ClinicalReader
import com.viora.mobile.testutil.*
import kotlinx.coroutines.CoroutineScope

internal class ClinicalFixture(scope: CoroutineScope) {
    val clock = FakeClock()
    val bindings = EnvironmentBindings(clock)
    val session = SessionCoordinator(bindings.auth, bindings.workspaces, FakeSecureStore(), clock, scope)
    val requests = FakeAuthenticatedRequestExecutor()
    val operational = bindings.operational(session, requests, clock)
    val repository = SyntheticClinicalReadRepository(session)
    val reader = ClinicalReader(repository, operational.patients, operational.appointments, session)
    suspend fun login() { session.restore(); session.signIn(); session.selectWorkspace(SyntheticClinicalData.WORKSPACE_A) }
    fun json(name: String) = requireNotNull(javaClass.classLoader!!.getResource("fixtures/clinical/" + name + ".json")).readText()
}
