package com.imlive.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.imlive.app.model.Recording
import com.imlive.app.model.ScheduledBroadcast
import com.imlive.app.network.EndpointUrlRules
import com.imlive.app.ui.ImLiveContainer
import com.imlive.app.ui.components.BadgePill
import com.imlive.app.ui.components.KeepScreenAwakeEffect
import com.imlive.app.ui.components.RecordingFeedCard
import com.imlive.app.ui.components.SectionHeader
import com.imlive.app.ui.components.formatDurationClock
import com.imlive.app.ui.components.sharePlainText
import com.imlive.app.ui.theme.ImLivePalette
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.Instant
import java.time.temporal.ChronoUnit

@Composable
fun LibraryAndScheduleScreen(
    container: ImLiveContainer,
    initialRecording: Recording? = null,
    onGoLiveFromSchedule: (String) -> Unit,
    onRequireSignIn: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val apiBase by container.endpointStore.apiBaseUrlFlow.collectAsState()
    val currentUser by container.authRepository.currentUser.collectAsState()

    var section by remember { mutableStateOf("public_vods") } // public_vods | my_vods | schedule
    var publicRecordings by remember { mutableStateOf<List<Recording>>(emptyList()) }
    var myRecordings by remember { mutableStateOf<List<Recording>>(emptyList()) }
    var schedules by remember { mutableStateOf<List<ScheduledBroadcast>>(emptyList()) }
    var activeRecording by remember(initialRecording) { mutableStateOf(initialRecording) }
    var loading by remember { mutableStateOf(true) }
    var feedback by remember { mutableStateOf<String?>(null) }

    var showClipDialog by remember { mutableStateOf(false) }
    var editingRecording by remember { mutableStateOf<Recording?>(null) }
    var showScheduleDialog by remember { mutableStateOf(false) }
    var uploadingVideo by remember { mutableStateOf(false) }

    suspend fun reloadAll() {
        loading = true
        container.platformRepository.publicRecordings().onSuccess { publicRecordings = it }
        container.platformRepository.scheduledBroadcasts().onSuccess { schedules = it }
        if (currentUser != null) {
            container.platformRepository.myRecordings().onSuccess { myRecordings = it }
        }
        loading = false
    }

    LaunchedEffect(apiBase, currentUser?.id) {
        reloadAll()
    }

    // Native video picker -> uploads MP4/WebM directly to cloud VOD library
    val videoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            uploadingVideo = true
            feedback = "Uploading video to cloud VOD library…"
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val mime = context.contentResolver.getType(uri) ?: "video/mp4"
                    val ext = if (mime.contains("webm")) "webm" else "mp4"
                    val tempFile = File(context.cacheDir, "upload-${System.currentTimeMillis()}.$ext")
                    context.contentResolver.openInputStream(uri)?.use { input ->
                        tempFile.outputStream().use { output -> input.copyTo(output) }
                    } ?: error("Could not read selected video")
                    try {
                        container.platformRepository.uploadRecordingFile(
                            file = tempFile,
                            mimeType = mime,
                            title = "Mobile Upload",
                            visibility = "public",
                        ).getOrThrow()
                    } finally {
                        tempFile.delete()
                    }
                }
            }
            uploadingVideo = false
            result.fold(
                onSuccess = {
                    feedback = "Video uploaded to your VOD Library!"
                    reloadAll()
                },
                onFailure = { feedback = it.message ?: "Upload failed" },
            )
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
                Column(modifier = Modifier.weight(1f)) {
                    Text("VOD Library & Schedule", style = MaterialTheme.typography.headlineLarge)
                    Text(
                        "Native Media3 replays, 60s clips, uploads & upcoming streams.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (currentUser != null) {
                    IconButton(
                        enabled = !uploadingVideo,
                        onClick = { videoPicker.launch("video/*") },
                    ) {
                        if (uploadingVideo) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        else Icon(Icons.Default.UploadFile, contentDescription = "Upload video")
                    }
                }
            }
        }

        feedback?.let { msg ->
            item {
                Surface(
                    color = ImLivePalette.CardElevated,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(msg, modifier = Modifier.padding(10.dp), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        // In-App Native Media3 ExoPlayer Theater when a recording is selected
        activeRecording?.let { playing ->
            item {
                NativeVodPlayerCard(
                    recording = playing,
                    apiBaseUrl = apiBase,
                    canClip = currentUser != null,
                    onViewed = {
                        scope.launch { container.platformRepository.incrementRecordingView(playing.id) }
                    },
                    onOpenClipCreator = { showClipDialog = true },
                    onClose = { activeRecording = null },
                )
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = section == "public_vods",
                    onClick = { section = "public_vods" },
                    label = { Text("Replays (${publicRecordings.size})") },
                )
                FilterChip(
                    selected = section == "my_vods",
                    onClick = {
                        if (currentUser == null) onRequireSignIn() else section = "my_vods"
                    },
                    label = { Text("My VODs") },
                )
                FilterChip(
                    selected = section == "schedule",
                    onClick = { section = "schedule" },
                    label = { Text("Schedule (${schedules.size})") },
                )
            }
        }

        when (section) {
            "public_vods" -> {
                if (!loading && publicRecordings.isEmpty()) {
                    item {
                        Text(
                            "No public replays or clips published yet.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                items(publicRecordings, key = { "pub-${it.id}" }) { rec ->
                    RecordingFeedCard(
                        recording = rec,
                        apiBaseUrl = apiBase,
                        onClick = { activeRecording = rec },
                    )
                }
            }

            "my_vods" -> {
                item {
                    OutlinedButton(
                        enabled = !uploadingVideo,
                        onClick = { videoPicker.launch("video/*") },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.UploadFile, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Upload MP4 / WebM from Device")
                    }
                }
                if (myRecordings.isEmpty()) {
                    item {
                        Text(
                            "You have no saved recordings yet. Enable 'Record local MP4' in Broadcast Studio or upload a video above.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                items(myRecordings, key = { "mine-${it.id}" }) { rec ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        RecordingFeedCard(
                            recording = rec,
                            apiBaseUrl = apiBase,
                            onClick = { activeRecording = rec },
                        )
                        Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                            TextButton(onClick = { editingRecording = rec }) {
                                Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Edit / Privacy")
                            }
                            TextButton(onClick = {
                                scope.launch {
                                    container.platformRepository.deleteRecording(rec.id).onSuccess {
                                        if (activeRecording?.id == rec.id) activeRecording = null
                                        reloadAll()
                                    }
                                }
                            }) {
                                Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Delete", color = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }
            }

            "schedule" -> {
                item {
                    SectionHeader(
                        title = "Upcoming Broadcasts",
                        actionLabel = if (currentUser != null) "+ Schedule Stream" else "Sign in to Schedule",
                        onAction = { if (currentUser != null) showScheduleDialog = true else onRequireSignIn() },
                    )
                }
                if (schedules.isEmpty()) {
                    item {
                        Text(
                            "No upcoming broadcasts scheduled right now.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                items(schedules, key = { "sched-${it.id}" }) { item ->
                    val isMine = currentUser?.id == item.userId
                    Card(
                        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                BadgePill(item.scheduledFor.replace('T', ' ').take(16) + " UTC", MaterialTheme.colorScheme.primary)
                                Text("${item.reminderCount} reminders", style = MaterialTheme.typography.labelSmall)
                            }
                            Text(item.title, style = MaterialTheme.typography.titleMedium)
                            Text(
                                buildString {
                                    append(item.displayName ?: item.username ?: "Creator")
                                    item.category?.let { append(" · $it") }
                                },
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            item.description?.takeIf(String::isNotBlank)?.let {
                                Text(it, style = MaterialTheme.typography.bodyMedium)
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (isMine) {
                                    Button(onClick = {
                                        scope.launch {
                                            container.platformRepository.goLiveFromSchedule(item.id).onSuccess { streamId ->
                                                onGoLiveFromSchedule(streamId)
                                            }
                                        }
                                    }) {
                                        Icon(Icons.Default.Videocam, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text("Go Live Now")
                                    }
                                    OutlinedButton(onClick = {
                                        scope.launch {
                                            container.platformRepository.cancelSchedule(item.id).onSuccess { reloadAll() }
                                        }
                                    }) { Text("Cancel") }
                                } else {
                                    OutlinedButton(onClick = {
                                        if (currentUser == null) {
                                            onRequireSignIn()
                                        } else {
                                            scope.launch {
                                                container.platformRepository.toggleScheduleReminder(item.id, !item.reminded)
                                                    .onSuccess { reloadAll() }
                                            }
                                        }
                                    }) {
                                        Icon(Icons.Default.NotificationsActive, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(if (item.reminded) "Reminder On" else "Remind Me")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showClipDialog && activeRecording != null) {
        val target = activeRecording!!
        val maxSec = (target.durationSeconds ?: 60).coerceAtLeast(10).toFloat()
        var startSec by remember(target.id) { mutableFloatStateOf(0f) }
        var endSec by remember(target.id) { mutableFloatStateOf(minOf(30f, maxSec)) }
        var clipTitle by remember(target.id) { mutableStateOf("${target.title} — Highlight") }

        AlertDialog(
            onDismissRequest = { showClipDialog = false },
            title = { Text("Create Highlight Clip (max 60s)") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = clipTitle,
                        onValueChange = { clipTitle = it },
                        label = { Text("Clip title") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text("Start: ${formatDurationClock(startSec.toInt())}  ·  End: ${formatDurationClock(endSec.toInt())}")
                    Slider(
                        value = startSec,
                        onValueChange = {
                            startSec = it.coerceAtMost(endSec - 1f)
                            if (endSec - startSec > 60f) endSec = startSec + 60f
                        },
                        valueRange = 0f..(maxSec - 1f).coerceAtLeast(1f),
                    )
                    Slider(
                        value = endSec,
                        onValueChange = {
                            endSec = it.coerceIn(startSec + 1f, minOf(maxSec, startSec + 60f))
                        },
                        valueRange = 1f..maxSec,
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    scope.launch {
                        container.platformRepository.createClip(
                            recordingId = target.id,
                            title = clipTitle,
                            clipStartSeconds = startSec.toInt(),
                            clipEndSeconds = endSec.toInt().coerceAtLeast(startSec.toInt() + 1),
                        ).fold(
                            onSuccess = {
                                showClipDialog = false
                                feedback = "Highlight clip created!"
                                reloadAll()
                            },
                            onFailure = { feedback = it.message ?: "Could not create clip" },
                        )
                    }
                }) { Text("Save Clip") }
            },
            dismissButton = { TextButton(onClick = { showClipDialog = false }) { Text("Cancel") } },
        )
    }

    editingRecording?.let { rec ->
        var editTitle by remember(rec.id) { mutableStateOf(rec.title) }
        var editVisibility by remember(rec.id) { mutableStateOf(rec.visibility) }

        AlertDialog(
            onDismissRequest = { editingRecording = null },
            title = { Text("Edit Recording") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = editTitle,
                        onValueChange = { editTitle = it },
                        label = { Text("Title") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("public", "unlisted", "private").forEach { vis ->
                            FilterChip(
                                selected = editVisibility == vis,
                                onClick = { editVisibility = vis },
                                label = { Text(vis) },
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    scope.launch {
                        container.platformRepository.updateRecording(
                            recordingId = rec.id,
                            title = editTitle,
                            visibility = editVisibility,
                        ).onSuccess {
                            editingRecording = null
                            reloadAll()
                        }
                    }
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { editingRecording = null }) { Text("Cancel") } },
        )
    }

    if (showScheduleDialog) {
        var schedTitle by remember { mutableStateOf("") }
        var schedCategory by remember { mutableStateOf("Just Chatting") }
        var schedDesc by remember { mutableStateOf("") }
        var hoursAhead by remember { mutableStateOf("2") }

        AlertDialog(
            onDismissRequest = { showScheduleDialog = false },
            title = { Text("Schedule Upcoming Stream") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = schedTitle,
                        onValueChange = { schedTitle = it },
                        label = { Text("Broadcast title") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = schedCategory,
                        onValueChange = { schedCategory = it },
                        label = { Text("Category") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = schedDesc,
                        onValueChange = { schedDesc = it },
                        label = { Text("Description") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("1", "2", "6", "24").forEach { h ->
                            FilterChip(
                                selected = hoursAhead == h,
                                onClick = { hoursAhead = h },
                                label = { Text("In ${h}h") },
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    enabled = schedTitle.trim().length >= 3,
                    onClick = {
                        val hrs = hoursAhead.toLongOrNull()?.coerceIn(1L, 720L) ?: 2L
                        val iso = Instant.now().plus(hrs, ChronoUnit.HOURS).toString()
                        scope.launch {
                            container.platformRepository.createScheduledBroadcast(
                                title = schedTitle,
                                scheduledForIso = iso,
                                description = schedDesc,
                                category = schedCategory,
                            ).onSuccess {
                                showScheduleDialog = false
                                reloadAll()
                            }
                        }
                    },
                ) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Schedule")
                }
            },
            dismissButton = { TextButton(onClick = { showScheduleDialog = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun NativeVodPlayerCard(
    recording: Recording,
    apiBaseUrl: String,
    canClip: Boolean,
    onViewed: () -> Unit,
    onOpenClipCreator: () -> Unit,
    onClose: () -> Unit,
) {
    KeepScreenAwakeEffect(enabled = true)
    val context = LocalContext.current
    val resolvedUrl = remember(recording.fileUrl, apiBaseUrl) {
        EndpointUrlRules.resolveMediaUrl(apiBaseUrl, recording.fileUrl)
    }

    val exoPlayer = remember(resolvedUrl) {
        ExoPlayer.Builder(context).build().apply {
            if (!resolvedUrl.isNullOrBlank()) {
                setMediaItem(MediaItem.fromUri(resolvedUrl))
                prepare()
                playWhenReady = true
            }
        }
    }

    LaunchedEffect(recording.id) {
        onViewed()
    }

    DisposableEffect(exoPlayer) {
        onDispose { exoPlayer.release() }
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column {
            Box(modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black)) {
                if (!resolvedUrl.isNullOrBlank()) {
                    AndroidView(
                        factory = { ctx ->
                            PlayerView(ctx).apply {
                                player = exoPlayer
                                useController = true
                            }
                        },
                        update = { view -> view.player = exoPlayer },
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("Media file URL unavailable", color = Color.White)
                    }
                }
                Surface(
                    color = Color.Black.copy(alpha = 0.6f),
                    shape = RoundedCornerShape(50),
                    modifier = Modifier.align(Alignment.TopEnd).padding(8.dp),
                ) {
                    IconButton(onClick = onClose, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Close player", tint = Color.White, modifier = Modifier.size(18.dp))
                    }
                }
            }

            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(recording.title, style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (canClip && !recording.isClip) {
                        OutlinedButton(onClick = onOpenClipCreator) {
                            Icon(Icons.Default.ContentCut, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Create 60s Clip")
                        }
                    }
                    OutlinedButton(onClick = {
                        val root = EndpointUrlRules.toOriginRootUrl(apiBaseUrl)
                        sharePlainText(
                            context,
                            recording.title,
                            "${recording.title}\nApp: imlive://library\nWeb: ${resolvedUrl ?: "$root/library"}",
                        )
                    }) {
                        Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Share")
                    }
                    if (!resolvedUrl.isNullOrBlank()) {
                        IconButton(onClick = {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(resolvedUrl)))
                        }) {
                            Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = "Open external")
                        }
                    }
                }
            }
        }
    }
}
