package com.viora.mobile.feature.clinical.ui

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.toRoute
import com.viora.mobile.app.navigation.*
import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.appointments.domain.*
import kotlinx.serialization.Serializable

@Serializable data class ClinicalEntryRoute(val patientId: String, val appointmentId: String? = null)
@Serializable data class ClinicalEncounterRoute(val id: String)
@Serializable data class ClinicalRecordRoute(val id: String)

/** B's Create entry means inspect its authorized context here; it never executes CL01. */
class ClinicalNavigationAdapter(private val session: SessionPort, private val navigate: (Any) -> Unit) : EncounterNavigation {
    override fun open(entry: EncounterEntry) {
        val state = session.state.value
        val context = state.workspace ?: return
        if (state.phase != SessionPhase.READY || !context.allows("encounter.read")) return
        when (entry) {
            is EncounterEntry.Create -> if (entry.patient.workspaceId == context.id && Ids.valid(entry.patient.patientId) &&
                (entry.appointmentId == null || Ids.valid(entry.appointmentId)))
                navigate(ClinicalEntryRoute(entry.patient.patientId, entry.appointmentId))
            is EncounterEntry.Existing -> if (Ids.valid(entry.encounterId)) navigate(ClinicalEncounterRoute(entry.encounterId))
        }
    }
}

class ClinicalNavigationContribution(private val screens: ClinicalScreens) : NavigationContribution {
    override val id = "clinical-read"
    override val routeKeys = setOf("clinical-entry", "clinical-encounter", "clinical-record")
    override fun register(builder: NavGraphBuilder, dependencies: NavigationDependencies) = with(builder) {
        composable<ClinicalEntryRoute> { entry -> val route = entry.toRoute<ClinicalEntryRoute>()
            screens.Entry(route, dependencies.session) }
        composable<ClinicalEncounterRoute> { entry -> screens.Encounter(entry.toRoute<ClinicalEncounterRoute>().id, dependencies.session) }
        composable<ClinicalRecordRoute> { entry -> screens.Record(entry.toRoute<ClinicalRecordRoute>().id, dependencies.session) }
    }
}
