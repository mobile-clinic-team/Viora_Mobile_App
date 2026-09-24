package com.viora.mobile.clinical

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.viora.mobile.MainActivity
import com.viora.mobile.VioraApplication
import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.feature.clinical.data.SyntheticClinicalData as Data
import com.viora.mobile.feature.clinical.data.SyntheticClinicalReadRepository
import com.viora.mobile.feature.clinical.ui.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import org.junit.*
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ClinicalNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val graph get() = (compose.activity.application as VioraApplication).graph
    private val fake get() = graph.clinicalReads as SyntheticClinicalReadRepository
    private fun waitFor(text: String) = compose.waitUntil(15000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    private fun click(text: String) { waitFor(text); compose.onNodeWithText(text).performClick() }
    private fun scrollClick(text: String) { waitFor(text); compose.onNodeWithText(text).performScrollTo().performClick() }
    private fun route(value: Any) = compose.runOnIdle { graph.operationalNavigator.navigate(value) }
    @Before fun login() {
        compose.runOnIdle { fake.beforeRead = null; fake.nextFailure = null }
        runBlocking { graph.session.logout() }
        click("Enter demo workspace"); click("Willow Clinic · Demo"); waitFor("Your clinic, at a glance")
    }
    @After fun resetFixture() { compose.runOnIdle { fake.beforeRead = null; fake.nextFailure = null } }
    @Test fun patientEntryHistoryEncounterRecordRotationAndWorkspaceReset() {
        click("Patients"); compose.onNodeWithText("Search patients").performTextInput("Synthetic")
        compose.runOnIdle {
            val manager = compose.activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
            manager.hideSoftInputFromWindow(compose.activity.window.decorView.windowToken, 0)
            compose.activity.currentFocus?.clearFocus()
        }
        click("Synthetic Patient A"); waitFor("Patient information")
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("Open encounter entry")); click("Open encounter entry")
        waitFor("Encounter history")
        compose.onNode(hasText("Encounter 1 ·", substring = true)).performScrollTo().performClick()
        scrollClick("Open clinical record"); waitFor("Version 7")
        compose.onNodeWithText("Synthetic training case — no confirmed diagnosis").performScrollTo().assertIsDisplayed()
        compose.activityRule.scenario.recreate(); waitFor("Version 7")
        click("Switch clinic"); click("Harbor Clinic · Demo"); waitFor("Your clinic, at a glance")
        compose.onNodeWithText("Version 7").assertDoesNotExist()
        route(ClinicalRecordRoute(Data.RECORD))
        waitFor("You do not have permission to view this clinical information.")
        compose.onNodeWithText("Synthetic training case — no confirmed diagnosis").assertDoesNotExist()
    }
    @Test fun appointmentEntryFollowsExistingLinkedEncounterAndLogoutClearsRecord() {
        click("Schedule"); click("IN_PROGRESS"); waitFor("Synthetic clinical visit")
        scrollClick("Open encounter entry"); waitFor("Encounter")
        scrollClick("Open clinical record"); waitFor("Version 7")
        runBlocking { graph.session.logout() }; waitFor("Enter demo workspace")
        route(ClinicalRecordRoute(Data.RECORD))
        compose.onNodeWithText("Version 7").assertDoesNotExist()
        compose.onNodeWithText("Enter demo workspace").assertExists()
    }
    @Test fun loadingAndTransientFailureRetryDisplayOnlyVerifiedRecord() {
        val gate = CompletableDeferred<Unit>()
        compose.runOnIdle { fake.beforeRead = { gate.await() } }
        route(ClinicalRecordRoute(Data.RECORD))
        waitFor("Loading clinical information…")
        compose.onNodeWithText("Version 7").assertDoesNotExist()
        compose.runOnIdle { fake.nextFailure = ApiResult.Failure("TRANSPORT_ERROR"); fake.beforeRead = null; gate.complete(Unit) }
        waitFor("Clinical information could not be loaded."); click("Retry"); waitFor("Version 7")
    }
    @Test fun emptyNotFoundMalformedAndConflictStatesRemainDistinct() {
        route(ClinicalEncounterRoute(Data.EMPTY_ENCOUNTER))
        waitFor("No clinical record has been created for this encounter.")
        compose.onNodeWithText("Open clinical record").assertDoesNotExist()
        route(ClinicalRecordRoute("99999999-9999-4999-8999-999999999999"))
        waitFor("Clinical information was not found or is no longer accessible.")
        route(ClinicalEntryRoute(""))
        waitFor("Clinical information could not be verified. Return and reopen this context.")
        compose.onNodeWithText("Retry").assertDoesNotExist()
        compose.runOnIdle { fake.nextFailure = ApiResult.Failure("VERSION_CONFLICT", 412) }
        route(ClinicalRecordRoute(Data.RECORD))
        waitFor("Clinical context changed. Refresh before continuing.")
        click("Refresh context"); waitFor("Version 7")
    }
    @Test fun contextSwitchDuringLoadingCannotRevealOldClinicalResult() {
        val gate = CompletableDeferred<Unit>()
        compose.runOnIdle { fake.beforeRead = { gate.await() } }
        route(ClinicalRecordRoute(Data.RECORD)); waitFor("Loading clinical information…")
        click("Switch clinic"); click("Harbor Clinic · Demo"); waitFor("Your clinic, at a glance")
        compose.runOnIdle { fake.beforeRead = null; gate.complete(Unit) }
        compose.onNodeWithText("Version 7").assertDoesNotExist()
        compose.onNodeWithText("Clinical record").assertDoesNotExist()
    }
}
