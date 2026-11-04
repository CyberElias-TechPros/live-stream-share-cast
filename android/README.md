# I'm Live — Native Android Application

This directory contains the complete, production-structured **native Kotlin + Jetpack Compose** Android application for **I'm Live** (`com.imlive.app`) — strictly native (zero WebViews), sharing the Cloudflare Worker REST, Durable Object WebSocket, WebRTC, and Offline LAN contracts with the web platform.

## Architecture & Module Map

- **`model/Models.kt`**: Typed, ProGuard/R8-safe Kotlin domain models and JSON codecs for authentication, live streams, WebRTC ICE/TURN, live chat (`replyTo`, moderation, typing), VOD recordings & 60s clips, scheduled broadcasts, categories, unified search, notifications, creator analytics, payments/tips, sessions, personal API tokens, webhooks, and admin controls.
- **`network/`**:
  - `ApiClient.kt`: `OkHttp` REST & multipart upload client with single-flight `Mutex` refresh-token rotation (`/api/auth/refresh`), `X-Request-Id` correlation headers, and structured `ApiException` error codes.
  - `ServerEndpointStore.kt`: Runtime server endpoint switcher (Official Cloudflare Worker, local `10.0.2.2:8787` dev server, or custom self-hosted HTTPS Worker), `ws://`/`wss://` derivation, media URL resolver, and `imlive://` + HTTPS App Link deep-link router.
  - `NetworkMonitor.kt`: Reactive `ConnectivityManager` `StateFlow<NetworkStatus>` detecting Wi-Fi, Cellular, Hotspot, offline state, and metered data.
- **`auth/` & `data/` & `live/`**:
  - `SecureTokenStore.kt`: Android Keystore `EncryptedSharedPreferences` with automatic corruption recovery.
  - `AppPreferences.kt`: Reactive device preferences (Accent theme, default quality preset, cellular Data Saver, auto-record MP4, keep screen awake).
  - `AuthRepository.kt`, `LiveRepository.kt`, `PlatformRepository.kt`, `ChatClient.kt`: Full domain repositories and resilient ticket-refreshing live chat client.
- **`media/` (100% Native Hardware Media & Offline Engine)**:
  - `WebRtcEngine.kt`: Shared `EglBase`, hardware-accelerated `PeerConnectionFactory` (`DefaultVideoEncoderFactory` + `DefaultVideoDecoderFactory`), `JavaAudioDeviceModule` (hardware acoustic echo cancellation & noise suppression), and `AudioRouteController` (`AudioFocusRequest` + speakerphone/earpiece routing).
  - `SignallingClient.kt`: Ticket-authenticated `/api/ws/signal/:streamId` WebSocket client with bounded outbox queue, 25s ping keepalive, single-use ticket refresh on reconnect, and terminal `p2p_capacity` handling.
  - `WebRtcViewerSession.kt`: Full `LanViewer` state machine (`hello-viewer` knock, `streamer-ready` lock, host peer tracking, per-viewer `quality` bitrate requests, audio-only data saver, transient disconnect recovery, and 2s `RTCStatsReport` diagnostics HUD).
  - `WebRtcBroadcasterSession.kt`: Camera2 front/rear capture, live resolution/FPS switching, send-only multi-viewer `PeerConnection` fan-out (up to 8 P2P viewers), per-viewer `maxBitrateBps` adaptation, and outbound bitrate telemetry.
  - `NativeStreamRecorder.kt`: Zero-copy GPU `EglRenderer` + `MediaCodec` (`video/avc` H.264) + `MediaMuxer` `.mp4` live stream recorder (bounded to 256 MB) for one-tap post-broadcast VOD publishing.
  - `BroadcastSessionManager.kt` + `BroadcastService.kt`: Process-scoped broadcast coordinator surviving screen rotation, navigation, and backgrounding via Android 14/15 `ServiceCompat.startForeground` (`camera|microphone`) with notification **Mute Mic** and **End Broadcast** actions.
  - `LanSignalling.kt` + `LanDiscovery.kt` + `OfflineSdpPeer.kt`: Dual zero-internet offline modes — mDNS (`_imlive._tcp.`) auto-discovered Android-to-Android TCP LAN rooms (with live `lan-chat`) AND cross-platform `imlive-offline-webrtc` v1 SDP Offer/Answer bundles compatible with the browser `/offline` route.
- **`ui/` (Jetpack Compose Material 3 Studio Design System)**:
  - `HomeScreen.kt`: Live feed, Following Live rail, Trending Creators, Upcoming Schedules, Recent Replays, Offline Mode banner, and active On-Air studio return bar.
  - `ExploreScreen.kt`: Debounced `/api/search` across streams, creators, and VODs + interactive Category directory.
  - `WatchScreen.kt`: Hardware `SurfaceViewRenderer` theater, fullscreen mode, quality & audio-only controls, live WebRTC `RTCStats` HUD, follow/unfollow, tip checkout, report/block, and live chat with replies & typing indicators.
  - `BroadcastScreen.kt`: Pre-live setup (Internet / Same-Wi-Fi Cloud / Offline LAN), live studio controls, local MP4 recording & cloud VOD upload, and live studio chat moderation.
  - `OfflineRoomsScreen.kt`: Nearby mDNS LAN scanner, direct TCP LAN theater with local chat, and cross-platform `imlive-offline-webrtc` v1 SDP Offer/Answer studio.
  - `LibraryAndScheduleScreen.kt`: In-app native **AndroidX Media3 `ExoPlayer`** VOD/clip playback, interactive 60-second highlight clip creator, device MP4/WebM uploader, privacy editor, and broadcast scheduler (`Go Live Now` + reminders).
  - `ProfileAndCreatorScreen.kt`: Channel profiles, avatar gallery upload, followers/following lists, 7d/30d/90d creator analytics, tip earnings, chat rules, viewer mutes/bans, and moderation queue.
  - `NotificationsAndSettingsScreen.kt`: Notifications inbox, theme/quality/data-saver settings, runtime server switcher & health diagnostics, email verification, password change, active session revocation, personal API tokens, outbound webhooks, GDPR JSON export, account deletion, and Admin Console.

## Deep Links Supported

- `imlive://watch/<streamId>` and `https://live-stream-share-cast.vercel.app/watch/<streamId>`
- `imlive://u/<username>` and `https://live-stream-share-cast.vercel.app/u/<username>`
- `imlive://broadcast`, `imlive://offline`, `imlive://library`, `imlive://schedule`
- `imlive://lan?host=<ipv4>&port=<port>&code=<pin>&title=<title>`

## Build, Test & Verify

Requires **JDK 17** and **Android SDK 35**:

```bash
cd android
./gradlew testDebugUnitTest assembleDebug assembleRelease
```

- Default API endpoint: `https://live-stream-share-cast-api.autumn-surf-21ec.workers.dev/api` (override at build time via `-PIM_LIVE_API_BASE_URL=https://.../api` or at runtime inside **Settings -> Switch Server**).
- GitHub Actions (`.github/workflows/ci.yml`) runs `testDebugUnitTest`, `assembleDebug`, and R8-minified `assembleRelease` on every push and uploads the built APKs as the `im-live-android-apks` workflow artifact.
