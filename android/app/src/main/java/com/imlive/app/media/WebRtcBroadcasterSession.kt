package com.imlive.app.media

import android.content.Context
import com.imlive.app.model.VideoQualityPreset
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.CandidatePairChangeEvent
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.RTCStatsCollectorCallback
import org.webrtc.RTCStatsReport
import org.webrtc.RtpReceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import java.util.concurrent.ConcurrentHashMap

/**
 * Hardware-accelerated native WebRTC broadcaster session.
 *
 * Matches the browser `LanStreamer` signalling contract (periodic `streamer-ready`,
 * `hello-viewer` response, per-viewer `quality` bitrate ceilings, 10s mobile-handoff
 * disconnect grace period, and P2P viewer capacity guard) while also supporting
 * the non-trickle `imlive-offline-webrtc` v1 SDP bundle mode.
 */
class WebRtcBroadcasterSession(
    context: Context,
    iceServers: List<PeerConnection.IceServer> = emptyList(),
    private val maxViewers: Int = 8,
    private val sendSignal: (JSONObject) -> Unit,
    private val onPreviewVideo: (VideoTrack) -> Unit,
    private val onState: (String) -> Unit,
    private val onViewerCount: (Int) -> Unit = {},
    private val onOutboundBitrateKbps: (Int) -> Unit = {},
) {
    private val appContext = context.applicationContext
    private val eglBase = WebRtcEngine.eglBase()
    private val factory = WebRtcEngine.factory(appContext)
    private val audioRoutes = AudioRouteController(appContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val audioSource: AudioSource
    private val videoSource: VideoSource
    val audioTrack: AudioTrack
    val videoTrack: VideoTrack

    private var cameraCapturer: CameraVideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private val peerConnections = ConcurrentHashMap<String, PeerConnection>()
    private val remoteDescriptions = ConcurrentHashMap.newKeySet<String>()
    private val pendingCandidates = ConcurrentHashMap<String, MutableList<IceCandidate>>()
    private val disconnectJobs = ConcurrentHashMap<String, Job>()
    private var offlineSinglePeer: PeerConnection? = null

    private var announceJob: Job? = null
    private var statsJob: Job? = null
    private var lastBytesSent = 0L
    private var lastStatsTimeMs = 0L
    @Volatile var isFrontCamera: Boolean = true
        private set
    @Volatile private var closed = false

    private val configuration = PeerConnection.RTCConfiguration(iceServers).apply {
        sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
    }

    init {
        audioRoutes.acquire(forBroadcast = true, speakerphone = true)
        videoSource = factory.createVideoSource(false)
        audioSource = factory.createAudioSource(MediaConstraints())
        audioTrack = factory.createAudioTrack("android-audio", audioSource)
        videoTrack = factory.createVideoTrack("android-video", videoSource)
        videoTrack.setEnabled(true)
        audioTrack.setEnabled(true)
        onPreviewVideo(videoTrack)
    }

    fun startCapture(width: Int = 1280, height: Int = 720, fps: Int = 30) {
        if (closed || cameraCapturer != null) return
        val enumerator = Camera2Enumerator(appContext)
        val frontName = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
        val cameraName = frontName
            ?: enumerator.deviceNames.firstOrNull()
            ?: error("No camera is available on this device")
        isFrontCamera = frontName != null && cameraName == frontName

        val capturer = enumerator.createCapturer(
            cameraName,
            object : CameraVideoCapturer.CameraEventsHandler {
                override fun onCameraError(errorDescription: String) = onState("Camera error: $errorDescription")
                override fun onCameraDisconnected() = onState("Camera disconnected")
                override fun onCameraFreezed(errorDescription: String) = onState("Camera paused: $errorDescription")
                override fun onCameraOpening(cameraName: String) = onState("Opening camera…")
                override fun onFirstFrameAvailable() = onState("Live camera active")
                override fun onCameraClosed() = onState("Camera closed")
            },
        ) ?: error("Could not open camera capturer")

        val helper = SurfaceTextureHelper.create("im-live-capture", eglBase.eglBaseContext)
        surfaceTextureHelper = helper
        cameraCapturer = capturer
        capturer.initialize(helper, appContext, videoSource.capturerObserver)
        capturer.startCapture(width, height, fps)
        onState("Capturing ${width}x${height} @ ${fps}fps")
    }

    fun startPeriodicAnnounce() {
        announceJob?.cancel()
        announceJob = scope.launch {
            sendSignal(JSONObject().put("type", "streamer-ready"))
            while (isActive && !closed) {
                delay(4_000L)
                if (!closed) sendSignal(JSONObject().put("type", "streamer-ready"))
            }
        }
        startStatsLoop()
    }

    fun applyQualityPreset(preset: VideoQualityPreset) {
        val capturer = cameraCapturer ?: return
        runCatching {
            capturer.changeCaptureFormat(preset.captureWidth, preset.captureHeight, preset.captureFps)
            onState("Capture quality: ${preset.label}")
        }
    }

    fun setVideoEnabled(enabled: Boolean) {
        videoTrack.setEnabled(enabled)
    }

    fun setAudioEnabled(enabled: Boolean) {
        audioTrack.setEnabled(enabled)
    }

    fun switchCamera(onSwitched: (Boolean) -> Unit = {}) {
        val capturer = cameraCapturer ?: return
        capturer.switchCamera(
            object : CameraVideoCapturer.CameraSwitchHandler {
                override fun onCameraSwitchDone(front: Boolean) {
                    isFrontCamera = front
                    onSwitched(front)
                    onState(if (front) "Front camera" else "Rear camera")
                }

                override fun onCameraSwitchError(errorDescription: String) {
                    onState("Camera switch failed: $errorDescription")
                }
            },
        )
    }

    fun handle(frame: JSONObject) {
        if (closed) return
        when (frame.optString("type")) {
            "hello-viewer" -> frame.optString("from").takeIf(String::isNotBlank)?.let { viewer ->
                sendSignal(JSONObject().put("type", "streamer-ready").put("to", viewer))
            }
            "peer-joined" -> {
                if (frame.optString("role") == "viewer") {
                    frame.optString("id").takeIf(String::isNotBlank)?.let { viewer ->
                        sendSignal(JSONObject().put("type", "streamer-ready").put("to", viewer))
                    }
                }
            }
            "offer" -> {
                val viewer = frame.optString("from").takeIf(String::isNotBlank) ?: return
                val sdp = frame.optJSONObject("sdp")?.optString("sdp") ?: return
                acceptOffer(viewer, sdp)
            }
            "quality" -> {
                val viewer = frame.optString("from").takeIf(String::isNotBlank) ?: return
                val kbps = if (frame.isNull("kbps")) null else frame.optInt("kbps", -1).takeIf { it > 0 }
                applyViewerBitrateCeiling(viewer, kbps)
            }
            "ice" -> {
                val viewer = frame.optString("from").takeIf(String::isNotBlank) ?: return
                val candidate = frame.optJSONObject("candidate") ?: return
                val ice = IceCandidate(
                    candidate.optString("sdpMid"),
                    candidate.optInt("sdpMLineIndex"),
                    candidate.optString("candidate"),
                )
                if (remoteDescriptions.contains(viewer)) {
                    peerConnections[viewer]?.addIceCandidate(ice)
                } else {
                    pendingCandidates.computeIfAbsent(viewer) { mutableListOf() }.add(ice)
                }
            }
            "close", "peer-left" -> {
                val target = frame.optString("from").takeIf(String::isNotBlank)
                    ?: frame.optString("id").takeIf(String::isNotBlank)
                if (target != null) closePeer(target)
            }
        }
    }

    private fun applyViewerBitrateCeiling(viewer: String, kbps: Int?) {
        val pc = peerConnections[viewer] ?: return
        for (sender in pc.senders) {
            if (sender.track()?.kind() != "video") continue
            runCatching {
                val params = sender.parameters
                for (encoding in params.encodings) {
                    encoding.maxBitrateBps = kbps?.coerceIn(64, 10_000)?.times(1000)
                }
                sender.parameters = params
            }
        }
    }

    private fun acceptOffer(viewer: String, sdp: String) {
        if (!peerConnections.containsKey(viewer) && peerConnections.size >= maxViewers) {
            sendSignal(
                JSONObject()
                    .put("type", "error")
                    .put("to", viewer)
                    .put("code", "p2p_capacity")
                    .put("maxViewers", maxViewers)
                    .put("error", "This broadcast has reached its $maxViewers-viewer peer-to-peer limit"),
            )
            return
        }

        // Replace stale connection if the same peer re-offers
        peerConnections.remove(viewer)?.let { runCatching { it.close() } }
        disconnectJobs.remove(viewer)?.cancel()
        remoteDescriptions.remove(viewer)

        val connection = createPeer(viewer)
        connection.setRemoteDescription(
            object : SdpObserverAdapter() {
                override fun onSetSuccess() {
                    remoteDescriptions += viewer
                    pendingCandidates.remove(viewer)?.forEach { connection.addIceCandidate(it) }
                    connection.createAnswer(
                        object : SdpObserverAdapter() {
                            override fun onCreateSuccess(description: SessionDescription) {
                                connection.setLocalDescription(
                                    object : SdpObserverAdapter() {
                                        override fun onSetSuccess() {
                                            sendSignal(
                                                JSONObject()
                                                    .put("type", "answer")
                                                    .put("to", viewer)
                                                    .put(
                                                        "sdp",
                                                        JSONObject()
                                                            .put("type", "answer")
                                                            .put("sdp", description.description),
                                                    ),
                                            )
                                        }
                                    },
                                    description,
                                )
                            }
                        },
                        MediaConstraints(),
                    )
                }

                override fun onSetFailure(error: String) = onState("Viewer negotiation failed: $error")
            },
            SessionDescription(SessionDescription.Type.OFFER, sdp),
        )
    }

    private fun createPeer(viewer: String): PeerConnection {
        val observer = object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                sendSignal(
                    JSONObject()
                        .put("type", "ice")
                        .put("to", viewer)
                        .put(
                            "candidate",
                            JSONObject()
                                .put("sdpMid", candidate.sdpMid)
                                .put("sdpMLineIndex", candidate.sdpMLineIndex)
                                .put("candidate", candidate.sdp),
                        ),
                )
            }

            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                when (newState) {
                    PeerConnection.PeerConnectionState.CONNECTED -> {
                        disconnectJobs.remove(viewer)?.cancel()
                        emitViewerCount()
                        onState("Live · ${activeViewerCount()} watching")
                    }
                    PeerConnection.PeerConnectionState.DISCONNECTED -> {
                        if (!disconnectJobs.containsKey(viewer)) {
                            disconnectJobs[viewer] = scope.launch {
                                delay(10_000L)
                                disconnectJobs.remove(viewer)
                                if (peerConnections[viewer]?.connectionState() == PeerConnection.PeerConnectionState.DISCONNECTED) {
                                    closePeer(viewer)
                                }
                            }
                        }
                        emitViewerCount()
                    }
                    PeerConnection.PeerConnectionState.FAILED,
                    PeerConnection.PeerConnectionState.CLOSED -> {
                        closePeer(viewer)
                    }
                    else -> Unit
                }
            }

            override fun onSignalingChange(state: PeerConnection.SignalingState) = Unit
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) = Unit
            override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) = Unit
            override fun onAddStream(stream: MediaStream) = Unit
            override fun onRemoveStream(stream: MediaStream) = Unit
            override fun onAddTrack(receiver: RtpReceiver?, mediaStreams: Array<out MediaStream>?) = Unit
            override fun onDataChannel(channel: DataChannel) = Unit
            override fun onRenegotiationNeeded() = Unit
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
            override fun onSelectedCandidatePairChanged(event: CandidatePairChangeEvent) = Unit
        }
        val connection = requireNotNull(factory.createPeerConnection(configuration, observer))
        connection.addTrack(videoTrack, listOf("android-broadcast"))
        connection.addTrack(audioTrack, listOf("android-broadcast"))
        peerConnections[viewer] = connection
        return connection
    }

    /** Creates a non-trickle `imlive-offline-webrtc` v1 SDP offer bundle for browser/Android offline pairing. */
    suspend fun createOfflineBundleOffer(roomCode: String): OfflineSdpProtocol.OfflineSignalBundle {
        offlineSinglePeer?.let { runCatching { it.close() } }
        val emptyConfig = PeerConnection.RTCConfiguration(emptyList()).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
        }
        val pc = requireNotNull(
            factory.createPeerConnection(
                emptyConfig,
                object : PeerConnection.Observer {
                    override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                        onState("Offline peer: ${newState.name.lowercase()}")
                        onViewerCount(if (newState == PeerConnection.PeerConnectionState.CONNECTED) 1 else 0)
                    }
                    override fun onIceCandidate(candidate: IceCandidate) = Unit
                    override fun onSignalingChange(state: PeerConnection.SignalingState) = Unit
                    override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) = Unit
                    override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
                    override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) = Unit
                    override fun onAddStream(stream: MediaStream) = Unit
                    override fun onRemoveStream(stream: MediaStream) = Unit
                    override fun onAddTrack(receiver: RtpReceiver?, mediaStreams: Array<out MediaStream>?) = Unit
                    override fun onDataChannel(channel: DataChannel) = Unit
                    override fun onRenegotiationNeeded() = Unit
                    override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
                    override fun onSelectedCandidatePairChanged(event: CandidatePairChangeEvent) = Unit
                },
            ),
        )
        pc.addTrack(videoTrack, listOf("offline-broadcast"))
        pc.addTrack(audioTrack, listOf("offline-broadcast"))
        offlineSinglePeer = pc

        val offerDeferred = CompletableDeferred<SessionDescription>()
        pc.createOffer(
            object : SdpObserverAdapter() {
                override fun onCreateSuccess(description: SessionDescription) { offerDeferred.complete(description) }
                override fun onCreateFailure(error: String) { offerDeferred.completeExceptionally(IllegalStateException(error)) }
            },
            MediaConstraints(),
        )
        val offer = offerDeferred.await()

        val localDeferred = CompletableDeferred<Unit>()
        pc.setLocalDescription(
            object : SdpObserverAdapter() {
                override fun onSetSuccess() { localDeferred.complete(Unit) }
                override fun onSetFailure(error: String) { localDeferred.completeExceptionally(IllegalStateException(error)) }
            },
            offer,
        )
        localDeferred.await()

        var waited = 0L
        while (pc.iceGatheringState() != PeerConnection.IceGatheringState.COMPLETE && waited < 8_000L) {
            delay(200L)
            waited += 200L
        }
        val finalSdp = pc.localDescription?.description ?: offer.description
        return OfflineSdpProtocol.OfflineSignalBundle(
            type = "offer",
            roomCode = OfflineSdpProtocol.validateRoomCode(roomCode),
            sdp = finalSdp,
        )
    }

    suspend fun acceptOfflineBundleAnswer(
        answerBundle: OfflineSdpProtocol.OfflineSignalBundle,
        expectedRoomCode: String,
    ) {
        require(answerBundle.type == "answer") { "Paste the viewer's answer bundle." }
        OfflineSdpProtocol.assertRoomMatches(answerBundle, expectedRoomCode)
        val pc = offlineSinglePeer ?: error("Generate a broadcaster offer first.")
        val done = CompletableDeferred<Unit>()
        pc.setRemoteDescription(
            object : SdpObserverAdapter() {
                override fun onSetSuccess() { done.complete(Unit) }
                override fun onSetFailure(error: String) { done.completeExceptionally(IllegalStateException(error)) }
            },
            SessionDescription(SessionDescription.Type.ANSWER, answerBundle.sdp),
        )
        done.await()
    }

    fun activeViewerCount(): Int =
        peerConnections.values.count { it.connectionState() == PeerConnection.PeerConnectionState.CONNECTED }

    private fun emitViewerCount() {
        if (!closed) onViewerCount(activeViewerCount())
    }

    private fun startStatsLoop() {
        statsJob?.cancel()
        statsJob = scope.launch {
            while (isActive && !closed) {
                delay(4_000L)
                val firstConnected = peerConnections.values.firstOrNull {
                    it.connectionState() == PeerConnection.PeerConnectionState.CONNECTED
                } ?: continue
                runCatching {
                    firstConnected.getStats(
                        object : RTCStatsCollectorCallback {
                            override fun onStatsDelivered(report: RTCStatsReport) {
                                var bytesSent = 0L
                                for ((_, stat) in report.statsMap) {
                                    if (stat.type == "outbound-rtp") {
                                        bytesSent += (stat.members["bytesSent"] as? Number)?.toLong() ?: 0L
                                    }
                                }
                                val now = System.currentTimeMillis()
                                if (lastStatsTimeMs > 0 && now > lastStatsTimeMs && bytesSent >= lastBytesSent) {
                                    val kbps = (((bytesSent - lastBytesSent) * 8.0) / (now - lastStatsTimeMs)).toInt()
                                    onOutboundBitrateKbps(kbps * peerConnections.size.coerceAtLeast(1))
                                }
                                lastBytesSent = bytesSent
                                lastStatsTimeMs = now
                            }
                        },
                    )
                }
            }
        }
    }

    private fun closePeer(viewer: String) {
        disconnectJobs.remove(viewer)?.cancel()
        peerConnections.remove(viewer)?.let { runCatching { it.close() } }
        remoteDescriptions.remove(viewer)
        pendingCandidates.remove(viewer)
        emitViewerCount()
    }

    fun close() {
        if (closed) return
        closed = true
        announceJob?.cancel()
        statsJob?.cancel()
        disconnectJobs.values.forEach { it.cancel() }
        disconnectJobs.clear()
        sendSignal(JSONObject().put("type", "close"))
        offlineSinglePeer?.let { runCatching { it.close() } }
        offlineSinglePeer = null
        peerConnections.values.forEach { runCatching { it.close() } }
        peerConnections.clear()
        pendingCandidates.clear()
        remoteDescriptions.clear()
        cameraCapturer?.let { capturer ->
            runCatching { capturer.stopCapture() }
            runCatching { capturer.dispose() }
        }
        cameraCapturer = null
        surfaceTextureHelper?.let { runCatching { it.dispose() } }
        surfaceTextureHelper = null
        runCatching { videoTrack.dispose() }
        runCatching { audioTrack.dispose() }
        runCatching { videoSource.dispose() }
        runCatching { audioSource.dispose() }
        audioRoutes.release()
        scope.cancel()
    }

    private open class SdpObserverAdapter : SdpObserver {
        override fun onCreateSuccess(description: SessionDescription) = Unit
        override fun onSetSuccess() = Unit
        override fun onCreateFailure(error: String) = Unit
        override fun onSetFailure(error: String) = Unit
    }
}
