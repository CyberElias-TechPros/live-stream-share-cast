package com.imlive.app

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.imlive.app.auth.AuthRepository
import com.imlive.app.live.ChatClient
import com.imlive.app.live.ChatConnectionState
import com.imlive.app.live.ChatMessage
import com.imlive.app.live.IceServerConfig
import com.imlive.app.live.LiveRepository
import com.imlive.app.live.LiveStream
import com.imlive.app.live.Recording
import com.imlive.app.media.BroadcastService
import com.imlive.app.media.LanRoomInfo
import com.imlive.app.media.LanSignalClient
import com.imlive.app.media.LanSignalServer
import com.imlive.app.media.SignallingClient
import com.imlive.app.media.WebRtcBroadcasterSession
import com.imlive.app.media.WebRtcViewerSession
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.EglBase
import org.webrtc.PeerConnection
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack
import java.util.UUID

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val watchId = intent?.data?.pathSegments?.let { segments ->
            if (segments.size >= 2 && segments.firstOrNull() == "watch") segments[1] else null
        }
        setContent { ImLiveApp(initialWatchStreamId = watchId) }
    }
}

private enum class Screen { HOME, LOGIN, WATCH, LAN_JOIN, LAN_WATCH, BROADCAST, LIBRARY, SETTINGS }

@Composable
private fun ImLiveApp(initialWatchStreamId: String? = null) {
    val context = LocalContext.current
    val api = remember { com.imlive.app.network.ApiClient(context) }
    val auth = remember { AuthRepository(context) }
    val repository = remember { LiveRepository(api) }
    var screen by remember { mutableStateOf(if (auth.loggedIn()) Screen.HOME else Screen.LOGIN) }
    var selectedStream by remember { mutableStateOf<LiveStream?>(null) }
    var selectedLanRoom by remember { mutableStateOf<LanRoomInfo?>(null) }
    var broadcastBackToLogin by remember { mutableStateOf(false) }

    LaunchedEffect(initialWatchStreamId, auth.loggedIn()) {
        if (!initialWatchStreamId.isNullOrBlank() && auth.loggedIn()) {
            repository.stream(initialWatchStreamId).onSuccess {
                selectedStream = it
                screen = Screen.WATCH
            }
        }
    }

    MaterialTheme(
        colorScheme = MaterialTheme.colorScheme.copy(
            background = Color(0xFF08070C),
            surface = Color(0xFF15121F),
            primary = Color(0xFFA78BFA),
        ),
    ) {
        Surface(modifier = Modifier.fillMaxSize()) {
            when (screen) {
                Screen.LOGIN -> LoginScreen(
                    repository = auth,
                    onAuthenticated = { screen = Screen.HOME },
                    onJoinLan = { screen = Screen.LAN_JOIN },
                    onStartLan = { broadcastBackToLogin = true; screen = Screen.BROADCAST },
                )
                Screen.HOME -> HomeScreen(
                    repository = repository,
                    onWatch = { selectedStream = it; screen = Screen.WATCH },
                    onBroadcast = { broadcastBackToLogin = false; screen = Screen.BROADCAST },
                    onJoinLan = { screen = Screen.LAN_JOIN },
                    onLibrary = { screen = Screen.LIBRARY },
                    onSettings = { screen = Screen.SETTINGS },
                    onLogout = { auth.logout(); screen = Screen.LOGIN },
                )
                Screen.WATCH -> WatchScreen(
                    repository = repository,
                    stream = selectedStream,
                    onBack = { screen = Screen.HOME },
                )
                Screen.LAN_JOIN -> LanJoinScreen(
                    onBack = { screen = if (auth.loggedIn()) Screen.HOME else Screen.LOGIN },
                    onJoin = { room -> selectedLanRoom = room; screen = Screen.LAN_WATCH },
                )
                Screen.LAN_WATCH -> selectedLanRoom?.let { room ->
                    LanWatchScreen(room = room, onBack = { screen = Screen.LAN_JOIN })
                }
                Screen.BROADCAST -> BroadcastScreen(
                    repository = repository,
                    initialLanOnly = broadcastBackToLogin,
                    onBack = { screen = if (broadcastBackToLogin) Screen.LOGIN else Screen.HOME },
                )
                Screen.LIBRARY -> LibraryScreen(repository = repository, onBack = { screen = Screen.HOME })
                Screen.SETTINGS -> SettingsScreen(onBack = { screen = Screen.HOME }, onLogout = { auth.logout(); screen = Screen.LOGIN })
            }
        }
    }
}

@Composable
private fun LoginScreen(repository: AuthRepository, onAuthenticated: () -> Unit, onJoinLan: () -> Unit, onStartLan: () -> Unit) {
    val scope = rememberCoroutineScope()
    var signUp by remember { mutableStateOf(false) }
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("I'm Live", style = MaterialTheme.typography.displaySmall)
        Text("Share the moment, live.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(32.dp))
        if (signUp) {
            OutlinedTextField(username, { username = it }, label = { Text("Username") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            Spacer(Modifier.height(12.dp))
        }
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            password,
            { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 12.dp)) }
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = {
                busy = true
                error = null
                scope.launch {
                    val result = if (signUp) repository.signUp(username, email, password) else repository.login(email, password)
                    result.fold(
                        onSuccess = { busy = false; onAuthenticated() },
                        onFailure = { busy = false; error = it.message ?: "Authentication failed" },
                    )
                }
            },
            enabled = !busy && email.isNotBlank() && password.length >= 8 && (!signUp || username.length >= 3),
            modifier = Modifier.fillMaxWidth(),
        ) { if (busy) CircularProgressIndicator(modifier = Modifier.size(20.dp)) else Text(if (signUp) "Create account" else "Sign in") }
        OutlinedButton(onClick = { signUp = !signUp; error = null }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Text(if (signUp) "I already have an account" else "Create an account")
        }
        Text("Use the same account and Worker API as the web client.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 16.dp))
        OutlinedButton(onClick = onJoinLan, modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
            Text("Join a LAN broadcast offline")
        }
        OutlinedButton(onClick = onStartLan, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Text("Start a LAN broadcast offline")
        }
    }
}

@Composable
private fun HomeScreen(
    repository: LiveRepository,
    onWatch: (LiveStream) -> Unit,
    onBroadcast: () -> Unit,
    onJoinLan: () -> Unit,
    onLibrary: () -> Unit,
    onSettings: () -> Unit,
    onLogout: () -> Unit,
) {
    var streams by remember { mutableStateOf<List<LiveStream>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            loading = true
            error = null
            repository.liveStreams().fold(
                onSuccess = { streams = it; loading = false },
                onFailure = { error = it.message ?: "Could not load live streams"; loading = false },
            )
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column { Text("Live now", style = MaterialTheme.typography.headlineMedium); Text("Low-latency rooms", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            Row {
                IconButton(onClick = onSettings) { Text("⚙") }
                OutlinedButton(onClick = onLogout) { Text("Log out") }
            }
        }
        Spacer(Modifier.height(16.dp))
        Button(onClick = onBroadcast, modifier = Modifier.fillMaxWidth()) { Text("Start a broadcast") }
        OutlinedButton(onClick = onJoinLan, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Join a LAN broadcast offline") }
        OutlinedButton(onClick = onLibrary, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Open my library") }
        Spacer(Modifier.height(20.dp))
        when {
            loading -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            error != null -> Column { Text(error ?: "Could not load live streams", color = MaterialTheme.colorScheme.error); OutlinedButton(onClick = { load() }) { Text("Retry") } }
            streams.isEmpty() -> Text("No one is live yet. Start a room and share the link.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(streams) { stream ->
                    Card(onClick = { onWatch(stream) }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text(stream.title, style = MaterialTheme.typography.titleLarge)
                            Text("${stream.username ?: "creator"} · ${stream.viewers} watching", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            stream.category?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LanJoinScreen(onBack: () -> Unit, onJoin: (LanRoomInfo) -> Unit) {
    var hostAddress by remember { mutableStateOf("") }
    var port by remember { mutableStateOf("39000") }
    var roomCode by remember { mutableStateOf("") }
    var title by remember { mutableStateOf("LAN broadcast") }
    var error by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        OutlinedButton(onClick = onBack) { Text("Back") }
        Spacer(Modifier.height(18.dp))
        Text("Join LAN broadcast", style = MaterialTheme.typography.headlineMedium)
        Text(
            "This mode uses only your local Wi-Fi after you receive the host details. No account or Worker connection is required.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
        Spacer(Modifier.height(18.dp))
        OutlinedTextField(
            hostAddress,
            { hostAddress = it.trim() },
            label = { Text("Host IP address") },
            placeholder = { Text("192.168.1.24") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            port,
            { port = it.filter(Char::isDigit) },
            label = { Text("Port") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            roomCode,
            { roomCode = it.uppercase().filter { character -> character.isLetterOrDigit() } },
            label = { Text("Room code") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            title,
            { title = it },
            label = { Text("Broadcast title (optional)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 10.dp)) }
        Button(
            onClick = {
                val parsedPort = port.toIntOrNull()
                when {
                    hostAddress.isBlank() -> error = "Enter the host's Wi-Fi IP address"
                    parsedPort == null || parsedPort !in 1..65535 -> error = "Enter a valid port"
                    roomCode.length < 4 -> error = "Enter the room code shown by the host"
                    else -> onJoin(LanRoomInfo(hostAddress.trim(), parsedPort, roomCode, title.ifBlank { "LAN broadcast" }))
                }
            },
            enabled = hostAddress.isNotBlank() && port.isNotBlank() && roomCode.length >= 4,
            modifier = Modifier.fillMaxWidth().padding(top = 18.dp),
        ) { Text("Connect over Wi-Fi") }
    }
}

@Composable
private fun LanWatchScreen(room: LanRoomInfo, onBack: () -> Unit) {
    val context = LocalContext.current
    var status by remember { mutableStateOf("Connecting to ${room.hostAddress}:${room.port}…") }
    var videoTrack by remember { mutableStateOf<VideoTrack?>(null) }
    val eglBase = remember { EglBase.create() }
    val renderer = remember { SurfaceViewRenderer(context) }

    DisposableEffect(Unit) {
        renderer.init(eglBase.eglBaseContext, null)
        renderer.setEnableHardwareScaler(true)
        renderer.setMirror(false)
        onDispose {
            videoTrack?.removeSink(renderer)
            renderer.release()
            eglBase.release()
        }
    }
    DisposableEffect(videoTrack) {
        videoTrack?.addSink(renderer)
        onDispose { videoTrack?.removeSink(renderer) }
    }

    LaunchedEffect(room.hostAddress, room.port, room.roomCode) {
        val peerId = "android-lan-viewer-${UUID.randomUUID()}"
        lateinit var client: LanSignalClient
        val rtc = WebRtcViewerSession(
            context = context,
            iceServers = emptyList(),
            sendSignal = { frame -> client.send(frame) },
            onVideo = { track ->
                track.setEnabled(true)
                videoTrack = track
                status = "LAN video connected"
            },
            onAudio = { track -> track.setEnabled(true) },
            onState = { connectionState -> status = "LAN media: ${connectionState.name.lowercase()}" },
        )
        client = LanSignalClient(
            room = room,
            peerId = peerId,
            onFrame = { frame ->
                when (frame.optString("type")) {
                    "welcome" -> status = "Host found — waiting for media negotiation…"
                    "streamer-ready" -> {
                        status = "Negotiating local media…"
                        rtc.createOffer()
                    }
                    "answer", "ice" -> rtc.accept(frame)
                    "error" -> status = frame.optString("error", "The LAN room rejected this connection")
                    "peer-left", "close" -> status = "The LAN broadcaster disconnected"
                }
            },
            onError = { message -> status = message },
        )
        client.connect()
        try {
            awaitCancellation()
        } finally {
            client.close()
            rtc.close()
        }
    }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        OutlinedButton(onClick = onBack) { Text("Leave LAN broadcast") }
        Spacer(Modifier.height(12.dp))
        Text(room.title, style = MaterialTheme.typography.headlineMedium)
        Text("Local Wi-Fi · ${room.hostAddress}:${room.port} · code ${room.roomCode}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        Box(Modifier.fillMaxWidth().height(280.dp).background(Color.Black), contentAlignment = Alignment.Center) {
            AndroidView(factory = { renderer }, modifier = Modifier.fillMaxSize())
            if (videoTrack == null) Text(status, color = Color.White)
        }
        Text(status, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 10.dp))
        Text(
            "Audio and video stay on the local network. This offline mode does not include cloud chat, follows, or stream history.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun WatchScreen(repository: LiveRepository, stream: LiveStream?, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf("Preparing a secure viewer connection…") }
    var signal by remember { mutableStateOf<SignallingClient?>(null) }
    var chat by remember { mutableStateOf<ChatClient?>(null) }
    var messages by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var chatText by remember { mutableStateOf("") }
    var chatError by remember { mutableStateOf<String?>(null) }
    var followed by remember { mutableStateOf(false) }
    var followError by remember { mutableStateOf<String?>(null) }
    var videoTrack by remember { mutableStateOf<VideoTrack?>(null) }
    val eglBase = remember { EglBase.create() }
    val renderer = remember { SurfaceViewRenderer(context) }

    DisposableEffect(Unit) {
        renderer.init(eglBase.eglBaseContext, null)
        renderer.setEnableHardwareScaler(true)
        renderer.setMirror(false)
        onDispose {
            videoTrack?.removeSink(renderer)
            renderer.release()
            eglBase.release()
        }
    }
    DisposableEffect(videoTrack) {
        videoTrack?.addSink(renderer)
        onDispose { videoTrack?.removeSink(renderer) }
    }

    LaunchedEffect(stream?.id) {
        val current = stream ?: return@LaunchedEffect
        val ice = repository.iceServers().getOrDefault(emptyList()).toNativeIceServers()
        repository.ticket(current.id, "viewer").fold(
            onSuccess = { ticket ->
                val peerId = "android-${UUID.randomUUID()}"
                lateinit var client: SignallingClient
                val rtc = WebRtcViewerSession(
                    context = context,
                    iceServers = ice,
                    sendSignal = { frame -> client.send(frame) },
                    onVideo = { track ->
                        track.setEnabled(true)
                        videoTrack = track
                        state = "Video track connected"
                    },
                    onAudio = { track -> track.setEnabled(true); state = "Audio track connected" },
                    onState = { connectionState -> state = "Media connection: ${connectionState.name.lowercase()}" },
                )
                client = SignallingClient(current.id, ticket, "viewer", peerId, { frame ->
                    when (frame.optString("type")) {
                        "welcome" -> {
                            state = "Host found — negotiating media…"
                            rtc.createOffer()
                        }
                        "answer", "ice" -> rtc.accept(frame)
                        "error" -> state = frame.optString("error", "The room rejected this connection")
                        "peer-left" -> state = "The host disconnected"
                    }
                }, { message -> state = message })
                signal = client
                client.connect()
                state = "Waiting for the host's media…"
                try {
                    awaitCancellation()
                } finally {
                    client.close()
                    rtc.close()
                }
            },
            onFailure = { state = it.message ?: "Could not open the viewer connection" },
        )
    }

    LaunchedEffect(stream?.id) {
        val current = stream ?: return@LaunchedEffect
        repository.chatHistory(current.id).onSuccess { messages = it.takeLast(50) }
        repository.ticket(current.id, "viewer").fold(
            onSuccess = { ticket ->
                val client = ChatClient(
                    streamId = current.id,
                    initialTicket = ticket,
                    refreshTicket = { repository.ticket(current.id, "viewer").getOrNull() },
                    onMessage = { message ->
                        if (messages.none { it.id == message.id }) messages = (messages + message).takeLast(100)
                    },
                    onError = { chatError = it },
                    onState = { connection ->
                        if (connection == ChatConnectionState.CONNECTED || connection == ChatConnectionState.ACTIVE) {
                            chatError = null
                        } else if (connection == ChatConnectionState.RECONNECTING) {
                            chatError = "Chat reconnecting…"
                        }
                    },
                )
                chat = client
                client.connect()
                try {
                    awaitCancellation()
                } finally {
                    client.close()
                }
            },
            onFailure = { chatError = it.message ?: "Chat is unavailable" },
        )
    }

    LaunchedEffect(stream?.ownerId) {
        val owner = stream?.ownerId ?: return@LaunchedEffect
        followed = false
        followError = null
        repository.followState(owner).fold(
            onSuccess = { followed = it },
            onFailure = { followError = it.message ?: "Could not load follow state" },
        )
    }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        OutlinedButton(onClick = { signal?.close(); chat?.close(); onBack() }) { Text("Back") }
        Spacer(Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(stream?.title ?: "Broadcast", style = MaterialTheme.typography.headlineMedium)
            if (stream?.ownerId != null) {
                OutlinedButton(onClick = {
                    val owner = stream.ownerId
                    if (owner != null) {
                        followError = null
                        scope.launch {
                            val result = if (followed) repository.unfollow(owner) else repository.follow(owner)
                            result.fold(
                                onSuccess = { followed = it },
                                onFailure = { followError = it.message ?: "Could not update follow state" },
                            )
                        }
                    }
                }) { Text(if (followed) "Following" else "Follow") }
            }
        }
        followError?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 6.dp)) }
        Box(Modifier.fillMaxWidth().height(260.dp).background(Color.Black), contentAlignment = Alignment.Center) {
            AndroidView(factory = { renderer }, modifier = Modifier.fillMaxSize())
            if (videoTrack == null) Text(state, color = Color.White)
        }
        Spacer(Modifier.height(8.dp))
        Text(state, color = MaterialTheme.colorScheme.primary)
        Text("Audio is routed to the speaker by default.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
        Spacer(Modifier.height(12.dp))
        Text("Live chat", style = MaterialTheme.typography.titleMedium)
        Box(Modifier.fillMaxWidth().height(150.dp).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.25f))) {
            if (messages.isEmpty()) {
                Text("No messages yet.", modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                LazyColumn(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(messages, key = { it.id }) { message ->
                        Text("${message.username}: ${message.message}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        chatError?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 6.dp)) }
        Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(chatText, { chatText = it }, label = { Text("Say something") }, modifier = Modifier.weight(1f), singleLine = true)
            Button(onClick = {
                val text = chatText.trim()
                if (text.isNotEmpty() && chat?.send(text) == true) chatText = ""
            }, enabled = chat != null && chatText.isNotBlank(), modifier = Modifier.padding(start = 8.dp)) { Text("Send") }
        }
    }
}

@Composable
private fun BroadcastScreen(repository: LiveRepository, initialLanOnly: Boolean = false, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var permissionsGranted by remember { mutableStateOf(false) }
    var activeStream by remember { mutableStateOf<LiveStream?>(null) }
    var lanRoom by remember { mutableStateOf<LanRoomInfo?>(null) }
    var lanOnly by remember { mutableStateOf(initialLanOnly) }
    var session by remember { mutableStateOf<WebRtcBroadcasterSession?>(null) }
    var signal by remember { mutableStateOf<SignallingClient?>(null) }
    var lanSignal by remember { mutableStateOf<LanSignalServer?>(null) }
    var previewTrack by remember { mutableStateOf<VideoTrack?>(null) }
    val isBroadcasting = activeStream != null || lanRoom != null
    var status by remember { mutableStateOf("Camera and microphone are required to broadcast.") }
    var error by remember { mutableStateOf<String?>(null) }
    var videoEnabled by remember { mutableStateOf(true) }
    var audioEnabled by remember { mutableStateOf(true) }
    val eglBase = remember { EglBase.create() }
    val renderer = remember { SurfaceViewRenderer(context) }
    val latestSession = rememberUpdatedState(session)
    val latestSignal = rememberUpdatedState(signal)
    val latestLanSignal = rememberUpdatedState(lanSignal)
    val latestPreviewTrack = rememberUpdatedState(previewTrack)

    DisposableEffect(Unit) {
        renderer.init(eglBase.eglBaseContext, null)
        renderer.setEnableHardwareScaler(true)
        renderer.setMirror(true)
        onDispose {
            latestPreviewTrack.value?.removeSink(renderer)
            renderer.release()
            eglBase.release()
            latestSession.value?.close()
            latestSignal.value?.close()
            latestLanSignal.value?.stop()
            context.stopService(Intent(context, BroadcastService::class.java))
        }
    }
    DisposableEffect(previewTrack) {
        previewTrack?.addSink(renderer)
        onDispose { previewTrack?.removeSink(renderer) }
    }

    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        permissionsGranted = grants[Manifest.permission.CAMERA] == true && grants[Manifest.permission.RECORD_AUDIO] == true
        status = if (permissionsGranted) "Permissions granted. Tap start to create a live room." else "Camera and microphone permissions are both required."
    }

    suspend fun stopBroadcast() {
        val stream = activeStream
        if (stream != null) repository.stopStream(stream.id)
        session?.close()
        signal?.close()
        lanSignal?.stop()
        context.stopService(Intent(context, BroadcastService::class.java))
        session = null
        signal = null
        lanSignal = null
        lanRoom = null
        activeStream = null
        previewTrack = null
        status = "Broadcast ended"
    }

    LaunchedEffect(activeStream?.id) {
        val stream = activeStream ?: return@LaunchedEffect
        while (true) {
            delay(30_000)
            repository.heartbeat(stream.id, 0)
        }
    }

    val start = {
        if (!permissionsGranted) {
            permissions.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS))
        } else {
            scope.launch {
                error = null
                if (lanOnly) {
                    status = "Opening a private LAN room…"
                    var localSession: WebRtcBroadcasterSession? = null
                    var localServer: LanSignalServer? = null
                    try {
                        val code = (100000..999999).random().toString()
                        val server = LanSignalServer(
                            roomCode = code,
                            onFrame = { frame -> localSession?.handle(frame) },
                            onStatus = { next -> status = next },
                        )
                        localServer = server
                        val nativeSession = WebRtcBroadcasterSession(
                            context = context,
                            iceServers = emptyList(),
                            sendSignal = { frame -> server.send(frame) },
                            onPreviewVideo = { track -> previewTrack = track },
                            onState = { next -> status = next },
                        )
                        localSession = nativeSession
                        val info = server.start(title.ifBlank { "LAN broadcast" })
                        session = nativeSession
                        lanSignal = server
                        lanRoom = info
                        ContextCompat.startForegroundService(context, Intent(context, BroadcastService::class.java).putExtra("title", info.title))
                        nativeSession.startCapture()
                        status = "LAN-only broadcast ready"
                    } catch (failure: Exception) {
                        localServer?.stop()
                        localSession?.close()
                        localSession = null
                        session = null
                        lanSignal = null
                        lanRoom = null
                        error = failure.message ?: "Could not open the LAN broadcast"
                        status = "LAN broadcast failed"
                    }
                    return@launch
                }

                status = "Creating the live room…"
                repository.createStream(title.ifBlank { "Android broadcast" }, "Other").fold(
                    onSuccess = { created ->
                        repository.startStream(created.id).fold(
                            onSuccess = { started ->
                                repository.iceServers().fold(
                                    onSuccess = { config ->
                                        repository.ticket(started.id, "host").fold(
                                            onSuccess = { ticket ->
                                                val peerId = "android-host-${UUID.randomUUID()}"
                                                lateinit var client: SignallingClient
                                                val nativeSession = WebRtcBroadcasterSession(
                                                    context = context,
                                                    iceServers = config.toNativeIceServers(),
                                                    sendSignal = { frame -> client.send(frame) },
                                                    onPreviewVideo = { track -> previewTrack = track },
                                                    onState = { next -> status = next },
                                                )
                                                client = SignallingClient(started.id, ticket, "host", peerId, { frame ->
                                                    when (frame.optString("type")) {
                                                        "welcome" -> status = "Live — waiting for viewers"
                                                        "error" -> status = frame.optString("error", "Signalling rejected the broadcast")
                                                        else -> nativeSession.handle(frame)
                                                    }
                                                }, { message -> status = message })
                                                session = nativeSession
                                                signal = client
                                                activeStream = started
                                                ContextCompat.startForegroundService(context, Intent(context, BroadcastService::class.java).putExtra("title", started.title))
                                                nativeSession.startCapture()
                                                client.connect()
                                                status = "Live — waiting for viewers"
                                            },
                                            onFailure = { error = it.message ?: "Could not authorize the host connection" },
                                        )
                                    },
                                    onFailure = { error = it.message ?: "Could not load TURN configuration" },
                                )
                            },
                            onFailure = { error = it.message ?: "Could not start the live room" },
                        )
                    },
                    onFailure = { error = it.message ?: "Could not create the live room" },
                )
            }
        }
    }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        OutlinedButton(onClick = { scope.launch { stopBroadcast(); onBack() } }) { Text(if (!isBroadcasting) "Back" else "End broadcast") }
        Spacer(Modifier.height(16.dp))
        Text("Broadcast", style = MaterialTheme.typography.headlineMedium)
        Text("The foreground service keeps camera and microphone use visible while Android backgrounds the activity.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(title, { title = it }, label = { Text("Stream title") }, modifier = Modifier.fillMaxWidth(), enabled = !isBroadcasting)
        Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("LAN-only mode")
                Text("Keep audio/video on this Wi-Fi. No account, cloud API, or internet signalling is used.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }
            Switch(checked = lanOnly, onCheckedChange = { lanOnly = it }, enabled = !isBroadcasting)
        }
        Spacer(Modifier.height(16.dp))
        Box(Modifier.fillMaxWidth().height(240.dp).background(Color.Black), contentAlignment = Alignment.Center) {
            AndroidView(factory = { renderer }, modifier = Modifier.fillMaxSize())
            if (previewTrack == null) Text(status, color = Color.White)
        }
        Text(status, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 10.dp))
        lanRoom?.let { room ->
            Card(modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
                Column(Modifier.padding(14.dp)) {
                    Text("Share these LAN details with the viewer", style = MaterialTheme.typography.titleMedium)
                    Text("Address: ${room.hostAddress}:${room.port}")
                    Text("Room code: ${room.roomCode}")
                    Text("The viewer must be on the same Wi-Fi and use Join a LAN broadcast offline.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
                }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
        Row(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { videoEnabled = !videoEnabled; session?.setVideoEnabled(videoEnabled) }, enabled = isBroadcasting) { Text(if (videoEnabled) "Camera on" else "Camera off") }
            OutlinedButton(onClick = { audioEnabled = !audioEnabled; session?.setAudioEnabled(audioEnabled) }, enabled = isBroadcasting) { Text(if (audioEnabled) "Mic on" else "Mic off") }
            OutlinedButton(onClick = { session?.switchCamera() }, enabled = isBroadcasting) { Text("Flip") }
        }
        Button(onClick = start, enabled = !isBroadcasting, modifier = Modifier.fillMaxWidth().padding(top = 14.dp)) {
            Text(if (permissionsGranted) "Start broadcast" else "Check camera and microphone")
        }
    }
}

@Composable
private fun LibraryScreen(repository: LiveRepository, onBack: () -> Unit) {
    val context = LocalContext.current
    var recordings by remember { mutableStateOf<List<Recording>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            loading = true
            repository.recordingsMine().fold(
                onSuccess = { recordings = it; loading = false },
                onFailure = { error = it.message ?: "Could not load recordings"; loading = false },
            )
        }
    }
    LaunchedEffect(Unit) { load() }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        OutlinedButton(onClick = onBack) { Text("Back") }
        Spacer(Modifier.height(16.dp))
        Text("Library", style = MaterialTheme.typography.headlineMedium)
        when {
            loading -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            error != null -> Column { Text(error ?: "Could not load recordings", color = MaterialTheme.colorScheme.error); OutlinedButton(onClick = { load() }) { Text("Retry") } }
            recordings.isEmpty() -> Text("Your ready replays will appear here after a broadcast upload.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 12.dp)) {
                items(recordings, key = { it.id }) { recording ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(recording.title, style = MaterialTheme.typography.titleMedium)
                                Text("${recording.status} · ${recording.visibility}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            OutlinedButton(onClick = {
                                scope.launch {
                                    repository.playbackUrl(recording.id).onSuccess { url ->
                                        val absolute = if (url.startsWith("http")) url else BuildConfig.API_BASE_URL.substringBefore("/api") + url
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(absolute)))
                                    }
                                }
                            }, enabled = recording.status == "ready") { Text("Open") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsScreen(onBack: () -> Unit, onLogout: () -> Unit) {
    val context = LocalContext.current
    val preferences = remember { context.getSharedPreferences("im_live_preferences", 0) }
    var dataSaver by remember { mutableStateOf(preferences.getBoolean("data_saver", false)) }
    var notifications by remember { mutableStateOf(preferences.getBoolean("notifications", true)) }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        OutlinedButton(onClick = onBack) { Text("Back") }
        Spacer(Modifier.height(16.dp))
        Text("Settings", style = MaterialTheme.typography.headlineMedium)
        Text("These safe local preferences are kept separate from encrypted session credentials.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        Row(Modifier.fillMaxWidth().padding(top = 20.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Data saver")
                Text("Prefer lower capture/playback quality when native quality policy is available.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(checked = dataSaver, onCheckedChange = {
                dataSaver = it
                preferences.edit().putBoolean("data_saver", it).apply()
            })
        }
        Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Notifications")
                Text("Local preference only until FCM registration is configured for release.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(checked = notifications, onCheckedChange = {
                notifications = it
                preferences.edit().putBoolean("notifications", it).apply()
            })
        }
        OutlinedButton(onClick = onLogout, modifier = Modifier.padding(top = 24.dp)) { Text("Log out") }
    }
}

private fun List<IceServerConfig>.toNativeIceServers(): List<PeerConnection.IceServer> = flatMap { config ->
    config.urls.map { url ->
        val builder = PeerConnection.IceServer.builder(url)
        config.username?.let { username -> builder.setUsername(username) }
        config.credential?.let { password -> builder.setPassword(password) }
        builder.createIceServer()
    }
}
