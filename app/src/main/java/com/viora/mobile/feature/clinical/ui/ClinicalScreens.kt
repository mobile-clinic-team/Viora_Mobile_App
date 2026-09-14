package com.viora.mobile.feature.clinical.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.feature.clinical.domain.*
import com.viora.mobile.feature.patients.domain.PageRequest
import com.viora.mobile.feature.patients.domain.Patient

class ClinicalScreens(private val reader: ClinicalReader, private val navigate: (Any) -> Unit, private val back: () -> Unit) {
    @Composable fun Entry(route: ClinicalEntryRoute, session: SessionPort) {
        val model = clinicalModel(session, { it: ClinicalEntryContext -> it.encounters.items.isEmpty() }) { reader.entry(route.patientId, route.appointmentId) }
        val state by model.state.collectAsStateWithLifecycle()
        ClinicalPage("Clinical entry", back) {
            ClinicalReadPane(state, model::retry, emptyText = "No encounter has been created for this context.") { value ->
                PatientHeader(value.patient)
                value.appointment?.let { Text("Appointment status: " + it.status) }
                Text("Encounter history", style = MaterialTheme.typography.titleMedium)
                value.encounters.items.forEachIndexed { index, encounter ->
                    OutlinedButton(onClick = { navigate(ClinicalEncounterRoute(encounter.id)) }, modifier = Modifier.fillMaxWidth()) {
                        Text("Encounter " + (index + 1) + " · " + (if (encounter.supported) encounter.status else "Unsupported status") +
                            " · " + encounter.createdAt.toString())
                    }
                }
                value.encounters.nextCursor?.let { cursor ->
                    Text("This is one page of encounter history.")
                    Button(onClick = { model.load { reader.entry(route.patientId, route.appointmentId, PageRequest(cursor = cursor)) } }) { Text("Next page") }
                }
                Text("Encounter creation is currently unavailable.")
            }
        }
    }
    @Composable fun Encounter(id: String, session: SessionPort) {
        val model = clinicalModel(session, { it: EncounterContext -> it.encounter.recordId == null }) { reader.encounter(id) }
        val state by model.state.collectAsStateWithLifecycle()
        val sessionState by session.state.collectAsStateWithLifecycle()
        ClinicalPage("Encounter", back) {
            ClinicalReadPane(state, model::retry, emptyText = "No clinical record has been created for this encounter.") { value ->
                EncounterHeader(value)
                value.encounter.recordId?.let { record ->
                    Button(onClick = { navigate(ClinicalRecordRoute(record)) },
                        enabled = sessionState.workspace?.allows("record.read") == true) { Text("Open clinical record") }
                }
                Text("Encounter changes and record creation are currently unavailable.")
            }
        }
    }
    @Composable fun Record(id: String, session: SessionPort) {
        val model = clinicalModel<ClinicalRecordContext>(session, { false }) { reader.record(id) }
        val state by model.state.collectAsStateWithLifecycle()
        ClinicalRecordScreen(state, model::retry, back)
    }
    @Composable private fun <T> clinicalModel(session: SessionPort, empty: (T) -> Boolean,
        action: suspend () -> ApiResult<T>): ClinicalViewModel<T> = viewModel(factory = object : ViewModelProvider.Factory {
        override fun <VM : ViewModel> create(modelClass: Class<VM>): VM {
            require(modelClass == ClinicalViewModel::class.java)
            @Suppress("UNCHECKED_CAST") return ClinicalViewModel(session, empty, action) as VM
        }
    })
}

@Composable fun ClinicalRecordScreen(state: ClinicalState<ClinicalRecordContext>, retry: () -> Unit, back: () -> Unit) {
    ClinicalPage("Clinical record", back) {
        ClinicalReadPane(state, retry, "No clinical record is available.") { value ->
            EncounterHeader(value.encounter)
            val record = value.record
            Text(if (record.supported) "Record status: " + record.status else "Unsupported record state", style = MaterialTheme.typography.titleMedium)
            Text("Version " + record.currentVersion)
            record.reviewedVersion?.let { Text("Reviewed version " + it) }
            ContentField("Diagnosis", record.current.content.diagnosis)
            ContentField("Symptoms", record.current.content.symptoms)
            ContentField("Clinical notes", record.current.content.clinicalNotes)
            ContentField("Treatment plan", record.current.content.treatmentPlan)
            record.current.amendmentReason?.let { ContentField("Amendment reason", it) }
            Text("Read-only. Record changes are currently unavailable.")
            OutlinedButton(onClick = retry) { Text("Refresh record") }
        }
    }
}
@Composable private fun PatientHeader(patient: Patient) {
    Text(patient.fullName, style = MaterialTheme.typography.titleLarge)
    Text("MRN: " + patient.medicalRecordNumber)
}
@Composable private fun EncounterHeader(value: EncounterContext) {
    PatientHeader(value.patient)
    Text("Encounter status: " + if (value.encounter.supported) value.encounter.status else "Unsupported status")
    Text(if (value.appointment == null) "Standalone encounter" else "Linked appointment: " + value.appointment.status)
    value.encounter.startedAt?.let { Text("Started: " + it.toString()) }
    value.encounter.endedAt?.let { Text("Ended: " + it.toString()) }
}
@Composable private fun ContentField(label: String, value: String) {
    Text(label, style = MaterialTheme.typography.titleMedium)
    Text(value.ifEmpty { "Not documented" })
}
@Composable internal fun ClinicalPage(title: String, back: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        OutlinedButton(onClick = back) { Text("Return") }
        content()
    }
}
@Composable fun <T> ClinicalReadPane(state: ClinicalState<T>, retry: () -> Unit, emptyText: String,
    content: @Composable (T) -> Unit) {
    when (state) {
        ClinicalState.Initial -> Text("Clinical context is unavailable.")
        ClinicalState.Loading -> Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
            CircularProgressIndicator(Modifier.semantics { contentDescription = "Loading clinical information" })
            Text("Loading clinical information…")
        }
        is ClinicalState.Loaded -> content(state.value)
        is ClinicalState.Empty -> { content(state.value); Text(emptyText, Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
        ClinicalState.PermissionDenied -> Text("You do not have permission to view this clinical information.")
        ClinicalState.NotFound -> Text("Clinical information was not found or is no longer accessible.")
        ClinicalState.Stale -> {
            Text("Clinical context changed. Refresh before continuing.")
            Button(onClick = retry) { Text("Refresh context") }
        }
        is ClinicalState.Error -> Text("Clinical information could not be verified. Return and reopen this context.")
        is ClinicalState.RetriableFailure -> {
            Text("Clinical information could not be loaded.")
            Button(onClick = retry) { Text("Retry") }
        }
    }
}
