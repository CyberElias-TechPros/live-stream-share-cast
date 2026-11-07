package com.imlive.app.media

import android.content.Context
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.view.Surface
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.webrtc.EglBase
import org.webrtc.EglRenderer
import org.webrtc.GlRectDrawer
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import org.webrtc.VideoTrack
import java.io.File

data class CompletedLocalRecording(
    val file: File,
    val durationSeconds: Int,
    val sizeBytes: Long,
)

/**
 * Hardware GPU H.264 `.mp4` live broadcast recorder.
 *
 * Attaches directly to the active WebRTC `VideoTrack` as a `VideoSink` using
 * `EglRenderer` + `EglBase.CONFIG_RECORDABLE` + `MediaCodec.createInputSurface()`
 * + `MediaMuxer`, avoiding a second Camera2 open and avoiding CPU YUV copies.
 * Bounded to 256 MB per recording file to protect device storage.
 */
class NativeStreamRecorder(
    context: Context,
    private val width: Int = 1280,
    private val height: Int = 720,
    private val fps: Int = 30,
    private val bitrateBps: Int = 2_200_000,
) : VideoSink {
    private val recordingsDir = File(context.applicationContext.cacheDir, "recordings").apply { mkdirs() }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private var encoder: MediaCodec? = null
    private var inputSurface: Surface? = null
    private var eglRenderer: EglRenderer? = null
    private var muxer: MediaMuxer? = null
    private var attachedTrack: VideoTrack? = null
    private var drainJob: Job? = null
    private var outputFile: File? = null
    private var startedAtMs: Long = 0L

    @Volatile private var recording = false
    @Volatile private var muxerStarted = false
    private var videoTrackIndex = -1

    fun start(videoTrack: VideoTrack): Result<File> = runCatching {
        check(!recording) { "Recording is already active" }
        val file = File(recordingsDir, "imlive-broadcast-${System.currentTimeMillis()}.mp4")
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, bitrateBps)
            setInteger(MediaFormat.KEY_FRAME_RATE, fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
        }

        val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        val surface = codec.createInputSurface()
        codec.start()

        val mediaMuxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        val renderer = EglRenderer("imlive-mp4-recorder")
        renderer.init(WebRtcEngine.eglBase().eglBaseContext, EglBase.CONFIG_RECORDABLE, GlRectDrawer())
        renderer.createEglSurface(surface)

        encoder = codec
        inputSurface = surface
        muxer = mediaMuxer
        eglRenderer = renderer
        outputFile = file
        attachedTrack = videoTrack
        muxerStarted = false
        videoTrackIndex = -1
        startedAtMs = System.currentTimeMillis()
        recording = true

        videoTrack.addSink(this)
        drainJob = scope.launch { drainLoop(codec, mediaMuxer, file) }
        file
    }

    override fun onFrame(frame: VideoFrame) {
        if (!recording) return
        val file = outputFile
        if (file != null && file.length() > MAX_RECORDING_BYTES) return
        runCatching { eglRenderer?.onFrame(frame) }
    }

    private fun drainLoop(codec: MediaCodec, mediaMuxer: MediaMuxer, file: File) {
        val info = MediaCodec.BufferInfo()
        while (recording) {
            val outIndex = runCatching { codec.dequeueOutputBuffer(info, 15_000L) }.getOrDefault(-1)
            when {
                outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    if (!muxerStarted) {
                        videoTrackIndex = mediaMuxer.addTrack(codec.outputFormat)
                        mediaMuxer.start()
                        muxerStarted = true
                    }
                }
                outIndex >= 0 -> {
                    val encodedData = codec.getOutputBuffer(outIndex)
                    if (encodedData != null && info.size > 0 && muxerStarted &&
                        (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0 &&
                        file.length() < MAX_RECORDING_BYTES
                    ) {
                        encodedData.position(info.offset)
                        encodedData.limit(info.offset + info.size)
                        runCatching { mediaMuxer.writeSampleData(videoTrackIndex, encodedData, info) }
                    }
                    runCatching { codec.releaseOutputBuffer(outIndex, false) }
                    if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) break
                }
            }
        }
    }

    suspend fun stop(): CompletedLocalRecording? {
        if (!recording) return null
        recording = false
        runCatching { attachedTrack?.removeSink(this) }
        attachedTrack = null
        runCatching { encoder?.signalEndOfInputStream() }
        drainJob?.join()
        drainJob = null

        runCatching { eglRenderer?.release() }
        eglRenderer = null
        runCatching { inputSurface?.release() }
        inputSurface = null
        runCatching {
            encoder?.stop()
            encoder?.release()
        }
        encoder = null
        runCatching {
            if (muxerStarted) muxer?.stop()
            muxer?.release()
        }
        muxer = null
        scope.cancel()

        val file = outputFile ?: return null
        val durationSec = ((System.currentTimeMillis() - startedAtMs) / 1000L).toInt().coerceAtLeast(1)
        return if (file.exists() && file.length() > 0L) {
            CompletedLocalRecording(file = file, durationSeconds = durationSec, sizeBytes = file.length())
        } else {
            runCatching { file.delete() }
            null
        }
    }

    private companion object {
        const val MAX_RECORDING_BYTES = 256L * 1024L * 1024L
    }
}
