package com.viora.mobile.feature

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.viora.mobile.feature.auth.ui.LoginScreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AuthFeedbackTest {
    @get:Rule val compose = createComposeRule()

    @Test fun successfulRegistrationDoesNotMaskNextLoginFailure() {
        val message = mutableStateOf<String?>("Previous sign-in failure")
        compose.setContent {
            MaterialTheme {
                LoginScreen(message.value, synthetic = false,
                    onSignIn = { _, _ -> message.value = "Current sign-in failure" },
                    onRegister = { _, _, _ -> message.value = null })
            }
        }
        compose.onNodeWithText("Don't have an account? Create account").performScrollTo().performClick()
        compose.onNodeWithText("Display name").performScrollTo().performTextInput("Synthetic")
        compose.onNodeWithText("Email address").performScrollTo().performTextInput("synthetic@example.test")
        compose.onNodeWithText("Password").performScrollTo().performTextInput("test-password-123")
        compose.onNodeWithText("Confirm password").performScrollTo().performTextInput("test-password-123")
        compose.onNode(hasText("Create account") and hasClickAction()).performScrollTo().performClick()
        compose.onNodeWithText("Account created. Sign in with your email and password.").assertExists()
        compose.onNodeWithText("Previous sign-in failure").assertDoesNotExist()
        compose.onNodeWithText("Password").performScrollTo().performTextInput("test-password-123")
        compose.onNodeWithText("Sign in").performScrollTo().performClick()
        compose.onNodeWithText("Account created. Sign in with your email and password.").assertDoesNotExist()
        compose.onNodeWithText("Current sign-in failure").assertExists()
    }
}
