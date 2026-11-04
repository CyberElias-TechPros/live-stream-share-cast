package com.imlive.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.imlive.app.model.AccentTheme

object ImLivePalette {
    val Obsidian = Color(0xFF08070C)
    val SurfaceDark = Color(0xFF110F1A)
    val CardDark = Color(0xFF191626)
    val CardElevated = Color(0xFF231F35)
    val BorderSubtle = Color(0xFF2D2844)
    val TextPrimary = Color(0xFFF6F5FA)
    val TextMuted = Color(0xFFA39EB8)
    val LiveRose = Color(0xFFF43F5E)
    val OnlineEmerald = Color(0xFF10B981)
    val WarningAmber = Color(0xFFF59E0B)
    val DangerRed = Color(0xFFEF4444)

    fun primaryFor(accent: AccentTheme): Color = when (accent) {
        AccentTheme.MAGENTA -> Color(0xFFC084FC)
        AccentTheme.AURORA -> Color(0xFF38BDF8)
        AccentTheme.EMBER -> Color(0xFFFB923C)
    }

    fun containerFor(accent: AccentTheme): Color = when (accent) {
        AccentTheme.MAGENTA -> Color(0xFF332056)
        AccentTheme.AURORA -> Color(0xFF13334C)
        AccentTheme.EMBER -> Color(0xFF462310)
    }
}

private val StudioTypography = Typography(
    headlineLarge = TextStyle(
        fontSize = 28.sp,
        lineHeight = 34.sp,
        fontWeight = FontWeight.ExtraBold,
        letterSpacing = (-0.5).sp,
    ),
    headlineMedium = TextStyle(
        fontSize = 22.sp,
        lineHeight = 28.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.3).sp,
    ),
    titleLarge = TextStyle(
        fontSize = 18.sp,
        lineHeight = 24.sp,
        fontWeight = FontWeight.Bold,
    ),
    titleMedium = TextStyle(
        fontSize = 15.sp,
        lineHeight = 21.sp,
        fontWeight = FontWeight.SemiBold,
    ),
    bodyLarge = TextStyle(
        fontSize = 15.sp,
        lineHeight = 22.sp,
    ),
    bodyMedium = TextStyle(
        fontSize = 13.sp,
        lineHeight = 19.sp,
    ),
    labelLarge = TextStyle(
        fontSize = 13.sp,
        lineHeight = 18.sp,
        fontWeight = FontWeight.SemiBold,
    ),
    labelSmall = TextStyle(
        fontSize = 11.sp,
        lineHeight = 14.sp,
        fontWeight = FontWeight.Medium,
    ),
)

private val StudioShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun ImLiveTheme(
    accent: AccentTheme = AccentTheme.MAGENTA,
    content: @Composable () -> Unit,
) {
    val primary = ImLivePalette.primaryFor(accent)
    val primaryContainer = ImLivePalette.containerFor(accent)
    val colors = darkColorScheme(
        primary = primary,
        onPrimary = Color(0xFF0A0812),
        primaryContainer = primaryContainer,
        onPrimaryContainer = ImLivePalette.TextPrimary,
        secondary = ImLivePalette.OnlineEmerald,
        onSecondary = Color(0xFF061B13),
        tertiary = ImLivePalette.LiveRose,
        background = ImLivePalette.Obsidian,
        onBackground = ImLivePalette.TextPrimary,
        surface = ImLivePalette.SurfaceDark,
        onSurface = ImLivePalette.TextPrimary,
        surfaceVariant = ImLivePalette.CardDark,
        onSurfaceVariant = ImLivePalette.TextMuted,
        outline = ImLivePalette.BorderSubtle,
        error = ImLivePalette.DangerRed,
    )

    MaterialTheme(
        colorScheme = colors,
        typography = StudioTypography,
        shapes = StudioShapes,
        content = content,
    )
}
