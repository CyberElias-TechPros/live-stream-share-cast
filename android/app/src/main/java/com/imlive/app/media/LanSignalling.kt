package com.imlive.app.media

import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.util.Collections
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

/** Connection details that can be shared manually with another device on the LAN. */
data class LanRoomInfo(
    val hostAddress: String,
    val port: Int,
    val roomCode: String,
    val title: String = "LAN broadcast",
)

/** Stable machine-readable values shared by the Android local UI and tests. */
object LanSignallingContract {
    const val ERROR_TYPE = "error"
    const val P2P_CAPACITY = "p2p_capacity"
    const val MAX_VIEWERS = 8
}

private const val MAX_LAN_FRAME_BYTES = 64 * 1024
private const val MAX_ROOM_CODE_LENGTH = 64
private const val MAX_PEER_ID_LENGTH = 100
private const val MAX_LAN_VIEWERS = LanSignallingContract.MAX_VIEWERS
private const val LAN_HOST_PEER_ID = "lan-host"
private val PEER_ID_PATTERN = Regex("^[A-Za-z0-9._:-]{1,$MAX_PEER_ID_LENGTH}$")

/**
 * Minimal local signalling transport for Android-to-Android LAN broadcasts.
 *
 * This is deliberately a newline-delimited JSON protocol rather than a second
 * WebRTC implementation. The existing WebRtcBroadcasterSession and
 * WebRtcViewerSession continue to own SDP/ICE; this class only moves those
 * bounded signalling frames over a TCP socket on the same WLAN.
 */
class LanSignalServer(
    private val roomCode: String,
    private val onFrame: (JSONObject) -> Unit,
    private val onStatus: (String) -> Unit = {},
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val peers = ConcurrentHashMap<String, LanPeer>()
    private var serverSocket: ServerSocket? = null
    @Volatile private var stopped = false

    fun start(title: String = "LAN broadcast"): LanRoomInfo {
        require(roomCode.length in 4..MAX_ROOM_CODE_LENGTH) { "Invalid LAN room code" }
        check(serverSocket == null) { "LAN signalling server already started" }

        val socket = ServerSocket()
        socket.reuseAddress = true
        socket.bind(InetSocketAddress("0.0.0.0", 0))
        serverSocket = socket
        stopped = false
        scope.launch { acceptLoop(socket) }

        val address = localIpv4Address()
            ?: throw IllegalStateException("This device has no usable IPv4 LAN address")
        onStatus("LAN room ready at $address:${socket.localPort}")
        return LanRoomInfo(address, socket.localPort, roomCode, title)
    }

    fun send(frame: JSONObject) {
        if (stopped) return
        val outgoing = JSONObject(frame.toString())
            .put("from", LAN_HOST_PEER_ID)
            .put("role", "host")
        val target = outgoing.optString("to").takeIf { it.isNotBlank() }
        if (target != null) {
            peers[target]?.send(outgoing)
        } else {
            peers.values.forEach { it.send(outgoing) }
        }
    }

    fun stop() {
        if (stopped) return
        stopped = true
        try {
            serverSocket?.close()
        } catch (_: Exception) {
            // The accept loop will exit after the close.
        }
        serverSocket = null
        peers.values.forEach { it.close() }
        peers.clear()
        scope.cancel()
    }

    private suspend fun acceptLoop(socket: ServerSocket) {
        while (!stopped) {
            try {
                val client = socket.accept()
                scope.launch { handlePeer(client) }
            } catch (_: SocketException) {
                if (!stopped) onStatus("LAN signalling stopped unexpectedly")
                return
            } catch (error: Exception) {
                if (!stopped) onStatus(error.message ?: "Could not accept a LAN viewer")
            }
        }
    }

    private fun handlePeer(socket: Socket) {
        socket.use { client ->
            client.soTimeout = 10_000
            val reader = BufferedReader(InputStreamReader(client.getInputStream(), Charsets.UTF_8))
            val writer = BufferedWriter(OutputStreamWriter(client.getOutputStream(), Charsets.UTF_8))
            val hello = readFrame(reader) ?: return
            client.soTimeout = 0
            if (hello.optString("type") != "hello-viewer" || hello.optString("roomCode") != roomCode) {
                sendRaw(writer, JSONObject().put("type", "error").put("code", "lan_room_rejected").put("error", "Invalid LAN room code"))
                return
            }

            val peerId = hello.optString("from").takeIf { PEER_ID_PATTERN.matches(it) }
                ?: "viewer-${UUID.randomUUID()}"
            val peer = LanPeer(peerId, client, writer)
            if (peers.size >= MAX_LAN_VIEWERS && !peers.containsKey(peerId)) {
                peer.send(JSONObject().put("type", LanSignallingContract.ERROR_TYPE).put("code", LanSignallingContract.P2P_CAPACITY).put("maxViewers", MAX_LAN_VIEWERS).put("error", "This LAN broadcast has reached its $MAX_LAN_VIEWERS-viewer limit"))
                return
            }
            if (peers.putIfAbsent(peerId, peer) != null) {
                peer.send(JSONObject().put("type", "error").put("code", "lan_peer_exists").put("error", "That viewer is already connected"))
                return
            }

            peer.send(
                JSONObject()
                    .put("type", "welcome")
                    .put("id", LAN_HOST_PEER_ID)
                    .put("role", "host")
                    .put("roomCode", roomCode),
            )
            onStatus("LAN viewer connected")
            onFrame(
                JSONObject(hello.toString())
                    .put("from", peerId)
                    .put("role", "viewer"),
            )

            try {
                while (!stopped) {
                    val frame = readFrame(reader) ?: break
                    val type = frame.optString("type")
                    if (type == "close") break
                    if (type !in setOf("offer", "ice", "quality", "hello-viewer", "ping")) {
                        peer.send(JSONObject().put("type", "error").put("code", "invalid_frame_type").put("error", "Unsupported LAN signalling frame"))
                        continue
                    }
                    val stamped = JSONObject(frame.toString())
                        .put("from", peerId)
                        .put("role", "viewer")
                    onFrame(stamped)
                }
            } finally {
                peers.remove(peerId, peer)
                onFrame(JSONObject().put("type", "peer-left").put("from", peerId).put("role", "viewer"))
                onStatus("LAN viewer disconnected")
            }
        }
    }

    private fun localIpv4Address(): String? {
        return try {
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
            interfaces.asSequence()
                .filter { it.isUp && !it.isLoopback && !it.isVirtual }
                .flatMap { Collections.list(it.inetAddresses).asSequence() }
                .filterIsInstance<Inet4Address>()
                .map(InetAddress::getHostAddress)
                .filter { address ->
                    address != "127.0.0.1" && !address.startsWith("169.254.")
                }
                .sortedWith(compareBy<String> { !isPrivateLanAddress(it) }.thenBy { it })
                .firstOrNull()
        } catch (_: Exception) {
            null
        }
    }

    private class LanPeer(
        val id: String,
        private val socket: Socket,
        private val writer: BufferedWriter,
    ) {
        @Synchronized
        fun send(frame: JSONObject) {
            runCatching { sendRaw(writer, frame) }
        }

        fun close() {
            runCatching { socket.close() }
        }
    }
}

/** Android viewer-side client for a LanSignalServer. */
class LanSignalClient(
    private val room: LanRoomInfo,
    private val peerId: String,
    private val onFrame: (JSONObject) -> Unit,
    private val onError: (String) -> Unit,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var socket: Socket? = null
    private var writer: BufferedWriter? = null
    @Volatile private var stopped = false

    fun connect() {
        if (stopped) return
        scope.launch {
            try {
                val client = Socket()
                client.connect(InetSocketAddress(room.hostAddress, room.port), 5_000)
                socket = client
                val output = BufferedWriter(OutputStreamWriter(client.getOutputStream(), Charsets.UTF_8))
                writer = output
                sendRaw(
                    output,
                    JSONObject()
                        .put("type", "hello-viewer")
                        .put("from", peerId)
                        .put("role", "viewer")
                        .put("roomCode", room.roomCode),
                )
                val reader = BufferedReader(InputStreamReader(client.getInputStream(), Charsets.UTF_8))
                while (!stopped) {
                    val frame = readFrame(reader) ?: break
                    onFrame(frame)
                }
                if (!stopped) onError("The LAN broadcaster disconnected")
            } catch (error: Exception) {
                if (!stopped) onError(error.message ?: "Could not connect to the LAN broadcaster")
            } finally {
                runCatching { socket?.close() }
                socket = null
                writer = null
            }
        }
    }

    @Synchronized
    fun send(frame: JSONObject) {
        val output = writer ?: return
        val outgoing = JSONObject(frame.toString())
            .put("from", peerId)
            .put("role", "viewer")
        runCatching { sendRaw(output, outgoing) }
            .onFailure { if (!stopped) onError("LAN signalling send failed") }
    }

    fun close() {
        if (stopped) return
        stopped = true
        runCatching {
            writer?.let { sendRaw(it, JSONObject().put("type", "close").put("from", peerId).put("role", "viewer")) }
        }
        runCatching { socket?.close() }
        socket = null
        writer = null
        scope.cancel()
    }
}

private fun readFrame(reader: BufferedReader): JSONObject? {
    val line = StringBuilder()
    var terminatedByNewline = false
    while (true) {
        val next = reader.read()
        if (next == -1) break
        if (next == '\n'.code) {
            terminatedByNewline = true
            break
        }
        if (next != '\r'.code) {
            if (line.length >= MAX_LAN_FRAME_BYTES) return null
            line.append(next.toChar())
        }
    }
    if (!terminatedByNewline) return null
    if (line.toString().toByteArray(Charsets.UTF_8).size > MAX_LAN_FRAME_BYTES) return null
    return runCatching { JSONObject(line.toString()) }.getOrNull()
}

private fun isPrivateLanAddress(address: String): Boolean {
    val octets = address.split('.').mapNotNull { it.toIntOrNull() }
    if (octets.size != 4) return false
    return octets[0] == 10 ||
        (octets[0] == 192 && octets[1] == 168) ||
        (octets[0] == 172 && octets[1] in 16..31)
}

private fun sendRaw(writer: BufferedWriter, frame: JSONObject) {
    writer.write(frame.toString())
    writer.newLine()
    writer.flush()
}