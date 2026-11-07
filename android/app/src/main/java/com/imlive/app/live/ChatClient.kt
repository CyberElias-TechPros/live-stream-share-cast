package com.imlive.app.live

import com.imlive.app.BuildConfig
import com.imlive.app.model.ChatMessage
import com.imlive.app.network.EndpointUrlRules
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlin.math.min

enum class ChatConnectionState { CONNECTING, CONNECTED, ACTIVE, RECONNECTING, CLOSED }

/**
 * Ticket-authenticated live chat & presence client using the Worker ChatRoom protocol.
 *
 * Supports both `viewer` and `host` roles, real-time presence updates, live
 * message moderation events (`hide`/`restore`), typing indicators, stream offline
 * notifications, and fresh single-use ticket minting on reconnect.
 */
class ChatClient(
    private val streamId: String,
    initialTicket: String,
    private val onMessage: (ChatMessage) -> Unit,
    private val onError: (String) -> Unit,
    private val refreshTicket: (suspend () -> String?)? = null,
    private val onState: (ChatConnectionState) -> Unit = {},
    private val role: String = "viewer",
    private val apiBaseUrl: String = BuildConfig.API_BASE_URL,
    private val onPresence: (viewers: Int, hostConnected: Boolean) -> Unit = { _, _ -> },
    private val onModeration: (messageId: String, isModerated: Boolean) -> Unit = { _, _ -> },
    private val onTyping: (username: String) -> Unit = {},
    private val onStreamOffline: () -> Unit = {},
) {
    private val http = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()
    private val reconnectScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var currentTicket = initialTicket
    private var socket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var hostHeartbeatJob: Job? = null
    private var reconnectAttempt = 0
    @Volatile private var manuallyClosed = false

    @Synchronized
    fun connect() {
        if (manuallyClosed || socket != null) return
        openSocket(currentTicket)
    }

    private fun openSocket(ticket: String) {
        if (manuallyClosed || socket != null) return
        val base = EndpointUrlRules.toWebSocketBaseUrl(apiBaseUrl)
        val encodedTicket = URLEncoder.encode(ticket, "UTF-8")
        val url = "$base/ws/chat/$streamId?role=$role&ticket=$encodedTicket"
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
                    if (role == "host") startHostSocketHeartbeat(webSocket)
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    runCatching {
                        val frame = JSONObject(text)
                        when (frame.optString("type")) {
                            "chat" -> frame.optJSONObject("message")?.let { onMessage(ChatMessage.from(it)) }
                            "typing" -> {
                                onState(ChatConnectionState.ACTIVE)
                                val who = frame.optString("username").takeIf { it.isNotBlank() }
                                if (who != null) onTyping(who)
                            }
                            "ready", "presence" -> {
                                onState(ChatConnectionState.ACTIVE)
                                onPresence(
                                    frame.optInt("viewers", 0),
                                    frame.optBoolean("hostConnected", false),
                                )
                            }
                            "moderation" -> {
                                val msgId = frame.optString("messageId")
                                if (msgId.isNotBlank()) {
                                    onModeration(msgId, frame.optBoolean("isModerated", false))
                                }
                            }
                            "stream" -> {
                                onState(ChatConnectionState.ACTIVE)
                                if (frame.optString("status") == "offline") {
                                    onStreamOffline()
                                }
                            }
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

    private fun startHostSocketHeartbeat(ws: WebSocket) {
        hostHeartbeatJob?.cancel()
        hostHeartbeatJob = reconnectScope.launch {
            while (!manuallyClosed && socket === ws) {
                delay(25_000L)
                if (!manuallyClosed && socket === ws) {
                    ws.send(JSONObject().put("type", "heartbeat").toString())
                }
            }
        }
    }

    private fun clearSocket(closedSocket: WebSocket) {
        synchronized(this) {
            if (socket === closedSocket) socket = null
        }
        hostHeartbeatJob?.cancel()
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

    fun sendTyping() {
        if (manuallyClosed) return
        socket?.send(JSONObject().put("type", "typing").toString())
    }

    fun moderate(messageId: String, isModerated: Boolean): Boolean {
        if (manuallyClosed || role != "host") return false
        val frame = JSONObject()
            .put("type", "moderate")
            .put("messageId", messageId)
            .put("isModerated", isModerated)
            .toString()
        return socket?.send(frame) == true
    }

    fun close() {
        manuallyClosed = true
        hostHeartbeatJob?.cancel()
        reconnectJob?.cancel()
        reconnectJob = null
        reconnectScope.coroutineContext.cancel()
        socket?.close(1000, "client closed")
        socket = null
        onState(ChatConnectionState.CLOSED)
        http.dispatcher.executorService.shutdown()
    }
}
