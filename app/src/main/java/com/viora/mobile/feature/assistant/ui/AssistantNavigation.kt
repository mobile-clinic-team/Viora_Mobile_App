package com.viora.mobile.feature.assistant.ui

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.toRoute
import com.viora.mobile.app.Assistant
import com.viora.mobile.app.navigation.*
import kotlinx.serialization.Serializable

@Serializable data class AssistantConversationRoute(val id: String)
@Serializable data class AssistantDraftRoute(val id: String)
@Serializable data class AssistantCreateRoute(val kind: String="GENERAL",val patientId: String?=null,val encounterId: String?=null)

class AssistantNavigationContribution(private val screens: AssistantScreens): NavigationContribution {
    override val id="assistant"
    override val routeKeys=setOf("assistant","assistant-conversation","assistant-draft","assistant-create")
    override fun register(builder: NavGraphBuilder,dependencies: NavigationDependencies) = with(builder) {
        composable<Assistant> { screens.Home(dependencies) }
        composable<AssistantConversationRoute> { screens.Conversation(it.toRoute<AssistantConversationRoute>().id,dependencies) }
        composable<AssistantDraftRoute> { screens.Draft(it.toRoute<AssistantDraftRoute>().id,dependencies) }
        composable<AssistantCreateRoute> { screens.Create(it.toRoute<AssistantCreateRoute>(),dependencies) }
    }
}
