package com.imlive.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Hearing
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.imlive.app.live.ChatClient
import com.imlive.app.live.ChatConnectionState
import com.imlive.app.media.SignallingClient
import com.imlive.app.media.WebRtcViewerSession
import com.imlive.app.media.toNativeIceServers
import com.imlive.app.model.ChatMessage
import com.imlive.app.model.LiveStream
import com.imlive.app.model.PaymentConfigInfo
import com.imlive.app.model.RtcConnectionDiagnostics
import com.imlive.app.model.VideoQualityPreset
import com.imlive.app.network.EndpointUrlRules
import com.imlive.app.ui.ImLiveContainer
import com.imlive.app.ui.components.AvatarCircle
import com.imlive.app.ui.components.KeepScreenAwakeEffect
import com.imlive.app.ui.components.LivePulseBadge
import com.imlive.app.ui.components.WebRtcVideoSurface
import com.imlive.app.ui.components.sharePlainText
import com.imlive.app.ui.theme.ImLivePalette
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.webrtc.VideoTrack
import java.util.UUID

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun WatchScreen(
    container: ImLiveContainer,
    initialStream: LiveStream,
    onBack: () -> Unit,
    onOpenCreatorProfile: (String) -> Unit,
    onRequireSignIn: () -> Unit,
) {
    BackHandler(onBack = onBack)

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val apiBase by container.endpointStore.apiBaseUrlFlow.collectAsState()
    val prefs by container.preferences.settings.collectAsState()
    val currentUser by container.authRepository.currentUser.collectAsState()

    KeepScreenAwakeEffect(enabled = prefs.keepScreenAwake)

    var stream by remember(initialStream.id) { mutableStateOf(initialStream) }
    var videoTrack by remember { mutableStateOf<VideoTrack?>(null) }
    var statusText by remember { mutableStateOf("Connecting to broadcast…") }
    var diagnostics by remember { mutableStateOf(RtcConnectionDiagnostics()) }
    var showDiagnostics by remember { mutableStateOf(false) }
    var theaterFullscreen by remember { mutableStateOf(false) }

    var audioMuted by remember { mutableStateOf(false) }
    var speakerphone by remember { mutableStateOf(true) }
    var audioOnly by remember { mutableStateOf(prefs.defaultQuality == VideoQualityPreset.AUDIO_ONLY) }
    var selectedQuality by remember {
        mutableStateOf(if (prefs.dataSaver) VideoQualityPreset.SAVER_360P else prefs.defaultQuality)
    }

    var viewerCount by remember { mutableIntStateOf(initialStream.viewers) }
    var isFollowing by remember { mutableStateOf(false) }
    var messages by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var chatDraft by remember { mutableStateOf("") }
    var replyTarget by remember { mutableStateOf<ChatMessage?>(null) }
    var typingUser by remember { mutableStateOf<String?>(null) }
    var chatState by remember { mutableStateOf(ChatConnectionState.CONNECTING) }
    var chatBanner by remember { mutableStateOf<String?>(null) }

    var viewerSessionRef by remember { mutableStateOf<WebRtcViewerSession?>(null) }
    var chatClientRef by remember { mutableStateOf<ChatClient?>(null) }
    var watchSessionId by remember { mutableStateOf<String?>(null) }

    var showTipDialog by remember { mutableStateOf(false) }
    var showReportDialog by remember { mutableStateOf(false) }
    var paymentConfig by remember { mutableStateOf<PaymentConfigInfo?>(null) }
    val watchStartedMs = remember { mutableLongStateOf(System.currentTimeMillis()) }
    val chatListState = rememberLazyListState()

    LaunchedEffect(typingUser) {
        if (typingUser != null) {
            delay(3_000L)
            typingUser = null
        }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            runCatching { chatListState.animateScrollToItem(messages.lastIndex) }
        }
    }

    LaunchedEffect(stream.id, currentUser?.id) {
        container.liveRepository.stream(stream.id).onSuccess { stream = it; viewerCount = it.viewers }
        container.liveRepository.presence(stream.id).onSuccess { viewerCount = maxOf(viewerCount, it.viewers) }
        container.liveRepository.chatHistory(stream.id).onSuccess { messages = it }
        container.platformRepository.paymentConfig().onSuccess { paymentConfig = it }
        container.liveRepository.startWatch(streamId = stream.id).onSuccess { sid ->
            if (sid.isNotBlank()) watchSessionId = sid
        }
        val ownerId = stream.ownerId
        if (currentUser != null && !ownerId.isNullOrBlank()) {
            container.liveRepository.followState(ownerId).onSuccess { isFollowing = it }
        }
    }

    DisposableEffect(stream.id, currentUser?.id, apiBase) {
        val sessionJob = scope.launch {
            val ice = if (stream.streamType == "local") {
                emptyList()
            } else {
                container.liveRepository.iceServers().getOrDefault(emptyList()).toNativeIceServers()
            }

            val sigTicket = container.liveRepository.ticket(stream.id, "viewer").getOrElse { err ->
                statusText = if (currentUser == null) {
                    "Sign in to watch live or wait for public stream"
                } else {
                    err.message ?: "Stream is offline or unavailable"
                }
                return@launch
            }

            val peerId = "android-viewer-${UUID.randomUUID().toString().take(8)}"
            var signalRef: SignallingClient? = null
            val rtc = WebRtcViewerSession(
                context = context,
                iceServers = ice,
                sendSignal = { frame -> signalRef?.send(frame) },
                onVideo = { track -> scope.launch { videoTrack = track } },
                onAudio = {},
                onState = { pcState ->
                    scope.launch {
                        statusText = when (pcState.name) {
                            "CONNECTED" -> "LIVE"
                            "CONNECTING" -> "Negotiating P2P media…"
                            "DISCONNECTED" -> "Reconnecting media…"
                            "FAILED" -> "Media interrupted — retrying…"
                            else -> pcState.name.lowercase()
                        }
                    }
                },
                onDiagnostics = { diag -> scope.launch { diagnostics = diag } },
            )
            viewerSessionRef = rtc

            val sig = SignallingClient(
                streamId = stream.id,
                initialTicket = sigTicket,
                role = "viewer",
                peerId = peerId,
                apiBaseUrl = apiBase,
                refreshTicket = { container.liveRepository.ticket(stream.id, "viewer").getOrNull() },
                onFrame = { frame ->
                    when (frame.optString("type")) {
                        "welcome" -> {
                            scope.launch { statusText = "Signalling ready — waiting for broadcaster…" }
                            rtc.startKnocking()
                        }
                        "ready", "streamer-ready" -> {
                            val hostId = frame.optString("from").takeIf(String::isNotBlank)
                                ?: frame.optString("id").takeIf(String::isNotBlank)
                            rtc.onHostReady(hostId)
                            selectedQuality.viewerKbps?.let { rtc.requestQuality(it) }
                        }
                        "peer-left" -> {
                            val leftId = frame.optString("id").takeIf(String::isNotBlank)
                                ?: frame.optString("from").takeIf(String::isNotBlank)
                            val role = frame.optString("role")
                            if (role == "host" || (leftId != null && leftId == rtc.streamerPeerId)) {
                                scope.launch { statusText = "Broadcaster paused or disconnected — waiting…" }
                                rtc.onHostLeft()
                            }
                        }
                        "close" -> {
                            scope.launch { statusText = "Broadcaster ended the stream" }
                            rtc.onHostLeft()
                        }
                        "error" -> {
                            scope.launch {
                                statusText = frame.optString("error", "Broadcast unavailable")
                            }
                        }
                        else -> rtc.accept(frame)
                    }
                },
                onClosed = { reason -> scope.launch { statusText = reason } },
                onReconnected = { rtc.startKnocking() },
            )
            signalRef = sig
            sig.connect()

            container.liveRepository.ticket(stream.id, "viewer").onSuccess { chatTicket ->
                val chat = ChatClient(
                    streamId = stream.id,
                    initialTicket = chatTicket,
                    role = "viewer",
                    apiBaseUrl = apiBase,
                    refreshTicket = { container.liveRepository.ticket(stream.id, "viewer").getOrNull() },
                    onState = { st -> scope.launch { chatState = st } },
                    onMessage = { msg ->
                        scope.launch {
                            if (messages.none { it.id == msg.id }) {
                                messages = (messages + msg).takeLast(150)
                            }
                        }
                    },
                    onPresence = { viewers, _ -> scope.launch { viewerCount = viewers } },
                    onModeration = { id, hidden ->
                        scope.launch {
                            messages = messages.map { if (it.id == id) it.copy(isModerated = hidden) else it }
                        }
                    },
                    onTyping = { who -> scope.launch { typingUser = who } },
                    onStreamOffline = { scope.launch { statusText = "Broadcast has ended" } },
                    onError = { err -> scope.launch { chatBanner = err } },
                )
                chatClientRef = chat
                chat.connect()
            }
        }

        onDispose {
            val watchedSec = ((System.currentTimeMillis() - watchStartedMs.longValue) / 1000L).toInt()
            val sid = watchSessionId
            if (!sid.isNullOrBlank() && watchedSec >= 2) {
                CoroutineScope(Dispatchers.IO).launch {
                    container.liveRepository.endWatch(sid, watchedSec)
                }
            }
            sessionJob.cancel()
            chatClientRef?.close()
            chatClientRef = null
            viewerSessionRef?.close()
            viewerSessionRef = null
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(ImLivePalette.Obsidian)) {
        Box(
            modifier = if (theaterFullscreen) {
                Modifier.fillMaxSize().background(Color.Black)
            } else {
                Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black)
            },
        ) {
            if (videoTrack != null && !audioOnly) {
                WebRtcVideoSurface(
                    videoTrack = videoTrack,
                    modifier = Modifier.fillMaxSize(),
                    fillCrop = false,
                )
            } else {
                Column(
                    modifier = Modifier.fillMaxSize().padding(20.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    if (audioOnly) {
                        Icon(Icons.Default.GraphicEq, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(42.dp))
                        Spacer(Modifier.height(8.dp))
                        Text("Audio-Only Data Saver Active", style = MaterialTheme.typography.titleMedium)
                    } else {
                        Text(statusText, style = MaterialTheme.typography.titleMedium, color = Color.White)
                        if (currentUser == null) {
                            Spacer(Modifier.height(12.dp))
                            Button(onClick = onRequireSignIn) { Text("Sign in for Chat & Follow") }
                        }
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth().padding(8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Surface(color = Color.Black.copy(alpha = 0.55f), shape = RoundedCornerShape(50)) {
                        IconButton(onClick = { if (theaterFullscreen) theaterFullscreen = false else onBack() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                        }
                    }
                    LivePulseBadge(if (statusText == "LIVE") "LIVE · $viewerCount" else statusText.take(22))
                }

                Surface(color = Color.Black.copy(alpha = 0.55f), shape = RoundedCornerShape(50)) {
                    Row {
                        IconButton(onClick = {
                            audioMuted = !audioMuted
                            viewerSessionRef?.setAudioMuted(audioMuted)
                        }) {
                            Icon(
                                if (audioMuted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp,
                                contentDescription = "Mute audio",
                                tint = Color.White,
                            )
                        }
                        IconButton(onClick = {
                            speakerphone = !speakerphone
                            viewerSessionRef?.setSpeakerphone(speakerphone)
                        }) {
                            Icon(
                                Icons.Default.Hearing,
                                contentDescription = "Toggle speaker/earpiece",
                                tint = if (speakerphone) MaterialTheme.colorScheme.primary else Color.White,
                            )
                        }
                        IconButton(onClick = { showDiagnostics = !showDiagnostics }) {
                            Icon(
                                Icons.Default.Info,
                                contentDescription = "WebRTC stats",
                                tint = if (showDiagnostics) MaterialTheme.colorScheme.primary else Color.White,
                            )
                        }
                        IconButton(onClick = { theaterFullscreen = !theaterFullscreen }) {
                            Icon(
                                if (theaterFullscreen) Icons.Default.FullscreenExit else Icons.Default.Fullscreen,
                                contentDescription = "Toggle fullscreen",
                                tint = Color.White,
                            )
                        }
                    }
                }
            }

            if (showDiagnostics) {
                Surface(
                    color = Color.Black.copy(alpha = 0.80f),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.align(Alignment.BottomStart).padding(10.dp),
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Text("Transport: ${diagnostics.transportType}", style = MaterialTheme.typography.labelSmall, color = ImLivePalette.OnlineEmerald)
                        Text(
                            "Video: ${diagnostics.resolutionLabel} @ ${diagnostics.fps}fps · ${diagnostics.bitrateKbps} kbps",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White,
                        )
                        Text(
                            "RTT: ${diagnostics.rttMs?.let { "${it}ms" } ?: "—"} · Lost: ${diagnostics.packetsLost} pkts · Retries: ${diagnostics.reconnectCount}",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.LightGray,
                        )
                    }
                }
            }
        }

        if (!theaterFullscreen) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(ImLivePalette.SurfaceDark)
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier.clickable(enabled = !stream.username.isNullOrBlank()) {
                            stream.username?.let(onOpenCreatorProfile)
                        },
                    ) {
                        AvatarCircle(
                            name = stream.hostDisplay,
                            avatarUrl = stream.userAvatar,
                            apiBaseUrl = apiBase,
                            size = 40.dp,
                            isLive = true,
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(stream.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "${stream.hostDisplay}${stream.category?.let { " · $it" } ?: ""}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    val ownerId = stream.ownerId
                    if (currentUser != null && !ownerId.isNullOrBlank() && ownerId != currentUser?.id) {
                        Button(
                            onClick = {
                                scope.launch {
                                    val res = if (isFollowing) {
                                        container.liveRepository.unfollow(ownerId)
                                    } else {
                                        container.liveRepository.follow(ownerId)
                                    }
                                    res.onSuccess { next -> isFollowing = next }
                                }
                            },
                        ) {
                            Text(if (isFollowing) "Following" else "Follow")
                        }
                    }
                }

                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf(VideoQualityPreset.AUTO, VideoQualityPreset.HD_720P, VideoQualityPreset.SD_480P, VideoQualityPreset.SAVER_360P).forEach { preset ->
                        FilterChip(
                            selected = !audioOnly && selectedQuality == preset,
                            onClick = {
                                audioOnly = false
                                selectedQuality = preset
                                viewerSessionRef?.setAudioOnly(false)
                                viewerSessionRef?.requestQuality(preset.viewerKbps)
                            },
                            label = { Text(preset.label.substringBefore(" ")) },
                        )
                    }
                    FilterChip(
                        selected = audioOnly,
                        onClick = {
                            audioOnly = !audioOnly
                            viewerSessionRef?.setAudioOnly(audioOnly)
                        },
                        label = { Text("Audio only") },
                    )
                    IconButton(onClick = {
                        val root = EndpointUrlRules.toOriginUrl(apiBase)
                        sharePlainText(
                            context = context,
                            subject = stream.title,
                            text = "Watch ${stream.title} live!\nApp: imlive://watch/${stream.id}\nWeb: $root/watch/${stream.id}",
                        )
                    }) {
                        Icon(Icons.Default.Share, contentDescription = "Share")
                    }
                    if (currentUser != null && stream.ownerId != null && stream.ownerId != currentUser?.id) {
                        IconButton(onClick = { showTipDialog = true }) {
                            Icon(Icons.Default.Favorite, contentDescription = "Tip creator", tint = ImLivePalette.LiveRose)
                        }
                        IconButton(onClick = { showReportDialog = true }) {
                            Icon(Icons.Default.Flag, contentDescription = "Report stream")
                        }
                    }
                }
            }

            LazyColumn(
                state = chatListState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                item { Spacer(Modifier.height(4.dp)) }
                chatBanner?.let { warn ->
                    item {
                        Text(warn, style = MaterialTheme.typography.labelSmall, color = ImLivePalette.WarningAmber)
                    }
                }
                items(messages.filterNot { it.isModerated }, key = { it.id }) { msg ->
                    Surface(
                        color = ImLivePalette.CardDark,
                        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { replyTarget = msg },
                    ) {
                        Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp)) {
                            msg.replyTo?.let { reply ->
                                Text(
                                    "↳ @${reply.username}: ${reply.message}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "${msg.username}: ",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                                Text(msg.message, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
                typingUser?.let { who ->
                    item {
                        Text("$who is typing…", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            Surface(color = ImLivePalette.SurfaceDark, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                    replyTarget?.let { target ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                "Replying to @${target.username}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                            )
                            IconButton(onClick = { replyTarget = null }, modifier = Modifier.size(22.dp)) {
                                Icon(Icons.Default.Close, contentDescription = "Cancel reply", modifier = Modifier.size(14.dp))
                            }
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = chatDraft,
                            onValueChange = {
                                chatDraft = it
                                chatClientRef?.sendTyping()
                            },
                            placeholder = {
                                Text(
                                    if (currentUser == null) "Sign in to chat live"
                                    else "Say something in live chat…",
                                )
                            },
                            enabled = currentUser != null,
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(
                            onClick = {
                                val text = chatDraft.trim()
                                if (text.isEmpty()) return@IconButton
                                val reply = replyTarget
                                if (reply != null) {
                                    scope.launch {
                                        container.liveRepository.sendRestChat(stream.id, text, reply.id).onSuccess { sent ->
                                            if (messages.none { it.id == sent.id }) messages = messages + sent
                                            chatDraft = ""
                                            replyTarget = null
                                        }
                                    }
                                } else if (chatClientRef?.send(text) == true) {
                                    chatDraft = ""
                                } else {
                                    scope.launch {
                                        container.liveRepository.sendRestChat(stream.id, text, null).onSuccess { sent ->
                                            if (messages.none { it.id == sent.id }) messages = messages + sent
                                            chatDraft = ""
                                        }
                                    }
                                }
                            },
                            enabled = currentUser != null && chatDraft.isNotBlank(),
                        ) {
                            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send chat", tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }

    if (showTipDialog && stream.ownerId != null) {
        var amountDollars by remember { mutableStateOf("5") }
        var tipMessage by remember { mutableStateOf("") }
        var tipFeedback by remember { mutableStateOf<String?>(null) }

        AlertDialog(
            onDismissRequest = { showTipDialog = false },
            title = { Text("Support ${stream.hostDisplay}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("2", "5", "10", "25").forEach { preset ->
                            FilterChip(
                                selected = amountDollars == preset,
                                onClick = { amountDollars = preset },
                                label = { Text("$$preset") },
                            )
                        }
                    }
                    OutlinedTextField(
                        value = tipMessage,
                        onValueChange = { tipMessage = it },
                        label = { Text("Cheer message (optional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (paymentConfig?.enabled == false) {
                        Text(
                            "Creator checkout is not configured on this server yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = ImLivePalette.WarningAmber,
                        )
                    }
                    tipFeedback?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val cents = ((amountDollars.toDoubleOrNull() ?: 5.0) * 100).toInt().coerceAtLeast(100)
                        scope.launch {
                            container.platformRepository.createTip(
                                streamerId = stream.ownerId!!,
                                amountCents = cents,
                                streamId = stream.id,
                                message = tipMessage.takeIf(String::isNotBlank),
                            ).fold(
                                onSuccess = { checkout ->
                                    showTipDialog = false
                                    val targetUrl = checkout.checkoutUrl ?: checkout.redirectUrl
                                    if (!targetUrl.isNullOrBlank()) {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)))
                                    }
                                },
                                onFailure = { tipFeedback = it.message ?: "Tip checkout unavailable" },
                            )
                        }
                    },
                ) { Text("Continue") }
            },
            dismissButton = { TextButton(onClick = { showTipDialog = false }) { Text("Close") } },
        )
    }

    if (showReportDialog) {
        var reason by remember { mutableStateOf("inappropriate_content") }
        var details by remember { mutableStateOf("") }
        var blockAlso by remember { mutableStateOf(false) }

        AlertDialog(
            onDismissRequest = { showReportDialog = false },
            title = { Text("Report or Block") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("spam", "harassment", "inappropriate_content").forEach { r ->
                            FilterChip(
                                selected = reason == r,
                                onClick = { reason = r },
                                label = { Text(r.replace('_', ' ')) },
                            )
                        }
                    }
                    OutlinedTextField(
                        value = details,
                        onValueChange = { details = it },
                        label = { Text("Additional context") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (stream.ownerId != null) {
                        FilterChip(
                            selected = blockAlso,
                            onClick = { blockAlso = !blockAlso },
                            label = { Text("Also block ${stream.hostDisplay}") },
                        )
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    scope.launch {
                        container.platformRepository.submitReport(
                            targetType = "stream",
                            targetId = stream.id,
                            reason = reason,
                            details = details,
                            streamId = stream.id,
                        )
                        if (blockAlso && stream.ownerId != null) {
                            container.platformRepository.blockUser(stream.ownerId!!)
                        }
                        showReportDialog = false
                        if (blockAlso) onBack()
                    }
                }) { Text("Submit") }
            },
            dismissButton = { TextButton(onClick = { showReportDialog = false }) { Text("Cancel") } },
        )
    }
}
