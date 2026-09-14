package com.viora.mobile.feature.workspace.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.viora.mobile.core.session.SessionState

@Composable
fun WorkspaceScreen(state: SessionState, select: (String) -> Unit, logout: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Text("Choose your clinic", style = MaterialTheme.typography.headlineMedium)
            Text("Access is checked each time you enter.", modifier = Modifier.padding(top = 8.dp))
        }
        if (state.memberships.isEmpty()) item { Text("No workspaces available for this account.") }
        items(state.memberships, key = { it.id }) { membership ->
            OutlinedCard(onClick = { select(membership.workspaceId) }, enabled = membership.active, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(membership.name, style = MaterialTheme.typography.titleMedium)
                    Text(if (membership.active) "Open workspace →" else "Access unavailable")
                }
            }
        }
        state.message?.let { item { Text(it) } }
        item { TextButton(onClick = logout) { Text("Sign out") } }
    }
}
