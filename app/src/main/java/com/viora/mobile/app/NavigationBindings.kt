package com.viora.mobile.app

import androidx.navigation.NavDestination.Companion.hasRoute
import com.viora.mobile.app.navigation.NavigationContribution
import com.viora.mobile.app.navigation.NavigationTab

/** Platform-owned integration list. Feature members add contribution objects here, never to AppNavHost. */
object NavigationBindings {
    fun contributions(screens: com.viora.mobile.feature.appointments.ui.OperationalDestinationScreens,
        clinical: NavigationContribution? = null): List<NavigationContribution> =
        listOfNotNull(com.viora.mobile.feature.appointments.ui.OperationalNavigationContribution(screens), clinical)
    val tabs: List<NavigationTab> = listOf(
        NavigationTab("patients", Patients, "Patients", "P") { it?.hasRoute<Patients>() == true },
        NavigationTab("schedule", Schedule, "Schedule", "S") { it?.hasRoute<Schedule>() == true },
        NavigationTab("assistant", Assistant, "Assistant", "A") { it?.hasRoute<Assistant>() == true },
        NavigationTab("account", Account, "Account", "●") { it?.hasRoute<Account>() == true },
    )
}
