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

@Composable
fun <T> OperationalReadPane(state: ReadState<T>, retry: () -> Unit, emptyMessage: String,
    content: @Composable (T) -> Unit) {
    when (state) {
        ReadState.Initial -> Text("Enter at least two characters to search.")
        ReadState.Loading -> Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
            CircularProgressIndicator(Modifier.semantics { contentDescription = "Loading" }); Text("Loading…")
        }
        ReadState.Empty -> Text(emptyMessage, Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        ReadState.PermissionDenied -> Text("You do not have permission to view this information.")
        ReadState.Unavailable -> Text("Unavailable for this workspace.")
        is ReadState.Failure -> Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
            Text(if (state.code == "INVALID_CURSOR") "Results changed. Start the search again." else "Could not load information.")
            state.requestId?.let { Text("Request ID: $it") }
            Button(onClick = retry, modifier = Modifier.heightIn(min = 48.dp)) { Text("Retry") }
        }
        is ReadState.Content -> content(state.value)
    }
}

@Composable fun PatientListScreen(query: String, state: ReadState<DirectoryPage<Patient>>, onQuery: (String) -> Unit,
    retry: () -> Unit, next: () -> Unit, select: (String) -> Unit) {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Patient directory", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(value = query, onValueChange = onQuery, label = { Text("Search patients") },
            singleLine = true, keyboardOptions = KeyboardOptions(autoCorrectEnabled = false), modifier = Modifier.fillMaxWidth())
        OperationalReadPane(state, retry, "No patients match this search.") { page ->
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(page.items, key = { it.id }) { patient ->
                    Column(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClickLabel = "Open patient") { select(patient.id) }.padding(12.dp)) {
                        Text(patient.fullName, style = MaterialTheme.typography.titleMedium)
                        Text(patient.medicalRecordNumber)
                    }
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
        Text("Patient information", style = MaterialTheme.typography.headlineSmall)
        OperationalReadPane(state, retry, "Patient unavailable.") { patient ->
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Text(patient.fullName, style = MaterialTheme.typography.titleLarge); Text("MRN: ${patient.medicalRecordNumber}") }
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
                item { Button(onClick = { appointment(patient.id) }, enabled = canSchedule && "appointment.create" in patient.allowedActions) { Text("New appointment") } }
                item { OutlinedButton(onClick = { encounter(patient.reference()) }, enabled = canEncounter && "encounter.create" in patient.allowedActions) { Text("Open encounter entry") } }
                item { Text("Patient editing is unavailable for this workspace.") }
                item { related() }
            }
        }
    }
}
@Composable private fun <T> PatientFieldText(label: String, field: PatientField<T>) {
    if (field is PatientField.Disclosed) Text("$label: ${field.value ?: "Not supplied"}")
}
