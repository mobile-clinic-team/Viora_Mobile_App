package com.viora.mobile.feature

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.operations.*
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.appointments.ui.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@RunWith(AndroidJUnit4::class)
class PatientBookingScreenTest {
    @get:Rule val compose = createComposeRule()
    private val doctor = "11111111-1111-4111-8111-111111111111"
    private val location = "22222222-2222-4222-8222-222222222222"
    private val operation = "33333333-3333-4333-8333-333333333333"
    private val option = PatientBookingOption(doctor, location, "Dr A", "Main", "Clinic A", Instant.parse("2026-10-01T08:00:00Z"))
    private val receipt = OperationReceipt(operation, doctor, null, "2026-09-23T00:00:00.000Z", "2026-09-24T00:00:00.000Z", "SELF")
    private var pending = emptyList<OperationReceipt>()
    private var creates = 0
    private var refreshed = 0
    private val operations = object : OperationPort {
        override suspend fun prepare(): OperationReceipt { pending = listOf(receipt); return receipt }
        override suspend fun outstanding() = pending
        override suspend fun acknowledgeResolved(operationId: String) { pending = pending.filterNot { it.operationId == operationId } }
    }
    private val repository = object : PatientBookingRepository {
        override suspend fun options() = ApiResult.Success(listOf(option))
        override suspend fun create(intent: PatientBookingIntent, operation: OperationReceipt): ApiResult<AppointmentWrite> {
            creates++; assertEquals(option, intent.option); return success()
        }
        override suspend fun recover(operation: OperationReceipt) = success()
        private fun success() = ApiResult.Success(AppointmentWrite(operation, doctor, "\"1\"", null,
            Instant.parse(receipt.createdAt), Instant.parse(receipt.expiresAt)))
    }
    private fun show() {
        compose.setContent {
            val scope = rememberCoroutineScope()
            val model = remember { PatientBookingViewModel(repository, operations, scope) { refreshed++ } }
            MaterialTheme { Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { PatientBookingForm(model) } }
        }
    }
    @Test fun selectsLocationDoctorAndThirtyMinuteSlotThenShowsServerReceipt() {
        show()
        compose.onNodeWithText("Book 30-minute appointment").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("Clinic / location").performScrollTo().performClick()
        compose.onNodeWithText("Clinic A · Main").performClick()
        compose.onNodeWithText("Doctor").performScrollTo().performClick()
        compose.onNodeWithText("Dr A").performClick()
        compose.onNodeWithText("30-minute slot").performScrollTo().performClick()
        val date = DateTimeFormatter.ofPattern("EEE, d MMM · HH:mm z").withZone(ZoneId.systemDefault())
        compose.onNodeWithText("${date.format(option.startsAt)} – ${date.format(option.endsAt)}").performClick()
        compose.onNodeWithText("Reason for visit").performScrollTo().performTextInput("Visit")
        compose.onNodeWithText("Book 30-minute appointment").performScrollTo().performClick()
        compose.onNodeWithText("Appointment created").performScrollTo().assertIsDisplayed()
        compose.runOnIdle { assertEquals(1, creates); assertEquals(1, refreshed); assertTrue(pending.isEmpty()) }
    }
    @Test fun restoredReceiptBlocksAnotherBookingUntilServerRecoverySucceeds() {
        pending = listOf(receipt)
        show()
        compose.onNodeWithText("Book 30-minute appointment").assertDoesNotExist()
        compose.onNodeWithText("Check saved booking · ${operation.take(8)}").performScrollTo().performClick()
        compose.onNodeWithText("Appointment created").performScrollTo().assertIsDisplayed()
        compose.runOnIdle { assertEquals(0, creates); assertEquals(1, refreshed); assertTrue(pending.isEmpty()) }
    }
}
