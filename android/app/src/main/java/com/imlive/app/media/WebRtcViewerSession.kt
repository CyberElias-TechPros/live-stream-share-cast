package com.imlive.app.media

import android.content.Context
import com.imlive.app.model.RtcConnectionDiagnostics
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.AudioTrack
import org.webrtc.CandidatePairChangeEvent
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.RTCStatsCollectorCallback
import org.webrtc.RTCStatsReport
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack

/**
 * Hardware-accelerated native WebRTC viewer session implementing the full
 * `LanViewer` protocol (`hello-viewer` knock, `streamer-ready` lock, quality
 * requests, audio-only saver, transient disconnect recovery, and live RTCStats).
 */
class WebRtcViewerSession(
    private val context: Context,
    private val iceServers: List<PeerConnection.IceServer> = emptyList(),
    private val sendSignal: (JSONObject) -> Unit,
    private val onVideo: (VideoTrack?) -> Unit,
    private val onAudio: (AudioTrack) -> Unit,
    private val onState: (PeerConnection.PeerConnectionState) -> Unit,
    private val onDiagnostics: (RtcConnectionDiagnostics) -> Unit = {},
) {
    private val appContext = context.applicationContext
    private val factory = WebRtcEngine.factory(appContext)
    private val audioRoutes = AudioRouteController(appContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Volatile private var connection: PeerConnection? = null
    @Volatile private var currentVideoTrack: VideoTrack? = null
    @Volatile private var currentAudioTrack: AudioTrack? = null
    @Volatile private var remoteDescriptionSet = false
    @Volatile private var closed = false
    @Volatile var streamerPeerId: String? = null
        private set

    private val pendingCandidates = mutableListOf<IceCandidate>()
    private var helloJob: Job? = null
    private var statsJob: Job? = null
    private var disconnectGraceJob: Job? = null
    private var audioOnlyMode = false
    private var audioMuted = false
    private var reconnectCount = 0
    private var lastBytesReceived = 0L
    private var lastStatsTimeMs = 0L

    init {
        audioRoutes.acquire(forBroadcast = false, speakerphone = true)
        rebuildPeerConnection()
        startStatsLoop()
    }

    @Synchronized
    private fun rebuildPeerConnection() {
        if (closed) return
        remoteDescriptionSet = false
        pendingCandidates.clear()
        runCatching { connection?.close() }

        val configuration = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
        }

        val observer = object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                val frame = JSONObject()
                    .put("type", "ice")
                    .put(
                        "candidate",
                        JSONObject()
                            .put("sdpMid", candidate.sdpMid)
                            .put("sdpMLineIndex", candidate.sdpMLineIndex)
                            .put("candidate", candidate.sdp),
                    )
                streamerPeerId?.let { frame.put("to", it) }
                sendSignal(frame)
            }

            override fun onTrack(transceiver: RtpTransceiver) {
                when (val track = transceiver.receiver.track()) {
                    is VideoTrack -> {
                        track.setEnabled(!audioOnlyMode)
                        currentVideoTrack = track
                        onVideo(if (audioOnlyMode) null else track)
                    }
                    is AudioTrack -> {
                        track.setEnabled(!audioMuted)
                        currentAudioTrack = track
                        onAudio(track)
                    }
                }
            }

            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                onState(newState)
                when (newState) {
                    PeerConnection.PeerConnectionState.CONNECTED -> {
                        disconnectGraceJob?.cancel()
                    }
                    PeerConnection.PeerConnectionState.DISCONNECTED -> {
                        scheduleRecovery(5_000L)
                    }
                    PeerConnection.PeerConnectionState.FAILED -> {
                        scheduleRecovery(1_500L)
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

        val created = requireNotNull(factory.createPeerConnection(configuration, observer))
        created.addTransceiver(
            MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY),
        )
        created.addTransceiver(
            MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY),
        )
        connection = created
    }

    /** Periodically knocks with `hello-viewer` until the broadcaster replies `streamer-ready`. */
    fun startKnocking() {
        if (closed) return
        helloJob?.cancel()
        helloJob = scope.launch {
            while (isActive && !closed && streamerPeerId == null) {
                sendSignal(JSONObject().put("type", "hello-viewer"))
                delay(3_000L)
            }
        }
    }

    fun onHostReady(hostPeerId: String?) {
        if (closed) return
        if (!hostPeerId.isNullOrBlank()) streamerPeerId = hostPeerId
        helloJob?.cancel()
        val pc = connection
        if (pc == null || pc.signalingState() != PeerConnection.SignalingState.STABLE || !remoteDescriptionSet) {
            if (pc == null || pc.connectionState() == PeerConnection.PeerConnectionState.CLOSED ||
                pc.connectionState() == PeerConnection.PeerConnectionState.FAILED
            ) {
                rebuildPeerConnection()
            }
            if (!remoteDescriptionSet) {
                createOffer()
            }
        }
    }

    fun onHostLeft() {
        if (closed) return
        streamerPeerId = null
        currentVideoTrack = null
        onVideo(null)
        rebuildPeerConnection()
        startKnocking()
    }

    private fun scheduleRecovery(delayMs: Long) {
        if (closed || disconnectGraceJob?.isActive == true) return
        disconnectGraceJob = scope.launch {
            delay(delayMs)
            if (closed) return@launch
            val state = connection?.connectionState()
            if (state == PeerConnection.PeerConnectionState.DISCONNECTED ||
                state == PeerConnection.PeerConnectionState.FAILED
            ) {
                reconnectCount += 1
                streamerPeerId = null
                rebuildPeerConnection()
                startKnocking()
            }
        }
    }

    fun createOffer() {
        val pc = connection ?: return
        pc.createOffer(
            object : SdpCallback() {
                override fun onCreateSuccess(description: SessionDescription) {
                    pc.setLocalDescription(SdpCallback(), description)
                    val frame = JSONObject()
                        .put("type", "offer")
                        .put("sdp", JSONObject().put("type", "offer").put("sdp", description.description))
                    streamerPeerId?.let { frame.put("to", it) }
                    sendSignal(frame)
                }
            },
            MediaConstraints(),
        )
    }

    fun accept(frame: JSONObject) {
        if (closed) return
        val pc = connection ?: return
        when (frame.optString("type")) {
            "answer" -> {
                val from = frame.optString("from").takeIf(String::isNotBlank)
                if (from != null) streamerPeerId = from
                val sdp = frame.optJSONObject("sdp") ?: return
                pc.setRemoteDescription(
                    object : SdpCallback() {
                        override fun onSetSuccess() {
                            remoteDescriptionSet = true
                            synchronized(pendingCandidates) {
                                pendingCandidates.forEach { pc.addIceCandidate(it) }
                                pendingCandidates.clear()
                            }
                        }
                    },
                    SessionDescription(SessionDescription.Type.ANSWER, sdp.optString("sdp")),
                )
            }
            "ice" -> {
                val candidate = frame.optJSONObject("candidate") ?: return
                val ice = IceCandidate(
                    candidate.optString("sdpMid"),
                    candidate.optInt("sdpMLineIndex"),
                    candidate.optString("candidate"),
                )
                if (remoteDescriptionSet) pc.addIceCandidate(ice)
                else synchronized(pendingCandidates) { pendingCandidates += ice }
            }
        }
    }

    /** Requests a per-viewer bitrate cap from the broadcaster (`null` restores automatic). */
    fun requestQuality(kbps: Int?) {
        val frame = JSONObject().put("type", "quality")
        if (kbps == null) frame.put("kbps", JSONObject.NULL) else frame.put("kbps", kbps.coerceIn(64, 10_000))
        streamerPeerId?.let { frame.put("to", it) }
        sendSignal(frame)
    }

    fun setAudioOnly(enabled: Boolean) {
        audioOnlyMode = enabled
        currentVideoTrack?.setEnabled(!enabled)
        onVideo(if (enabled) null else currentVideoTrack)
        requestQuality(if (enabled) 128 else null)
    }

    fun setAudioMuted(muted: Boolean) {
        audioMuted = muted
        currentAudioTrack?.setEnabled(!muted)
    }

    fun setSpeakerphone(enabled: Boolean) {
        audioRoutes.setSpeakerphone(enabled)
    }

    /** Creates an offline viewer answer for the `imlive-offline-webrtc` v1 SDP bundle room. */
    suspend fun acceptOfflineOfferAndCreateAnswer(
        offerBundle: OfflineSdpProtocol.OfflineSignalBundle,
    ): OfflineSdpProtocol.OfflineSignalBundle {
        require(offerBundle.type == "offer") { "Paste the broadcaster's offer bundle." }
        val pc = connection ?: error("Viewer peer connection closed")
        val done = kotlinx.coroutines.CompletableDeferred<Unit>()
        pc.setRemoteDescription(
            object : SdpCallback() {
                override fun onSetSuccess() { done.complete(Unit) }
                override fun onSetFailure(error: String) { done.completeExceptionally(IllegalStateException(error)) }
            },
            SessionDescription(SessionDescription.Type.OFFER, offerBundle.sdp),
        )
        done.await()

        val createdOffer = kotlinx.coroutines.CompletableDeferred<SessionDescription>()
        pc.createAnswer(
            object : SdpCallback() {
                override fun onCreateSuccess(description: SessionDescription) { createdOffer.complete(description) }
                override fun onCreateFailure(error: String) { createdOffer.completeExceptionally(IllegalStateException(error)) }
            },
            MediaConstraints(),
        )
        val answer = createdOffer.await()
        val localSet = kotlinx.coroutines.CompletableDeferred<Unit>()
        pc.setLocalDescription(
            object : SdpCallback() {
                override fun onSetSuccess() { localSet.complete(Unit) }
                override fun onSetFailure(error: String) { localSet.completeExceptionally(IllegalStateException(error)) }
            },
            answer,
        )
        localSet.await()

        // Wait up to 8 seconds for non-trickle host ICE candidates
        var waited = 0L
        while (pc.iceGatheringState() != PeerConnection.IceGatheringState.COMPLETE && waited < 8_000L) {
            delay(200L)
            waited += 200L
        }
        val finalSdp = pc.localDescription?.description ?: answer.description
        return OfflineSdpProtocol.OfflineSignalBundle(
            type = "answer",
            roomCode = offerBundle.roomCode,
            sdp = finalSdp,
        )
    }

    private fun startStatsLoop() {
        statsJob?.cancel()
        statsJob = scope.launch {
            while (isActive && !closed) {
                delay(2_000L)
                val pc = connection ?: continue
                runCatching {
                    pc.getStats(
                        object : RTCStatsCollectorCallback {
                            override fun onStatsDelivered(report: RTCStatsReport) {
                                parseDiagnostics(report)
                            }
                        },
                    )
                }
            }
        }
    }

    private fun parseDiagnostics(report: RTCStatsReport) {
        var bytesIn = 0L
        var width = 0
        var height = 0
        var fps = 0
        var packetsLost = 0L
        var rttMs: Int? = null
        var activeLocalCandidateId: String? = null
        val candidateTypes = mutableMapOf<String, String>()

        for ((_, stat) in report.statsMap) {
            val members = stat.members
            when (stat.type) {
                "inbound-rtp" -> {
                    val kind = (members["kind"] ?: members["mediaType"])?.toString()
                    bytesIn += (members["bytesReceived"] as? Number)?.toLong() ?: 0L
                    packetsLost += (members["packetsLost"] as? Number)?.toLong() ?: 0L
                    if (kind == "video") {
                        width = (members["frameWidth"] as? Number)?.toInt() ?: width
                        height = (members["frameHeight"] as? Number)?.toInt() ?: height
                        fps = (members["framesPerSecond"] as? Number)?.toInt() ?: fps
                    }
                }
                "candidate-pair" -> {
                    val state = members["state"]?.toString()
                    val nominated = members["nominated"] as? Boolean ?: false
                    if (state == "succeeded" && nominated) {
                        val rttSec = (members["currentRoundTripTime"] as? Number)?.toDouble()
                        if (rttSec != null) rttMs = (rttSec * 1000.0).toInt()
                        activeLocalCandidateId = members["localCandidateId"]?.toString()
                    }
                }
                "local-candidate" -> {
                    val cType = members["candidateType"]?.toString()
                    if (cType != null) candidateTypes[stat.id] = cType
                }
            }
        }

        val now = System.currentTimeMillis()
        val kbps = if (lastStatsTimeMs > 0 && now > lastStatsTimeMs && bytesIn >= lastBytesReceived) {
            (((bytesIn - lastBytesReceived) * 8.0) / (now - lastStatsTimeMs)).toInt()
        } else 0
        lastBytesReceived = bytesIn
        lastStatsTimeMs = now

        val candType = activeLocalCandidateId?.let { candidateTypes[it] }
        val transportLabel = when (candType) {
            "relay" -> "TURN Relay"
            "host" -> "Direct LAN / P2P"
            "srflx", "prflx" -> "Direct NAT P2P"
            else -> if (iceServers.isEmpty()) "Offline Local P2P" else "P2P"
        }

        onDiagnostics(
            RtcConnectionDiagnostics(
                transportType = transportLabel,
                videoWidth = width,
                videoHeight = height,
                fps = fps,
                bitrateKbps = kbps,
                rttMs = rttMs,
                packetsLost = packetsLost,
                reconnectCount = reconnectCount,
            ),
        )
    }

    fun close() {
        if (closed) return
        closed = true
        helloJob?.cancel()
        statsJob?.cancel()
        disconnectGraceJob?.cancel()
        scope.cancel()
        synchronized(pendingCandidates) { pendingCandidates.clear() }
        runCatching { connection?.close() }
        connection = null
        audioRoutes.release()
    }

    private open class SdpCallback : SdpObserver {
        override fun onCreateSuccess(description: SessionDescription) = Unit
        override fun onSetSuccess() = Unit
        override fun onCreateFailure(error: String) = Unit
        override fun onSetFailure(error: String) = Unit
    }
}
