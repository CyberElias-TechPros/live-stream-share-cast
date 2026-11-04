package com.imlive.app.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Cameraswitch
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.imlive.app.media.BroadcastTransportKind
import com.imlive.app.model.CategoryItem
import com.imlive.app.model.VideoQualityPreset
import com.imlive.app.network.EndpointUrlRules
import com.imlive.app.ui.ImLiveContainer
import com.imlive.app.ui.components.BadgePill
import com.imlive.app.ui.components.KeepScreenAwakeEffect
import com.imlive.app.ui.components.LivePulseBadge
import com.imlive.app.ui.components.SectionHeader
import com.imlive.app.ui.components.WebRtcVideoSurface
import com.imlive.app.ui.components.formatDurationClock
import com.imlive.app.ui.components.sharePlainText
import com.imlive.app.ui.theme.ImLivePalette
import kotlinx.coroutines.launch

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BroadcastScreen(
    container: ImLiveContainer,
    initialLanOnly: Boolean = false,
    preparedStreamId: String? = null,
    onRequireSignIn: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val studio by container.broadcastManager.state.collectAsState()
    val prefs by container.preferences.settings.collectAsState()
    val apiBase by container.endpointStore.apiBaseUrlFlow.collectAsState()
    val currentUser by container.authRepository.currentUser.collectAsState()

    KeepScreenAwakeEffect(enabled = studio.isLive && prefs.keepScreenAwake)

    var title by remember { mutableStateOf("Live from Android") }
    var description by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("Just Chatting") }
    var tagsRaw by remember { mutableStateOf("mobile, live") }
    var isMature by remember { mutableStateOf(false) }
    var autoRecord by remember { mutableStateOf(prefs.autoRecordBroadcasts) }
    var selectedQuality by remember {
        mutableStateOf(
            if (prefs.defaultVideoQuality == VideoQualityPreset.AUTO) VideoQualityPreset.HD_720P
            else prefs.defaultVideoQuality,
        )
    }
    var selectedTransport by remember(initialLanOnly, currentUser) {
        mutableStateOf(
            if (initialLanOnly || currentUser == null) BroadcastTransportKind.OFFLINE_LAN
            else BroadcastTransportKind.INTERNET,
        )
    }
    var categories by remember { mutableStateOf<List<CategoryItem>>(emptyList()) }
    var hostChatDraft by remember { mutableStateOf("") }
    var permissionsGranted by remember { mutableStateOf(container.broadcastManager.hasMediaPermissions()) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        permissionsGranted = container.broadcastManager.hasMediaPermissions()
    }

    LaunchedEffect(Unit) {
        container.liveRepository.categories().onSuccess { categories = it }
    }

    LaunchedEffect(preparedStreamId) {
        if (!preparedStreamId.isNullOrBlank()) {
            container.liveRepository.stream(preparedStreamId).onSuccess { existing ->
                title = existing.title
                description = existing.description ?: ""
                category = existing.category ?: category
                selectedTransport = BroadcastTransportKind.INTERNET
            }
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("Broadcast Studio", style = MaterialTheme.typography.headlineLarge)
                    Text(
                        studio.statusText,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (studio.isLive) {
                    LivePulseBadge("ON AIR · ${formatDurationClock(studio.elapsedSeconds)}")
                }
            }
        }

        // Camera Viewfinder / Live Studio Monitor
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color.Black),
                border = BorderStroke(1.dp, if (studio.isLive) ImLivePalette.LiveRose else ImLivePalette.BorderSubtle),
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Box(modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f)) {
                    if (studio.previewTrack != null && studio.videoEnabled) {
                        WebRtcVideoSurface(
                            videoTrack = studio.previewTrack,
                            mirror = studio.isFrontCamera,
                            fillCrop = true,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        Column(
                            modifier = Modifier.fillMaxSize().padding(20.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(
                                if (studio.isLive && !studio.videoEnabled) Icons.Default.VideocamOff else Icons.Default.Videocam,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(44.dp),
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                if (studio.isLive && !studio.videoEnabled) "Camera video paused (audio still live)"
                                else "Camera preview starts when you go live",
                                style = MaterialTheme.typography.titleMedium,
                                color = Color.White,
                            )
                        }
                    }

                    if (studio.isLive) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                BadgePill("${studio.viewerCount} watching (peak ${studio.peakViewers})", ImLivePalette.OnlineEmerald)
                                if (studio.outboundKbps > 0) {
                                    BadgePill("${studio.outboundKbps} kbps", MaterialTheme.colorScheme.primary)
                                }
                                if (studio.isRecordingLocal) {
                                    BadgePill("REC MP4", ImLivePalette.LiveRose)
                                }
                            }
                        }
                    }
                }
            }
        }

        studio.errorText?.let { err ->
            item {
                Surface(
                    color = MaterialTheme.colorScheme.error.copy(alpha = 0.14f),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(err, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(12.dp))
                }
            }
        }

        // Post-stream Local MP4 Replay Card
        studio.lastCompletedRecording?.let { rec ->
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                    border = BorderStroke(1.dp, ImLivePalette.OnlineEmerald.copy(alpha = 0.6f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Local MP4 Replay Captured", style = MaterialTheme.typography.titleMedium, color = ImLivePalette.OnlineEmerald)
                        Text(
                            "Duration: ${formatDurationClock(rec.durationSeconds)} · Size: ${(rec.sizeBytes / 1024).coerceAtLeast(1)} KB",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        if (currentUser != null && studio.lastUploadedRecordingId == null) {
                            Button(
                                enabled = !studio.isUploadingRecording,
                                onClick = { container.broadcastManager.publishLastRecordingToCloud("public", "$title — Replay") },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                if (studio.isUploadingRecording) {
                                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                                } else {
                                    Icon(Icons.Default.CloudUpload, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(8.dp))
                                    Text("Publish Replay to Cloud VOD Library")
                                }
                            }
                        } else if (studio.lastUploadedRecordingId != null) {
                            Text("Published to VOD Library!", color = ImLivePalette.OnlineEmerald, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }
        }

        if (studio.isLive) {
            // Live Control Deck
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                    border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        studio.lanRoom?.let { lan ->
                            Surface(
                                color = ImLivePalette.OnlineEmerald.copy(alpha = 0.14f),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text("Offline Wi-Fi LAN Room Ready", style = MaterialTheme.typography.titleMedium, color = ImLivePalette.OnlineEmerald)
                                    Text("Host IP: ${lan.hostAddress}  ·  Port: ${lan.port}", style = MaterialTheme.typography.bodyLarge)
                                    Text("6-Digit Room Code: ${lan.roomCode}", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            OutlinedButton(onClick = { container.broadcastManager.toggleAudio() }, modifier = Modifier.weight(1f)) {
                                Icon(if (studio.audioEnabled) Icons.Default.Mic else Icons.Default.MicOff, contentDescription = null)
                                Spacer(Modifier.width(4.dp))
                                Text(if (studio.audioEnabled) "Mute" else "Unmute")
                            }
                            OutlinedButton(onClick = { container.broadcastManager.toggleVideo() }, modifier = Modifier.weight(1f)) {
                                Icon(if (studio.videoEnabled) Icons.Default.Videocam else Icons.Default.VideocamOff, contentDescription = null)
                                Spacer(Modifier.width(4.dp))
                                Text(if (studio.videoEnabled) "Hide Cam" else "Show Cam")
                            }
                            OutlinedButton(onClick = { container.broadcastManager.switchCamera() }, modifier = Modifier.weight(1f)) {
                                Icon(Icons.Default.Cameraswitch, contentDescription = null)
                                Spacer(Modifier.width(4.dp))
                                Text("Flip")
                            }
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            OutlinedButton(
                                onClick = {
                                    if (studio.isRecordingLocal) {
                                        scope.launch { container.broadcastManager.stopLocalRecording() }
                                    } else {
                                        container.broadcastManager.startLocalRecording()
                                    }
                                },
                                modifier = Modifier.weight(1f),
                            ) {
                                Icon(
                                    if (studio.isRecordingLocal) Icons.Default.Stop else Icons.Default.FiberManualRecord,
                                    contentDescription = null,
                                    tint = ImLivePalette.LiveRose,
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(if (studio.isRecordingLocal) "Stop MP4 Rec" else "Record MP4")
                            }

                            OutlinedButton(
                                onClick = {
                                    val lan = studio.lanRoom
                                    val active = studio.activeStream
                                    if (lan != null) {
                                        sharePlainText(
                                            context,
                                            "Join my Offline LAN Broadcast",
                                            "Join ${lan.title} on the same Wi-Fi!\nHost: ${lan.hostAddress}\nPort: ${lan.port}\nCode: ${lan.roomCode}\nDeep link: ${lan.toDeepLinkUri()}",
                                        )
                                    } else if (active != null) {
                                        val root = EndpointUrlRules.toOriginRootUrl(apiBase)
                                        sharePlainText(
                                            context,
                                            "Watch ${active.title} live!",
                                            "I'm live on I'm Live!\nApp: imlive://watch/${active.id}\nWeb: $root/watch/${active.id}",
                                        )
                                    }
                                },
                                modifier = Modifier.weight(1f),
                            ) {
                                Icon(Icons.Default.Share, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text("Share Link")
                            }
                        }

                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf(VideoQualityPreset.FHD_1080P, VideoQualityPreset.HD_720P, VideoQualityPreset.SD_480P, VideoQualityPreset.SAVER_360P).forEach { preset ->
                                FilterChip(
                                    selected = studio.qualityPreset == preset,
                                    onClick = { container.broadcastManager.updateQualityPreset(preset) },
                                    label = { Text(preset.label.substringBefore(" ")) },
                                )
                            }
                        }

                        Button(
                            onClick = { scope.launch { container.broadcastManager.stopBroadcast() } },
                            colors = ButtonDefaults.buttonColors(containerColor = ImLivePalette.LiveRose, contentColor = Color.White),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Default.Stop, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text("End Live Broadcast")
                        }
                    }
                }
            }

            // Live Studio Chat & One-Tap Moderation
            item { SectionHeader("Studio Live Chat (${studio.chatMessages.size})") }
            items(studio.chatMessages.takeLast(30), key = { "host-chat-${it.id}" }) { msg ->
                Surface(
                    color = ImLivePalette.CardDark,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "${msg.username}: ${if (msg.isModerated) "[Hidden by host]" else msg.message}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (msg.isModerated) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                            )
                        }
                        if (studio.activeStream != null) {
                            IconButton(
                                onClick = { container.broadcastManager.moderateMessage(msg.id, !msg.isModerated) },
                                modifier = Modifier.size(28.dp),
                            ) {
                                Icon(Icons.Default.VisibilityOff, contentDescription = "Moderate message", modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = hostChatDraft,
                        onValueChange = { hostChatDraft = it },
                        placeholder = { Text("Message your viewers…") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(
                        onClick = {
                            val who = currentUser?.username ?: "Host"
                            if (container.broadcastManager.sendHostChat(who, hostChatDraft)) {
                                hostChatDraft = ""
                            }
                        },
                        enabled = hostChatDraft.isNotBlank(),
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                    }
                }
            }
        } else {
            // Pre-Live Setup Form
            if (!permissionsGranted) {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                        border = BorderStroke(1.dp, ImLivePalette.WarningAmber),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Camera & Microphone Access Needed", style = MaterialTheme.typography.titleMedium, color = ImLivePalette.WarningAmber)
                            Text("Grant native camera and microphone access so Android hardware encoders can capture your stream.")
                            Button(
                                onClick = {
                                    val perms = buildList {
                                        add(Manifest.permission.CAMERA)
                                        add(Manifest.permission.RECORD_AUDIO)
                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                            add(Manifest.permission.POST_NOTIFICATIONS)
                                        }
                                    }.toTypedArray()
                                    permissionLauncher.launch(perms)
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("Grant Camera & Microphone") }
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
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("1. Choose Transport Mode", style = MaterialTheme.typography.titleMedium)
                        BroadcastTransportKind.entries.forEach { kind ->
                            val selected = selectedTransport == kind
                            Surface(
                                color = if (selected) MaterialTheme.colorScheme.primaryContainer else ImLivePalette.SurfaceDark,
                                border = BorderStroke(1.dp, if (selected) MaterialTheme.colorScheme.primary else ImLivePalette.BorderSubtle),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { selectedTransport = kind },
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(kind.label, style = MaterialTheme.typography.titleMedium)
                                    Text(kind.subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }

                        if (selectedTransport != BroadcastTransportKind.OFFLINE_LAN && currentUser == null) {
                            Surface(
                                color = ImLivePalette.WarningAmber.copy(alpha = 0.14f),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Text("Cloud broadcasts require an account.", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                                    OutlinedButton(onClick = onRequireSignIn) { Text("Sign in") }
                                }
                            }
                        }

                        Text("2. Stream Details", style = MaterialTheme.typography.titleMedium)
                        OutlinedTextField(
                            value = title,
                            onValueChange = { title = it },
                            label = { Text("Stream title") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        if (selectedTransport != BroadcastTransportKind.OFFLINE_LAN) {
                            OutlinedTextField(
                                value = description,
                                onValueChange = { description = it },
                                label = { Text("Description (optional)") },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            if (categories.isNotEmpty()) {
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    categories.take(8).forEach { cat ->
                                        FilterChip(
                                            selected = category == cat.name,
                                            onClick = { category = cat.name },
                                            label = { Text(cat.name) },
                                        )
                                    }
                                }
                            }
                            OutlinedTextField(
                                value = tagsRaw,
                                onValueChange = { tagsRaw = it },
                                label = { Text("Tags (comma separated)") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }

                        Text("3. Video Capture & Local MP4 Replay", style = MaterialTheme.typography.titleMedium)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf(VideoQualityPreset.FHD_1080P, VideoQualityPreset.HD_720P, VideoQualityPreset.SD_480P, VideoQualityPreset.SAVER_360P).forEach { preset ->
                                FilterChip(
                                    selected = selectedQuality == preset,
                                    onClick = { selectedQuality = preset },
                                    label = { Text(preset.label) },
                                )
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Record local H.264 MP4 replay", style = MaterialTheme.typography.titleMedium)
                                Text("Publish to VOD Library right after ending", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Switch(checked = autoRecord, onCheckedChange = { autoRecord = it })
                        }

                        if (selectedTransport != BroadcastTransportKind.OFFLINE_LAN) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("18+ Mature content label", style = MaterialTheme.typography.bodyLarge)
                                Switch(checked = isMature, onCheckedChange = { isMature = it })
                            }
                        }

                        Button(
                            enabled = !studio.isBusy && permissionsGranted &&
                                (selectedTransport == BroadcastTransportKind.OFFLINE_LAN || currentUser != null),
                            onClick = {
                                val parsedTags = tagsRaw.split(',').map { it.trim() }.filter { it.isNotBlank() }.take(5)
                                container.broadcastManager.startBroadcast(
                                    title = title,
                                    description = description,
                                    category = category,
                                    tags = parsedTags,
                                    isMature = isMature,
                                    transport = selectedTransport,
                                    qualityPreset = selectedQuality,
                                    autoRecord = autoRecord,
                                    existingStreamId = preparedStreamId,
                                )
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (studio.isBusy) {
                                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Default.Videocam, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    if (selectedTransport == BroadcastTransportKind.OFFLINE_LAN) "Start Offline Wi-Fi LAN Broadcast"
                                    else "Go Live Now",
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
