package com.viora.mobile.core.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Colors = lightColorScheme(
    primary = Color(0xFF246E91), onPrimary = Color.White,
    primaryContainer = Color(0xFFE8F3F7), onPrimaryContainer = Color(0xFF245D74),
    secondary = Color(0xFF337E80), onSecondary = Color.White,
    secondaryContainer = Color(0xFFE5F2F0), onSecondaryContainer = Color(0xFF246D6C),
    background = Color(0xFFF7FAFB), onBackground = Color(0xFF203D4D),
    surface = Color(0xFFFFFFFF), surfaceVariant = Color(0xFFE8F0F5),
    onSurface = Color(0xFF203D4D), onSurfaceVariant = Color(0xFF5C7380),
    surfaceContainer = Color(0xFFEDF4F8), surfaceContainerLow = Color(0xFFEEF6FA),
    surfaceContainerHigh = Color(0xFFE4EFF6), surfaceContainerHighest = Color(0xFFDFEAF2),
    outline = Color(0xFF748A9A), outlineVariant = Color(0xFFD7E4ED),
)
private val Type = Typography(
    headlineMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = (-0.5).sp),
    headlineSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 30.sp, letterSpacing = (-0.3).sp),
    titleLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 24.sp, letterSpacing = (-0.2).sp),
    titleMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 18.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 14.sp),
)
@Composable fun VioraTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, typography = Type,
        shapes = Shapes(small = RoundedCornerShape(12.dp), medium = RoundedCornerShape(16.dp), large = RoundedCornerShape(20.dp)),
        content = content)
}

