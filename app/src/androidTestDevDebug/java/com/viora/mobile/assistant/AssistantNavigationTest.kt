package com.viora.mobile.assistant

import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.viora.mobile.MainActivity
import com.viora.mobile.VioraApplication
import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.feature.assistant.data.*
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.assistant.ui.*
import com.viora.mobile.feature.clinical.data.SyntheticClinicalData as Data
import kotlinx.coroutines.runBlocking
import org.junit.*
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AssistantNavigationTest {
    @get:Rule val compose=createAndroidComposeRule<MainActivity>()
    private val graph get()=(compose.activity.application as VioraApplication).graph
    private val fake get()=graph.assistant.repository as SyntheticAssistantBackend
    private fun waitFor(text:String)=compose.waitUntil(15000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    private fun click(text:String) { waitFor(text); compose.onNodeWithText(text).performClick() }
    private fun scroll(text:String) { waitFor(text); compose.onNodeWithText(text).performScrollTo().performClick() }
    private fun route(value:Any)=compose.runOnIdle { graph.operationalNavigator.navigate(value) }
    private fun input(label:String,value:String) {
        fun find(view:View):EditText? {
            if(view is EditText && view.contentDescription==label) return view
            if(view is ViewGroup) for(index in 0 until view.childCount) find(view.getChildAt(index))?.let { return it }
            return null
        }
        compose.runOnIdle {
            val edit=requireNotNull(find(compose.activity.window.decorView)); edit.setText(value)
            Assert.assertFalse(edit.isSaveEnabled); Assert.assertEquals(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS,edit.importantForAutofill)
        }
    }
    @Before fun login() {
        compose.runOnIdle { fake.beforeGeneration=null; fake.beforeRead=null; fake.nextReadFailure=null; fake.nextHandoffFailure=null; fake.generation=SyntheticGeneration.SUCCESS }
        runBlocking { graph.session.logout() }
        click("Enter demo workspace"); click("Willow Clinic · Demo"); waitFor("Your clinic, at a glance")
    }
    @After fun reset() { compose.runOnIdle { fake.beforeGeneration=null; fake.beforeRead=null; fake.nextReadFailure=null; fake.nextHandoffFailure=null; fake.generation=SyntheticGeneration.SUCCESS } }
    private fun newEncounterConversation() {
        route(AssistantCreateRoute("ENCOUNTER",Data.PATIENT_A,Data.ENCOUNTER))
        scroll("Confirm and create conversation"); scroll("Open conversation"); waitFor("Context: ENCOUNTER")
    }
    private fun generateDraft() { newEncounterConversation(); scroll("Generate synthetic draft"); scroll("Open AI draft"); waitFor("Draft state: GENERATED") }
    @Test fun homeContextSelectionConversationAndSyntheticMessageWork() {
        click("Assistant"); waitFor("No conversations yet."); scroll("New conversation")
        input("Search patient context","Synthetic"); scroll("Find patients"); scroll("Synthetic Patient A")
        scroll("Use encounter 1 · IN_PROGRESS"); scroll("Confirm and create conversation"); scroll("Open conversation")
        waitFor("Context: ENCOUNTER"); input("Question","Synthetic question")
        scroll("Send question"); waitFor("AI-generated advisory"); scroll("Acknowledge result")
        compose.onNodeWithText("Synthetic advisory response. Review the authorized context; this is not a clinical decision.").assertExists()
    }
    @Test fun generationProvenanceExplicitReviewStepUpAndHandoffEvidence() {
        generateDraft(); compose.onNodeWithText("Provenance").assertExists()
        compose.onNodeWithText("Synthetic source record").assertExists()
        compose.onNodeWithText("Approve reviewed draft").assertDoesNotExist()
        scroll("Start human review"); scroll("Acknowledge review result"); waitFor("Draft state: IN_REVIEW")
        compose.activityRule.scenario.recreate(); waitFor("Draft state: IN_REVIEW")
        scroll("Request demo step-up"); waitFor("Confirm reviewed handoff")
        compose.onNodeWithText("Synthetic handoff verified. No clinical record was written or finalized.").assertDoesNotExist()
        click("Approve reviewed draft"); waitFor("Synthetic handoff verified. No clinical record was written or finalized.")
        scroll("Open unchanged clinical record"); waitFor("Version 7")
    }
    @Test fun expiredDraftAndChangedTargetAreSafe() {
        generateDraft()
        val draft=runBlocking { (fake.drafts(Data.RECORD) as ApiResult.Success).value.items.single() }
        compose.runOnIdle { fake.expireDraft(draft.id) }
        route(AssistantDraftRoute(draft.id)); waitFor("Draft or conversation expired. Approval is unavailable.")
        compose.onNodeWithText("Approve reviewed draft").assertDoesNotExist()
        compose.runOnIdle { fake.nextReadFailure=ApiResult.Failure("VERSION_CONFLICT",412) }
        route(AssistantDraftRoute(draft.id)); waitFor("Context or target changed. Reload and review; generate a new draft for a changed target.")
    }
    @Test fun workspaceAndLogoutClearAssistantContent() {
        generateDraft(); click("Switch clinic"); click("Harbor Clinic · Demo"); waitFor("Your clinic, at a glance")
        compose.onNodeWithText("AI-generated draft — explicit human review required").assertDoesNotExist()
        click("Assistant"); waitFor("Assistant access denied.")
        runBlocking { graph.session.logout() }; waitFor("Enter demo workspace")
        route(AssistantCreateRoute("ENCOUNTER",Data.PATIENT_A,Data.ENCOUNTER))
        compose.onNodeWithText("Confirm assistant context").assertDoesNotExist()
    }
    @Test fun failureRecoveryAndExplicitRejection() {
        newEncounterConversation(); compose.runOnIdle { fake.generation=SyntheticGeneration.TIMEOUT }
        scroll("Generate synthetic draft"); waitFor("Operation did not commit. Review before starting a new explicit attempt.")
        compose.runOnIdle { fake.generation=SyntheticGeneration.SUCCESS }
        scroll("Generate synthetic draft"); scroll("Open AI draft"); scroll("Start human review"); scroll("Acknowledge review result")
        scroll("Reject draft"); scroll("Acknowledge review result"); waitFor("Draft state: REJECTED")
        compose.onNodeWithText("Approve reviewed draft").assertDoesNotExist()
    }
}
