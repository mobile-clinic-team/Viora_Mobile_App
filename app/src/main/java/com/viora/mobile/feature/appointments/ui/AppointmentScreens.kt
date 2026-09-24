package com.viora.mobile.feature.appointments.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.patients.domain.*
import com.viora.mobile.feature.patients.ui.OperationalReadPane
import com.viora.mobile.core.ui.*
import androidx.compose.ui.Alignment
import java.time.format.DateTimeFormatter
import java.time.ZoneId
import java.time.ZoneOffset

@Composable fun AgendaScreen(state: ReadState<DirectoryPage<Appointment>>, zone: ZoneId, retry: () -> Unit, next: () -> Unit,
    select: (String) -> Unit, doctors: () -> Unit, create: () -> Unit, canCreate: Boolean,
    controls: @Composable () -> Unit = {}) {
    val timeFormat = DateTimeFormatter.ofPattern("HH:mm")
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { ScreenHeading("Clinic schedule", "Plan the day and review appointments.") }
        item { controls() }
        item {
            Button(onClick = create, enabled = canCreate, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                VioraIcon("plus"); Spacer(Modifier.width(8.dp)); Text("New appointment")
            }
            TextButton(onClick = doctors, modifier = Modifier.fillMaxWidth()) { Text("Doctor directory"); Spacer(Modifier.width(8.dp)); VioraIcon("next") }
        }
        item {
            Text("Times shown in " + zone.id + ". This page is not a complete queue.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (state is ReadState.Content) {
            items(state.value.items, key = { it.id }) { appointment ->
                val time = appointment.startsAt.atZone(zone).format(timeFormat) + " – " + appointment.endsAt.atZone(zone).format(timeFormat)
                ActionRow(time, if (appointment.knownStatus == null) "Unsupported status" else displayLabel(appointment.status),
                    "schedule", { select(appointment.id) })
            }
            if (state.value.nextCursor != null) item { OutlinedButton(onClick = next, modifier = Modifier.fillMaxWidth()) { Text("Next page") } }
        } else item { OperationalReadPane(state, retry, "No appointments in this range.") {} }
    }
}

@Composable fun AppointmentDetailScreen(state: ReadState<Appointment>, zone: ZoneId, retry: () -> Unit,
    allowed: (Appointment, AppointmentAction) -> Boolean, action: (Appointment, AppointmentAction) -> Unit,
    edit: (String) -> Unit, canEdit: Boolean, encounter: ((EncounterEntry) -> Unit)? = null) {
    var confirmation by remember { mutableStateOf<AppointmentAction?>(null) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ScreenHeading("Appointment")
        OperationalReadPane(state, retry, "Appointment unavailable.") { appointment ->
            Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.primaryContainer) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(appointment.startsAt.atZone(zone).format(DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy")), style = MaterialTheme.typography.titleMedium)
                    Text(appointment.startsAt.atZone(zone).format(DateTimeFormatter.ofPattern("HH:mm")) + " – " +
                        appointment.endsAt.atZone(zone).format(DateTimeFormatter.ofPattern("HH:mm")), style = MaterialTheme.typography.headlineSmall)
                    Text(zone.id, style = MaterialTheme.typography.bodySmall)
                }
            }
            Text(if (appointment.knownStatus == null) "Unsupported status" else displayLabel(appointment.status), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            appointment.checkedInAt?.let { Text("Checked in: ${it.atZone(zone)}") }
            appointment.reason?.let { DetailField("Reason", it) }; appointment.notes?.let { DetailField("Notes", it) }
            OutlinedButton(onClick = { edit(appointment.id) }, enabled = canEdit && "appointment.reschedule" in appointment.allowedActions && appointment.knownStatus != null) { Text("Reschedule") }
            AppointmentAction.entries.filter { it !in setOf(AppointmentAction.START, AppointmentAction.COMPLETE) }.forEach { item ->
                Button(onClick = { confirmation = item }, enabled = allowed(appointment, item)) { Text(item.label()) }
            }
            if (encounter != null) OutlinedButton(onClick = {
                encounter(appointment.encounterId?.let { EncounterEntry.Existing(it) }
                    ?: EncounterEntry.Create(PatientReference(appointment.patientId, appointment.workspaceId), appointment.id))
            }, enabled = "encounter.read" in appointment.allowedActions &&
                (appointment.encounterId != null || appointment.knownStatus == AppointmentStatus.CHECKED_IN)) { Text("Open encounter entry") }
            Text("Starting or completing a linked encounter requires the clinical workflow.")
            confirmation?.let { selected ->
                AlertDialog(onDismissRequest = { confirmation = null }, title = { Text("${selected.label()}?") },
                    text = { Text("Confirm this change to the current appointment.") },
                    confirmButton = { TextButton(onClick = { confirmation = null; action(appointment, selected) }, enabled = allowed(appointment, selected)) { Text("Confirm") } },
                    dismissButton = { TextButton(onClick = { confirmation = null }) { Text("Keep appointment") } })
            }
        }
    }
}
private fun AppointmentAction.label() = when (this) { AppointmentAction.CONFIRM -> "Confirm appointment"
    AppointmentAction.CANCEL -> "Cancel appointment"; AppointmentAction.CHECK_IN -> "Check in"
    AppointmentAction.NO_SHOW -> "Mark no-show"; AppointmentAction.START -> "Start"; AppointmentAction.COMPLETE -> "Complete" }

/** Presentation projection supplied by the platform's authorized Workspace.locations; never guessed from doctors. */
data class AppointmentLocationOption(val id: String, val label: String)

@Composable fun AppointmentFormScreen(state: AppointmentFormState, change: (AppointmentFormState) -> Unit,
    locations: List<AppointmentLocationOption>, pickPatient: () -> Unit, pickDoctor: () -> Unit,
    startOffsets: List<ZoneOffset>, endOffsets: List<ZoneOffset>, submit: () -> Unit, cancel: () -> Unit,
    available: Boolean, submission: AppointmentSubmitState, restart: (() -> Unit)? = null, edit: Boolean = false,
    saved: (() -> Unit)? = null) {
    var discard by remember { mutableStateOf(false) }
    val first = remember { FocusRequester() }
    val locked = submission !in setOf(AppointmentSubmitState.Idle, AppointmentSubmitState.Unavailable)
    BackHandler(state.dirty || locked) { if (!locked) discard = true }
    LaunchedEffect(state.error) { if (state.error != null) first.requestFocus() }
    fun update(date: String = state.date, start: String = state.start, end: String = state.end, reason: String = state.reason,
        notes: String = state.notes, location: String? = state.locationId, startOffset: ZoneOffset? = state.startOffset, endOffset: ZoneOffset? = state.endOffset) =
        change(AppointmentFormState(state.patientId, state.doctorId, location, date, start, end, reason, notes, startOffset, endOffset, true))
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (edit) "Reschedule appointment" else "New appointment", style = MaterialTheme.typography.headlineSmall)
        Text("Changes are not saved until confirmed. Leaving or session expiry may discard them.")
        if (!available) Text("Scheduling changes are unavailable for this workspace.")
        Button(onClick = pickPatient, enabled = !edit && !locked) { Text(if (state.patientId == null) "Choose patient" else "Change patient") }
        Button(onClick = pickDoctor, enabled = !locked) { Text(if (state.doctorId == null) "Choose doctor" else "Change doctor") }
        if (locations.isEmpty()) Text("No authorized locations are available.")
        locations.forEach { option -> FilterChip(selected = state.locationId == option.id, onClick = { update(location = option.id) },
            label = { Text(option.label) }, enabled = !locked, modifier = Modifier.heightIn(min = 48.dp)) }
        OutlinedTextField(state.date, { update(date = it, startOffset = null, endOffset = null) }, label = { Text("Clinic date (YYYY-MM-DD)") },
            enabled = !locked, modifier = Modifier.fillMaxWidth().focusRequester(first))
        OutlinedTextField(state.start, { update(start = it, startOffset = null) }, label = { Text("Start time (HH:mm)") }, enabled = !locked, modifier = Modifier.fillMaxWidth())
        if (startOffsets.size > 1) startOffsets.forEach { offset -> FilterChip(state.startOffset == offset,
            { update(startOffset = offset) }, label = { Text("Start offset $offset") }, modifier = Modifier.heightIn(min = 48.dp), enabled = !locked) }
        OutlinedTextField(state.end, { update(end = it, endOffset = null) }, label = { Text("End time (HH:mm)") }, enabled = !locked, modifier = Modifier.fillMaxWidth())
        if (endOffsets.size > 1) endOffsets.forEach { offset -> FilterChip(state.endOffset == offset,
            { update(endOffset = offset) }, label = { Text("End offset $offset") }, modifier = Modifier.heightIn(min = 48.dp), enabled = !locked) }
        if (!edit) {
            OutlinedTextField(state.reason, { update(reason = it) }, label = { Text("Reason (optional)") }, enabled = !locked, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(autoCorrectEnabled = false))
            OutlinedTextField(state.notes, { update(notes = it) }, label = { Text("Notes (optional)") }, enabled = !locked, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(autoCorrectEnabled = false))
        }
        state.error?.let { Text(it, Modifier.semantics { liveRegion = LiveRegionMode.Assertive; error(it) }) }
        Button(onClick = submit, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp), enabled = available && !locked && state.locationId in locations.map { it.id }) { Text("Save appointment") }
        OutlinedButton(onClick = { if (state.dirty) discard = true else cancel() }, enabled = !locked) { Text("Back") }
        AppointmentSubmissionPane(submission, restart)
        if (submission is AppointmentSubmitState.Saved && saved != null)
            Button(onClick = saved) { Text("Open saved appointment") }
    }
    if (discard) AlertDialog(onDismissRequest = { discard = false }, title = { Text("Discard unsaved changes?") },
        confirmButton = { TextButton(onClick = { discard = false; cancel() }) { Text("Discard") } },
        dismissButton = { TextButton(onClick = { discard = false }) { Text("Stay") } })
}

@Composable fun AppointmentSubmissionPane(state: AppointmentSubmitState, restart: (() -> Unit)? = null) {
    when (state) {
        AppointmentSubmitState.Idle -> Unit
        AppointmentSubmitState.Submitting -> UiStatePanel(UiStateKind.LOADING, "Submitting", "Saving the appointment…")
        AppointmentSubmitState.Unavailable -> UiStatePanel(UiStateKind.UNAVAILABLE, "Unavailable", "Unavailable for this workspace.")
        is AppointmentSubmitState.CheckOutcome -> UiStatePanel(UiStateKind.ERROR, "Check the operation outcome",
            when (state.failureCode) {
                "VERSION_CONFLICT" -> "The appointment changed. Refresh and review its current details."
                "SCHEDULE_CONFLICT" -> "The time is no longer available. Refresh availability before choosing another interval."
                "FORBIDDEN", "WORKSPACE_ACCESS_REVOKED" -> "Permission to change this appointment is unavailable."
                "INVALID_STATE", "RELATIONSHIP_CONFLICT" -> "The appointment no longer supports this action. Refresh its details."
                "FEATURE_UNAVAILABLE" -> "This action is unavailable for the workspace."
                "VALIDATION_ERROR" -> "Check the appointment fields before preparing a new request."
                else -> "Check the operation outcome before creating another request."
            }, action = if (state.failureCode != null && restart != null) ({
                OutlinedButton(onClick = restart) { Text("Edit appointment") }
            }) else null)
        is AppointmentSubmitState.Saved -> UiStatePanel(UiStateKind.SUCCESS, "Appointment saved",
            if (state.appointment == null) "Saved; current details unavailable." else "Appointment saved.")
        is AppointmentSubmitState.Rejected -> UiStatePanel(UiStateKind.ERROR, "Appointment not saved", "Could not prepare this request. No appointment was sent.")
    }
}
