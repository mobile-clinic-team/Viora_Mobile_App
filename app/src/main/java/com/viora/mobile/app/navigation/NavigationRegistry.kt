package com.viora.mobile.app.navigation

import androidx.navigation.NavDestination
import androidx.navigation.NavGraphBuilder
import com.viora.mobile.core.operations.OperationPort
import com.viora.mobile.core.session.AuthenticatedRequestPort
import com.viora.mobile.core.session.SessionPort

/** Dependencies that a feature navigation contribution may consume. */
data class NavigationDependencies(
    val session: SessionPort,
    val requests: AuthenticatedRequestPort,
    val operations: OperationPort,
)

/** A feature-owned graph contribution. The central shell owns the NavHost and tab chrome. */
interface NavigationContribution {
    val id: String
    val routeKeys: Set<String> get() = emptySet()
    fun register(builder: NavGraphBuilder, dependencies: NavigationDependencies)
}

data class NavigationTab(
    val id: String,
    val route: Any,
    val label: String,
    val iconText: String,
    val isSelected: (NavDestination?) -> Boolean,
)

/** Immutable registry assembled by the composition root; feature code never edits AppNavHost. */
class NavigationRegistry(
    contributions: List<NavigationContribution>,
    tabs: List<NavigationTab>,
) {
    val tabs: List<NavigationTab> = tabs.toList().also { values ->
        require(values.map(NavigationTab::id).distinct().size == values.size)
        require(values.map { it.route::class }.distinct().size == values.size)
    }
    private val contributions: List<NavigationContribution> = contributions.toList().also { values ->
        require(values.map(NavigationContribution::id).distinct().size == values.size)
        require(values.flatMap { it.routeKeys }.let { it.distinct().size == it.size })
    }

    fun provides(routeKey: String): Boolean = contributions.any { routeKey in it.routeKeys }

    fun register(builder: NavGraphBuilder, dependencies: NavigationDependencies) {
        contributions.forEach { it.register(builder, dependencies) }
    }
}
