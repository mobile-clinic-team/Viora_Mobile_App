package com.viora.mobile.app

import com.viora.mobile.app.navigation.NavigationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class NavigationRegistryTest {
    @Test fun foundationTabsRemainTheFourDocumentedTabs() {
        assertEquals(listOf("patients", "schedule", "assistant", "account"), NavigationBindings.tabs.map { it.id })
    }

    @Test fun duplicateContributionIdsAreRejectedAtComposition() {
        val contribution = object : com.viora.mobile.app.navigation.NavigationContribution {
            override val id = "duplicate"
            override fun register(builder: androidx.navigation.NavGraphBuilder, dependencies: com.viora.mobile.app.navigation.NavigationDependencies) = Unit
        }
        assertThrows(IllegalArgumentException::class.java) {
            NavigationRegistry(listOf(contribution, contribution), NavigationBindings.tabs)
        }
    }

    @Test fun featureContributionClaimsItsRouteSoPlaceholderIsSkipped() {
        val contribution = object : com.viora.mobile.app.navigation.NavigationContribution {
            override val id = "patients-feature"
            override val routeKeys = setOf("patients")
            override fun register(builder: androidx.navigation.NavGraphBuilder, dependencies: com.viora.mobile.app.navigation.NavigationDependencies) = Unit
        }
        assertEquals(true, NavigationRegistry(listOf(contribution), NavigationBindings.tabs).provides("patients"))
    }
}
