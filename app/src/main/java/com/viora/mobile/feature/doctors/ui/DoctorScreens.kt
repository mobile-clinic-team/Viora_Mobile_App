package com.viora.mobile.feature.doctors.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.viora.mobile.feature.doctors.domain.*
import com.viora.mobile.feature.patients.domain.*
import com.viora.mobile.feature.patients.ui.OperationalReadPane
import java.time.ZoneId

@Composable fun DoctorListScreen(query: String, state: ReadState<DirectoryPage<Doctor>>, onQuery: (String) -> Unit,
    retry: () -> Unit, next: () -> Unit, select: (String) -> Unit) {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Doctor directory", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(query, onQuery, label = { Text("Search doctors") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OperationalReadPane(state, retry, "No doctors match these filters.") { page ->
            LazyColumn {
                items(page.items, key = { it.id }) { doctor ->
                    Column(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClickLabel = "Open doctor") { select(doctor.id) }.padding(12.dp)) {
                        Text(doctor.displayName); doctor.specialization?.let { Text(it) }
                        Text(if (doctor.supported) doctor.status else "Unsupported status")
                    }
                }
                if (page.nextCursor != null) item { Button(onClick = next) { Text("Next page") } }
            }
        }
    }
}

@Composable fun DoctorDetailScreen(state: ReadState<Doctor>, schedule: ReadState<DirectoryPage<Shift>>,
    zone: ZoneId, retry: () -> Unit, retryShifts: () -> Unit, choose: ((String) -> Unit)? = null) {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Doctor information", style = MaterialTheme.typography.headlineSmall)
        OperationalReadPane(state, retry, "Doctor unavailable.") { doctor ->
            Text(doctor.displayName); doctor.specialization?.let { Text(it) }; doctor.departmentName?.let { Text(it) }
            doctor.bio?.let { Text(it) }; Text(if (doctor.supported) doctor.status else "Unsupported status")
            if (choose != null) Button(onClick = { choose(doctor.id) }, enabled = doctor.supported && "doctor.read" in doctor.allowedActions) { Text("Choose doctor") }
            Text("Shifts are advisory and do not reserve an appointment.")
            OperationalReadPane(schedule, retryShifts, "No shifts in this range.") { page ->
                LazyColumn { items(page.items, key = { it.id }) { shift -> Text("${shift.startsAt.atZone(zone)} – ${shift.endsAt.atZone(zone)}") } }
            }
        }
    }
}
