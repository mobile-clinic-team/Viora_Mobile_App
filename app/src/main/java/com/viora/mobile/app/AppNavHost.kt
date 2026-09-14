package com.viora.mobile.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.*
import androidx.navigation.toRoute
import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.session.SessionPhase
import com.viora.mobile.core.session.SessionState
import com.viora.mobile.app.navigation.NavigationDependencies
import com.viora.mobile.feature.auth.ui.LoginScreen
import com.viora.mobile.feature.appointments.ui.OperationalNavigator
import com.viora.mobile.feature.workspace.ui.WorkspaceScreen
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun AppShell(model: AppViewModel) {
    val state by model.session.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        if (model.graph.synthetic) Surface(color = MaterialTheme.colorScheme.primaryContainer) {
            Text("SYNTHETIC DEMO · No live patient data", Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp),
                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
        when (state.phase) {
            SessionPhase.SIGNED_OUT -> LoginScreen(state.message, model.graph.synthetic, model::signIn)
            SessionPhase.RESTORING, SessionPhase.VALIDATING_WORKSPACE -> Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
                CircularProgressIndicator(Modifier.align(androidx.compose.ui.Alignment.CenterHorizontally))
                Text("Checking access…", Modifier.align(androidx.compose.ui.Alignment.CenterHorizontally).padding(16.dp))
                TextButton(onClick = model::logout, modifier = Modifier.align(androidx.compose.ui.Alignment.CenterHorizontally)) { Text("Sign out") }
            }
            SessionPhase.SELECT_WORKSPACE -> WorkspaceScreen(state, model::selectWorkspace, model::logout)
            SessionPhase.READY -> key(state.authEpoch, state.contextEpoch) { ProtectedNavigation(state, model) }
        }
    }
}

@Composable
private fun ProtectedNavigation(state: SessionState, model: AppViewModel) {
    // A fresh controller is created after every context validation. No rememberSaveable restoration.
    val context = LocalContext.current
    val navigator = remember { ComposeNavigator() }
    val dialogNavigator = remember { DialogNavigator() }
    val nav = remember { androidx.navigation.NavHostController(context).apply {
        navigatorProvider.addNavigator(navigator)
        navigatorProvider.addNavigator(dialogNavigator)
        restoreState(model.restoreNavigation(state.authEpoch, state.contextEpoch))
    } }
    DisposableEffect(nav) {
        onDispose { model.retainNavigation(state.authEpoch, state.contextEpoch, nav.saveState()) }
    }
    val entry by nav.currentBackStackEntryAsState()
    val destination = entry?.destination
    fun home() { nav.popBackStack<Dashboard>(inclusive = false) }
    fun tab(route: Any) { nav.navigate(route) { popUpTo<Dashboard> { inclusive = false }; launchSingleTop = true } }
    var pendingExit by remember { mutableStateOf<(() -> Unit)?>(null) }
    fun exit(action: () -> Unit) {
        if (model.operationalFormDirty) pendingExit = action
        else { model.graph.clearOperationalPickers(); action() }
    }
    val operationalBridge = remember(nav) {
        object : OperationalNavigator {
            private fun current() = model.session.value.let {
                it.phase == SessionPhase.READY && it.authEpoch == state.authEpoch && it.contextEpoch == state.contextEpoch
            }
            override fun navigate(route: Any) { if (current()) nav.navigate(route) }
            override fun back() { if (current() && !nav.popBackStack()) home() }
            override fun dirtyForm(dirty: Boolean) { if (current()) {
                model.updateOperationalFormDirty(dirty)
                if (!dirty) model.graph.clearOperationalPickers()
            } }
        }
    }
    DisposableEffect(nav, operationalBridge) {
        model.graph.operationalNavigator.bind(operationalBridge)
        onDispose {
            model.graph.operationalNavigator.unbind(operationalBridge)
        }
    }
    val isHome = destination?.hasRoute<Dashboard>() != false
    BackHandler(!isHome) { if (!nav.popBackStack()) home() }
    Scaffold(
        topBar = {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { exit(::home) }) { Text("Viora · Home") }
                TextButton(onClick = { exit(model::switchWorkspace) }) { Text("Switch clinic") }
            }
        },
        bottomBar = {
            NavigationBar {
                model.graph.navigation.tabs.forEach { item ->
                    NavigationBarItem(selected = item.isSelected(destination), onClick = { exit { tab(item.route) } },
                        icon = { Text(item.iconText) }, label = { Text(item.label) })
                }
            }
        }
    ) { padding ->
        NavHost(navController = nav, startDestination = Dashboard, modifier = Modifier.padding(padding)) {
            composable<Dashboard> {
                Page("Your clinic, at a glance") {
                    Text(state.workspace!!.name, style = MaterialTheme.typography.titleLarge)
                    Text(LocalDate.now(ZoneId.of(state.workspace.timezone)).format(DateTimeFormatter.ofPattern("EEEE, d MMMM")))
                    Spacer(Modifier.height(12.dp))
                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Welcome, " + state.user!!.displayName, style = MaterialTheme.typography.titleMedium)
                        Text("The foundation is ready to explore. Care workflows will appear here as they become available.")
                    } }
                    OutlinedButton(onClick = { tab(Schedule) }, modifier = Modifier.fillMaxWidth()) { Text("Open schedule") }
                    Text("No live appointments are loaded.", style = MaterialTheme.typography.bodyMedium)
                }
            }
            if (!model.graph.navigation.provides("patients")) {
                composable<Patients> { UnavailablePage("Patient directory", "Search and patient profiles will be available in a later batch.") }
            }
            if (!model.graph.navigation.provides("schedule")) {
                composable<Schedule> { Page("Clinic schedule") {
                    Text("Scheduling is unavailable in this foundation build.")
                    OutlinedButton(onClick = { nav.navigate(Doctors) }) { Text("Doctor directory") }
                } }
            }
            if (!model.graph.navigation.provides("doctors")) {
                composable<Doctors> { UnavailablePage("Doctor directory", "Doctor information will appear when this feature is connected.") }
            }
            if (!model.graph.navigation.provides("assistant")) {
                composable<Assistant> { UnavailablePage("Care assistant", "AI assistance is unavailable. No questions or clinical content are sent.") }
            }
            composable<Account> { Page("Your account") {
                Text(state.user!!.displayName, style = MaterialTheme.typography.titleLarge)
                Text(state.workspace!!.name)
                Text("Demo permissions do not authorize clinical actions.")
                OutlinedButton(onClick = { exit(model::switchWorkspace) }) { Text("Choose another clinic") }
                Button(onClick = { exit(model::logout) }) { Text("Sign out") }
            } }
            composable<ClinicalEntryPlaceholderRoute> { entry ->
                val route = entry.toRoute<ClinicalEntryPlaceholderRoute>()
                val ids = listOfNotNull(route.patientId, route.appointmentId, route.encounterId)
                val allowed = if (route.encounterId != null) route.patientId == null && route.appointmentId == null && state.workspace!!.allows("encounter.read")
                    else route.patientId != null && state.workspace!!.allows("encounter.create")
                if (allowed && ids.isNotEmpty() && ids.all(Ids::valid)) Page("Clinical entry") {
                    Text("Clinical workflows are not available in this operational build.")
                    OutlinedButton(onClick = { nav.popBackStack() }) { Text("Return") }
                } else UnavailablePage("Clinical entry", "This handoff has expired. Return to the schedule.")
            }
            registerFeatureNavigation(model)
        }
    }
    pendingExit?.let { action ->
        AlertDialog(onDismissRequest = { pendingExit = null }, title = { Text("Discard unsaved changes?") },
            confirmButton = { TextButton(onClick = {
                pendingExit = null
                model.updateOperationalFormDirty(false)
                model.graph.clearOperationalPickers()
                action()
            }) { Text("Discard") } },
            dismissButton = { TextButton(onClick = { pendingExit = null }) { Text("Stay") } })
    }
}
private fun androidx.navigation.NavGraphBuilder.registerFeatureNavigation(model: AppViewModel) {
    model.graph.navigation.register(this, NavigationDependencies(model.graph.session, model.graph.requests, model.graph.operations))
}
@Composable private fun Page(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        content()
    }
}
@Composable private fun UnavailablePage(title: String, text: String) { Page(title) {
    Text("Coming next", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
    Text(text)
} }
