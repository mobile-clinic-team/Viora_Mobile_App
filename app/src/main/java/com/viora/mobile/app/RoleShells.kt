package com.viora.mobile.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.viora.mobile.core.session.*
import com.viora.mobile.core.ui.*

@Composable internal fun AccessDenied(logout: () -> Unit) {
    Column(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp)) {
        ScreenHeading("Access denied", "This account cannot open this area.")
        TextButton(onClick = logout) { Text("Sign out") }
    }
}

@Composable internal fun RolePicker(state: SessionState, model: AppViewModel) {
    Column(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        ScreenHeading("Continue as", "Choose one of your authorized roles.")
        state.roles.forEach { role -> Button(onClick = { model.selectRole(role) }) { Text(role.label) } }
        if (state.roles.isEmpty()) Text("No authorized roles are available.")
        TextButton(onClick = model::logout) { Text("Sign out") }
    }
}

internal enum class AdminArea(val label: String, val permission: String?) {
    HOME("Administrator workspace", null), USERS("Users", "admin.users.read"),
    CLINICS("Clinics / workspaces", "admin.workspaces.read"), ROLES("Roles & access", "admin.roles.read"),
    AUDIT("Audit / system information", "admin.audit.read"), ACCOUNT("Account", null)
}

@Composable internal fun AdminShell(state: SessionState, model: AppViewModel) {
    if (!Authorization.canEnter(state, AppRole.ADMIN)) { AccessDenied(model::logout); return }
    var area by remember { mutableStateOf(AdminArea.HOME) }
    BackHandler(area != AdminArea.HOME) { area = AdminArea.HOME }
    Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        VioraBrand()
        if (model.graph.synthetic) InfoPanel("LOCAL DEMO · Read only", "Fictional management information. No changes are sent to a backend.")
        else InfoPanel("Administrator", "Signed in to ${state.workspace!!.name}. Management features are not connected in this release.")
        ScreenHeading(area.label)
        if (area.permission != null && state.workspace?.allows(area.permission!!) != true) {
            Text("Access denied")
        } else when (area) {
            AdminArea.HOME -> AdminArea.entries.filter { it != AdminArea.HOME }.forEach { item ->
                if (item.permission == null || state.workspace!!.allows(item.permission))
                    ActionRow(item.label, "Open local demo", "account", { area = item })
            }
            AdminArea.USERS -> {
                Text("Demo account directory")
                model.graph.demoAccounts.forEach { Text("${it.label} · ${it.email}") }
            }
            AdminArea.CLINICS -> Text("Willow Clinic · Demo\nSynthetic care workspace")
            AdminArea.ROLES -> {
                Text("Patient: personal care\nDoctor: authorized clinical tools\nNurse: permitted read workflows\nAdministrator: local management information")
                Text("Roles are assigned by the authentication service. This screen cannot change access.")
            }
            AdminArea.AUDIT -> Text("Environment: local demo\nSession role: Administrator\nAccess policy: ${state.workspace!!.permissionRevision}\nNo production audit service is connected.")
            AdminArea.ACCOUNT -> { Text(state.user!!.displayName); Text("Administrator") }
        }
        if (area != AdminArea.HOME) TextButton(onClick = { area = AdminArea.HOME }) { Text("Back to administration") }
        OutlinedButton(onClick = model::logout, modifier = Modifier.fillMaxWidth()) { Text("Sign out") }
    }
}

@Composable internal fun ReceptionistShell(state: SessionState, model: AppViewModel) {
    if (!Authorization.canEnter(state, AppRole.RECEPTIONIST)) { AccessDenied(model::logout); return }
    Column(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        VioraBrand()
        ScreenHeading("Receptionist Home", "Welcome, ${state.user!!.displayName}")
        Text(state.workspace!!.name)
        InfoPanel("Your workspace", "Reception operations will be available in a later release.")
        OutlinedButton(onClick = model::switchWorkspace) { Text("Choose workspace") }
        Button(onClick = model::logout) { Text("Sign out") }
    }
}
