package com.viora.mobile.feature.auth.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun LoginScreen(message: String?, synthetic: Boolean, onSignIn: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(28.dp), verticalArrangement = Arrangement.Center) {
        Text("VIORA", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(24.dp))
        Text("A clearer day\nof care.", style = MaterialTheme.typography.displaySmall)
        Spacer(Modifier.height(16.dp))
        Text("Your clinic, together in one place.", style = MaterialTheme.typography.bodyLarge)
        Spacer(Modifier.height(32.dp))
        Card {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(if (synthetic) "Explore the foundation" else "Sign-in unavailable", style = MaterialTheme.typography.titleMedium)
                Text(if (synthetic) "Use a demo clinician and two fictional workspaces. No patient data or live services are connected."
                    else "Live sign-in is not configured for this build.")
                Button(onClick = onSignIn, enabled = synthetic, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text("Enter demo workspace")
                }
            }
        }
        message?.let { Spacer(Modifier.height(16.dp)); Text(it, style = MaterialTheme.typography.bodyMedium) }
    }
}
