package com.imlive.app.media

import com.imlive.app.BuildConfig
import com.imlive.app.network.EndpointUrlRules
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.ConcurrentLinkedDeque
import java.util.concurrent.TimeUnit
import kotlin.math.min

/**
 * Resilient ticket-authenticated WebRTC signalling socket sharing the exact
 * JSON frame protocol as web `lanStream.ts` and Cloudflare `SignalRoom`.
 *
 * Includes:
 * - bounded outbox queue while connecting/reconnecting;
 * - exponential backoff reconnect minting a fresh single-use ticket each attempt;
 * - periodic 25s ping keepalive;
 * - terminal halt on `p2p_capacity` so full rooms never spin-loop tickets.
 */
class SignallingClient(
    private val streamId: String,
    initialTicket: String,
    private val role: String,
    private val peerId: String,
    private val onFrame: (JSONObject) -> Unit,
    private val onClosed: (String) -> Unit,
    private val apiBaseUrl: String = BuildConfig.API_BASE_URL,
    private val refreshTicket: (suspend () -> String?)? = null,
    private val onReconnected: () -> Unit = {},
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val outbox = ConcurrentLinkedDeque<String>()

    @Volatile private var socket: WebSocket? = null
    @Volatile private var open = false
    @Volatile private var manuallyClosed = false
    @Volatile private var terminalError = false
    private var currentTicket = initialTicket
    private var reconnectJob: Job? = null
    private var pingJob: Job? = null
    private var retryCount = 0

    @Synchronized
    fun connect() {
        if (manuallyClosed || terminalError || socket != null) return
        openWithTicket(currentTicket, isReconnect = false)
    }

    private fun openWithTicket(ticket: String, isReconnect: Boolean) {
        if (manuallyClosed || terminalError || socket != null) return
        val wsBase = EndpointUrlRules.toWebSocketBaseUrl(apiBaseUrl)
        val encodedTicket = URLEncoder.encode(ticket, "UTF-8")
        val encodedPeer = URLEncoder.encode(peerId, "UTF-8")
        val url = "$wsBase/ws/signal/$streamId?role=$role&peerId=$encodedPeer&ticket=$encodedTicket"

        socket = client.newWebSocket(
            Request.Builder().url(url).build(),
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    if (manuallyClosed) {
                        webSocket.close(1000, "client closed")
                        return
                    }
                    retryCount = 0
                    open = true
                    flushOutbox(webSocket)
                    startKeepalive(webSocket)
                    if (isReconnect) onReconnected()
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    val frame = runCatching { JSONObject(text) }.getOrNull() ?: return
                    val from = frame.optString("from")
                    if (from == peerId) return
                    val to = frame.optString("to")
                    if (to.isNotBlank() && to != peerId) return

                    if (frame.optString("type") == "error" && frame.optString("code") == "p2p_capacity") {
                        terminalError = true
                    }
                    onFrame(frame)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    handleDisconnect(webSocket, t.message ?: "Signalling connection interrupted")
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    handleDisconnect(webSocket, reason.ifBlank { "Signalling closed ($code)" })
                }
            },
        )
    }

    private fun handleDisconnect(closedSocket: WebSocket, message: String) {
        synchronized(this) {
            if (socket === closedSocket) {
                socket = null
                open = false
            }
        }
        pingJob?.cancel()
        if (manuallyClosed || terminalError) {
            if (!manuallyClosed) onClosed(message)
            return
        }
        if (refreshTicket == null) {
            onClosed(message)
            return
        }
        onClosed("Reconnecting signalling…")
        scheduleReconnect()
    }

    private fun scheduleReconnect() {
        if (manuallyClosed || terminalError || reconnectJob?.isActive == true) return
        reconnectJob = scope.launch {
            while (isActive && !manuallyClosed && !terminalError) {
                retryCount = min(retryCount + 1, 6)
                val waitMs = min(1_000L * (1L shl (retryCount - 1)), 20_000L)
                delay(waitMs)
                if (manuallyClosed || terminalError) return@launch
                val nextTicket = runCatching { refreshTicket?.invoke() }.getOrNull()
                if (nextTicket.isNullOrBlank()) continue
                currentTicket = nextTicket
                openWithTicket(nextTicket, isReconnect = true)
                return@launch
            }
        }
    }

    private fun startKeepalive(ws: WebSocket) {
        pingJob?.cancel()
        pingJob = scope.launch {
            while (isActive && open && socket === ws) {
                delay(25_000L)
                if (open && socket === ws) {
                    ws.send(JSONObject().put("type", "ping").toString())
                }
            }
        }
    }

    private fun flushOutbox(ws: WebSocket) {
        while (open) {
            val next = outbox.pollFirst() ?: break
            ws.send(next)
        }
    }

    fun send(frame: JSONObject) {
        if (manuallyClosed || terminalError) return
        val serialized = frame.toString()
        val activeSocket = socket
        if (open && activeSocket != null && activeSocket.send(serialized)) {
            return
        }
        while (outbox.size >= 50) outbox.pollFirst()
        outbox.offerLast(serialized)
    }

    fun close() {
        manuallyClosed = true
        open = false
        reconnectJob?.cancel()
        pingJob?.cancel()
        outbox.clear()
        socket?.close(1000, "client closed")
        socket = null
        scope.cancel()
        client.dispatcher.executorService.shutdown()
    }
}
