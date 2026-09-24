package com.viora.mobile.feature.auth.ui

import android.util.Patterns
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.dp
import com.viora.mobile.core.ui.*
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(message: String?, synthetic: Boolean, onSignIn: (String, String) -> Unit, loading: Boolean = false,
    demoAccounts: List<com.viora.mobile.core.session.DemoAccount> = emptyList(),
    onRegister: (suspend (String, String, String) -> Unit)? = null) {
    var registering by remember { mutableStateOf(false) }
    var registeringBusy by remember { mutableStateOf(false) }
    var displayName by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var registrationMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    // Password is deliberately not saved to Activity state or persistent storage.
    var password by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    var submitted by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var forgot by remember { mutableStateOf(false) }
    var explore by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current
    val emailInvalid = submitted && !Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches()
    val passwordInvalid = submitted && password.isEmpty()
    fun submit() {
        if (loading || registeringBusy) return
        submitted = true
        error = null
        registrationMessage = null
        if (!Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches() || password.isEmpty()) return
        if (registering) {
            if (displayName.isBlank()) { error = "Enter your display name."; return }
            if (password != confirmation) { error = "Passwords do not match."; return }
            val register = onRegister ?: return
            registeringBusy = true
            val submittedPassword = password
            password = ""; confirmation = ""
            scope.launch {
                try {
                    register(email.trim(), submittedPassword, displayName.trim())
                    registering = false
                    registrationMessage = "Account created. Sign in with your email and password."
                } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
                catch (_: Exception) { error = "Account could not be created. Check your details and retry. Passwords need at least 12 characters." }
                finally { registeringBusy = false; submitted = false }
            }
            return
        }
        focus.clearFocus()
        onSignIn(email.trim(), password)
        password = ""
        submitted = false
    }
    val fieldColors = OutlinedTextFieldDefaults.colors(
        unfocusedContainerColor = MaterialTheme.colorScheme.surface,
        focusedContainerColor = MaterialTheme.colorScheme.surface,
        unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
        unfocusedLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant)
    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        VioraBrand()
        Spacer(Modifier.height(4.dp))
        Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.primaryContainer) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                IconBadge("heart")
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("A little care. A healthier you.", style = MaterialTheme.typography.labelLarge)
                    Text("Your health, all in one place.", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        ScreenHeading(if (registering) "Create account" else "Welcome to Viora", "Your care journey starts here.")
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (registering) OutlinedTextField(displayName, { displayName = it }, modifier = Modifier.fillMaxWidth(),
                label = { Text("Display name") }, singleLine = true, enabled = !registeringBusy)
            OutlinedTextField(value = email, onValueChange = { email = it; error = null },
                modifier = Modifier.fillMaxWidth(), label = { Text("Email address") }, singleLine = true,
                shape = MaterialTheme.shapes.medium, colors = fieldColors,
                leadingIcon = { VioraIcon("email") }, enabled = !loading, isError = emailInvalid,
                supportingText = if (emailInvalid) ({ Text("Enter a valid email address.") }) else null,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { focus.moveFocus(androidx.compose.ui.focus.FocusDirection.Down) }))
            OutlinedTextField(value = password, onValueChange = { password = it; error = null },
                modifier = Modifier.fillMaxWidth(), label = { Text("Password") }, singleLine = true,
                shape = MaterialTheme.shapes.medium, colors = fieldColors,
                leadingIcon = { VioraIcon("lock") }, enabled = !loading, isError = passwordInvalid,
                supportingText = if (passwordInvalid) ({ Text("Enter your password.") }) else null,
                visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = { IconButton(onClick = { visible = !visible }, enabled = !loading) {
                    VioraIcon(if (visible) "eyeOff" else "eye", if (visible) "Hide password" else "Show password")
                } },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }))
            if (registering) OutlinedTextField(confirmation, { confirmation = it }, modifier = Modifier.fillMaxWidth(),
                label = { Text("Confirm password") }, singleLine = true, enabled = !registeringBusy,
                visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
            if (!registering) TextButton(onClick = { forgot = true }, modifier = Modifier.align(Alignment.End).heightIn(min = 48.dp)) {
                Text("Forgot password?")
            }
        }
        val feedback = error ?: registrationMessage ?: message?.let {
            if (it.startsWith("Signed out")) "You're signed out. See you again soon." else it
        }
        feedback?.let {
            Text(it, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                color = if (error != null || (registrationMessage == null && !it.startsWith("You're signed out"))) MaterialTheme.colorScheme.error
                else MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
        }
        Button(onClick = ::submit, enabled = !loading && !registeringBusy, shape = MaterialTheme.shapes.medium,
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
            if (loading) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(12.dp))
            }
            Text(if (registeringBusy) "Creating account…" else if (registering) "Create account" else if (loading) "Signing in…" else "Sign in")
        }
        if (!synthetic && onRegister != null) TextButton(onClick = {
            registering = !registering; password = ""; confirmation = ""; error = null; registrationMessage = null; submitted = false
        }, enabled = !loading && !registeringBusy) { Text(if (registering) "Already have an account? Sign in" else "Don't have an account? Create account") }
        if (synthetic) {
            OutlinedButton(onClick = { focus.clearFocus(); explore = true },
                shape = MaterialTheme.shapes.medium, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                enabled = !loading, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                Text("Explore local demo"); Spacer(Modifier.width(12.dp)); VioraIcon("next")
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("LOCAL DEMO · Fictional people, no live services", style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Explore local demo to use a demo account.", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(8.dp))
    }
    if (forgot) AlertDialog(onDismissRequest = { forgot = false }, title = { Text("Sign-in help") },
        text = { Text(if (synthetic) "This local demo doesn't send password reset emails. Choose Explore local demo to fill in a demo account." else "Password reset is not available yet. Contact your clinic for account help.") },
        confirmButton = { TextButton(onClick = { forgot = false }) { Text("Got it") } })
    if (explore && synthetic) AlertDialog(onDismissRequest = { explore = false }, title = { Text("Explore local demo") },
        text = { Column {
            Text("Choose an account, then sign in. All data is fictional and local.")
            demoAccounts.forEach { account ->
                TextButton(onClick = {
                    email = account.email; password = account.password
                    submitted = false; error = null; explore = false
                }) { Text(account.label) }
            }
        } }, confirmButton = { TextButton(onClick = { explore = false }) { Text("Close") } })
}
