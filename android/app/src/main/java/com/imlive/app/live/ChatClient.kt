package com.imlive.app.live

import com.imlive.app.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.net.URLEncoder
import kotlin.math.min

/**
 * Ticket-authenticated live chat client using the Worker ChatRoom protocol.
 *
 * Chat is deliberately online-only: send() returns false while disconnected so
 * a user never sees a message that was only queued locally. The socket obtains
 * a fresh one-use ticket for every reconnect, then backs off up to 30 seconds.
 */
class ChatClient(
    private val streamId: String,
    initialTicket: String,
    private val onMessage: (ChatMessage) -> Unit,
    private val onError: (String) -> Unit,
    private val refreshTicket: (suspend () -> String?)? = null,
    private val onState: (ChatConnectionState) -> Unit = {},
) {
    private val http = OkHttpClient()
    private val reconnectScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var currentTicket = initialTicket
    private var socket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var reconnectAttempt = 0
    @Volatile private var manuallyClosed = false

    @Synchronized
    fun connect() {
        if (manuallyClosed || socket != null) return
        openSocket(currentTicket)
    }

    private fun openSocket(ticket: String) {
        if (manuallyClosed || socket != null) return
        val base = BuildConfig.API_BASE_URL.trimEnd('/')
            .replaceFirst("https://", "wss://")
            .replaceFirst("http://", "ws://")
        val encodedTicket = URLEncoder.encode(ticket, "UTF-8")
        val url = "$base/ws/chat/$streamId?role=viewer&ticket=$encodedTicket"
        onState(ChatConnectionState.CONNECTING)
        socket = http.newWebSocket(
            Request.Builder().url(url).build(),
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    if (manuallyClosed) {
                        webSocket.close(1000, "client closed")
                        return
                    }
                    reconnectAttempt = 0
                    onState(ChatConnectionState.CONNECTED)
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    runCatching {
                        val frame = JSONObject(text)
                        when (frame.optString("type")) {
                            "chat" -> frame.optJSONObject("message")?.let { onMessage(ChatMessage.from(it)) }
                            "typing" -> onState(ChatConnectionState.ACTIVE)
                            "ready", "presence", "stream" -> onState(ChatConnectionState.ACTIVE)
                            "error" -> {
                                val code = frame.optString("code").takeIf { it.isNotBlank() }
                                val message = frame.optString("error", "Chat is unavailable")
                                onError(if (code == null) message else "$message ($code)")
                            }
                        }
                    }.onFailure { onError("Chat returned an invalid message") }
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    clearSocket(webSocket)
                    if (!manuallyClosed) {
                        onState(ChatConnectionState.RECONNECTING)
                        onError(t.message ?: "Chat connection failed")
                        scheduleReconnect()
                    }
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    clearSocket(webSocket)
                    if (!manuallyClosed) {
                        onState(ChatConnectionState.RECONNECTING)
                        if (code != 1000) onError(reason.ifBlank { "Chat connection closed ($code)" })
                        scheduleReconnect()
                    }
                }
            },
        )
    }

    private fun clearSocket(closedSocket: WebSocket) {
        synchronized(this) {
            if (socket === closedSocket) socket = null
        }
    }

    private fun scheduleReconnect() {
        if (manuallyClosed || reconnectJob?.isActive == true) return
        reconnectJob = reconnectScope.launch {
            while (!manuallyClosed) {
                reconnectAttempt = min(reconnectAttempt + 1, 6)
                val delayMs = min(1_000L * (1L shl (reconnectAttempt - 1)), 30_000L)
                delay(delayMs)
                if (manuallyClosed) return@launch

                val nextTicket = refreshTicket?.invoke()
                if (refreshTicket != null && nextTicket.isNullOrBlank()) {
                    onError("Chat could not refresh its connection ticket")
                    continue
                }
                currentTicket = nextTicket ?: currentTicket
                openSocket(currentTicket)
                return@launch
            }
        }
    }

    /** Returns false when the socket is offline; callers should not clear UI input on false. */
    fun send(message: String): Boolean {
        val text = message.trim()
        if (text.isEmpty() || manuallyClosed) return false
        val frame = JSONObject().put("type", "chat").put("message", text).toString()
        return socket?.send(frame) == true
    }

    fun close() {
        manuallyClosed = true
        reconnectJob?.cancel()
        reconnectJob = null
        reconnectScope.coroutineContext.cancel()
        socket?.close(1000, "client closed")
        socket = null
        onState(ChatConnectionState.CLOSED)
        http.dispatcher.executorService.shutdown()
    }
}

enum class ChatConnectionState { CONNECTING, CONNECTED, ACTIVE, RECONNECTING, CLOSED }

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
