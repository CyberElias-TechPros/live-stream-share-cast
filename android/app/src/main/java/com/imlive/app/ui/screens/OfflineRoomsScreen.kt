package com.imlive.app.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Router
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.WifiFind
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.imlive.app.media.LanRoomBrowser
import com.imlive.app.media.LanRoomInfo
import com.imlive.app.media.LanSignalClient
import com.imlive.app.media.LanSignallingContract
import com.imlive.app.media.OfflineSdpProtocol
import com.imlive.app.media.WebRtcBroadcasterSession
import com.imlive.app.media.WebRtcViewerSession
import com.imlive.app.model.ChatMessage
import com.imlive.app.ui.ImLiveContainer
import com.imlive.app.ui.components.KeepScreenAwakeEffect
import com.imlive.app.ui.components.LivePulseBadge
import com.imlive.app.ui.components.SectionHeader
import com.imlive.app.ui.components.WebRtcVideoSurface
import com.imlive.app.ui.components.sharePlainText
import com.imlive.app.ui.theme.ImLivePalette
import kotlinx.coroutines.launch
import org.webrtc.VideoTrack
import java.util.UUID

@Composable
fun OfflineRoomsScreen(
    container: ImLiveContainer,
    initialLanRoom: LanRoomInfo? = null,
    onBack: () -> Unit,
    onStartHostingLan: () -> Unit,
) {
    BackHandler(onBack = onBack)

    var activeLanRoom by remember(initialLanRoom) { mutableStateOf(initialLanRoom) }
    var tab by remember { mutableStateOf(0) } // 0 = Wi-Fi LAN Discovery/TCP, 1 = Offline SDP Bundle

    if (activeLanRoom != null) {
        LanWatchTheater(
            container = container,
            room = activeLanRoom!!,
            onLeave = { activeLanRoom = null },
        )
        return
    }

    val context = LocalContext.current
    val browser = remember { LanRoomBrowser(context) }
    val discoveredHosts by browser.hosts.collectAsState()

    DisposableEffect(Unit) {
        browser.start()
        onDispose { browser.stop() }
    }

    var hostIp by remember { mutableStateOf("") }
    var portText by remember { mutableStateOf("") }
    var pinCode by remember { mutableStateOf("") }
    var joinError by remember { mutableStateOf<String?>(null) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
                Column {
                    Text("Offline Wi-Fi & Hotspot Rooms", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        "Stream directly over local Wi-Fi or phone hotspot with zero internet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = tab == 0,
                    onClick = { tab = 0 },
                    label = { Text("Wi-Fi LAN Discovery (TCP)") },
                )
                FilterChip(
                    selected = tab == 1,
                    onClick = { tab = 1 },
                    label = { Text("Browser / SDP Bundle") },
                )
            }
        }

        if (tab == 0) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                    border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.WifiFind, contentDescription = null, tint = ImLivePalette.OnlineEmerald)
                            Spacer(Modifier.width(8.dp))
                            Text("Nearby Android LAN Broadcasters (${discoveredHosts.size})", style = MaterialTheme.typography.titleMedium)
                        }
                        if (discoveredHosts.isEmpty()) {
                            Text(
                                "Scanning local Wi-Fi (`_imlive._tcp.`)… Start an Offline LAN Broadcast on another Android phone on the same Wi-Fi/Hotspot to see it appear automatically.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        } else {
                            discoveredHosts.forEach { found ->
                                Surface(
                                    color = ImLivePalette.CardElevated,
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            hostIp = found.hostAddress
                                            portText = found.port.toString()
                                        },
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Column {
                                            Text(found.title, style = MaterialTheme.typography.titleMedium)
                                            Text("${found.hostAddress}:${found.port} · Tap to fill IP & port", style = MaterialTheme.typography.labelSmall, color = ImLivePalette.OnlineEmerald)
                                        }
                                        Icon(Icons.Default.Router, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                    border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Join LAN Broadcast", style = MaterialTheme.typography.titleMedium)
                        OutlinedTextField(
                            value = hostIp,
                            onValueChange = { hostIp = it },
                            label = { Text("Broadcaster IPv4 (e.g. 192.168.43.1)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = portText,
                                onValueChange = { portText = it.filter(Char::isDigit) },
                                label = { Text("TCP Port") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedTextField(
                                value = pinCode,
                                onValueChange = { pinCode = it.trim() },
                                label = { Text("6-Digit Code") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        joinError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }

                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Button(
                                onClick = {
                                    val port = portText.toIntOrNull()
                                    if (hostIp.isBlank() || port == null || port !in 1..65535 || pinCode.length < 4) {
                                        joinError = "Enter a valid IPv4 address, port, and room code."
                                    } else {
                                        joinError = null
                                        activeLanRoom = LanRoomInfo(hostIp.trim(), port, pinCode)
                                    }
                                },
                                modifier = Modifier.weight(1f),
                            ) { Text("Connect Live") }
                            OutlinedButton(onClick = onStartHostingLan, modifier = Modifier.weight(1f)) {
                                Text("Host LAN Room")
                            }
                        }
                    }
                }
            }
        } else {
            item {
                OfflineSdpBundleCard(container = container)
            }
        }
    }
}

@Composable
private fun LanWatchTheater(
    container: ImLiveContainer,
    room: LanRoomInfo,
    onLeave: () -> Unit,
) {
    BackHandler(onBack = onLeave)
    KeepScreenAwakeEffect(enabled = true)

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val currentUser by container.authRepository.currentUser.collectAsState()

    var videoTrack by remember { mutableStateOf<VideoTrack?>(null) }
    var status by remember { mutableStateOf("Connecting to ${room.hostAddress}:${room.port}…") }
    var chatMessages by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var chatDraft by remember { mutableStateOf("") }
    var lanClientRef by remember { mutableStateOf<LanSignalClient?>(null) }

    DisposableEffect(room) {
        val peerId = "lan-viewer-${UUID.randomUUID().toString().take(8)}"
        var client: LanSignalClient? = null
        val rtc = WebRtcViewerSession(
            context = context,
            iceServers = emptyList(),
            sendSignal = { frame -> client?.send(frame) },
            onVideo = { track -> scope.launch { videoTrack = track } },
            onAudio = {},
            onState = { st -> scope.launch { status = "LAN P2P: ${st.name.lowercase()}" } },
        )
        client = LanSignalClient(
            room = room,
            peerId = peerId,
            onFrame = { frame ->
                when (frame.optString("type")) {
                    "welcome" -> {
                        val hostId = frame.optString("id").ifBlank { "lan-host" }
                        rtc.onHostReady(hostId)
                    }
                    "streamer-ready" -> {
                        val hostId = frame.optString("from").ifBlank { "lan-host" }
                        rtc.onHostReady(hostId)
                    }
                    LanSignallingContract.LAN_CHAT_TYPE -> {
                        val msg = ChatMessage(
                            id = frame.optString("id", UUID.randomUUID().toString()),
                            username = frame.optString("username", "LAN Peer"),
                            message = frame.optString("message"),
                        )
                        scope.launch {
                            if (chatMessages.none { it.id == msg.id }) {
                                chatMessages = (chatMessages + msg).takeLast(100)
                            }
                        }
                    }
                    "close" -> scope.launch { status = "LAN broadcaster ended the session" }
                    "error" -> scope.launch { status = frame.optString("error", "LAN room rejected connection") }
                    else -> rtc.accept(frame)
                }
            },
            onError = { err -> scope.launch { status = err } },
        )
        lanClientRef = client
        client.connect()

        onDispose {
            lanClientRef = null
            client.close()
            rtc.close()
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(ImLivePalette.Obsidian)) {
        Box(modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black)) {
            if (videoTrack != null) {
                WebRtcVideoSurface(videoTrack = videoTrack, modifier = Modifier.fillMaxSize())
            } else {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(status, color = Color.White, style = MaterialTheme.typography.titleMedium)
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Surface(color = Color.Black.copy(alpha = 0.55f), shape = RoundedCornerShape(50)) {
                    IconButton(onClick = onLeave) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Leave LAN room", tint = Color.White)
                    }
                }
                LivePulseBadge("OFFLINE LAN · ${room.hostAddress}")
            }
        }

        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item { SectionHeader("Local Wi-Fi Chat") }
            items(chatMessages, key = { it.id }) { msg ->
                Surface(color = ImLivePalette.CardDark, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Text(
                        "${msg.username}: ${msg.message}",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(10.dp),
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                value = chatDraft,
                onValueChange = { chatDraft = it },
                placeholder = { Text("Send zero-internet LAN message…") },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            IconButton(
                onClick = {
                    val sender = currentUser?.username ?: "AndroidViewer"
                    if (lanClientRef?.sendChat(sender, chatDraft) == true) {
                        chatDraft = ""
                    }
                },
                enabled = chatDraft.isNotBlank(),
            ) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
            }
        }
    }
}

@Composable
private fun OfflineSdpBundleCard(container: ImLiveContainer) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val clipboard = remember { context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager }

    var role by remember { mutableStateOf("viewer") } // viewer | host
    var roomCode by remember { mutableStateOf(OfflineSdpProtocol.createRoomCode()) }
    var localBundleJson by remember { mutableStateOf("") }
    var remoteBundleInput by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("Compatible with the browser `/offline` room (imlive-offline-webrtc v1).") }
    var previewOrRemoteTrack by remember { mutableStateOf<VideoTrack?>(null) }

    var viewerRef by remember { mutableStateOf<WebRtcViewerSession?>(null) }
    var hostRef by remember { mutableStateOf<WebRtcBroadcasterSession?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            viewerRef?.close()
            hostRef?.close()
        }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Cross-Platform Offline SDP Room", style = MaterialTheme.typography.titleLarge)
            Text(status, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = role == "viewer",
                    onClick = {
                        role = "viewer"
                        hostRef?.close(); hostRef = null
                        previewOrRemoteTrack = null
                        localBundleJson = ""
                    },
                    label = { Text("Viewer (Paste Offer)") },
                )
                FilterChip(
                    selected = role == "host",
                    onClick = {
                        role = "host"
                        viewerRef?.close(); viewerRef = null
                        previewOrRemoteTrack = null
                        localBundleJson = ""
                    },
                    label = { Text("Broadcaster (Create Offer)") },
                )
            }

            if (previewOrRemoteTrack != null) {
                Box(modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black)) {
                    WebRtcVideoSurface(
                        videoTrack = previewOrRemoteTrack,
                        mirror = role == "host",
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }

            if (role == "host") {
                OutlinedTextField(
                    value = roomCode,
                    onValueChange = { roomCode = OfflineSdpProtocol.normalizeRoomCode(it) },
                    label = { Text("Room Code (4–12 letters/numbers)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = {
                        if (!container.broadcastManager.hasMediaPermissions()) {
                            status = "Grant camera & microphone permissions in Broadcast Studio first."
                            return@Button
                        }
                        scope.launch {
                            runCatching {
                                hostRef?.close()
                                val session = WebRtcBroadcasterSession(
                                    context = context,
                                    iceServers = emptyList(),
                                    sendSignal = {},
                                    onPreviewVideo = { previewOrRemoteTrack = it },
                                    onState = { status = it },
                                )
                                hostRef = session
                                session.startCapture()
                                status = "Gathering local LAN candidates…"
                                val bundle = session.createOfflineBundleOffer(roomCode)
                                localBundleJson = OfflineSdpProtocol.encode(bundle)
                                status = "Offer ready! Copy/share with the viewer, then paste their Answer below."
                            }.onFailure { status = it.message ?: "Could not create offline offer" }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("1. Start Camera & Generate Offer Bundle") }

                if (localBundleJson.isNotBlank()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = {
                                clipboard.setPrimaryClip(ClipData.newPlainText("imlive-offer", localBundleJson))
                                status = "Copied Offer bundle to clipboard!"
                            },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Copy Offer")
                        }
                        OutlinedButton(
                            onClick = { sharePlainText(context, "I'm Live Offline Offer ($roomCode)", localBundleJson) },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Share Offer")
                        }
                    }
                }

                OutlinedTextField(
                    value = remoteBundleInput,
                    onValueChange = { remoteBundleInput = it },
                    label = { Text("2. Paste Viewer Answer Bundle JSON") },
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    enabled = remoteBundleInput.isNotBlank() && hostRef != null,
                    onClick = {
                        scope.launch {
                            runCatching {
                                val parsed = OfflineSdpProtocol.decode(remoteBundleInput)
                                hostRef?.acceptOfflineBundleAnswer(parsed, roomCode)
                                status = "Answer accepted — connecting direct P2P media!"
                            }.onFailure { status = it.message ?: "Invalid answer bundle" }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Complete Offline Handshake") }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = remoteBundleInput,
                        onValueChange = { remoteBundleInput = it },
                        label = { Text("1. Paste Broadcaster Offer Bundle JSON") },
                        maxLines = 4,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = {
                        val pasted = clipboard.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString().orEmpty()
                        if (pasted.isNotBlank()) remoteBundleInput = pasted
                    }) {
                        Icon(Icons.Default.ContentPaste, contentDescription = "Paste")
                    }
                }
                Button(
                    enabled = remoteBundleInput.isNotBlank(),
                    onClick = {
                        scope.launch {
                            runCatching {
                                val offer = OfflineSdpProtocol.decode(remoteBundleInput)
                                viewerRef?.close()
                                val viewer = WebRtcViewerSession(
                                    context = context,
                                    iceServers = emptyList(),
                                    sendSignal = {},
                                    onVideo = { previewOrRemoteTrack = it },
                                    onAudio = {},
                                    onState = { status = "Offline P2P: ${it.name.lowercase()}" },
                                )
                                viewerRef = viewer
                                status = "Gathering local viewer answer…"
                                val answer = viewer.acceptOfflineOfferAndCreateAnswer(offer)
                                localBundleJson = OfflineSdpProtocol.encode(answer)
                                status = "Answer ready (${answer.roomCode})! Send it back to the broadcaster."
                            }.onFailure { status = it.message ?: "Invalid offer bundle" }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("2. Generate Viewer Answer Bundle") }

                if (localBundleJson.isNotBlank()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                clipboard.setPrimaryClip(ClipData.newPlainText("imlive-answer", localBundleJson))
                                status = "Copied Answer bundle to clipboard!"
                            },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Copy Answer")
                        }
                        OutlinedButton(
                            onClick = { sharePlainText(context, "I'm Live Offline Answer", localBundleJson) },
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Share Answer")
                        }
                    }
                }
            }
        }
    }
}
