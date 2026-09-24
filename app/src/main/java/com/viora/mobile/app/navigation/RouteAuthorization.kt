package com.viora.mobile.app.navigation

import androidx.compose.runtime.*
import androidx.compose.material3.Text
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import com.viora.mobile.app.*
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.appointments.ui.*
import com.viora.mobile.feature.assistant.ui.*
import com.viora.mobile.feature.clinical.ui.*
import kotlin.reflect.KClass

object RouteAuthorization {
    private val permissions = mapOf<KClass<*>, String>(
        Patients::class to "patient.read", PatientDetailRoute::class to "patient.read", PatientPickerRoute::class to "patient.read",
        Doctors::class to "doctor.read", DoctorDetailRoute::class to "doctor.read", DoctorPickerRoute::class to "doctor.read",
        Schedule::class to "appointment.read", AgendaRoute::class to "appointment.read", AppointmentDetailRoute::class to "appointment.read",
        AppointmentCreateRoute::class to "appointment.create", AppointmentEditRoute::class to "appointment.reschedule",
        ClinicalEntryRoute::class to "encounter.read", ClinicalEncounterRoute::class to "encounter.read", ClinicalRecordRoute::class to "record.read",
        Assistant::class to "assistant.use", AssistantCreateRoute::class to "assistant.use",
        AssistantConversationRoute::class to "assistant.use", AssistantDraftRoute::class to "draft.read",
    )
    fun allows(state: SessionState, route: KClass<*>): Boolean {
        val role = state.selectedRole ?: return false
        if (role !in setOf(AppRole.DOCTOR, AppRole.NURSE) || !Authorization.canEnter(state, role)) return false
        if (route == Dashboard::class || route == Account::class) return true
        return permissions[route]?.let { state.workspace?.allows(it) } == true
    }
}

/** Runs on destination composition as well as navigation: restored routes cannot skip it. */
inline fun <reified T : Any> NavGraphBuilder.authorizedComposable(
    dependencies: NavigationDependencies,
    crossinline content: @Composable (NavBackStackEntry) -> Unit,
) {
    composable<T> { entry ->
        val state by dependencies.session.state.collectAsState()
        if (RouteAuthorization.allows(state, T::class)) content(entry) else Text("Access denied")
    }
}
