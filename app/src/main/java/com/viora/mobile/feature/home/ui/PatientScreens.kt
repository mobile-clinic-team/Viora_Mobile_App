package com.viora.mobile.feature.home.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.viora.mobile.core.ui.*
import com.viora.mobile.feature.appointments.domain.PatientSelfAppointmentRepository
import com.viora.mobile.feature.appointments.ui.PatientSelfAppointmentsState
import com.viora.mobile.feature.appointments.ui.PatientSelfAppointmentsViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Explicitly fictional preview content, shared by Home and Appointments. No clinical writes. */
private const val PROVIDER = "Dr. Maya Linden"
private const val CLINIC = "Willow Care Clinic · Riverside"
private val specialties = listOf("General Medicine" to "plus", "Pediatrics" to "patients",
    "Dermatology" to "sun", "Cardiology" to "heart")

@Composable
fun PatientHome(name: String, appointments: () -> Unit, records: () -> Unit, synthetic: Boolean = true) {
    if (!synthetic) {
        PatientPage("Hello, ${name.substringBefore(' ')}", "Welcome to your Patient Home.") {
            InfoPanel("Your care", "View your appointments across connected clinics.")
            ActionRow("My appointments", "View appointments", "schedule", appointments)
            ActionRow("Medical record", "Coming later", "records", records)
        }
        return
    }
    var query by remember { mutableStateOf("") }
    var notice by remember { mutableStateOf<String?>(null) }
    var selectedSpecialty by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(Modifier.background(Brush.verticalGradient(listOf(Color(0xFFEEF7F8), MaterialTheme.colorScheme.background)))
            .padding(start = 20.dp, end = 20.dp, top = 12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("viora · Your everyday care", style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.secondary)
                    Text("Hello, ${name.substringBefore(' ')}", style = MaterialTheme.typography.headlineSmall)
                }
                FilledTonalIconButton(onClick = { notice = "You're all caught up. Your demo appointment is confirmed." },
                    modifier = Modifier.size(48.dp), shape = MaterialTheme.shapes.medium,
                    colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = Color.White,
                        contentColor = MaterialTheme.colorScheme.onSurfaceVariant)) { VioraIcon("bell", "Notifications") }
            }
            OutlinedTextField(query, { query = it; selectedSpecialty = null }, modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Search doctors, clinics & more", style = MaterialTheme.typography.bodyMedium) },
                textStyle = MaterialTheme.typography.bodyMedium,
                leadingIcon = { VioraIcon("search") }, singleLine = true, shape = MaterialTheme.shapes.medium,
                trailingIcon = if (query.isNotEmpty()) ({ IconButton(onClick = { query = "" }) { VioraIcon("close", "Clear search") } }) else null,
                colors = OutlinedTextFieldDefaults.colors(unfocusedContainerColor = Color.White,
                    focusedContainerColor = Color.White, unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant))
            Surface(shape = MaterialTheme.shapes.large, color = Color(0xFFE4F1F2),
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer) {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("CARE THAT FEELS PERSONAL", style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.secondary)
                        Text("Better health starts with you.", style = MaterialTheme.typography.titleLarge)
                        Text("The right care, close to home.", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Box(Modifier.padding(start = 12.dp).size(48.dp).background(Color.White.copy(alpha = 0.7f), CircleShape),
                        contentAlignment = Alignment.Center) { VioraIcon("heart", modifier = Modifier.size(28.dp)) }
                }
            }
        }
        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("How can we help?", style = MaterialTheme.typography.titleLarge)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    QuickAction("Book doctor", "doctor", Modifier.weight(1f), appointments)
                    QuickAction("Clinics", "clinic", Modifier.weight(1f)) { query = "Willow"; selectedSpecialty = null }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    QuickAction("Hospitals", "hospital", Modifier.weight(1f)) { notice = "Hospital discovery is coming soon. No hospitals are connected in this local demo." }
                    QuickAction("Medical record", "records", Modifier.weight(1f), records)
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionHeader("Upcoming appointment", "View all", appointments)
                AppointmentCard()
            }
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Popular specialties", style = MaterialTheme.typography.titleLarge)
                specialties.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        row.forEach { (title, icon) ->
                            Surface(onClick = { selectedSpecialty = if (selectedSpecialty == title) null else title; query = "" },
                                modifier = Modifier.weight(1f).heightIn(min = 60.dp), shape = MaterialTheme.shapes.medium,
                                color = if (selectedSpecialty == title) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface) {
                                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                                    VioraIcon(icon)
                                    Text(title, style = MaterialTheme.typography.labelMedium)
                                }
                            }
                        }
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(if (query.isBlank() && selectedSpecialty == null) "Recommended for you" else "Matching care", style = MaterialTheme.typography.titleLarge)
                Text("Meet our fictional demo care team", style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                val providers = listOf(Triple(PROVIDER, "General Medicine", "ML"),
                    Triple("Dr. Theo Vale", "Cardiology", "TV"), Triple("Dr. Nora Fern", "Pediatrics", "NF"),
                    Triple("Dr. Iris Brook", "Dermatology", "IB"))
                val matches = providers.filter { (doctor, specialty, _) ->
                    (selectedSpecialty == null || selectedSpecialty == specialty) &&
                        (query.isBlank() || "$doctor $specialty $CLINIC".contains(query.trim(), ignoreCase = true))
                }
                if (matches.isEmpty()) Text("No demo providers found. Try a specialty or Willow Care Clinic.")
                matches.forEach { (doctor, specialty, initials) ->
                    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                Avatar(initials)
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    Text(doctor, style = MaterialTheme.typography.titleMedium)
                                    Text(specialty, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                                    Text("Willow Care Clinic", style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            OutlinedButton(onClick = { notice = "$doctor is a fictional $specialty provider. Booking will be available in a later phase; no appointment has been created." },
                                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("View provider") }
                        }
                    }
                }
            }
            Text("LOCAL DEMO · All people and appointments are fictional.", style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    notice?.let { message -> AlertDialog(onDismissRequest = { notice = null }, title = { Text("Your Viora care") },
        text = { Text(message) }, confirmButton = { TextButton(onClick = { notice = null }) { Text("Got it") } }) }
}

@Composable private fun QuickAction(label: String, icon: String, modifier: Modifier, onClick: () -> Unit) {
    Surface(onClick = onClick, modifier = modifier.heightIn(min = 58.dp), shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f)),
        color = MaterialTheme.colorScheme.surface) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            IconBadge(icon, Modifier.size(36.dp))
            Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable private fun SectionHeader(title: String, action: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
        TextButton(onClick = onClick, modifier = Modifier.heightIn(min = 48.dp)) { Text(action) }
    }
}

@Composable private fun Avatar(initials: String) {
    Box(Modifier.size(52.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape), contentAlignment = Alignment.Center) {
        Text(initials, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
    }
}

@Composable private fun AppointmentCard() {
    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f))) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(40.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                    contentAlignment = Alignment.Center) {
                    Text("ML", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                }
                Column(Modifier.weight(1f)) {
                    Text(PROVIDER, style = MaterialTheme.typography.titleMedium)
                    Text("General Medicine", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Surface(shape = MaterialTheme.shapes.small, color = Color(0xFFEAF5EF)) {
                    Text("Confirmed", Modifier.padding(horizontal = 8.dp, vertical = 5.dp), color = Color(0xFF286C54), style = MaterialTheme.typography.labelSmall)
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                VioraIcon("schedule", modifier = Modifier.size(18.dp))
                Text("Tue, 22 Sep 2026 · 09:30 AM", style = MaterialTheme.typography.labelMedium)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                VioraIcon("location", modifier = Modifier.size(18.dp))
                Text(CLINIC, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable private fun PatientPage(title: String, subtitle: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        ScreenHeading(title, subtitle)
        content()
    }
}

@Composable fun PatientAppointments(synthetic: Boolean = true, repository: PatientSelfAppointmentRepository? = null,
    booking: com.viora.mobile.feature.appointments.domain.PatientBookingRepository? = null,
    operations: com.viora.mobile.core.operations.OperationPort? = null) {
    if (!synthetic && repository != null) {
        val scope = rememberCoroutineScope()
        val model = remember(repository, scope) { PatientSelfAppointmentsViewModel(repository, scope) }
        val state by model.state.collectAsStateWithLifecycle()
        LaunchedEffect(model) { model.load() }
        val date = remember { DateTimeFormatter.ofPattern("EEE, d MMM yyyy · HH:mm") }
        PatientPage("My appointments", "Your visits across connected clinics.") {
            when (val current = state) {
                PatientSelfAppointmentsState.Loading -> CircularProgressIndicator()
                is PatientSelfAppointmentsState.Error -> {
                    if (current.items.isNotEmpty()) current.items.forEach { item ->
                        PatientAppointmentItem(item.doctorName, item.clinicName, item.locationName,
                            date.format(item.startsAt.atZone(ZoneId.systemDefault())), item.status)
                    }
                    Text("Appointments could not be loaded (${current.code}).")
                    Button(onClick = model::retry) { Text("Retry") }
                }
                is PatientSelfAppointmentsState.Loaded -> {
                    if (current.items.isEmpty()) Text("You have no appointments yet.")
                    current.items.forEach { item -> PatientAppointmentItem(item.doctorName, item.clinicName,
                        item.locationName, date.format(item.startsAt.atZone(ZoneId.systemDefault())), item.status) }
                    if (current.nextCursor != null) Button(onClick = model::loadMore) { Text("Load more") }
                }
            }
            if (booking != null && operations != null) {
                val bookingModel = remember(booking, operations, model) {
                    com.viora.mobile.feature.appointments.ui.PatientBookingViewModel(booking, operations, scope, model::load)
                }
                com.viora.mobile.feature.appointments.ui.PatientBookingForm(bookingModel)
            }
        }
        return
    }
    PatientPage("Your appointments", "A little planning. Better peace of mind.") {
        if (synthetic) {
        Text("UPCOMING · 1 DEMO VISIT", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        AppointmentCard()
        }
        InfoPanel("Your next step in care", "Booking and appointment changes are coming in a later release.", "schedule")
    }
}

@Composable private fun PatientAppointmentItem(doctor: String, clinic: String, location: String,
    time: String, status: String) {
    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(doctor, style = MaterialTheme.typography.titleMedium)
            Text("$clinic · $location", style = MaterialTheme.typography.bodyMedium)
            Text(time, style = MaterialTheme.typography.bodyMedium)
            Text(status.replace('_', ' ').lowercase().replaceFirstChar { it.titlecase() },
                style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable fun PatientHistory() {
    PatientPage("Treatment History", "Your past care.") {
        InfoPanel("Coming later", "Treatment history is not connected yet. No history is available in this release.", "records")
    }
}

@Composable fun PatientRecords() {
    PatientPage("Health Records", "Your health story, together in one place.") {
        InfoPanel("A home for your health history", "Visit summaries, prescriptions and test results will appear here when patient records are connected.", "records")
        Text("No records connected", style = MaterialTheme.typography.titleMedium)
        Text("Medical records are not available in this release.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable fun PatientAccount(name: String, signOut: () -> Unit, synthetic: Boolean = true) {
    PatientPage("Your account", "Care that feels personal.") {
        Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surface) {
            Row(Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Avatar("AM")
                Column {
                    Text(name, style = MaterialTheme.typography.titleLarge)
                    Text("Patient account", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (synthetic) InfoPanel("Your local demo account", "Explore Viora with fictional care details. Nothing here books a real visit or changes a medical record.", "account")
        Button(onClick = signOut, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
            VioraIcon("logout"); Spacer(Modifier.width(10.dp)); Text("Sign out")
        }
        Text("Signing out removes this device's local session.", style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        VioraBrand()
    }
}
