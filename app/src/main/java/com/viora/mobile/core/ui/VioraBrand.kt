package com.viora.mobile.core.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable fun VioraBrand(large: Boolean = false) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(if (large) 68.dp else 44.dp)
            .background(Brush.linearGradient(listOf(Color(0xFF187AB5), Color(0xFF139A96))), RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center) {
            Text("v", color = Color.White, fontSize = if (large) 56.sp else 36.sp,
                fontWeight = FontWeight.Bold, modifier = Modifier.offset(y = (-4).dp))
        }
        Text("viora", fontSize = if (large) 40.sp else 28.sp, fontWeight = FontWeight.Bold,
            letterSpacing = (-1).sp, color = MaterialTheme.colorScheme.primary)
    }
}

@Composable fun VioraSplash() {
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.White, Color(0xFFE7F5FA))))
        .safeDrawingPadding()) {
        Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            VioraBrand(large = true)
            Text("Care that feels personal.", style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            CircularProgressIndicator(Modifier.padding(top = 16.dp).size(26.dp), strokeWidth = 2.dp)
        }
        Text("YOUR HEALTH. YOUR EVERYDAY COMPANION.", Modifier.align(Alignment.BottomCenter).padding(28.dp),
            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
