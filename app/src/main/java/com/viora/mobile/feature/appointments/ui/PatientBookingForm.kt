package com.viora.mobile.feature.appointments.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import java.time.Instant
import java.time.format.DateTimeFormatter

@Composable
fun PatientBookingForm(model: PatientBookingViewModel) {
    val state by model.state.collectAsStateWithLifecycle()
    var location by remember { mutableStateOf<String?>(null) }
    var doctor by remember { mutableStateOf<String?>(null) }
    var startsAt by remember { mutableStateOf<Instant?>(null) }
    var reason by remember { mutableStateOf("") }
    LaunchedEffect(model) { model.load() }
    val date = remember { DateTimeFormatter.ofPattern("EEE, d MMM · HH:mm z").withZone(ZoneId.systemDefault()) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Create appointment", style = MaterialTheme.typography.titleLarge)
        Text("Visits last 30 minutes. New bookings are Pending until reviewed by the clinic.")
        if (state.loading || state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        state.success?.let {
            Text("Appointment created", style = MaterialTheme.typography.titleMedium)
            Text("Booking reference: ${it.appointmentId}", style = MaterialTheme.typography.bodySmall)
        }
        state.message?.let { code ->
            Text(when (code) {
                "CONFLICT" -> "That slot was just taken. Refresh available times and choose another."
                "VALIDATION_ERROR" -> "Choose an available visit and enter a reason (up to 1,000 characters)."
                "UNKNOWN_OUTCOME", "OPERATION_IN_PROGRESS", "RECOVERY_REQUIRED" -> "The booking outcome is not yet known. Check the saved booking before trying again."
                "TRANSPORT_ERROR", "TLS_ERROR" -> "Unable to reach the clinic. Please retry."
                else -> "Unable to complete this request ($code)."
            })
        }
        if (state.outstanding.isNotEmpty()) {
            Text("A saved booking needs checking. Creating another is disabled until its outcome is known.")
            state.outstanding.forEach { receipt ->
                OutlinedButton(onClick = { model.recover(receipt) }, enabled = !state.busy) {
                    Text("Check saved booking · ${receipt.operationId.take(8)}")
                }
            }
        } else {
            val enabled = !state.busy && !state.loading
            BookingPicker("Clinic / location", state.options.distinctBy { it.locationId }.map {
                it.locationId to "${it.clinicName} · ${it.locationName}"
            }, location, enabled) { location = it; doctor = null; startsAt = null }
            BookingPicker("Doctor", state.options.filter { it.locationId == location }.distinctBy { it.doctorId }
                .map { it.doctorId to it.doctorName }, doctor, enabled) { doctor = it; startsAt = null }
            BookingPicker("30-minute slot", state.options.filter { it.locationId == location && it.doctorId == doctor }
                .map { it.startsAt.toString() to "${date.format(it.startsAt)} – ${date.format(it.endsAt)}" },
                startsAt?.toString(), enabled) { startsAt = Instant.parse(it) }
            OutlinedTextField(reason, { if (it.length <= 1000) reason = it }, label = { Text("Reason for visit") },
                enabled = enabled, modifier = Modifier.fillMaxWidth())
            val selected = state.options.find { it.locationId == location && it.doctorId == doctor && it.startsAt == startsAt }
            Button(onClick = { model.submit(selected, reason) }, enabled = enabled && selected != null && reason.isNotBlank()) {
                Text("Book 30-minute appointment")
            }
            if (!state.loading && state.options.isEmpty()) Text("No available appointments in the next seven days.")
        }
        OutlinedButton(onClick = model::load, enabled = !state.busy) { Text("Refresh available times / Retry") }
    }
}

@Composable private fun BookingPicker(label: String, choices: List<Pair<String, String>>, selected: String?,
    enabled: Boolean, choose: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }, enabled = enabled && choices.isNotEmpty(), modifier = Modifier.fillMaxWidth()) {
            Text(choices.find { it.first == selected }?.second ?: label)
        }
        DropdownMenu(expanded = expanded && enabled, onDismissRequest = { expanded = false }) {
            choices.forEach { (id, text) -> DropdownMenuItem(text = { Text(text) }, onClick = { choose(id); expanded = false }) }
        }
    }
}
