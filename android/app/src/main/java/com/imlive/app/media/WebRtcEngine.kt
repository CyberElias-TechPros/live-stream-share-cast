package com.imlive.app.media

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import com.imlive.app.model.IceServerConfig
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.audio.JavaAudioDeviceModule

/**
 * Process-wide native WebRTC hardware engine.
 *
 * Sharing a single EglBase context and PeerConnectionFactory configured with
 * DefaultVideoEncoderFactory, DefaultVideoDecoderFactory, and JavaAudioDeviceModule
 * enables zero-copy hardware H.264/VP8/VP9 encoding/decoding, acoustic echo
 * cancellation, and noise suppression across viewer, broadcaster, and offline rooms.
 */
object WebRtcEngine {
    @Volatile
    private var sharedEglBase: EglBase? = null

    @Volatile
    private var sharedFactory: PeerConnectionFactory? = null

    @Synchronized
    fun eglBase(): EglBase {
        val current = sharedEglBase
        if (current != null) return current
        val created = EglBase.create()
        sharedEglBase = created
        return created
    }

    @Synchronized
    fun factory(context: Context): PeerConnectionFactory {
        val existing = sharedFactory
        if (existing != null) return existing

        val appContext = context.applicationContext
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(appContext)
                .setEnableInternalTracer(false)
                .createInitializationOptions(),
        )

        val eglContext = eglBase().eglBaseContext
        val audioModule = JavaAudioDeviceModule.builder(appContext)
            .setUseHardwareAcousticEchoCanceler(true)
            .setUseHardwareNoiseSuppressor(true)
            .createAudioDeviceModule()

        val encoderFactory = DefaultVideoEncoderFactory(
            eglContext,
            true,
            true,
        )
        val decoderFactory = DefaultVideoDecoderFactory(eglContext)

        val built = PeerConnectionFactory.builder()
            .setAudioDeviceModule(audioModule)
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()

        audioModule.release()
        sharedFactory = built
        return built
    }
}

class AudioRouteController(context: Context) {
    private val audioManager = context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val previousMode = audioManager.mode
    private val previousSpeaker = audioManager.isSpeakerphoneOn
    private var focusRequest: AudioFocusRequest? = null
    private var active = false

    fun acquire(forBroadcast: Boolean, speakerphone: Boolean = true) {
        if (!active) {
            val attributes = AudioAttributes.Builder()
                .setUsage(
                    if (forBroadcast) AudioAttributes.USAGE_VOICE_COMMUNICATION
                    else AudioAttributes.USAGE_MEDIA,
                )
                .setContentType(
                    if (forBroadcast) AudioAttributes.CONTENT_TYPE_SPEECH
                    else AudioAttributes.CONTENT_TYPE_MOVIE,
                )
                .build()
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attributes)
                .setOnAudioFocusChangeListener {}
                .build()
            focusRequest = req
            runCatching { audioManager.requestAudioFocus(req) }
            active = true
        }
        runCatching {
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = speakerphone
        }
    }

    fun setSpeakerphone(enabled: Boolean) {
        runCatching {
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = enabled
        }
    }

    fun release() {
        if (!active) return
        active = false
        focusRequest?.let { req -> runCatching { audioManager.abandonAudioFocusRequest(req) } }
        focusRequest = null
        runCatching {
            audioManager.mode = previousMode
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = previousSpeaker
        }
    }
}

fun List<IceServerConfig>.toNativeIceServers(): List<PeerConnection.IceServer> = flatMap { config ->
    config.urls.map { url ->
        val builder = PeerConnection.IceServer.builder(url)
        config.username?.let(builder::setUsername)
        config.credential?.let(builder::setPassword)
        builder.createIceServer()
    }
}
