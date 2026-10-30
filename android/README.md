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

Remaining release-gate work is deliberately visible rather than hidden: build
and compile in an Android/JDK environment, reconnect/backoff and moderation chat
states, native in-app VOD playback and editing, bounded recording upload/
finalisation, robust background/process-death recovery, TURN/direct diagnostics,
analytics, App Link domain verification, signed AAB/FCM/store disclosures, and
real Android↔web interoperability/device tests.
