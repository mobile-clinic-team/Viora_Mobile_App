package com.viora.mobile.app

import androidx.activity.compose.BackHandler
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.viora.mobile.core.session.SessionPhase
import com.viora.mobile.core.session.AppRole
import com.viora.mobile.core.session.Authorization
import com.viora.mobile.core.ui.*
import com.viora.mobile.feature.auth.ui.LoginScreen
import com.viora.mobile.feature.home.ui.*
import com.viora.mobile.feature.appointments.domain.PatientSelfAppointmentRepository
import kotlinx.coroutines.delay

@Composable
fun AppShell(model: AppViewModel) {
    val state by model.session.collectAsStateWithLifecycle()
    val primaryDemoAccounts = remember(model.graph.demoAccounts) {
        model.graph.demoAccounts.filter { account ->
            account.label.startsWith("Doctor ") || account.label.startsWith("Nurse ")
        }
    }
    var splashComplete by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { delay(850); splashComplete = true }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when {
            !splashComplete -> VioraSplash()
            state.phase == SessionPhase.SIGNED_OUT || model.signingIn -> {
                Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                    LoginScreen(state.message, model.graph.synthetic, model::signIn, model.signingIn, primaryDemoAccounts, model::register)
                }
            }
            state.phase == SessionPhase.READY && state.user != null -> {
                // Memory-only patient navigation is destroyed on logout, expiry or context change.
                key(state.authEpoch, state.contextEpoch) {
                    AuthorizedRoleShell(state.selectedRole, state, model)
                }
            }
            state.phase == SessionPhase.SELECT_ROLE -> RolePicker(state, model)
            state.phase == SessionPhase.SELECT_WORKSPACE -> {
                Box(Modifier.fillMaxSize().safeDrawingPadding()) {
                    com.viora.mobile.feature.workspace.ui.WorkspaceScreen(state, model::selectWorkspace, model::logout)
                }
            }
            else -> VioraSplash()
        }
    }
}

/** All shell entry points, including restored or requested contexts, share this guard. */
@Composable
internal fun AuthorizedRoleShell(role: AppRole?, state: com.viora.mobile.core.session.SessionState, model: AppViewModel) {
    if (role == null || !Authorization.canEnter(state, role)) { AccessDenied(model::logout); return }
    when (role) {
        AppRole.PATIENT -> PatientNavigation(state.user!!.displayName, model::logout, model.graph.synthetic,
            model.graph.patientSelfAppointments, model.graph.patientBooking, model.graph.patientOperations)
        AppRole.DOCTOR, AppRole.NURSE -> InternalWorkspaceShell(model)
        AppRole.ADMIN -> AdminShell(state, model)
        AppRole.RECEPTIONIST -> ReceptionistShell(state, model)
    }
}

private enum class PatientTab(val label: String, val icon: String) {
    HOME("Home", "home"), APPOINTMENTS("Appointments", "schedule"), HISTORY("History", "records"),
    RECORDS("Records", "records"), ACCOUNT("Account", "account")
}

@Composable
private fun PatientNavigation(name: String, signOut: () -> Unit, synthetic: Boolean,
    appointments: PatientSelfAppointmentRepository,
    booking: com.viora.mobile.feature.appointments.domain.PatientBookingRepository,
    operations: com.viora.mobile.core.operations.OperationPort) {
    var selected by remember { mutableStateOf(PatientTab.HOME) }
    BackHandler(selected != PatientTab.HOME) { selected = PatientTab.HOME }
    Scaffold(modifier = Modifier.statusBarsPadding(), contentWindowInsets = WindowInsets(0, 0, 0, 0),
        bottomBar = {
            Surface(color = MaterialTheme.colorScheme.surface) {
                Column {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
                    Row(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBars)
                        .selectableGroup().heightIn(min = 80.dp).padding(vertical = 8.dp)) {
                        PatientTab.entries.forEach { item ->
                            val active = selected == item
                            Column(Modifier.weight(1f).selectable(selected = active, role = Role.Tab,
                                onClick = { selected = item }).padding(vertical = 4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Box(Modifier.size(width = 48.dp, height = 32.dp).background(
                                    if (active) MaterialTheme.colorScheme.primaryContainer else androidx.compose.ui.graphics.Color.Transparent,
                                    RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                                    CompositionLocalProvider(LocalContentColor provides if (active) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.onSurfaceVariant) { VioraIcon(item.icon) }
                                }
                                Text(item.label, style = MaterialTheme.typography.labelSmall,
                                    color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                            }
                        }
                    }
                }
            }
        }) { padding ->
        Crossfade(selected, modifier = Modifier.padding(padding), label = "Patient destination") { tab ->
            when (tab) {
                PatientTab.HOME -> PatientHome(name, { selected = PatientTab.APPOINTMENTS }, { selected = PatientTab.RECORDS }, synthetic)
                PatientTab.APPOINTMENTS -> PatientAppointments(synthetic, appointments, booking, operations)
                PatientTab.HISTORY -> PatientHistory()
                PatientTab.RECORDS -> PatientRecords()
                PatientTab.ACCOUNT -> PatientAccount(name, signOut, synthetic)
            }
        }
    }
}
