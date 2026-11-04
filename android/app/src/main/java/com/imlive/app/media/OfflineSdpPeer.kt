package com.imlive.app.media

import org.json.JSONObject
import java.security.SecureRandom

/**
 * Native Kotlin implementation of the `imlive-offline-webrtc` v1 protocol from
 * `src/lib/offlinePeer.ts`.
 *
 * Allows 100% offline Android ↔ Browser and Android ↔ Android streaming over any
 * local Wi-Fi or hotspot by exchanging a self-contained non-trickle SDP bundle
 * (via copy/paste, Nearby Share, QR, or local chat) with zero Worker/STUN/TURN traffic.
 */
object OfflineSdpProtocol {
    const val PROTOCOL = "imlive-offline-webrtc"
    const val VERSION = 1
    const val MAX_SIGNAL_CHARS = 200_000
    private const val ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    private val ROOM_CODE_REGEX = Regex("^[A-Z0-9]{4,12}$")
    private val random = SecureRandom()

    data class OfflineSignalBundle(
        val protocol: String = PROTOCOL,
        val version: Int = VERSION,
        val type: String, // "offer" | "answer"
        val roomCode: String,
        val sdp: String,
    )

    fun createRoomCode(length: Int = 6): String =
        buildString(length) {
            repeat(length) {
                append(ALPHABET[random.nextInt(ALPHABET.length)])
            }
        }

    fun normalizeRoomCode(raw: String): String =
        raw.replace(Regex("[^A-Za-z0-9]"), "").uppercase().take(12)

    fun validateRoomCode(raw: String): String {
        val normalized = normalizeRoomCode(raw)
        require(ROOM_CODE_REGEX.matches(normalized)) {
            "Use a room code containing 4 to 12 letters or numbers."
        }
        return normalized
    }

    fun encode(bundle: OfflineSignalBundle): String {
        val code = validateRoomCode(bundle.roomCode)
        require(bundle.type == "offer" || bundle.type == "answer") {
            "Signal type must be offer or answer."
        }
        require(bundle.sdp.length >= 20) {
            "The device did not produce a usable WebRTC SDP description."
        }
        return JSONObject()
            .put("protocol", PROTOCOL)
            .put("version", VERSION)
            .put("type", bundle.type)
            .put("roomCode", code)
            .put("sdp", bundle.sdp)
            .toString()
    }

    fun decode(raw: String): OfflineSignalBundle {
        val trimmed = raw.trim()
        require(trimmed.isNotEmpty()) { "Paste the other device's signalling bundle first." }
        require(trimmed.length <= MAX_SIGNAL_CHARS) { "That signalling bundle is too large to be valid." }

        val json = try {
            JSONObject(trimmed)
        } catch (_: Exception) {
            throw IllegalArgumentException("That bundle is not valid JSON. Copy the complete offer or answer.")
        }

        require(json.optString("protocol") == PROTOCOL && json.optInt("version", -1) == VERSION) {
            "This bundle was made by a different offline room version."
        }
        val type = json.optString("type")
        require(type == "offer" || type == "answer") {
            "The bundle must be an offer or an answer."
        }
        val roomCode = validateRoomCode(json.optString("roomCode"))
        val sdp = json.optString("sdp")
        require(sdp.length >= 20) {
            "The bundle does not contain a usable SDP description."
        }
        return OfflineSignalBundle(
            protocol = PROTOCOL,
            version = VERSION,
            type = type,
            roomCode = roomCode,
            sdp = sdp,
        )
    }

    fun assertRoomMatches(bundle: OfflineSignalBundle, expectedRoomCode: String) {
        val expected = validateRoomCode(expectedRoomCode)
        require(bundle.roomCode == expected) {
            "The room codes do not match (${bundle.roomCode} vs $expected)."
        }
    }
}
