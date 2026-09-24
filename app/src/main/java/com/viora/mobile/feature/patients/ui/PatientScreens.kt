package com.viora.mobile.feature.patients.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import com.viora.mobile.feature.patients.domain.*
import com.viora.mobile.core.ui.*

@Composable
fun <T> OperationalReadPane(state: ReadState<T>, retry: () -> Unit, emptyMessage: String,
    content: @Composable (T) -> Unit) {
    when (state) {
        ReadState.Initial -> UiStatePanel(UiStateKind.EMPTY, "Find a patient", "Enter at least two characters to search.", "search")
        ReadState.Loading -> UiStatePanel(UiStateKind.LOADING, "Loading", "Getting the latest information…")
        ReadState.Empty -> UiStatePanel(UiStateKind.EMPTY, "Nothing to show yet", emptyMessage, "search")
        ReadState.PermissionDenied -> UiStatePanel(UiStateKind.DENIED, "Access unavailable", "You do not have permission to view this information.")
        ReadState.Unavailable -> UiStatePanel(UiStateKind.UNAVAILABLE, "Not available", "Unavailable for this workspace.")
        is ReadState.Failure -> UiStatePanel(UiStateKind.ERROR, "Unable to load", if (state.code == "INVALID_CURSOR") "Results changed. Start the search again." else "Could not load information.",
            action = {
                state.requestId?.let { Text("Request ID: $it", style = MaterialTheme.typography.bodySmall) }
                Button(onClick = retry, modifier = Modifier.heightIn(min = 48.dp)) { Text("Retry") }
            })
        is ReadState.Content -> content(state.value)
    }
}

@Composable fun PatientListScreen(query: String, state: ReadState<DirectoryPage<Patient>>, onQuery: (String) -> Unit,
    retry: () -> Unit, next: () -> Unit, select: (String) -> Unit) {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ScreenHeading("Patients", "Search your clinic’s patient directory.")
        OutlinedTextField(value = query, onValueChange = onQuery, label = { Text("Search patients") },
            singleLine = true, leadingIcon = { VioraIcon("search") },
            trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { onQuery("") }) { VioraIcon("close", "Clear search") } },
            shape = MaterialTheme.shapes.medium,
            keyboardOptions = KeyboardOptions(autoCorrectEnabled = false), modifier = Modifier.fillMaxWidth())
        OperationalReadPane(state, retry, "No patients match this search.") { page ->
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(page.items, key = { it.id }) { patient ->
                    ActionRow(patient.fullName, "MRN: " + patient.medicalRecordNumber, "patients", { select(patient.id) })
                }
                if (page.nextCursor != null) item { Button(onClick = next) { Text("Next page") } }
            }
        }
    }
}

@Composable fun PatientDetailScreen(state: ReadState<Patient>, retry: () -> Unit,
    appointment: (String) -> Unit, encounter: (PatientReference) -> Unit, canSchedule: Boolean, canEncounter: Boolean,
    related: @Composable () -> Unit = {}) {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ScreenHeading("Patient information")
        OperationalReadPane(state, retry, "Patient unavailable.") { patient ->
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.primaryContainer) {
                    Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(patient.fullName, style = MaterialTheme.typography.titleLarge)
                        Text("MRN: " + patient.medicalRecordNumber, style = MaterialTheme.typography.bodyMedium)
                    }
                } }
                item { PatientFieldText("Date of birth", patient.dateOfBirth) }
                item { PatientFieldText("Sex", patient.sex) }
                item { PatientFieldText("Phone", patient.phone) }
                item { PatientFieldText("Email", patient.email) }
                item { PatientFieldText("Address", patient.address) }
                item { PatientFieldText("Status", patient.status) }
                item {
                    val contact = patient.emergencyContact
                    if (contact is PatientField.Disclosed) { Text("Emergency contact")
                        contact.value?.let { Text(it.name); Text(it.phone); it.relationship?.let { relation -> Text(relation) } } ?: Text("Not supplied") }
                }
                item { Button(onClick = { appointment(patient.id) }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp), enabled = canSchedule && "appointment.create" in patient.allowedActions) { Text("New appointment") } }
                item { OutlinedButton(onClick = { encounter(patient.reference()) }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp), enabled = canEncounter && "encounter.create" in patient.allowedActions) { Text("Open encounter entry") } }
                item { Text("Patient editing is unavailable for this workspace.") }
                item { related() }
            }
        }
    }
}
@Composable private fun <T> PatientFieldText(label: String, field: PatientField<T>) {
    if (field is PatientField.Disclosed) DetailField(label, field.value?.toString() ?: "Not supplied")
}
