package com.viora.mobile.app

import android.content.Context
import com.viora.mobile.core.network.ApiClient
import com.viora.mobile.core.operations.OperationCoordinator
import com.viora.mobile.core.operations.OperationPort
import com.viora.mobile.core.security.KeystoreSecureStore
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.SystemAppClock
import com.viora.mobile.app.navigation.NavigationRegistry
import com.viora.mobile.feature.appointments.domain.PickerHandles
import com.viora.mobile.feature.appointments.ui.OperationalScreens
import com.viora.mobile.feature.clinical.domain.ClinicalReader
import com.viora.mobile.feature.clinical.ui.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

class AppGraph(context: Context) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val clock = SystemAppClock()
    private val store = KeystoreSecureStore(context)
    // No network call can leave the synthetic application graph.
    private val apiClient = ApiClient("https://disabled.invalid", clock, networkEnabled = false)
    private val bindings = EnvironmentBindings(clock)
    val synthetic = bindings.synthetic
    val session: SessionPort = SessionCoordinator(bindings.auth, bindings.workspaces, store, clock, scope)
    val requests: AuthenticatedRequestPort = AuthenticatedRequestExecutor(apiClient, session)
    val operations: OperationPort = OperationCoordinator(session, store, clock)
    val operational: OperationalDependencies = bindings.operational(session, requests, clock)
    val operationalNavigator = OperationalNavigatorHost()
    val clinicalReads = bindClinicalReads(session, requests)
    private val assistantContexts = com.viora.mobile.feature.assistant.domain.AssistantContextReader(operational.patients, clinicalReads, session)
    val assistant = bindAssistant(session, clock, assistantContexts, scope)
    private val assistantScreens = com.viora.mobile.feature.assistant.ui.AssistantScreens(assistant.repository, assistantContexts,
        assistant.assurance, assistant.handoff, clock, operationalNavigator::navigate, operationalNavigator::back,
        operationalNavigator::dirtyForm, com.viora.mobile.feature.clinical.domain.ClinicalRecordNavigation { reference ->
            if (session.state.value.phase == SessionPhase.READY && session.state.value.workspace?.id == reference.workspaceId &&
                session.state.value.workspace?.allows("record.read") == true) operationalNavigator.navigate(ClinicalRecordRoute(reference.recordId))
        }, synthetic)
    private val clinicalScreens = ClinicalScreens(ClinicalReader(clinicalReads, operational.patients, operational.appointments, session),
        operationalNavigator::navigate, operationalNavigator::back)
    private val pickerHandles = PickerHandles { session.state.value.authEpoch to session.state.value.contextEpoch }
    private val operationalScreens = OperationalScreens(operational.patients, operational.doctors, operational.appointments,
        clock, operationalNavigator, pickerHandles, operational.capability, operational.locations,
        operational.clinical ?: ClinicalNavigationAdapter(session, operationalNavigator::navigate))
    val privacy = com.viora.mobile.core.security.PrivacyController(session, clock, scope)
    val navigation = NavigationRegistry(
        NavigationBindings.contributions(operationalScreens, ClinicalNavigationContribution(clinicalScreens)) +
            com.viora.mobile.feature.assistant.ui.AssistantNavigationContribution(assistantScreens),
        NavigationBindings.tabs)
    init {
        scope.launch {
            session.state.map { it.authEpoch to it.contextEpoch }.distinctUntilChanged().collect {
                pickerHandles.clear()
            }
        }
    }
    fun clearOperationalPickers() { pickerHandles.clear() }
}
