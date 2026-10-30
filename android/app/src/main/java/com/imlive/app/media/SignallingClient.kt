package com.imlive.app.media

import com.imlive.app.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

/** Uses the same one-use ticket + JSON frame protocol as web `lanStream.ts`. */
class SignallingClient(
    private val streamId: String,
    private val ticket: String,
    private val role: String,
    private val peerId: String,
    private val onFrame: (JSONObject) -> Unit,
    private val onClosed: (String) -> Unit,
) {
    private val client = OkHttpClient()
    private var socket: WebSocket? = null

    fun connect() {
        val base = BuildConfig.API_BASE_URL.trimEnd('/')
            .replaceFirst("https://", "wss://")
            .replaceFirst("http://", "ws://")
        val url = "$base/ws/signal/$streamId?role=$role&peerId=$peerId&ticket=${java.net.URLEncoder.encode(ticket, "UTF-8")}"
        socket = client.newWebSocket(
            Request.Builder().url(url).build(),
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) {
                    runCatching { onFrame(JSONObject(text)) }
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    onClosed(t.message ?: "Signalling connection failed")
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    onClosed(reason.ifBlank { "Signalling connection closed ($code)" })
                }
            },
        )
    }

    fun send(frame: JSONObject) {
        socket?.send(frame.toString())
    }

    fun close() {
        socket?.close(1000, "client closed")
        socket = null
        client.dispatcher.executorService.shutdown()
    }
}
