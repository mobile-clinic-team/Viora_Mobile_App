package com.viora.mobile.core.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

enum class UiStateKind { LOADING, EMPTY, ERROR, DENIED, UNAVAILABLE, SUCCESS }

/** Small, presentational state surface shared by final-demo screens. */
@Composable fun UiStatePanel(kind: UiStateKind, title: String, message: String, icon: String = "info",
    action: (@Composable () -> Unit)? = null, secondaryAction: (@Composable () -> Unit)? = null) {
    val region = if (kind == UiStateKind.ERROR) LiveRegionMode.Assertive else LiveRegionMode.Polite
    Surface(Modifier.fillMaxWidth().semantics { liveRegion = region },
        shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (kind == UiStateKind.LOADING) {
                CircularProgressIndicator(Modifier.size(28.dp).semantics { contentDescription = "Loading" }, strokeWidth = 3.dp)
            } else IconBadge(icon)
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            action?.invoke()
            secondaryAction?.invoke()
        }
    }
}

/** Small line icons without an additional dependency. Labels live on their controls. */
@Composable fun VioraIcon(name: String, description: String? = null, modifier: Modifier = Modifier) {
    val vector = remember(name) {
        val data = when (name) {
            "heart" -> "M12 21 L3 12 C-2 5 7 0 12 6 C17 0 26 5 21 12 Z"
            "records" -> "M6 3 H15 L20 8 V21 H4 V3 Z M14 3 V9 H20 M8 13 H16 M8 17 H14"
            "bell" -> "M5 17 H19 L17 14 V9 A5 5 0 0 0 7 9 V14 Z M10 21 H14 M12 2 V4"
            "email" -> "M3 5 H21 V19 H3 Z M3 6 L12 13 L21 6"
            "lock" -> "M5 10 H19 V21 H5 Z M8 10 V6 A4 4 0 0 1 16 6 V10 M12 14 V17"
            "eye" -> "M2 12 Q12 -2 22 12 Q12 26 2 12 Z M15 12 A3 3 0 1 1 9 12 A3 3 0 1 1 15 12"
            "eyeOff" -> "M3 3 L21 21 M2 12 Q8 3 14 6 M22 12 Q16 21 10 18"
            "doctor" -> "M5 3 V9 A5 5 0 0 0 15 9 V3 M3 3 H7 M13 3 H17 M10 14 V17 A5 4 0 0 0 20 17 V13 M22 11 A2 2 0 1 1 18 11 A2 2 0 1 1 22 11"
            "hospital" -> "M3 21 V8 H8 V3 H16 V8 H21 V21 Z M10 21 V16 H14 V21 M10 8 H14 M12 6 V10"
            "video" -> "M3 5 H16 V19 H3 Z M16 10 L22 6 V18 L16 14"
            "sun" -> "M16 12 A4 4 0 1 1 8 12 A4 4 0 1 1 16 12 M12 2 V4 M12 20 V22 M2 12 H4 M20 12 H22 M5 5 L6 6 M18 18 L19 19 M5 19 L6 18 M18 6 L19 5"
            "location" -> "M19 9 C19 15 12 22 12 22 C12 22 5 15 5 9 A7 7 0 0 1 19 9 Z M14 9 A2 2 0 1 1 10 9 A2 2 0 1 1 14 9"
            "patients", "account" -> "M16 7 A4 4 0 1 1 8 7 A4 4 0 1 1 16 7 M4 21 V19 A8 7 0 0 1 20 19 V21"
            "schedule" -> "M5 5 H19 Q21 5 21 7 V19 Q21 21 19 21 H5 Q3 21 3 19 V7 Q3 5 5 5 M7 3 V7 M17 3 V7 M3 10 H21 M8 14 H9 M15 14 H16 M8 17 H9"
            "assistant" -> "M5 3 H19 Q21 3 21 5 V15 Q21 17 19 17 H10 L4 21 V17 Q2 17 2 15 V5 Q2 3 5 3 M7 8 H16 M7 12 H13"
            "clinic" -> "M5 21 V5 Q5 3 7 3 H17 Q19 3 19 5 V21 M3 21 H21 M10 21 V16 H14 V21 M9 8 H15 M12 5 V11"
            "home" -> "M3 10 L12 3 L21 10 M5 9 V21 H10 V15 H14 V21 H19 V9"
            "search" -> "M17 10 A7 7 0 1 1 3 10 A7 7 0 1 1 17 10 M15 15 L21 21"
            "back" -> "M14 5 L7 12 L14 19 M7 12 H21"
            "next" -> "M9 5 L16 12 L9 19"
            "previous" -> "M15 5 L8 12 L15 19"
            "close" -> "M6 6 L18 18 M18 6 L6 18"
            "plus" -> "M12 4 V20 M4 12 H20"
            "logout" -> "M9 3 H4 V21 H9 M9 12 H21 M16 7 L21 12 L16 17"
            else -> "M12 3 A9 9 0 1 1 12 21 A9 9 0 1 1 12 3 M12 11 V16 M12 7 V7.1"
        }
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).addPath(
            PathParser().parsePathString(data).toNodes(), fill = null, stroke = SolidColor(Color.Black),
            strokeLineWidth = 1.8f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
        ).build()
    }
    Icon(vector, description, modifier.size(24.dp))
}

@Composable fun IconBadge(icon: String, modifier: Modifier = Modifier) {
    Surface(modifier.size(44.dp), shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.primaryContainer,
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer) {
        Box(contentAlignment = Alignment.Center) { VioraIcon(icon) }
    }
}

@Composable fun ScreenHeading(title: String, subtitle: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        subtitle?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable fun ActionRow(title: String, subtitle: String, icon: String, onClick: () -> Unit,
    modifier: Modifier = Modifier, enabled: Boolean = true) {
    OutlinedCard(onClick = onClick, enabled = enabled, modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            IconBadge(icon)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (enabled) VioraIcon("next")
        }
    }
}

@Composable fun InfoPanel(title: String, message: String, icon: String = "info", loading: Boolean = false,
    action: (@Composable () -> Unit)? = null) {
    Surface(Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
        shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainerLow) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (loading) CircularProgressIndicator(Modifier.size(28.dp).semantics { contentDescription = "Loading" }, strokeWidth = 3.dp)
            else IconBadge(icon)
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            action?.invoke()
        }
    }
}

@Composable fun DetailField(label: String, value: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge)
    }
}

fun displayLabel(value: String): String = value.lowercase().replace('_', ' ').replaceFirstChar { it.titlecase() }
