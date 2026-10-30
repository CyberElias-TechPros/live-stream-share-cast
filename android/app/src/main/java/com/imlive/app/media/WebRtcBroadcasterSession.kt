package com.imlive.app.media

import android.content.Context
import org.json.JSONObject
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.AudioTrack
import org.webrtc.EglBase

/**
 * Native creator session. Capture stays in the foreground process and each
 * viewer gets a separate send-only peer, matching the browser LanStreamer
 * protocol until an SFU transport is selected.
 */
class WebRtcBroadcasterSession(
    context: Context,
    iceServers: List<PeerConnection.IceServer> = emptyList(),
    private val sendSignal: (JSONObject) -> Unit,
    private val onPreviewVideo: (VideoTrack) -> Unit,
    private val onState: (String) -> Unit,
) {
    private val appContext = context.applicationContext
    private val eglBase = EglBase.create()
    private lateinit var factory: PeerConnectionFactory
    private lateinit var videoSource: VideoSource
    private lateinit var audioTrack: AudioTrack
    private lateinit var videoTrack: VideoTrack
    private lateinit var cameraCapturer: CameraVideoCapturer
    private lateinit var surfaceTextureHelper: SurfaceTextureHelper
    private val peerConnections = mutableMapOf<String, PeerConnection>()
    private val remoteDescriptions = mutableSetOf<String>()
    private val pendingCandidates = mutableMapOf<String, MutableList<IceCandidate>>()
    private val configuration = PeerConnection.RTCConfiguration(iceServers).apply {
        sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
    }
    private var closed = false

    init {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(appContext).createInitializationOptions(),
        )
        factory = PeerConnectionFactory.builder().createPeerConnectionFactory()
        videoSource = factory.createVideoSource(false)
        audioTrack = factory.createAudioTrack("android-audio", factory.createAudioSource(MediaConstraints()))
        videoTrack = factory.createVideoTrack("android-video", videoSource)
        videoTrack.setEnabled(true)
        audioTrack.setEnabled(true)
        onPreviewVideo(videoTrack)
    }

    fun startCapture(width: Int = 1280, height: Int = 720, fps: Int = 30) {
        if (closed || ::cameraCapturer.isInitialized) return
        val enumerator = Camera2Enumerator(appContext)
        val cameraName = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
            ?: enumerator.deviceNames.firstOrNull()
            ?: error("No camera is available")
        cameraCapturer = enumerator.createCapturer(cameraName, object : CameraVideoCapturer.CameraEventsHandler {
            override fun onCameraError(errorDescription: String) = onState("Camera error: $errorDescription")
            override fun onCameraDisconnected() = onState("Camera disconnected")
            override fun onCameraFreezed(errorDescription: String) = onState("Camera paused: $errorDescription")
            override fun onCameraOpening(cameraName: String) = onState("Opening $cameraName")
            override fun onFirstFrameAvailable() = onState("Camera ready")
            override fun onCameraClosed() = onState("Camera closed")
        }) ?: error("Could not create camera capturer")
        surfaceTextureHelper = SurfaceTextureHelper.create("im-live-capture", eglBase.eglBaseContext)
        cameraCapturer.initialize(surfaceTextureHelper, appContext, videoSource.capturerObserver)
        cameraCapturer.startCapture(width, height, fps)
        onState("Capturing camera and microphone")
    }

    fun setVideoEnabled(enabled: Boolean) {
        if (::videoTrack.isInitialized) videoTrack.setEnabled(enabled)
    }

    fun setAudioEnabled(enabled: Boolean) {
        if (::audioTrack.isInitialized) audioTrack.setEnabled(enabled)
    }

    fun switchCamera() {
        if (!::cameraCapturer.isInitialized) return
        cameraCapturer.switchCamera(object : CameraVideoCapturer.CameraSwitchHandler {
            override fun onCameraSwitchDone(isFrontCamera: Boolean) = onState(if (isFrontCamera) "Front camera" else "Rear camera")
            override fun onCameraSwitchError(errorDescription: String) = onState("Camera switch failed: $errorDescription")
        })
    }

    fun handle(frame: JSONObject) {
        if (closed) return
        when (frame.optString("type")) {
            "hello-viewer" -> frame.optString("from").takeIf(String::isNotBlank)?.let { viewer ->
                sendSignal(JSONObject().put("type", "streamer-ready").put("to", viewer))
            }
            "offer" -> {
                val viewer = frame.optString("from").takeIf(String::isNotBlank) ?: return
                val sdp = frame.optJSONObject("sdp")?.optString("sdp") ?: return
                acceptOffer(viewer, sdp)
            }
            "ice" -> {
                val viewer = frame.optString("from").takeIf(String::isNotBlank) ?: return
                val candidate = frame.optJSONObject("candidate") ?: return
                val ice = IceCandidate(
                    candidate.optString("sdpMid"),
                    candidate.optInt("sdpMLineIndex"),
                    candidate.optString("candidate"),
                )
                if (remoteDescriptions.contains(viewer)) peerConnections[viewer]?.addIceCandidate(ice)
                else pendingCandidates.getOrPut(viewer) { mutableListOf() }.add(ice)
            }
            "close", "peer-left" -> frame.optString("from").takeIf(String::isNotBlank)
                ?.let(::closePeer)
                ?: frame.optString("id").takeIf(String::isNotBlank)?.let(::closePeer)
        }
    }

    private fun acceptOffer(viewer: String, sdp: String) {
        val connection = peerConnections[viewer] ?: createPeer(viewer)
        connection.setRemoteDescription(object : SdpObserverAdapter() {
            override fun onSetSuccess() {
                remoteDescriptions += viewer
                pendingCandidates.remove(viewer)?.forEach { connection.addIceCandidate(it) }
                connection.createAnswer(object : SdpObserverAdapter() {
                    override fun onCreateSuccess(description: SessionDescription) {
                        connection.setLocalDescription(object : SdpObserverAdapter() {
                            override fun onSetSuccess() {
                                sendSignal(JSONObject()
                                    .put("type", "answer")
                                    .put("to", viewer)
                                    .put("sdp", JSONObject().put("type", "answer").put("sdp", description.description)))
                            }
                        }, description)
                    }
                }, MediaConstraints())
            }

            override fun onSetFailure(error: String) = onState("Viewer negotiation failed: $error")
        }, SessionDescription(SessionDescription.Type.OFFER, sdp))
    }

    private fun createPeer(viewer: String): PeerConnection {
        val observer = object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                sendSignal(JSONObject()
                    .put("type", "ice")
                    .put("to", viewer)
                    .put("candidate", JSONObject()
                        .put("sdpMid", candidate.sdpMid)
                        .put("sdpMLineIndex", candidate.sdpMLineIndex)
                        .put("candidate", candidate.sdp)))
            }

            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                onState("Viewer $viewer: ${newState.name.lowercase()}")
                if (newState == PeerConnection.PeerConnectionState.FAILED || newState == PeerConnection.PeerConnectionState.CLOSED) closePeer(viewer)
            }

            override fun onSignalingChange(state: PeerConnection.SignalingState) = Unit
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) = Unit
            override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) = Unit
            override fun onAddStream(stream: org.webrtc.MediaStream) = Unit
            override fun onRemoveStream(stream: org.webrtc.MediaStream) = Unit
            override fun onAddTrack(receiver: org.webrtc.RtpReceiver?, mediaStreams: Array<out org.webrtc.MediaStream>?) = Unit
            override fun onDataChannel(channel: org.webrtc.DataChannel) = Unit
            override fun onRenegotiationNeeded() = Unit
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
            override fun onSelectedCandidatePairChanged(event: org.webrtc.CandidatePairChangeEvent) = Unit
        }
        val connection = requireNotNull(factory.createPeerConnection(configuration, observer))
        connection.addTrack(videoTrack, listOf("android-broadcast"))
        connection.addTrack(audioTrack, listOf("android-broadcast"))
        peerConnections[viewer] = connection
        return connection
    }

    private fun closePeer(viewer: String) {
        peerConnections.remove(viewer)?.close()
        remoteDescriptions.remove(viewer)
        pendingCandidates.remove(viewer)
    }

    fun close() {
        if (closed) return
        closed = true
        peerConnections.values.forEach { it.close() }
        peerConnections.clear()
        pendingCandidates.clear()
        remoteDescriptions.clear()
        if (::cameraCapturer.isInitialized) runCatching { cameraCapturer.stopCapture() }
        if (::cameraCapturer.isInitialized) runCatching { cameraCapturer.dispose() }
        if (::surfaceTextureHelper.isInitialized) surfaceTextureHelper.dispose()
        if (::videoSource.isInitialized) videoSource.dispose()
        runCatching { factory.dispose() }
        eglBase.release()
    }

    private open class SdpObserverAdapter : SdpObserver {
        override fun onCreateSuccess(description: SessionDescription) = Unit
        override fun onSetSuccess() = Unit
        override fun onCreateFailure(error: String) = Unit
        override fun onSetFailure(error: String) = Unit
    }
}
