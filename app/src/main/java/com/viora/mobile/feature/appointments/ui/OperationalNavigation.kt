package com.viora.mobile.feature.appointments.ui

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.toRoute
import com.viora.mobile.app.*
import com.viora.mobile.app.navigation.*
import com.viora.mobile.core.model.Ids
import kotlinx.serialization.Serializable

@Serializable data class PatientPickerRoute(val pickerHandle: String)
@Serializable data class PatientDetailRoute(val id: String)
@Serializable data class DoctorPickerRoute(val pickerHandle: String)
@Serializable data class DoctorDetailRoute(val id: String, val pickerHandle: String? = null)
@Serializable data class AgendaRoute(val patientId: String? = null)
@Serializable data class AppointmentCreateRoute(val patientId: String? = null, val doctorId: String? = null)
@Serializable data class AppointmentDetailRoute(val id: String)
@Serializable data class AppointmentEditRoute(val id: String)

/** Member A supplies the existing NavController and global dirty-exit handling through this port. */
interface OperationalNavigator {
    fun navigate(route: Any)
    fun back()
    fun dirtyForm(dirty: Boolean)
}

/** Composition contract: constructors/factories remain owned by the application, never by repositories. */
interface OperationalDestinationScreens {
    @Composable fun patients(pickerHandle: String?, dependencies: NavigationDependencies)
    @Composable fun patient(id: String, dependencies: NavigationDependencies)
    @Composable fun doctors(pickerHandle: String?, dependencies: NavigationDependencies)
    @Composable fun doctor(id: String, pickerHandle: String?, dependencies: NavigationDependencies)
    @Composable fun agenda(patientId: String?, dependencies: NavigationDependencies)
    @Composable fun create(patientId: String?, doctorId: String?, dependencies: NavigationDependencies)
    @Composable fun appointment(id: String, dependencies: NavigationDependencies)
    @Composable fun edit(id: String, dependencies: NavigationDependencies)
}

/** Install in NavigationBindings once Member A supplies navigator, authorized locations and environment factories. */
class OperationalNavigationContribution(private val screens: OperationalDestinationScreens) : NavigationContribution {
    override val id = "operational-clinic"
    override val routeKeys = setOf("patients", "schedule", "doctors", "patient-detail", "doctor-detail", "appointment-detail",
        "patient-picker", "doctor-picker", "appointment-create", "appointment-edit", "patient-agenda")
    override fun register(builder: NavGraphBuilder, dependencies: NavigationDependencies) = with(builder) {
        authorizedComposable<Patients>(dependencies) { screens.patients(null, dependencies) }
        authorizedComposable<Schedule>(dependencies) { screens.agenda(null, dependencies) }
        authorizedComposable<Doctors>(dependencies) { screens.doctors(null, dependencies) }
        authorizedComposable<PatientPickerRoute>(dependencies) { entry -> val route = entry.toRoute<PatientPickerRoute>()
            valid(route.pickerHandle) { screens.patients(route.pickerHandle, dependencies) } }
        authorizedComposable<PatientDetailRoute>(dependencies) { entry -> val route = entry.toRoute<PatientDetailRoute>()
            valid(route.id) { screens.patient(route.id, dependencies) } }
        authorizedComposable<DoctorPickerRoute>(dependencies) { entry -> val route = entry.toRoute<DoctorPickerRoute>()
            valid(route.pickerHandle) { screens.doctors(route.pickerHandle, dependencies) } }
        authorizedComposable<DoctorDetailRoute>(dependencies) { entry -> val route = entry.toRoute<DoctorDetailRoute>()
            valid(route.id, route.pickerHandle) { screens.doctor(route.id, route.pickerHandle, dependencies) } }
        authorizedComposable<AgendaRoute>(dependencies) { entry -> val route = entry.toRoute<AgendaRoute>()
            valid(route.patientId) { screens.agenda(route.patientId, dependencies) } }
        authorizedComposable<AppointmentCreateRoute>(dependencies) { entry -> val route = entry.toRoute<AppointmentCreateRoute>()
            valid(route.patientId, route.doctorId) { screens.create(route.patientId, route.doctorId, dependencies) } }
        authorizedComposable<AppointmentDetailRoute>(dependencies) { entry -> val route = entry.toRoute<AppointmentDetailRoute>()
            valid(route.id) { screens.appointment(route.id, dependencies) } }
        authorizedComposable<AppointmentEditRoute>(dependencies) { entry -> val route = entry.toRoute<AppointmentEditRoute>()
            valid(route.id) { screens.edit(route.id, dependencies) } }
    }
    @Composable private fun valid(vararg ids: String?, content: @Composable () -> Unit) {
        if (ids.filterNotNull().all(Ids::valid)) content() else Text("Invalid destination. Go back to the schedule.")
    }
}
