package com.viora.mobile.feature

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.viora.mobile.feature.patients.domain.*
import com.viora.mobile.feature.patients.ui.PatientListScreen
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class OperationalScreensTest {
    @get:Rule val compose = createComposeRule()
    @Test fun loadingEmptyErrorRetryAndSuccessHaveAccessibleControls() {
        val state = mutableStateOf<ReadState<DirectoryPage<Patient>>>(ReadState.Loading)
        var retries = 0; var selected: String? = null
        compose.setContent { MaterialTheme { PatientListScreen("Synthetic", state.value, {}, { retries++ }, {}, { selected = it }) } }
        compose.onNodeWithContentDescription("Loading").assertExists()
        compose.runOnIdle { state.value = ReadState.Empty }
        compose.onNodeWithText("No patients match this search.").assertIsDisplayed()
        compose.runOnIdle { state.value = ReadState.Failure("TRANSPORT_ERROR") }
        compose.onNodeWithText("Retry").assertHasClickAction().performClick()
        compose.runOnIdle { assertEquals(1, retries) }
        val patient = Patient("71111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222",
            "\"fixture-1\"", setOf("patient.read"), Instant.EPOCH, Instant.EPOCH, "FIXTURE-001", "Synthetic Patient")
        compose.runOnIdle { state.value = ReadState.Content(DirectoryPage(listOf(patient), null)) }
        compose.onNodeWithText("Synthetic Patient").assertHasClickAction().performClick()
        compose.runOnIdle { assertEquals(patient.id, selected) }
    }
    @Test fun deniedStateRemovesPatientContentAndSearchHintIsNotAnEmptyDirectory() {
        val state = mutableStateOf<ReadState<DirectoryPage<Patient>>>(ReadState.Initial)
        compose.setContent { MaterialTheme { PatientListScreen("", state.value, {}, {}, {}, {}) } }
        compose.onNodeWithText("Enter at least two characters to search.").assertExists()
        compose.onNodeWithText("No patients match this search.").assertDoesNotExist()
        compose.runOnIdle { state.value = ReadState.PermissionDenied }
        compose.onNodeWithText("You do not have permission to view this information.").assertExists()
        compose.onNodeWithText("Retry").assertDoesNotExist()
    }
}
