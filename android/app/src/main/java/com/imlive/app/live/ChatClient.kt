package com.imlive.app.live

import com.imlive.app.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.net.URLEncoder

/** Ticket-authenticated live chat client using the Worker ChatRoom protocol. */
class ChatClient(
    private val streamId: String,
    private val ticket: String,
    private val onMessage: (ChatMessage) -> Unit,
    private val onError: (String) -> Unit,
) {
    private val http = OkHttpClient()
    private var socket: WebSocket? = null

    fun connect() {
        val base = BuildConfig.API_BASE_URL.trimEnd('/')
            .replaceFirst("https://", "wss://")
            .replaceFirst("http://", "ws://")
        val encodedTicket = URLEncoder.encode(ticket, "UTF-8")
        val url = "$base/ws/chat/$streamId?role=viewer&ticket=$encodedTicket"
        socket = http.newWebSocket(
            Request.Builder().url(url).build(),
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) {
                    runCatching {
                        val frame = JSONObject(text)
                        when (frame.optString("type")) {
                            "chat" -> frame.optJSONObject("message")?.let { onMessage(ChatMessage.from(it)) }
                            "error" -> onError(frame.optString("error", "Chat is unavailable"))
                        }
                    }.onFailure { onError("Chat returned an invalid message") }
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    onError(t.message ?: "Chat connection failed")
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    if (code != 1000) onError(reason.ifBlank { "Chat connection closed" })
                }
            },
        )
    }

    fun send(message: String): Boolean = socket?.send(
        JSONObject().put("type", "chat").put("message", message.trim()).toString(),
    ) == true

    fun close() {
        socket?.close(1000, "client closed")
        socket = null
        http.dispatcher.executorService.shutdown()
    }
}

data class ChatMessage(
    val id: String,
    val username: String,
    val message: String,
    val createdAt: String?,
) {
    companion object {
        fun from(json: JSONObject) = ChatMessage(
            id = json.optString("id", java.util.UUID.randomUUID().toString()),
            username = json.optString("username").ifBlank { json.optString("displayName", "viewer") },
            message = json.optString("message"),
            createdAt = json.optString("createdAt").ifBlank { json.optString("timestamp") }.takeIf { it.isNotBlank() },
        )
    }
}
