package com.viora.mobile.navigation

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.viora.mobile.MainActivity
import com.viora.mobile.VioraApplication
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FoundationNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Before fun signedOut() {
        runBlocking { (compose.activity.application as VioraApplication).graph.session.logout() }
        waitFor("Enter demo workspace")
    }
    private fun waitFor(text: String) {
        compose.waitUntil(10000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    }
    private fun login() {
        compose.onNodeWithText("Enter demo workspace").performClick()
        waitFor("Willow Clinic · Demo")
        compose.onNodeWithText("Willow Clinic · Demo").performClick()
        waitFor("Your clinic, at a glance")
    }
    @Test fun loginFourTabsDoctorEntryWorkspaceResetAndLogout() {
        login()
        listOf("Patients", "Schedule", "Assistant", "Account").forEach { compose.onNodeWithText(it).assertExists() }
        compose.onNodeWithText("Schedule").performClick()
        compose.onNodeWithText("Doctor directory").performClick()
        waitFor("Synthetic Doctor A")
        compose.onNodeWithText("Synthetic Doctor A").assertExists()
        compose.onNodeWithText("Switch clinic").performClick()
        waitFor("Choose your clinic")
        compose.onNodeWithText("Harbor Clinic · Demo").performClick()
        waitFor("Your clinic, at a glance")
        compose.onNodeWithText("Harbor Clinic · Demo").assertExists()
        compose.onNodeWithText("Willow Clinic · Demo").assertDoesNotExist()
        compose.onNodeWithText("Account").performClick()
        compose.onNodeWithText("Sign out").performClick()
        waitFor("Enter demo workspace")
        compose.onNodeWithText("Harbor Clinic · Demo").assertDoesNotExist()
    }
    @Test fun rotationRetainsInProcessDestination() {
        login()
        compose.onNodeWithText("Schedule").performClick()
        compose.onNodeWithText("Doctor directory").performClick()
        compose.activityRule.scenario.recreate()
        waitFor("Synthetic Doctor A")
        waitFor("Synthetic Doctor A")
        compose.onNodeWithText("Synthetic Doctor A").assertExists()
    }
}
