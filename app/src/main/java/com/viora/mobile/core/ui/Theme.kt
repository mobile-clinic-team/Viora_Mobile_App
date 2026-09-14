package com.viora.mobile.core.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Colors = lightColorScheme(
    primary = Color(0xFF176B5B), onPrimary = Color.White,
    primaryContainer = Color(0xFFD8EFE7), onPrimaryContainer = Color(0xFF0C4035),
    secondary = Color(0xFF526860), background = Color(0xFFF5F7F4),
    surface = Color(0xFFFFFFFF), surfaceVariant = Color(0xFFE9EFEB),
    onSurface = Color(0xFF172D25), onSurfaceVariant = Color(0xFF4F635B),
)
@Composable fun VioraTheme(content: @Composable () -> Unit) { MaterialTheme(colorScheme = Colors, content = content) }
