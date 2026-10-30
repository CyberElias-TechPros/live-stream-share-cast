package com.imlive.app.media

import android.content.Context
import android.media.AudioManager
import org.json.JSONObject
import org.webrtc.AudioTrack
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpTransceiver
import org.webrtc.SessionDescription
import org.webrtc.VideoTrack

/** Native viewer peer connection for the Worker signalling contract. */
class WebRtcViewerSession(
    context: Context,
    iceServers: List<PeerConnection.IceServer> = emptyList(),
    private val sendSignal: (JSONObject) -> Unit,
    private val onVideo: (VideoTrack) -> Unit,
    private val onAudio: (AudioTrack) -> Unit,
    private val onState: (PeerConnection.PeerConnectionState) -> Unit,
) {
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private lateinit var factory: PeerConnectionFactory
    private lateinit var connection: PeerConnection
    private var remoteDescriptionSet = false
    private val pendingCandidates = mutableListOf<IceCandidate>()
    private val previousAudioMode = audioManager.mode
    private val previousSpeakerphone = audioManager.isSpeakerphoneOn

    private val observer = object : PeerConnection.Observer {
        override fun onIceCandidate(candidate: IceCandidate) {
            sendSignal(JSONObject()
                .put("type", "ice")
                .put("candidate", JSONObject()
                    .put("sdpMid", candidate.sdpMid)
                    .put("sdpMLineIndex", candidate.sdpMLineIndex)
                    .put("candidate", candidate.sdp)))
        }

        override fun onTrack(transceiver: RtpTransceiver) {
            when (val track = transceiver.receiver.track()) {
                is VideoTrack -> {
                    track.setEnabled(true)
                    onVideo(track)
                }
                is AudioTrack -> {
                    track.setEnabled(true)
                    onAudio(track)
                }
            }
        }

        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) = onState(newState)
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

    init {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions(),
        )
        factory = PeerConnectionFactory.builder().createPeerConnectionFactory()
        val configuration = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        }
        connection = requireNotNull(factory.createPeerConnection(configuration, observer))
        connection.addTransceiver(
            org.webrtc.MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY),
        )
        connection.addTransceiver(
            org.webrtc.MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY),
        )
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager.isSpeakerphoneOn = true
    }

    fun createOffer() {
        connection.createOffer(object : SdpCallback() {
            override fun onCreateSuccess(description: SessionDescription) {
                connection.setLocalDescription(SdpCallback(), description)
                sendSignal(JSONObject()
                    .put("type", "offer")
                    .put("sdp", JSONObject().put("type", "offer").put("sdp", description.description)))
            }
        }, MediaConstraints())
    }

    fun accept(frame: JSONObject) {
        when (frame.optString("type")) {
            "answer" -> {
                val sdp = frame.optJSONObject("sdp") ?: return
                connection.setRemoteDescription(object : SdpCallback() {
                    override fun onSetSuccess() {
                        remoteDescriptionSet = true
                        pendingCandidates.forEach { connection.addIceCandidate(it) }
                        pendingCandidates.clear()
                    }
                }, SessionDescription(SessionDescription.Type.ANSWER, sdp.optString("sdp")))
            }
            "ice" -> {
                val candidate = frame.optJSONObject("candidate") ?: return
                val ice = IceCandidate(
                    candidate.optString("sdpMid"),
                    candidate.optInt("sdpMLineIndex"),
                    candidate.optString("candidate"),
                )
                if (remoteDescriptionSet) connection.addIceCandidate(ice) else pendingCandidates += ice
            }
        }
    }

    fun close() {
        pendingCandidates.clear()
        runCatching { connection.close() }
        runCatching { factory.dispose() }
        audioManager.mode = previousAudioMode
        audioManager.isSpeakerphoneOn = previousSpeakerphone
    }

    private open class SdpCallback : org.webrtc.SdpObserver {
        override fun onCreateSuccess(description: SessionDescription) = Unit
        override fun onSetSuccess() = Unit
        override fun onCreateFailure(error: String) = Unit
        override fun onSetFailure(error: String) = Unit
    }
}
