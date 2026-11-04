package com.imlive.app

import com.imlive.app.media.LanRoomInfo
import com.imlive.app.media.LanSignalClient
import com.imlive.app.media.LanSignalServer
import com.imlive.app.media.LanSignallingContract
import com.imlive.app.media.OfflineSdpProtocol
import com.imlive.app.model.AccentTheme
import com.imlive.app.model.ChatMessage
import com.imlive.app.model.ChatRules
import com.imlive.app.model.IceServerConfig
import com.imlive.app.model.LiveStream
import com.imlive.app.model.Recording
import com.imlive.app.model.RtcConnectionDiagnostics
import com.imlive.app.model.RuntimePlatformConfig
import com.imlive.app.model.UserProfile
import com.imlive.app.model.VideoQualityPreset
import com.imlive.app.network.DeepLinkDestination
import com.imlive.app.network.EndpointUrlRules
import com.imlive.app.ui.components.formatDurationClock
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class ContractTest {
    @Test
    fun signallingErrorKeepsStableMachineCode() {
        assertEquals("error", LanSignallingContract.ERROR_TYPE)
        assertEquals("p2p_capacity", LanSignallingContract.P2P_CAPACITY)
        assertEquals(8, LanSignallingContract.MAX_VIEWERS)
        assertEquals("lan-chat", LanSignallingContract.LAN_CHAT_TYPE)
    }

    @Test
    fun endpointRulesNormalizeApiAndWebSocketAndMediaUrls() {
        val normalized = EndpointUrlRules.normalizeApiBaseUrl("https://live.example.com/")
        assertEquals("https://live.example.com/api", normalized)
        assertEquals("wss://live.example.com/api", EndpointUrlRules.toWebSocketBaseUrl(normalized))
        assertEquals("https://live.example.com", EndpointUrlRules.toOriginRootUrl(normalized))

        val localDev = EndpointUrlRules.normalizeApiBaseUrl("http://10.0.2.2:8787/api/")
        assertEquals("http://10.0.2.2:8787/api", localDev)
        assertEquals("ws://10.0.2.2:8787/api", EndpointUrlRules.toWebSocketBaseUrl(localDev))

        assertEquals(
            "https://live.example.com/api/media/recordings/rec-1",
            EndpointUrlRules.resolveMediaUrl(normalized, "/api/media/recordings/rec-1"),
        )
        assertEquals(
            "https://cdn.example.com/thumb.jpg",
            EndpointUrlRules.resolveMediaUrl(normalized, "https://cdn.example.com/thumb.jpg"),
        )
        assertNull(EndpointUrlRules.resolveMediaUrl(normalized, ""))
    }

    @Test
    fun deepLinkParserRoutesWatchProfilesOfflineAndDirectLan() {
        assertEquals(
            DeepLinkDestination.WatchStream("stream-42"),
            EndpointUrlRules.parseDeepLink("https://live-stream-share-cast.vercel.app/watch/stream-42"),
        )
        assertEquals(
            DeepLinkDestination.WatchStream("abc-99"),
            EndpointUrlRules.parseDeepLink("imlive://watch/abc-99"),
        )
        assertEquals(
            DeepLinkDestination.UserProfile("cyber_elias"),
            EndpointUrlRules.parseDeepLink("imlive://u/@cyber_elias"),
        )
        assertEquals(
            DeepLinkDestination.OfflineRooms,
            EndpointUrlRules.parseDeepLink("imlive://offline"),
        )
        assertEquals(
            DeepLinkDestination.LanDirect("192.168.1.24", 49152, "654321", "Kitchen Live"),
            EndpointUrlRules.parseDeepLink("imlive://lan?host=192.168.1.24&port=49152&code=654321&title=Kitchen+Live"),
        )
    }

    @Test
    fun offlineSdpProtocolMatchesWebV1Contract() {
        val code = OfflineSdpProtocol.createRoomCode(6)
        assertEquals(6, code.length)
        assertEquals("AB12CD", OfflineSdpProtocol.validateRoomCode("ab-12 cd"))

        val fakeSdp = "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"
        val offer = OfflineSdpProtocol.OfflineSignalBundle(
            type = "offer",
            roomCode = "ROOM42",
            sdp = fakeSdp,
        )
        val encoded = OfflineSdpProtocol.encode(offer)
        val decoded = OfflineSdpProtocol.decode(encoded)
        assertEquals("imlive-offline-webrtc", decoded.protocol)
        assertEquals(1, decoded.version)
        assertEquals("offer", decoded.type)
        assertEquals("ROOM42", decoded.roomCode)
        assertEquals(fakeSdp, decoded.sdp)
        OfflineSdpProtocol.assertRoomMatches(decoded, "room-42")
    }

    @Test
    fun lanTcpServerAuthenticatesRelaysSignallingAndRelaysLanChat() {
        val welcomeLatch = CountDownLatch(1)
        val hostOfferLatch = CountDownLatch(1)
        val viewerChatLatch = CountDownLatch(1)
        val receivedOfferSdp = AtomicReference<String>()
        val receivedChatText = AtomicReference<String>()

        val server = LanSignalServer(
            roomCode = "842190",
            bindAddressOverride = "127.0.0.1",
            onFrame = { frame ->
                when (frame.optString("type")) {
                    "offer" -> {
                        receivedOfferSdp.set(frame.optJSONObject("sdp")?.optString("sdp"))
                        hostOfferLatch.countDown()
                    }
                    LanSignallingContract.LAN_CHAT_TYPE -> {
                        receivedChatText.set(frame.optString("message"))
                    }
                }
            },
        )

        val room: LanRoomInfo = server.start("Loopback Test")
        var client: LanSignalClient? = null
        try {
            client = LanSignalClient(
                room = room,
                peerId = "viewer-test-1",
                onFrame = { frame ->
                    when (frame.optString("type")) {
                        "welcome" -> welcomeLatch.countDown()
                        LanSignallingContract.LAN_CHAT_TYPE -> {
                            receivedChatText.set(frame.optString("message"))
                            viewerChatLatch.countDown()
                        }
                    }
                },
                onError = {},
            )
            client.connect()
            assertTrue("Expected LAN welcome frame", welcomeLatch.await(3, TimeUnit.SECONDS))

            client.send(
                JSONObject()
                    .put("type", "offer")
                    .put("sdp", JSONObject().put("type", "offer").put("sdp", "v=0-test-offer-sdp-payload")),
            )
            assertTrue("Expected host to receive viewer offer", hostOfferLatch.await(3, TimeUnit.SECONDS))
            assertEquals("v=0-test-offer-sdp-payload", receivedOfferSdp.get())

            server.sendHostChat("HostAlex", "Hello offline Wi-Fi viewers!")
            assertTrue("Expected viewer to receive LAN chat", viewerChatLatch.await(3, TimeUnit.SECONDS))
            assertEquals("Hello offline Wi-Fi viewers!", receivedChatText.get())
        } finally {
            client?.close()
            server.stop()
        }
    }

    @Test
    fun domainModelParsersHandleCloudflareWorkerPayloads() {
        val user = UserProfile.from(
            JSONObject()
                .put("id", "u-1")
                .put("username", "creator_one")
                .put("displayName", "Creator One")
                .put("email", "one@example.com")
                .put("emailVerified", 1)
                .put("roles", JSONArray().put("user").put("admin"))
                .put("followerCount", 42),
        )
        assertTrue(user.emailVerified)
        assertTrue(user.isAdmin)
        assertTrue(user.isModeratorOrAdmin)
        assertEquals("Creator One", user.bestName)

        val stream = LiveStream.from(
            JSONObject()
                .put("id", "s-1")
                .put("user_id", "u-1")
                .put("title", "Coding on Android")
                .put("is_live", 1)
                .put("viewer_count", 19)
                .put("tags", "[\"kotlin\",\"webrtc\"]")
                .put("stream_type", "internet"),
        )
        assertTrue(stream.isLive)
        assertEquals(19, stream.viewerCount)
        assertEquals(listOf("kotlin", "webrtc"), stream.tags)

        val chat = ChatMessage.from(
            JSONObject()
                .put("id", "m-1")
                .put("username", "ada")
                .put("message", "Loud and clear!")
                .put("replyTo", JSONObject().put("id", "m-0").put("username", "host").put("snippet", "How is audio?")),
        )
        assertEquals("m-0", chat.replyToId)
        assertEquals("host", chat.replyToUsername)
        assertEquals("How is audio?", chat.replyToSnippet)

        val clip = Recording.from(
            JSONObject()
                .put("id", "r-1")
                .put("title", "Best Moment")
                .put("file_url", "/api/media/recordings/r-1")
                .put("clip_start_seconds", 12)
                .put("clip_end_seconds", 40)
                .put("duration_seconds", 28),
        )
        assertTrue(clip.isClip)
        assertEquals(28, clip.durationSeconds)

        val ice = IceServerConfig.from(
            JSONObject()
                .put("urls", JSONArray().put("stun:stun.cloudflare.com:3478").put("turns:turn.cloudflare.com:5349"))
                .put("username", "turn-user")
                .put("credential", "turn-secret"),
        )
        assertEquals(2, ice.urls.size)
        assertEquals("turn-user", ice.username)

        val rules = ChatRules.from(
            JSONObject()
                .put("slowModeSeconds", 5)
                .put("followersOnly", true)
                .put("linksAllowed", false)
                .put("bannedWords", JSONArray().put("spam")),
        )
        assertEquals(5, rules.slowModeSeconds)
        assertTrue(rules.followersOnly)
        assertFalse(rules.linksAllowed)
        assertEquals(listOf("spam"), rules.bannedWords)

        val cfg = RuntimePlatformConfig.from(JSONObject().put("p2pMaxViewers", 8).put("maintenanceMode", false))
        assertEquals(8, cfg.p2pMaxViewers)
        assertFalse(cfg.maintenanceMode)
    }

    @Test
    fun uiHelpersFormatDurationsAndThemesDeterministically() {
        assertEquals("00:09", formatDurationClock(9))
        assertEquals("02:05", formatDurationClock(125))
        assertEquals("1:01:01", formatDurationClock(3661))
        assertEquals(AccentTheme.EMERALD, AccentTheme.fromId("emerald"))
        assertEquals(VideoQualityPreset.HD_720P, VideoQualityPreset.fromId("720p"))
        val diag = RtcConnectionDiagnostics(videoWidth = 1280, videoHeight = 720)
        assertNotNull(diag)
        assertEquals("1280x720", diag.resolutionLabel)
    }
}
