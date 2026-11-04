package com.imlive.app.media

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.imlive.app.data.PlatformRepository
import com.imlive.app.live.ChatClient
import com.imlive.app.live.LiveRepository
import com.imlive.app.model.ChatMessage
import com.imlive.app.model.LiveStream
import com.imlive.app.model.VideoQualityPreset
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.webrtc.VideoTrack
import java.util.UUID

enum class BroadcastTransportKind(val id: String, val label: String, val subtitle: String) {
    INTERNET("internet", "Cloud Internet (WebRTC + TURN)", "Share one global link · chat, follows & VOD enabled"),
    WORKER_LAN("local", "Same-Network Cloud Room", "Signalled via Worker · media stays strictly on local LAN"),
    OFFLINE_LAN("offline_lan", "Offline Wi-Fi LAN (Zero Internet)", "Direct Android-to-Android TCP + mDNS discovery"),
}

data class BroadcastStudioState(
    val isLive: Boolean = false,
    val isBusy: Boolean = false,
    val transport: BroadcastTransportKind = BroadcastTransportKind.INTERNET,
    val activeStream: LiveStream? = null,
    val lanRoom: LanRoomInfo? = null,
    val previewTrack: VideoTrack? = null,
    val videoEnabled: Boolean = true,
    val audioEnabled: Boolean = true,
    val isFrontCamera: Boolean = true,
    val qualityPreset: VideoQualityPreset = VideoQualityPreset.HD_720P,
    val isRecordingLocal: Boolean = false,
    val lastCompletedRecording: CompletedLocalRecording? = null,
    val lastUploadedRecordingId: String? = null,
    val isUploadingRecording: Boolean = false,
    val viewerCount: Int = 0,
    val peakViewers: Int = 0,
    val outboundKbps: Int = 0,
    val elapsedSeconds: Int = 0,
    val statusText: String = "Ready to set up your broadcast.",
    val errorText: String? = null,
    val chatMessages: List<ChatMessage> = emptyList(),
)

/**
 * Application-scoped coordinator owning the live broadcast lifecycle so rotating
 * the phone, navigating to Moderation/Dashboard, or backgrounding the activity
 * never drops the live camera/WebRTC session.
 */
class BroadcastSessionManager(
    context: Context,
    private val liveRepository: LiveRepository,
    private val platformRepository: PlatformRepository,
    private val apiBaseUrlProvider: () -> String,
) {
    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _state = MutableStateFlow(BroadcastStudioState())
    val state: StateFlow<BroadcastStudioState> = _state.asStateFlow()

    private var rtcSession: WebRtcBroadcasterSession? = null
    private var signalClient: SignallingClient? = null
    private var chatClient: ChatClient? = null
    private var lanServer: LanSignalServer? = null
    private val lanAdvertiser = LanRoomAdvertiser(appContext)
    private var recorder: NativeStreamRecorder? = null
    private var heartbeatJob: Job? = null
    private var timerJob: Job? = null

    init {
        BroadcastSessionRegistry.onToggleMicFromNotification = {
            toggleAudio()
        }
        BroadcastSessionRegistry.onStopFromNotification = {
            scope.launch { stopBroadcast() }
        }
    }

    fun hasMediaPermissions(): Boolean {
        val cam = ContextCompat.checkSelfPermission(appContext, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        val mic = ContextCompat.checkSelfPermission(appContext, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        return cam && mic
    }

    fun clearError() {
        _state.update { it.copy(errorText = null) }
    }

    fun startBroadcast(
        title: String,
        description: String,
        category: String,
        tags: List<String>,
        isMature: Boolean,
        transport: BroadcastTransportKind,
        qualityPreset: VideoQualityPreset,
        autoRecord: Boolean,
        existingStreamId: String? = null,
        maxViewers: Int = 8,
    ) {
        if (_state.value.isLive || _state.value.isBusy) return
        if (!hasMediaPermissions()) {
            _state.update { it.copy(errorText = "Grant camera and microphone permissions before going live.") }
            return
        }

        scope.launch {
            _state.update {
                it.copy(
                    isBusy = true,
                    errorText = null,
                    transport = transport,
                    qualityPreset = qualityPreset,
                    lastCompletedRecording = null,
                    lastUploadedRecordingId = null,
                    chatMessages = emptyList(),
                    statusText = "Preparing studio…",
                )
            }

            if (transport == BroadcastTransportKind.OFFLINE_LAN) {
                startOfflineLanInternal(title, qualityPreset, autoRecord)
            } else {
                startCloudBroadcastInternal(
                    title = title,
                    description = description,
                    category = category,
                    tags = tags,
                    isMature = isMature,
                    transport = transport,
                    qualityPreset = qualityPreset,
                    autoRecord = autoRecord,
                    existingStreamId = existingStreamId,
                    maxViewers = maxViewers,
                )
            }
        }
    }

    private fun startOfflineLanInternal(
        title: String,
        qualityPreset: VideoQualityPreset,
        autoRecord: Boolean,
    ) {
        var createdServer: LanSignalServer? = null
        var createdRtc: WebRtcBroadcasterSession? = null
        try {
            val code = (100000..999999).random().toString()
            val cleanTitle = title.trim().ifBlank { "Offline LAN Broadcast" }
            val server = LanSignalServer(
                roomCode = code,
                onFrame = { frame ->
                    if (frame.optString("type") == LanSignallingContract.LAN_CHAT_TYPE) {
                        val msg = ChatMessage(
                            id = frame.optString("id", UUID.randomUUID().toString()),
                            username = frame.optString("username", "Viewer"),
                            message = frame.optString("message"),
                        )
                        scope.launch {
                            _state.update { s ->
                                if (s.chatMessages.any { it.id == msg.id }) s
                                else s.copy(chatMessages = (s.chatMessages + msg).takeLast(120))
                            }
                        }
                    } else {
                        createdRtc?.handle(frame)
                    }
                },
                onStatus = { msg -> scope.launch { _state.update { it.copy(statusText = msg) } } },
            )
            createdServer = server

            val nativeRtc = WebRtcBroadcasterSession(
                context = appContext,
                iceServers = emptyList(),
                maxViewers = LanSignallingContract.MAX_VIEWERS,
                sendSignal = { frame -> server.send(frame) },
                onPreviewVideo = { track -> scope.launch { _state.update { it.copy(previewTrack = track) } } },
                onState = { msg -> scope.launch { _state.update { it.copy(statusText = msg) } } },
                onViewerCount = { count ->
                    scope.launch {
                        _state.update { it.copy(viewerCount = count, peakViewers = maxOf(it.peakViewers, count)) }
                    }
                },
                onOutboundBitrateKbps = { kbps -> scope.launch { _state.update { it.copy(outboundKbps = kbps) } } },
            )
            createdRtc = nativeRtc

            val roomInfo = server.start(cleanTitle)
            lanAdvertiser.advertise(roomInfo)
            startForegroundNotification(cleanTitle, micMuted = false)

            nativeRtc.startCapture(
                width = qualityPreset.captureWidth,
                height = qualityPreset.captureHeight,
                fps = qualityPreset.captureFps,
            )

            rtcSession = nativeRtc
            lanServer = server
            _state.update {
                it.copy(
                    isLive = true,
                    isBusy = false,
                    lanRoom = roomInfo,
                    videoEnabled = true,
                    audioEnabled = true,
                    isFrontCamera = nativeRtc.isFrontCamera,
                    elapsedSeconds = 0,
                    viewerCount = 0,
                    peakViewers = 0,
                    statusText = "LAN room live at ${roomInfo.hostAddress}:${roomInfo.port}",
                )
            }
            startElapsedTimer()
            if (autoRecord) startLocalRecording()
        } catch (err: Exception) {
            createdServer?.stop()
            createdRtc?.close()
            lanAdvertiser.stop()
            stopForegroundNotification()
            _state.update {
                it.copy(
                    isLive = false,
                    isBusy = false,
                    errorText = err.message ?: "Could not start the offline LAN room",
                    statusText = "LAN setup failed",
                )
            }
        }
    }

    private suspend fun startCloudBroadcastInternal(
        title: String,
        description: String,
        category: String,
        tags: List<String>,
        isMature: Boolean,
        transport: BroadcastTransportKind,
        qualityPreset: VideoQualityPreset,
        autoRecord: Boolean,
        existingStreamId: String?,
        maxViewers: Int,
    ) {
        val cleanTitle = title.trim().ifBlank { "Live from Android" }
        val streamType = if (transport == BroadcastTransportKind.WORKER_LAN) "local" else "internet"

        val preparedResult = if (!existingStreamId.isNullOrBlank()) {
            liveRepository.updateStream(
                streamId = existingStreamId,
                title = cleanTitle,
                description = description,
                category = category,
                tags = tags,
                isMature = isMature,
            ).recoverCatching { liveRepository.stream(existingStreamId).getOrThrow() }
        } else {
            liveRepository.createStream(
                title = cleanTitle,
                category = category,
                description = description,
                tags = tags,
                streamType = streamType,
                isRecording = autoRecord,
                isMature = isMature,
            )
        }

        val createdStream = preparedResult.getOrElse { err ->
            _state.update {
                it.copy(isBusy = false, errorText = err.message ?: "Could not create stream", statusText = "Setup failed")
            }
            return
        }

        val startedStream = liveRepository.startStream(createdStream.id, isRecording = autoRecord).getOrElse { err ->
            _state.update {
                it.copy(isBusy = false, errorText = err.message ?: "Could not start broadcast", statusText = "Start failed")
            }
            return
        }

        val iceServers = if (transport == BroadcastTransportKind.WORKER_LAN) {
            emptyList()
        } else {
            liveRepository.iceServers().getOrDefault(emptyList()).toNativeIceServers()
        }

        val signalTicket = liveRepository.ticket(startedStream.id, "host").getOrElse { err ->
            runCatching { liveRepository.stopStream(startedStream.id) }
            _state.update {
                it.copy(isBusy = false, errorText = err.message ?: "Could not mint host ticket", statusText = "Auth failed")
            }
            return
        }

        var localRtc: WebRtcBroadcasterSession? = null
        var localSignal: SignallingClient? = null
        try {
            val peerId = "android-host-${UUID.randomUUID().toString().take(8)}"
            val nativeRtc = WebRtcBroadcasterSession(
                context = appContext,
                iceServers = iceServers,
                maxViewers = maxViewers,
                sendSignal = { frame -> localSignal?.send(frame) },
                onPreviewVideo = { track -> scope.launch { _state.update { it.copy(previewTrack = track) } } },
                onState = { msg -> scope.launch { _state.update { it.copy(statusText = msg) } } },
                onViewerCount = { count ->
                    scope.launch {
                        _state.update { it.copy(viewerCount = count, peakViewers = maxOf(it.peakViewers, count)) }
                    }
                },
                onOutboundBitrateKbps = { kbps -> scope.launch { _state.update { it.copy(outboundKbps = kbps) } } },
            )
            localRtc = nativeRtc

            val sig = SignallingClient(
                streamId = startedStream.id,
                initialTicket = signalTicket,
                role = "host",
                peerId = peerId,
                apiBaseUrl = apiBaseUrlProvider(),
                refreshTicket = { liveRepository.ticket(startedStream.id, "host").getOrNull() },
                onFrame = { frame ->
                    when (frame.optString("type")) {
                        "welcome" -> scope.launch { _state.update { it.copy(statusText = "Live — waiting for viewers") } }
                        "error" -> scope.launch {
                            _state.update { it.copy(statusText = frame.optString("error", "Signalling warning")) }
                        }
                        else -> nativeRtc.handle(frame)
                    }
                },
                onClosed = { reason -> scope.launch { _state.update { it.copy(statusText = reason) } } },
                onReconnected = { nativeRtc.startPeriodicAnnounce() },
            )
            localSignal = sig

            startForegroundNotification(startedStream.title, micMuted = false)
            nativeRtc.startCapture(
                width = qualityPreset.captureWidth,
                height = qualityPreset.captureHeight,
                fps = qualityPreset.captureFps,
            )
            sig.connect()
            nativeRtc.startPeriodicAnnounce()

            rtcSession = nativeRtc
            signalClient = sig
            _state.update {
                it.copy(
                    isLive = true,
                    isBusy = false,
                    activeStream = startedStream,
                    videoEnabled = true,
                    audioEnabled = true,
                    isFrontCamera = nativeRtc.isFrontCamera,
                    elapsedSeconds = 0,
                    viewerCount = 0,
                    peakViewers = 0,
                    statusText = "LIVE on air — share your stream link!",
                )
            }

            startElapsedTimer()
            startCloudHeartbeat(startedStream.id)
            connectHostChat(startedStream.id)
            if (autoRecord) startLocalRecording()
        } catch (err: Exception) {
            localSignal?.close()
            localRtc?.close()
            stopForegroundNotification()
            runCatching { liveRepository.stopStream(startedStream.id) }
            _state.update {
                it.copy(
                    isLive = false,
                    isBusy = false,
                    errorText = err.message ?: "Camera or WebRTC initialization failed",
                    statusText = "Broadcast failed",
                )
            }
        }
    }

    private suspend fun connectHostChat(streamId: String) {
        liveRepository.chatHistory(streamId).onSuccess { history ->
            _state.update { it.copy(chatMessages = history.takeLast(80)) }
        }
        val chatTicket = liveRepository.ticket(streamId, "host").getOrNull() ?: return
        val client = ChatClient(
            streamId = streamId,
            initialTicket = chatTicket,
            role = "host",
            apiBaseUrl = apiBaseUrlProvider(),
            refreshTicket = { liveRepository.ticket(streamId, "host").getOrNull() },
            onMessage = { msg ->
                scope.launch {
                    _state.update { s ->
                        if (s.chatMessages.any { it.id == msg.id }) s
                        else s.copy(chatMessages = (s.chatMessages + msg).takeLast(120))
                    }
                }
            },
            onModeration = { msgId, isModerated ->
                scope.launch {
                    _state.update { s ->
                        s.copy(
                            chatMessages = s.chatMessages.map {
                                if (it.id == msgId) it.copy(isModerated = isModerated) else it
                            },
                        )
                    }
                }
            },
            onPresence = { viewers, _ ->
                scope.launch {
                    _state.update { s ->
                        val best = maxOf(viewers, rtcSession?.activeViewerCount() ?: 0)
                        s.copy(viewerCount = best, peakViewers = maxOf(s.peakViewers, best))
                    }
                }
            },
            onError = {},
        )
        chatClient = client
        client.connect()
    }

    private fun startCloudHeartbeat(streamId: String) {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive && _state.value.isLive) {
                delay(30_000L)
                val count = _state.value.viewerCount
                val kbps = _state.value.outboundKbps
                liveRepository.heartbeat(streamId, count)
                if (kbps > 0 || count > 0) {
                    liveRepository.postStreamStats(streamId, count, kbps)
                }
            }
        }
    }

    private fun startElapsedTimer() {
        timerJob?.cancel()
        timerJob = scope.launch {
            while (isActive && _state.value.isLive) {
                delay(1_000L)
                _state.update { it.copy(elapsedSeconds = it.elapsedSeconds + 1) }
            }
        }
    }

    fun toggleVideo() {
        val next = !_state.value.videoEnabled
        rtcSession?.setVideoEnabled(next)
        _state.update { it.copy(videoEnabled = next) }
    }

    fun toggleAudio() {
        val next = !_state.value.audioEnabled
        rtcSession?.setAudioEnabled(next)
        BroadcastSessionRegistry.isMicMuted = !next
        _state.update { it.copy(audioEnabled = next) }
        if (_state.value.isLive) {
            val title = _state.value.activeStream?.title ?: _state.value.lanRoom?.title ?: "Broadcasting"
            startForegroundNotification(title, micMuted = !next)
        }
    }

    fun switchCamera() {
        rtcSession?.switchCamera { isFront ->
            scope.launch { _state.update { it.copy(isFrontCamera = isFront) } }
        }
    }

    fun updateQualityPreset(preset: VideoQualityPreset) {
        rtcSession?.applyQualityPreset(preset)
        _state.update { it.copy(qualityPreset = preset) }
    }

    fun sendHostChat(username: String, text: String): Boolean {
        val clean = text.trim()
        if (clean.isEmpty()) return false
        return if (_state.value.lanRoom != null) {
            lanServer?.sendHostChat(username, clean)
            true
        } else {
            chatClient?.send(clean) == true
        }
    }

    fun moderateMessage(messageId: String, hide: Boolean) {
        val streamId = _state.value.activeStream?.id ?: return
        if (chatClient?.moderate(messageId, hide) != true) {
            scope.launch { liveRepository.moderateChatMessage(streamId, messageId, hide) }
        }
    }

    fun startLocalRecording() {
        if (_state.value.isRecordingLocal) return
        val track = rtcSession?.videoTrack ?: return
        val preset = _state.value.qualityPreset
        val rec = NativeStreamRecorder(
            context = appContext,
            width = preset.captureWidth,
            height = preset.captureHeight,
            fps = preset.captureFps,
        )
        rec.start(track).fold(
            onSuccess = {
                recorder = rec
                _state.update { it.copy(isRecordingLocal = true, statusText = "Recording live MP4 locally…") }
            },
            onFailure = { err ->
                _state.update { it.copy(errorText = "Local MP4 recorder unavailable: ${err.message}") }
            },
        )
    }

    suspend fun stopLocalRecording(): CompletedLocalRecording? {
        val rec = recorder ?: return null
        recorder = null
        val completed = rec.stop()
        _state.update {
            it.copy(
                isRecordingLocal = false,
                lastCompletedRecording = completed ?: it.lastCompletedRecording,
                statusText = if (completed != null) "Saved ${completed.durationSeconds}s local MP4 replay" else it.statusText,
            )
        }
        return completed
    }

    fun publishLastRecordingToCloud(visibility: String = "public", customTitle: String? = null) {
        val completed = _state.value.lastCompletedRecording ?: return
        if (_state.value.isUploadingRecording) return
        val stream = _state.value.activeStream
        val uploadTitle = customTitle?.trim()?.takeIf(String::isNotBlank)
            ?: stream?.title?.let { "$it — replay" }
            ?: "Android Broadcast Replay"

        scope.launch {
            _state.update { it.copy(isUploadingRecording = true, errorText = null, statusText = "Uploading replay to cloud VOD library…") }
            platformRepository.uploadRecordingFile(
                file = completed.file,
                mimeType = "video/mp4",
                title = uploadTitle,
                streamId = stream?.id,
                visibility = visibility,
                durationSeconds = completed.durationSeconds,
            ).fold(
                onSuccess = { recId ->
                    _state.update {
                        it.copy(
                            isUploadingRecording = false,
                            lastUploadedRecordingId = recId,
                            statusText = "Replay published to VOD Library!",
                        )
                    }
                },
                onFailure = { err ->
                    _state.update {
                        it.copy(
                            isUploadingRecording = false,
                            errorText = err.message ?: "Could not upload replay",
                        )
                    }
                },
            )
        }
    }

    suspend fun stopBroadcast() {
        heartbeatJob?.cancel()
        timerJob?.cancel()
        val completedRec = stopLocalRecording()
        val stream = _state.value.activeStream

        chatClient?.close()
        chatClient = null
        signalClient?.close()
        signalClient = null
        lanAdvertiser.stop()
        lanServer?.stop()
        lanServer = null
        rtcSession?.close()
        rtcSession = null
        stopForegroundNotification()

        if (stream != null) {
            runCatching { liveRepository.stopStream(stream.id) }
        }

        _state.update {
            it.copy(
                isLive = false,
                isBusy = false,
                lanRoom = null,
                previewTrack = null,
                isRecordingLocal = false,
                lastCompletedRecording = completedRec ?: it.lastCompletedRecording,
                viewerCount = 0,
                outboundKbps = 0,
                statusText = if (completedRec != null) {
                    "Broadcast ended · ${completedRec.durationSeconds}s MP4 ready to publish or share"
                } else {
                    "Broadcast ended"
                },
            )
        }
    }

    private fun startForegroundNotification(title: String, micMuted: Boolean) {
        val intent = Intent(appContext, BroadcastService::class.java)
            .putExtra(BroadcastService.EXTRA_TITLE, title)
            .putExtra(BroadcastService.EXTRA_MIC_MUTED, micMuted)
        runCatching { ContextCompat.startForegroundService(appContext, intent) }
    }

    private fun stopForegroundNotification() {
        runCatching { appContext.stopService(Intent(appContext, BroadcastService::class.java)) }
    }
}
