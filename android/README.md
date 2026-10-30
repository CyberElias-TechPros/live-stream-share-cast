# I'm Live Android client

This is a native Kotlin + Jetpack Compose client, not a WebView wrapper. It
shares the Worker contract with the web app:

- access/refresh tokens are stored with Android Keystore-backed encrypted
  preferences;
- `POST /api/ws/tickets` issues the same one-minute, single-use WebSocket
  ticket used by web;
- `SignallingClient` uses `/api/ws/signal/:streamId` and the same
  `welcome`/`offer`/`answer`/`ice`/`error` frames;
- `WebRtcViewerSession` uses native `PeerConnection` with recv-only audio and
  video transceivers, server-provided ICE/TURN configuration, speaker routing,
  and a Compose `SurfaceViewRenderer`;
- `WebRtcBroadcasterSession` captures the front camera/microphone, creates
  send-only peer connections for viewer offers, handles ICE/SDP, and exposes
  camera/mic toggles and camera switching;
- `BroadcastService` makes creator capture visible as an Android foreground
  service rather than pretending an activity can run indefinitely in the
  background.

## Open in Android Studio

1. Install JDK 17 and Android SDK 35.
2. Open this `android/` directory.
3. Set `IM_LIVE_API_BASE_URL` in `gradle.properties` or pass
   `-PIM_LIVE_API_BASE_URL=https://<worker-host>/api` in CI. Release builds must
   never use the placeholder endpoint.
4. Replace `links.im-live.example` in `AndroidManifest.xml` and publish the
   matching `assetlinks.json` from the web origin before enabling App Links;
   `docs/assetlinks.json.example` is the redacted shape to fill with the
   release certificate fingerprint.
5. Run the debug variant on a physical device for camera/microphone/WebRTC;
   emulators are useful for API/UI checks but not reliable for media.

The project is intentionally not signed in Git. Add a release keystore through
Android Studio/CI secrets, configure Play privacy/data-safety disclosures, and
run the device/network matrix in `docs/IMPLEMENTATION-ROADMAP.md` before a
store rollout.

## Current native slices

- sign in/sign up, encrypted session storage, refresh retry, live browse, watch
  route/deep link, ticket-authenticated signalling, native viewer PeerConnection
  setup, ICE/TURN parsing, rendered native video, and speaker audio routing;
- camera/microphone permission flow, server-backed stream create/start/heartbeat/
  stop, native camera/audio publishing, camera/mic toggles, camera switch, and a
  persistent foreground-service notification for creator mode;
- chat history + ticket-authenticated message send, follow action, recording
  library listing/playback handoff, local data-saver/notification preferences,
  Compose loading/empty/error states, and safe logout.

## Offline LAN mode

The Android app now has a genuine local-only Android-to-Android path:

1. On the broadcaster, open **Start a broadcast** and enable **LAN-only mode**.
2. Start the camera; the app shows a Wi-Fi IP address, ephemeral port, and room code.
3. On the viewer, choose **Join a LAN broadcast offline** and enter those three values.
4. The local Android signalling server relays only bounded SDP/ICE frames; the
   WebRTC audio/video connection uses an empty ICE-server list, so it does not
   request STUN/TURN or use the Worker/API.

Both devices must be on the same non-isolated Wi-Fi/LAN. Guest Wi-Fi, AP/client
isolation, VPN routing, and different subnets can prevent the direct connection.
The local protocol is newline-delimited JSON with a 64 KiB frame limit: the
viewer sends `hello-viewer` with the room code, the host sends `welcome` and
`streamer-ready`, and the peers exchange `offer`, `answer`, and `ice` frames;
`close`/`peer-left` tear down a viewer. The host accepts at most eight local
viewers. Capacity failures use the stable `error` / `p2p_capacity` contract and
include `maxViewers: 8`, matching the browser/API machine code where that
concept applies. This offline mode intentionally does not provide cloud chat, follows,
stream history, analytics, or public discovery. It is an Android-to-Android LAN
path; Android↔web interoperability still needs a local WebSocket bridge or
manual browser signalling and physical-device verification.

The debug Android project now compiles and its JVM contract test passes in the
GitHub Actions Android compile gate. Remaining release-gate work is deliberately
visible rather than hidden: physical-device LAN/WebRTC runs, typing/unread chat
UI, native in-app VOD playback and editing, bounded recording
upload/finalisation, robust background/process-death recovery, TURN/direct
diagnostics, analytics, App Link domain verification, signed AAB/FCM/store
disclosures, and real Android↔web interoperability/device tests. Chat
reconnect/backoff now refreshes one-use tickets, surfaces moderation error codes,
and refuses offline sends; follow state now supports initial load and unfollow.
