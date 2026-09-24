package com.viora.mobile.navigation

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.viora.mobile.MainActivity
import com.viora.mobile.VioraApplication
import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.feature.appointments.data.SyntheticOperationalBackend
import com.viora.mobile.feature.appointments.ui.AppointmentDetailRoute
import com.viora.mobile.feature.patients.domain.PatientSearch
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.ZoneId
import java.time.temporal.ChronoUnit

@RunWith(AndroidJUnit4::class)
class OperationalNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val graph get() = (compose.activity.application as VioraApplication).graph
    private fun waitFor(text: String) = compose.waitUntil(15000) {
        compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
    }
    private fun click(text: String) { waitFor(text); compose.onNodeWithText(text).performClick() }
    private fun scrollClick(text: String) { compose.onNodeWithText(text).performScrollTo().performClick() }
    @Before fun login() {
        runBlocking { graph.session.logout() }
        click("Enter demo workspace"); click("Willow Clinic · Demo"); waitFor("Your clinic, at a glance")
    }
    private fun closeSoftKeyboard() = compose.runOnIdle {
        val manager = compose.activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
        manager.hideSoftInputFromWindow(compose.activity.window.decorView.windowToken, 0)
        compose.activity.currentFocus?.clearFocus()
    }
    private fun patient() {
        click("Patients")
        compose.onNodeWithText("Search patients").performTextInput("Synthetic")
        closeSoftKeyboard()
        click("Synthetic Patient A"); waitFor("Patient information")
    }
    private fun patientAction(text: String) {
        compose.onNode(hasScrollAction()).performScrollToNode(hasText(text))
        click(text)
    }
    @Test fun patientClinicalPlaceholderAndWorkspaceIsolation() {
        patient(); patientAction("Open encounter entry"); waitFor("Clinical entry")
        click("Return"); waitFor("Patient information")
        click("Switch clinic"); click("Harbor Clinic · Demo"); waitFor("Your clinic, at a glance")
        click("Patients")
        compose.onNodeWithText("Synthetic Patient A").assertDoesNotExist()
        compose.onNodeWithText("Search patients").performTextInput("Synthetic")
        closeSoftKeyboard(); click("Synthetic Patient B"); waitFor("Patient information")
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("Open encounter entry"))
        compose.onNodeWithText("Open encounter entry").assertIsNotEnabled()
    }
    @Test fun dirtyFormSurvivesPickerAndRotationThenGuardsShellExit() {
        patient(); patientAction("New appointment")
        scrollClick("Willow Clinic · Main")
        scrollClick("Choose doctor")
        waitFor("Synthetic Doctor A")
        click("Switch clinic"); waitFor("Discard unsaved changes?"); click("Stay")
        click("Synthetic Doctor A"); click("Choose doctor")
        waitFor("Change doctor")
        compose.activityRule.scenario.recreate()
        waitFor("Change doctor")
        click("Viora · Home"); waitFor("Discard unsaved changes?"); click("Stay")
        click("Account"); waitFor("Discard unsaved changes?"); click("Discard")
        waitFor("Your account"); click("Sign out"); waitFor("Enter demo workspace")
        compose.onNodeWithText("Change doctor").assertDoesNotExist()
    }
    @Test fun patientAppointmentDoctorPickerSaveDetailAndClinicalHandoff() {
        patient(); patientAction("New appointment")
        scrollClick("Choose doctor"); click("Synthetic Doctor A"); click("Choose doctor")
        waitFor("Change doctor"); scrollClick("Willow Clinic · Main")
        val zone = ZoneId.of(graph.session.state.value.workspace!!.timezone)
        val start = graph.clock.now().plusSeconds(8 * 3600).truncatedTo(ChronoUnit.MINUTES).atZone(zone)
        compose.onNodeWithText("Clinic date (YYYY-MM-DD)").performScrollTo().performTextReplacement(start.toLocalDate().toString())
        compose.onNodeWithText("Start time (HH:mm)").performScrollTo().performTextReplacement(start.toLocalTime().toString())
        compose.onNodeWithText("End time (HH:mm)").performScrollTo().performTextReplacement(start.plusMinutes(20).toLocalTime().toString())
        closeSoftKeyboard()
        scrollClick("Save appointment"); waitFor("Appointment saved.")
        scrollClick("Open saved appointment"); waitFor("Appointment")
        scrollClick("Confirm appointment"); click("Confirm"); waitFor("Appointment saved.")
        click("Refresh current appointment"); waitFor("CONFIRMED")
        scrollClick("Check in"); click("Confirm"); waitFor("Appointment saved.")
        click("Refresh current appointment"); waitFor("CHECKED_IN")
        scrollClick("Open encounter entry"); waitFor("Clinical entry")
    }
    @Test fun scheduleLoadsAppointmentDetailAndDoctorDirectory() {
        click("Schedule"); waitFor("PENDING"); click("PENDING"); waitFor("Appointment")
        compose.onNodeWithText("Synthetic appointment").assertExists()
        click("Schedule"); click("Doctor directory"); click("Synthetic Doctor A")
        waitFor("Doctor information")
    }
    @Test fun integratedReadFailureRetryAndMalformedProtectedRouteAreSafe() {
        compose.runOnIdle { (graph.operational.patients as SyntheticOperationalBackend).failNextRead = true }
        click("Patients")
        compose.onNodeWithText("Search patients").performTextInput("Synthetic")
        closeSoftKeyboard(); waitFor("Could not load information."); click("Retry"); waitFor("Synthetic Patient A")
        compose.runOnIdle { graph.operationalNavigator.navigate(AppointmentDetailRoute("invalid")) }
        waitFor("Invalid destination. Go back to the schedule.")
        click("Viora · Home"); click("Account"); click("Sign out"); waitFor("Enter demo workspace")
        compose.runOnIdle { graph.operationalNavigator.navigate(AppointmentDetailRoute("69999999-9999-4999-8999-999999999999")) }
        compose.onNodeWithText("Enter demo workspace").assertExists()
        compose.onNodeWithText("Appointment").assertDoesNotExist()
    }
}
