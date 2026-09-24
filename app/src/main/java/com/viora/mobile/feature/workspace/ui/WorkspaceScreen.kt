package com.viora.mobile.feature.workspace.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.viora.mobile.core.session.SessionState
import com.viora.mobile.core.ui.*

@Composable
fun WorkspaceScreen(state: SessionState, select: (String) -> Unit, logout: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                IconBadge("clinic")
                Text("Viora", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.height(28.dp))
            ScreenHeading("Choose your clinic", "Select a workspace to continue your day.")
            Spacer(Modifier.height(12.dp))
        }
        if (state.authorizedMemberships.isEmpty()) item {
            UiStatePanel(UiStateKind.EMPTY, "No clinics available", "No workspaces available for this account.", "clinic")
        }
        items(state.authorizedMemberships, key = { it.id }) { membership ->
            ActionRow(membership.name, if (membership.active) "Open workspace" else "Access unavailable", "clinic",
                onClick = { select(membership.workspaceId) }, enabled = membership.active)
        }
        item { Text("Access is checked each time you enter.", Modifier.padding(top = 4.dp),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        state.message?.let { item { UiStatePanel(UiStateKind.ERROR, "Workspace access", it) } }
        item { TextButton(onClick = logout, modifier = Modifier.heightIn(min = 48.dp)) {
            VioraIcon("logout"); Spacer(Modifier.width(10.dp)); Text("Sign out")
        } }
    }
}
