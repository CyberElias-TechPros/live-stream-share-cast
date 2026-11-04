package com.imlive.app.ui.components

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import android.view.WindowManager
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.imlive.app.media.WebRtcEngine
import com.imlive.app.model.LiveStream
import com.imlive.app.model.Recording
import com.imlive.app.network.EndpointUrlRules
import com.imlive.app.ui.theme.ImLivePalette
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack
import java.util.concurrent.TimeUnit

private object RemoteBitmapCache {
    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    val cache = object : LruCache<String, Bitmap>(24 * 1024) {
        override fun sizeOf(key: String, value: Bitmap): Int = (value.byteCount / 1024).coerceAtLeast(1)
    }

    suspend fun load(url: String): Bitmap? = withContext(Dispatchers.IO) {
        cache.get(url)?.let { return@withContext it }
        runCatching {
            http.newCall(Request.Builder().url(url).build()).execute().use { res ->
                if (!res.isSuccessful) return@use null
                val bytes = res.body?.bytes() ?: return@use null
                if (bytes.size > 8 * 1024 * 1024) return@use null
                val opts = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.RGB_565 }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)?.also { bmp ->
                    cache.put(url, bmp)
                }
            }
        }.getOrNull()
    }
}

@Composable
fun NetworkImage(
    rawUrl: String?,
    apiBaseUrl: String,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    fallback: @Composable () -> Unit = {},
) {
    val resolved = remember(rawUrl, apiBaseUrl) { EndpointUrlRules.resolveMediaUrl(apiBaseUrl, rawUrl) }
    var bitmap by remember(resolved) {
        mutableStateOf(resolved?.let { RemoteBitmapCache.cache.get(it) })
    }
    LaunchedEffect(resolved) {
        if (resolved != null && bitmap == null) {
            bitmap = RemoteBitmapCache.load(resolved)
        }
    }
    val bmp = bitmap
    if (bmp != null) {
        Image(
            bitmap = bmp.asImageBitmap(),
            contentDescription = contentDescription,
            contentScale = contentScale,
            modifier = modifier,
        )
    } else {
        Box(modifier = modifier) { fallback() }
    }
}

@Composable
fun AvatarCircle(
    name: String,
    avatarUrl: String?,
    apiBaseUrl: String,
    size: Dp = 40.dp,
    isLive: Boolean = false,
) {
    val initials = remember(name) {
        name.trim().split(Regex("\\s+")).take(2)
            .mapNotNull { it.firstOrNull()?.uppercaseChar() }
            .joinToString("")
            .ifBlank { "?" }
    }
    Box(contentAlignment = Alignment.Center) {
        NetworkImage(
            rawUrl = avatarUrl,
            apiBaseUrl = apiBaseUrl,
            contentDescription = name,
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        listOf(MaterialTheme.colorScheme.primaryContainer, ImLivePalette.CardElevated),
                    ),
                ),
            fallback = {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        initials,
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            },
        )
        if (isLive) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(11.dp)
                    .clip(CircleShape)
                    .background(ImLivePalette.LiveRose),
            )
        }
    }
}

/**
 * Hardware-accelerated WebRTC video surface that manages track binding, mirror
 * orientation, and clean disposal without leaking EGL resources.
 */
@Composable
fun WebRtcVideoSurface(
    videoTrack: VideoTrack?,
    modifier: Modifier = Modifier,
    mirror: Boolean = false,
    fillCrop: Boolean = false,
) {
    var rendererRef by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var boundTrack by remember { mutableStateOf<VideoTrack?>(null) }

    DisposableEffect(videoTrack) {
        val view = rendererRef
        if (view != null) {
            if (boundTrack !== videoTrack) {
                boundTrack?.let { old -> runCatching { old.removeSink(view) } }
                videoTrack?.let { next -> runCatching { next.addSink(view) } }
                boundTrack = videoTrack
            }
        }
        onDispose {
            val currentView = rendererRef
            if (currentView != null && boundTrack != null) {
                runCatching { boundTrack?.removeSink(currentView) }
                boundTrack = null
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            val view = rendererRef
            if (view != null) {
                boundTrack?.let { old -> runCatching { old.removeSink(view) } }
                boundTrack = null
                runCatching { view.release() }
            }
        }
    }

    AndroidView(
        factory = { ctx ->
            SurfaceViewRenderer(ctx).apply {
                init(WebRtcEngine.eglBase().eglBaseContext, null)
                setEnableHardwareScaler(true)
                setMirror(mirror)
                setScalingType(
                    if (fillCrop) RendererCommon.ScalingType.SCALE_ASPECT_FILL
                    else RendererCommon.ScalingType.SCALE_ASPECT_FIT,
                )
                videoTrack?.let { track ->
                    runCatching { track.addSink(this) }
                    boundTrack = track
                }
                rendererRef = this
            }
        },
        update = { view ->
            view.setMirror(mirror)
            view.setScalingType(
                if (fillCrop) RendererCommon.ScalingType.SCALE_ASPECT_FILL
                else RendererCommon.ScalingType.SCALE_ASPECT_FIT,
            )
            if (boundTrack !== videoTrack) {
                boundTrack?.let { old -> runCatching { old.removeSink(view) } }
                videoTrack?.let { next -> runCatching { next.addSink(view) } }
                boundTrack = videoTrack
            }
        },
        modifier = modifier,
    )
}

@Composable
fun KeepScreenAwakeEffect(enabled: Boolean = true) {
    val context = LocalContext.current
    DisposableEffect(context, enabled) {
        val window = context.findActivity()?.window
        if (enabled) window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            if (enabled) window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}

private fun Context.findActivity(): Activity? {
    var cur: Context? = this
    while (cur is ContextWrapper) {
        if (cur is Activity) return cur
        cur = cur.baseContext
    }
    return null
}

@Composable
fun LivePulseBadge(label: String = "LIVE", modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "live_pulse")
    val dotAlpha by transition.animateFloat(
        initialValue = 1f,
        targetValue = 0.25f,
        animationSpec = infiniteRepeatable(tween(800), RepeatMode.Reverse),
        label = "dot_alpha",
    )
    Surface(
        color = ImLivePalette.LiveRose,
        shape = RoundedCornerShape(6.dp),
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .alpha(dotAlpha)
                    .clip(CircleShape)
                    .background(Color.White),
            )
            Spacer(Modifier.width(5.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, color = Color.White, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun OfflineModeBanner(
    isOnline: Boolean,
    onOpenOfflineRooms: () -> Unit,
) {
    if (isOnline) return
    Surface(
        color = ImLivePalette.WarningAmber.copy(alpha = 0.16f),
        border = BorderStroke(1.dp, ImLivePalette.WarningAmber.copy(alpha = 0.5f)),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpenOfflineRooms),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Icon(Icons.Default.WifiOff, contentDescription = null, tint = ImLivePalette.WarningAmber)
                Spacer(Modifier.width(10.dp))
                Column {
                    Text("No internet connection", style = MaterialTheme.typography.titleMedium, color = ImLivePalette.WarningAmber)
                    Text("Tap to open Offline Wi-Fi LAN & Hotspot streaming", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StreamFeedCard(
    stream: LiveStream,
    apiBaseUrl: String,
    onClick: () -> Unit,
    onCreatorClick: ((String) -> Unit)? = null,
    onShare: (() -> Unit)? = null,
) {
    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .background(
                        Brush.linearGradient(
                            listOf(Color(0xFF1F1638), Color(0xFF0E1B2A), Color(0xFF130F1D)),
                        ),
                    ),
            ) {
                NetworkImage(
                    rawUrl = stream.thumbnailUrl,
                    apiBaseUrl = apiBaseUrl,
                    contentDescription = stream.title,
                    modifier = Modifier.fillMaxSize(),
                    fallback = {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.PlayArrow,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.55f),
                                modifier = Modifier.size(44.dp),
                            )
                        }
                    },
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (stream.isLive) LivePulseBadge()
                        if (stream.streamType == "local") {
                            BadgePill("LAN", ImLivePalette.OnlineEmerald)
                        }
                        if (stream.isMature) {
                            BadgePill("18+", ImLivePalette.WarningAmber)
                        }
                    }
                    Surface(
                        color = Color.Black.copy(alpha = 0.68f),
                        shape = RoundedCornerShape(8.dp),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Default.Visibility, contentDescription = null, modifier = Modifier.size(13.dp), tint = Color.White)
                            Spacer(Modifier.width(4.dp))
                            Text("${stream.viewerCount}", style = MaterialTheme.typography.labelSmall, color = Color.White)
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Box(
                    modifier = Modifier.clickable(enabled = onCreatorClick != null && !stream.streamerUsername.isNullOrBlank()) {
                        stream.streamerUsername?.let { onCreatorClick?.invoke(it) }
                    },
                ) {
                    AvatarCircle(
                        name = stream.hostDisplay,
                        avatarUrl = stream.streamerAvatar,
                        apiBaseUrl = apiBaseUrl,
                        size = 40.dp,
                        isLive = stream.isLive,
                    )
                }
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        stream.title,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        buildString {
                            append(stream.hostDisplay)
                            stream.category?.takeIf(String::isNotBlank)?.let { append(" · $it") }
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (stream.tags.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            stream.tags.take(3).forEach { tag ->
                                Surface(
                                    color = ImLivePalette.CardElevated,
                                    shape = RoundedCornerShape(6.dp),
                                ) {
                                    Text(
                                        "#$tag",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    )
                                }
                            }
                        }
                    }
                }
                if (onShare != null) {
                    IconButton(onClick = onShare) {
                        Icon(Icons.Default.Share, contentDescription = "Share stream", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
fun RecordingFeedCard(
    recording: Recording,
    apiBaseUrl: String,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .width(126.dp)
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(ImLivePalette.CardElevated),
                contentAlignment = Alignment.Center,
            ) {
                NetworkImage(
                    rawUrl = recording.thumbnailUrl,
                    apiBaseUrl = apiBaseUrl,
                    contentDescription = recording.title,
                    modifier = Modifier.fillMaxSize(),
                    fallback = {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        }
                    },
                )
                recording.durationSeconds?.takeIf { it > 0 }?.let { sec ->
                    Surface(
                        color = Color.Black.copy(alpha = 0.75f),
                        shape = RoundedCornerShape(4.dp),
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(5.dp),
                    ) {
                        Text(
                            formatDurationClock(sec),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White,
                            modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                        )
                    }
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (recording.isClip) BadgePill("CLIP", MaterialTheme.colorScheme.primary)
                    if (recording.visibility != "public") BadgePill(recording.visibility.uppercase(), ImLivePalette.WarningAmber)
                }
                Text(
                    recording.title,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val creator = recording.streamerDisplayName ?: recording.streamerUsername
                Text(
                    buildString {
                        if (!creator.isNullOrBlank()) append("$creator · ")
                        append("${recording.viewsCount} views")
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
fun BadgePill(text: String, tint: Color) {
    Surface(
        color = tint.copy(alpha = 0.2f),
        border = BorderStroke(1.dp, tint.copy(alpha = 0.55f)),
        shape = RoundedCornerShape(6.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = tint,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}

@Composable
fun StatMetricTile(label: String, value: String, subtitle: String? = null, modifier: Modifier = Modifier) {
    Surface(
        color = ImLivePalette.CardDark,
        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
        shape = RoundedCornerShape(14.dp),
        modifier = modifier,
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
            subtitle?.let {
                Spacer(Modifier.height(2.dp))
                Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun SectionHeader(title: String, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        if (actionLabel != null && onAction != null) {
            Text(
                actionLabel,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(onClick = onAction)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
    }
}

fun formatDurationClock(totalSeconds: Int): String {
    val safe = totalSeconds.coerceAtLeast(0)
    val hrs = safe / 3600
    val mins = (safe % 3600) / 60
    val secs = safe % 60
    return if (hrs > 0) "%d:%02d:%02d".format(hrs, mins, secs) else "%02d:%02d".format(mins, secs)
}

fun sharePlainText(context: Context, subject: String, text: String) {
    val sendIntent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, subject)
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(sendIntent, subject).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
