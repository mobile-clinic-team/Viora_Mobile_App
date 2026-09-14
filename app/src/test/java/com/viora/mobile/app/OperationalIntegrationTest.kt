package com.viora.mobile.app

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.operations.OperationCoordinator
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.appointments.ui.*
import com.viora.mobile.feature.patients.domain.*
import com.viora.mobile.testutil.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class OperationalIntegrationTest {
    private class Fixture(scope: kotlinx.coroutines.CoroutineScope) {
        val clock = FakeClock()
        val store = FakeSecureStore()
        val bindings = EnvironmentBindings(clock)
        val requests = FakeAuthenticatedRequestExecutor()
        val session = SessionCoordinator(bindings.auth, bindings.workspaces, store, clock, scope)
        val repositories = bindings.operational(session, requests, clock)
        val operations = OperationCoordinator(session, store, clock)
        suspend fun login() { session.restore(); session.signIn(); session.selectWorkspace(A) }
    }

    @Test fun compositionIsApplicationScopedAndDoesNotUseTransport() = runTest {
        val f = Fixture(backgroundScope)
        assertSame(f.repositories, f.bindings.operational(f.session, f.requests, f.clock))
        f.login()
        assertEquals(1, (f.repositories.patients.search(PatientSearch("Synthetic")) as ApiResult.Success).value.items.size)
        assertTrue(f.requests.requests.isEmpty())
    }

    @Test fun workspaceSwitchInvalidatesSnapshotAndProjectsDistinctFieldsAndLocations() = runTest {
        val f = Fixture(backgroundScope); f.login()
        val snapshot = requireNotNull(f.session.snapshot())
        val first = (f.repositories.patients.search(PatientSearch("Synthetic")) as ApiResult.Success).value.items.single()
        assertTrue(first.phone is PatientField.Disclosed)
        val locations = f.repositories.locations(snapshot.workspace!!)
        assertEquals(snapshot.workspace!!.locations.single().id, locations.single().id)
        f.session.selectWorkspace(B)
        assertFalse(f.session.matches(snapshot))
        assertTrue(f.repositories.patients.patient(first.id) is ApiResult.Failure)
        val second = (f.repositories.patients.search(PatientSearch("Synthetic")) as ApiResult.Success).value.items.single()
        assertEquals(B, second.workspaceId)
        assertSame(PatientField.Withheld, second.phone)
        assertNotEquals(locations, f.repositories.locations(f.session.state.value.workspace!!))
        assertFalse(f.session.state.value.workspace!!.allows("encounter.create"))
        f.session.logout()
        assertTrue(f.repositories.patients.search(PatientSearch("Synthetic")) is ApiResult.Failure)
    }

    @Test fun inactiveLocationsCannotBeSelectedAndDuplicateLocationsRejectContext() = runTest {
        val f = Fixture(backgroundScope); f.login()
        val context = f.session.state.value.workspace!!
        val inactive = context.copy(locations = context.locations.map { it.copy(status = "INACTIVE") })
        inactive.validate()
        assertTrue(f.repositories.locations(inactive).isEmpty())
        assertThrows(IllegalArgumentException::class.java) { context.copy(locations = context.locations + context.locations).validate() }
        assertFalse(context.copy(permissions = setOf("future.grant")).allows("future.grant"))
    }

    @Test fun clinicalHandoffChecksWorkspaceGrantAndContainsOnlyIds() = runTest {
        val f = Fixture(backgroundScope); f.login()
        var route: Any? = null
        val host = OperationalNavigatorHost()
        val delegate = object : OperationalNavigator {
            override fun navigate(value: Any) { route = value }
            override fun back() = Unit
            override fun dirtyForm(dirty: Boolean) = Unit
        }
        host.bind(delegate)
        val clinical = ClinicalPlaceholderNavigation(host, f.session)
        val patient = (f.repositories.patients.search(PatientSearch("Synthetic")) as ApiResult.Success).value.items.single()
        clinical.open(EncounterEntry.Create(patient.reference()))
        assertEquals(ClinicalEntryPlaceholderRoute(patient.id), route)
        route = null
        f.session.selectWorkspace(B)
        clinical.open(EncounterEntry.Create(patient.reference()))
        assertNull(route)
        host.unbind(delegate); host.navigate(Schedule)
        assertNull(route)
    }

    @Test fun successfulSyntheticOperationUsesDurableReceiptAndAcknowledgmentAllowsNextAction() = runTest {
        val f = Fixture(backgroundScope); f.login()
        val id = "69999999-9999-4999-8999-999999999999"
        val first = (f.repositories.appointments.appointment(id) as ApiResult.Success).value
        val submitter = AppointmentSubmitter(f.repositories.appointments, f.session, f.operations, f.repositories.capability, backgroundScope)
        submitter.transition(first.reference(), AppointmentAction.CONFIRM)
        runCurrent()
        assertTrue(submitter.state.value is AppointmentSubmitState.Saved)
        assertEquals(1, f.store.receipts.size)
        var acknowledged = false
        submitter.acknowledgeSaved { acknowledged = true }
        runCurrent()
        assertTrue(acknowledged)
        assertTrue(f.store.receipts.isEmpty())
        assertEquals(AppointmentSubmitState.Idle, submitter.state.value)
        val confirmed = (f.repositories.appointments.appointment(id) as ApiResult.Success).value
        assertEquals(AppointmentStatus.CONFIRMED, confirmed.knownStatus)
        submitter.transition(confirmed.reference(), AppointmentAction.CHECK_IN)
        runCurrent()
        assertEquals(AppointmentStatus.CHECKED_IN, (submitter.state.value as AppointmentSubmitState.Saved).appointment!!.knownStatus)
    }
}
