package com.viora.mobile.phase1

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.viora.mobile.MainActivity
import com.viora.mobile.VioraApplication
import com.viora.mobile.core.session.SessionPhase
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Only this class is run for the Phase 1 acceptance smoke test. */
@RunWith(AndroidJUnit4::class)
class PatientPhase1SmokeTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val graph get() = (compose.activity.application as VioraApplication).graph
    private fun waitFor(text: String) {
        compose.waitUntil(15000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
        compose.waitForIdle()
    }
    private fun shot(name: String) {
        compose.runOnIdle {
            val view = compose.activity.window.decorView
            val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            // Capture our own view for layout review without changing FLAG_SECURE.
            view.draw(Canvas(bitmap))
            File(compose.activity.filesDir, "phase1-$name.png").outputStream().use {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
            }
            bitmap.recycle()
        }
    }
    @Test fun patientEntryValidationTabsAndSessionProtection() {
        runBlocking { graph.session.logout() }
        waitFor("Welcome to Viora")
        shot("login")
        compose.onNodeWithText("Sign in").performScrollTo().performClick()
        compose.onNodeWithText("Enter a valid email address.").assertExists()
        compose.onNodeWithText("Enter your password.").assertExists()
        compose.onNodeWithText("Email address").performTextInput("wrong@viora.demo")
        compose.onNodeWithText("Password").performTextInput("wrong-password")
        compose.onNodeWithContentDescription("Show password").performClick()
        compose.onNodeWithContentDescription("Hide password").assertExists().performClick()
        compose.onNodeWithText("Sign in").performScrollTo().performClick()
        compose.onNodeWithText("These details don't match the local demo account. Try the demo sign-in below.").assertExists()
        assertEquals(SessionPhase.SIGNED_OUT, graph.session.state.value.phase)
        compose.onNodeWithText("Forgot password?").performScrollTo().performClick()
        compose.onNodeWithText("Your demo sign-in").assertExists()
        compose.onNodeWithText("Got it").performClick()
        compose.onNodeWithText("Explore local demo").performScrollTo().performClick()
        waitFor("Hello, Alex")
        assertEquals(SessionPhase.READY, graph.session.state.value.phase)
        compose.onNodeWithText("Choose your clinic").assertDoesNotExist()
        compose.onNodeWithText("Willow Care Clinic · Riverside").assertIsDisplayed()
        listOf("Home", "Appointments", "Assistant", "Records", "Account").forEach {
            compose.onNodeWithText(it).assertIsDisplayed()
        }
        shot("home")
        compose.onNodeWithText("Recommended for you").performScrollTo().assertIsDisplayed()
        shot("home-specialties")
        compose.onNodeWithText("Dr. Theo Vale").performScrollTo().assertIsDisplayed()
        shot("home-providers")
        compose.onNodeWithText("LOCAL DEMO · All people and appointments are fictional.").performScrollTo().assertIsDisplayed()
        shot("home-bottom")
        compose.onNodeWithText("Appointments").performClick()
        waitFor("Your appointments")
        compose.onNodeWithText("Confirmed").assertExists()
        shot("appointments")
        compose.onNodeWithText("Assistant").performClick()
        waitFor("Viora Assistant")
        shot("assistant")
        compose.onNodeWithText("Records").performClick()
        waitFor("No records connected")
        shot("records")
        compose.onNodeWithText("Account").performClick()
        waitFor("Your account")
        shot("account")
        // Secondary tabs return to Home, never Login, on Back.
        compose.runOnIdle { compose.activity.onBackPressedDispatcher.onBackPressed() }
        waitFor("Hello, Alex")
        compose.onNodeWithText("Account").performClick()
        compose.onNodeWithText("Sign out").performScrollTo().performClick()
        waitFor("Welcome to Viora")
        assertEquals(SessionPhase.SIGNED_OUT, graph.session.state.value.phase)
        assertNull(runBlocking { graph.session.snapshot(false) })
        compose.onNodeWithText("Home").assertDoesNotExist()
        compose.onNodeWithText("Your account").assertDoesNotExist()
        // A recreated activity cannot restore any sensitive destination after logout.
        compose.activityRule.scenario.recreate()
        waitFor("Welcome to Viora")
        compose.onNodeWithText("Hello, Alex").assertDoesNotExist()
        shot("signed-out")
    }

    @Test fun credentialSignInAndRecreation() {
        runBlocking { graph.session.logout() }
        waitFor("Welcome to Viora")
        compose.onNodeWithText("Email address").performTextInput("alex@viora.demo")
        compose.onNodeWithText("Password").performTextInput("VioraDemo1!")
        shot("keyboard")
        compose.onNodeWithText("Password").performImeAction()
        waitFor("Hello, Alex")
        compose.activityRule.scenario.recreate()
        waitFor("Hello, Alex")
        assertEquals(SessionPhase.READY, graph.session.state.value.phase)
        // Leave a valid encrypted local session for the separate process-restart smoke test.
    }
}
