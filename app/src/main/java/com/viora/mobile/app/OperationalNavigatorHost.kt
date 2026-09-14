package com.viora.mobile.app

import com.viora.mobile.feature.appointments.ui.OperationalNavigator
import com.viora.mobile.feature.appointments.domain.EncounterEntry

/** Application-owned bridge from feature navigation requests to the current protected NavHost. */
class OperationalNavigatorHost : OperationalNavigator {
    private var delegate: OperationalNavigator? = null

    fun bind(navigator: OperationalNavigator) { delegate = navigator }

    fun unbind(navigator: OperationalNavigator) {
        if (delegate === navigator) delegate = null
    }

    override fun navigate(route: Any) { delegate?.navigate(route) }
    override fun back() { delegate?.back() }
    override fun dirtyForm(dirty: Boolean) { delegate?.dirtyForm(dirty) }
}

/** Temporary clinical handoff that preserves the public entry contract without implementing clinical data. */
class ClinicalPlaceholderNavigation(private val navigator: OperationalNavigator,
    private val session: com.viora.mobile.core.session.SessionPort) :
    com.viora.mobile.feature.appointments.domain.EncounterNavigation {
    override fun open(entry: EncounterEntry) {
        val state = session.state.value
        val context = state.workspace ?: return
        if (state.phase != com.viora.mobile.core.session.SessionPhase.READY) return
        when (entry) {
            is EncounterEntry.Create -> if (entry.patient.workspaceId == context.id && context.allows("encounter.create") &&
                com.viora.mobile.core.model.Ids.valid(entry.patient.patientId) &&
                (entry.appointmentId == null || com.viora.mobile.core.model.Ids.valid(entry.appointmentId)))
                navigator.navigate(ClinicalEntryPlaceholderRoute(patientId = entry.patient.patientId, appointmentId = entry.appointmentId))
            is EncounterEntry.Existing -> if (context.allows("encounter.read") && com.viora.mobile.core.model.Ids.valid(entry.encounterId))
                navigator.navigate(ClinicalEntryPlaceholderRoute(encounterId = entry.encounterId))
        }
    }
}
