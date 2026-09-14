package com.viora.mobile.feature.appointments.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.viora.mobile.app.navigation.NavigationDependencies
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.core.session.WorkspaceContext
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.doctors.domain.DoctorDirectory
import com.viora.mobile.feature.doctors.ui.*
import com.viora.mobile.feature.patients.domain.*
import com.viora.mobile.feature.patients.ui.*
import java.time.*

/** Ready for constructor wiring by Member A. No hidden graph, repository cache, HTTP or storage access. */
class OperationalScreens(
    private val patients: PatientDirectory, private val doctors: DoctorDirectory,
    private val appointments: AppointmentRepository, private val clock: AppClock,
    private val navigator: OperationalNavigator, private val pickers: PickerHandles,
    private val capability: SchedulingCapability = SchedulingCapability.Unavailable,
    private val locations: (WorkspaceContext) -> List<AppointmentLocationOption> = { emptyList() },
    private val clinical: EncounterNavigation? = null,
) : OperationalDestinationScreens {
    @Composable override fun patients(pickerHandle: String?, dependencies: NavigationDependencies) {
        if (pickerHandle != null && !pickers.alive(pickerHandle, PickerKind.PATIENT)) { deadPicker(); return }
        val model = model { PatientListViewModel(patients, dependencies.session) }
        val query by model.query.collectAsStateWithLifecycle(); val state by model.state.collectAsStateWithLifecycle()
        PatientListScreen(query, state, model::search, model::retry, model::next) { id ->
            if (pickerHandle == null) navigator.navigate(PatientDetailRoute(id))
            else if (pickers.select(pickerHandle, PickerKind.PATIENT, id)) navigator.back()
        }
    }
    @Composable override fun patient(id: String, dependencies: NavigationDependencies) {
        val model = model { PatientDetailViewModel(patients, dependencies.session, id) }
        val state by model.state.collectAsStateWithLifecycle(); val sessionState by dependencies.session.state.collectAsStateWithLifecycle(); val context = sessionState.workspace
        PatientDetailScreen(state, model::retry, { navigator.navigate(AppointmentCreateRoute(patientId = it)) },
            { clinical?.open(EncounterEntry.Create(it)) }, capability.available && context?.allows("appointment.create") == true,
            clinical != null && context?.allows("encounter.create") == true) {
            if (context != null) {
                val zone = ZoneId.of(context.timezone); val bounds = Scheduling.clinicDay(clock.now().atZone(zone).toLocalDate(), zone)
                val agenda = model { AgendaViewModel(appointments, dependencies.session, AppointmentQuery(bounds.first, bounds.second, patientId = id)) }
                val appointments by agenda.state.collectAsStateWithLifecycle()
                Text("Today's appointments", style = MaterialTheme.typography.titleMedium)
                OperationalReadPane(appointments, agenda::retry, "No appointments today.") { page ->
                    page.items.forEach { item -> TextButton(onClick = { navigator.navigate(AppointmentDetailRoute(item.id)) }) {
                        Text("${item.startsAt.atZone(zone).toLocalTime()} · ${item.status}")
                    } }
                    if (page.nextCursor != null) TextButton(onClick = { navigator.navigate(AgendaRoute(id)) }) { Text("Open patient schedule") }
                }
                Text("Encounter history", style = MaterialTheme.typography.titleMedium)
                Text("Encounter history is unavailable in this operational build.")
            }
        }
    }
    @Composable override fun doctors(pickerHandle: String?, dependencies: NavigationDependencies) {
        if (pickerHandle != null && !pickers.alive(pickerHandle, PickerKind.DOCTOR)) { deadPicker(); return }
        val model = model { DoctorListViewModel(doctors, dependencies.session) }
        val query by model.query.collectAsStateWithLifecycle(); val state by model.state.collectAsStateWithLifecycle()
        DoctorListScreen(query, state, { model.search(it) }, model::retry, model::next) { navigator.navigate(DoctorDetailRoute(it, pickerHandle)) }
    }
    @Composable override fun doctor(id: String, pickerHandle: String?, dependencies: NavigationDependencies) {
        if (pickerHandle != null && !pickers.alive(pickerHandle, PickerKind.DOCTOR)) { deadPicker(); return }
        val sessionState by dependencies.session.state.collectAsStateWithLifecycle(); val context = sessionState.workspace ?: return
        val zone = ZoneId.of(context.timezone); val bounds = Scheduling.clinicDay(clock.now().atZone(zone).toLocalDate(), zone)
        val model = model { DoctorDetailViewModel(doctors, dependencies.session, id, bounds.first, bounds.second) }
        val state by model.state.collectAsStateWithLifecycle(); val shifts by model.schedule.collectAsStateWithLifecycle()
        DoctorDetailScreen(state, shifts, zone, model::retry, model::retryShifts, pickerHandle?.let { handle ->
            { selected -> if (pickers.select(handle, PickerKind.DOCTOR, selected)) { navigator.back(); navigator.back() } }
        })
    }
    @Composable override fun agenda(patientId: String?, dependencies: NavigationDependencies) {
        val sessionState by dependencies.session.state.collectAsStateWithLifecycle(); val context = sessionState.workspace ?: return
        val zone = ZoneId.of(context.timezone); val bounds = Scheduling.clinicDay(clock.now().atZone(zone).toLocalDate(), zone)
        val model = model { AgendaViewModel(appointments, dependencies.session, AppointmentQuery(bounds.first, bounds.second, patientId = patientId)) }
        val state by model.state.collectAsStateWithLifecycle()
        val currentFilters by model.filters.collectAsStateWithLifecycle()
        val filters = currentFilters ?: return
        Column(Modifier.fillMaxSize()) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = { val day = filters.from.atZone(zone).toLocalDate().minusDays(1); val next = Scheduling.clinicDay(day, zone)
                model.filter(filters.copy(from = next.first, to = next.second, page = PageRequest())) }) { Text("Previous day") }
            Text(filters.from.atZone(zone).toLocalDate().toString())
            TextButton(onClick = { val day = filters.from.atZone(zone).toLocalDate().plusDays(1); val next = Scheduling.clinicDay(day, zone)
                model.filter(filters.copy(from = next.first, to = next.second, page = PageRequest())) }) { Text("Next day") }
        }
        var statusMenu by remember { mutableStateOf(false) }
        Box { TextButton(onClick = { statusMenu = true }) { Text("Status: ${filters.status?.name ?: "All"}") }
            DropdownMenu(statusMenu, onDismissRequest = { statusMenu = false }) {
                DropdownMenuItem(text = { Text("All statuses") }, onClick = { statusMenu = false; model.filter(filters.copy(status = null, page = PageRequest())) })
                AppointmentStatus.entries.forEach { status -> DropdownMenuItem(text = { Text(status.name) },
                    onClick = { statusMenu = false; model.filter(filters.copy(status = status, page = PageRequest())) }) }
            }
        }
        Row {
            TextButton(onClick = { val handle = pickers.open(PickerKind.DOCTOR) { selected -> model.filter(filters.copy(doctorId = selected, page = PageRequest())) }
                navigator.navigate(DoctorPickerRoute(handle)) }) { Text("Filter doctor") }
            TextButton(onClick = { model.filter(filters.copy(doctorId = null, locationId = null, page = PageRequest())) }) { Text("Clear filters") }
        }
        locations(context).forEach { location -> FilterChip(filters.locationId == location.id,
            { model.filter(filters.copy(locationId = location.id, page = PageRequest())) }, label = { Text(location.label) }) }
        Box(Modifier.weight(1f)) { AgendaScreen(state, zone, model::retry, model::next, { navigator.navigate(AppointmentDetailRoute(it)) },
            { navigator.navigate(com.viora.mobile.app.Doctors) }, { navigator.navigate(AppointmentCreateRoute(patientId)) },
            capability.available && context.allows("appointment.create")) }
        }
    }
    @Composable override fun create(patientId: String?, doctorId: String?, dependencies: NavigationDependencies) {
        form(dependencies, AppointmentFormState(patientId = patientId, doctorId = doctorId), null)
    }
    @Composable override fun appointment(id: String, dependencies: NavigationDependencies) {
        val sessionState by dependencies.session.state.collectAsStateWithLifecycle(); val context = sessionState.workspace ?: return
        val model = model { AppointmentDetailViewModel(appointments, dependencies.session, id) }
        val submission = model { SubmissionViewModel(appointments, dependencies, capability) }
        val state by model.state.collectAsStateWithLifecycle(); val submitted by submission.submitter.state.collectAsStateWithLifecycle()
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f)) { AppointmentDetailScreen(state, ZoneId.of(context.timezone), model::retry,
                { appointment, action -> capability.available && capability.blockedDecisionIds.isEmpty() &&
                    submitted == AppointmentSubmitState.Idle && context.allows(action.permission) && action.permission in appointment.allowedActions && appointment.knownStatus in action.source },
                { appointment, action -> submission.submitter.transition(appointment.reference(), action) },
                { navigator.navigate(AppointmentEditRoute(it)) }, capability.available && context.allows("appointment.reschedule"),
                clinical?.let { { entry -> it.open(entry) } }) }
            AppointmentSubmissionPane(submitted)
            if (submitted is AppointmentSubmitState.Saved) Button(onClick = {
                submission.submitter.acknowledgeSaved { model.retry() }
            }) { Text("Refresh current appointment") }
        }
    }
    @Composable override fun edit(id: String, dependencies: NavigationDependencies) {
        val sessionState by dependencies.session.state.collectAsStateWithLifecycle(); val context = sessionState.workspace ?: return
        val model = model { AppointmentDetailViewModel(appointments, dependencies.session, id) }
        val state by model.state.collectAsStateWithLifecycle()
        OperationalReadPane(state, model::retry, "Appointment unavailable.") { value ->
            val zone = ZoneId.of(context.timezone); val start = value.startsAt.atZone(zone); val end = value.endsAt.atZone(zone)
            form(dependencies, AppointmentFormState(value.patientId, value.doctorId, value.locationId,
                start.toLocalDate().toString(), start.toLocalTime().toString(), end.toLocalTime().toString(),
                value.reason.orEmpty(), value.notes.orEmpty(), start.offset, end.offset), value.reference())
        }
    }
    @Composable private fun form(dependencies: NavigationDependencies, initial: AppointmentFormState, current: AppointmentReference?) {
        val sessionState by dependencies.session.state.collectAsStateWithLifecycle(); val context = sessionState.workspace ?: return
        val model = model { AppointmentFormViewModel(dependencies.session, ZoneId.of(context.timezone), initial) }
        val submission = model { SubmissionViewModel(appointments, dependencies, capability) }
        val state by model.state.collectAsStateWithLifecycle(); val submitted by submission.submitter.state.collectAsStateWithLifecycle()
        // Picker navigation temporarily hides this form; retain its exit guard until explicit exit or scope invalidation.
        LaunchedEffect(state.dirty, submitted) { navigator.dirtyForm(
            state.dirty && submitted !is AppointmentSubmitState.Saved ||
                submitted is AppointmentSubmitState.Submitting || submitted is AppointmentSubmitState.CheckOutcome) }
        AppointmentFormScreen(state, model::change, locations(context), {
            val handle = pickers.open(PickerKind.PATIENT) { id -> val v = model.state.value
                model.change(AppointmentFormState(id, v.doctorId, v.locationId, v.date, v.start, v.end, v.reason, v.notes, v.startOffset, v.endOffset, true)) }
            navigator.navigate(PatientPickerRoute(handle))
        }, {
            val handle = pickers.open(PickerKind.DOCTOR) { id -> val v = model.state.value
                model.change(AppointmentFormState(v.patientId, id, v.locationId, v.date, v.start, v.end, v.reason, v.notes, v.startOffset, v.endOffset, true)) }
            navigator.navigate(DoctorPickerRoute(handle))
        }, model.offsets(true), model.offsets(false), {
            model.validate()?.let { input -> if (current == null) submission.submitter.create(input)
                else submission.submitter.reschedule(current, AppointmentReschedule(input.doctorId, input.locationId, input.startsAt, input.endsAt)) }
        }, { navigator.dirtyForm(false); navigator.back() }, capability.available && capability.blockedDecisionIds.isEmpty() &&
            context.allows(if (current == null) "appointment.create" else "appointment.reschedule"), submitted,
            restart = submission.submitter::resetForNewIntent, edit = current != null,
            saved = { submission.submitter.acknowledgeSaved { appointment ->
                navigator.dirtyForm(false)
                navigator.back()
                if (appointment != null) navigator.navigate(AppointmentDetailRoute(appointment.id))
            } })
    }
    @Composable private fun deadPicker() { Column(Modifier.padding(16.dp)) {
        Text("This selection has expired."); Button(onClick = { navigator.navigate(com.viora.mobile.app.Schedule) }) { Text("Return to schedule") }
    } }
    @Composable private inline fun <reified T : ViewModel> model(crossinline create: () -> T): T = viewModel(factory = object : ViewModelProvider.Factory {
        override fun <VM : ViewModel> create(modelClass: Class<VM>): VM {
            require(modelClass == T::class.java)
            @Suppress("UNCHECKED_CAST") return create() as VM
        }
    })
}

private class SubmissionViewModel(repository: AppointmentRepository, dependencies: NavigationDependencies,
    capability: SchedulingCapability) : ViewModel() {
    val submitter = AppointmentSubmitter(repository, dependencies.session, dependencies.operations, capability, viewModelScope)
}
