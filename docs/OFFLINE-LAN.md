# Fully offline local rooms

I'm Live has two separate local-delivery paths. They must not be described as the
same feature:

| Path | Media | Signalling | Requires internet during the session | Supported pairing |
|---|---|---|---|---|
| **LAN transport** (`LAN` in the normal creator/viewer flow) | WebRTC direct media with an empty ICE-server list | Worker ticket + `SignalRoom` WebSocket | Yes, for page/API/ticket/signalling; media remains local | Browser ↔ browser |
| **Offline room** (`/offline`) | WebRTC direct media with browser host candidates only | Manual copy/paste of complete SDP bundles | No, after the app shell has been cached and loaded | Browser ↔ browser |
| **Android LAN-only** | Native WebRTC direct media with an empty ICE-server list | Android broadcaster's local TCP server | No | Android ↔ Android |

A local media path is not automatically a fully offline path. The normal browser
LAN mode keeps media off the CDN, TURN, and public STUN, but it still uses the
Worker for authorization and signalling. The offline browser room is the path to
use when a venue, classroom, event, or emergency network has no internet access.

## Browser ↔ browser setup

1. Visit `/offline` on both devices while the app is online, or open it from a
   previously cached app shell. The service worker caches the SPA shell and
   static assets; it never caches API responses, credentials, recordings, or
   media.
2. Put both devices on the same reachable Wi-Fi/LAN. A guest network, client
   isolation, VPN, different subnet, or firewall can prevent host candidates from
   reaching one another.
3. On the broadcaster, choose **Broadcaster**, keep or regenerate the room code,
   grant camera/microphone permission, and select **Start camera and make offer**.
4. Copy the complete **Offer bundle** to the viewer using any local transfer
   method. The bundle is JSON containing SDP and local ICE candidates. It has no
   Worker token and is not a public stream URL.
5. On the viewer, choose **Viewer**, paste the offer, and select **Make viewer
   answer**. Copy the resulting **Answer bundle** back to the broadcaster.
6. The broadcaster pastes the answer and selects **Apply answer**. Playback should
   move to `Connected — media is local` on both sides.

The room code is a human mix-up check, not authentication or encryption. Keep
bundles within the intended group. WebRTC encrypts the media transport, but this
mode does not provide cloud moderation, discovery, chat, follows, analytics,
recording upload, or a globally shareable link.

## Browser constraints

- Camera and microphone capture generally require HTTPS or `localhost`.
- The app must be opened before the network is disconnected. A service worker
  cannot install itself for the first visit while fully offline.
- Some browsers use mDNS host candidates. If a browser or network cannot resolve
  those candidates, use the normal Worker-backed local mode or Android LAN-only
  mode instead.
- The complete SDP text can be several kilobytes. Do not truncate it, wrap it in
  a rich-text editor, or paste only the first lines.
- The current browser offline room intentionally uses non-trickle ICE. It waits
  up to twelve seconds for candidate gathering before making the bundle, then
  relies on the copied offer/answer exchange rather than a signalling server.

## Android ↔ Android setup

The native flow is documented in [`android/README.md`](../android/README.md).
The broadcaster binds a local TCP signalling socket to an ephemeral port and
shows its IPv4 address, port, and room code. The viewer enters those values. The
newline-delimited JSON protocol has a 64 KiB frame limit and a maximum of eight
viewers. It is intentionally separate from the browser JSON bundle protocol.

Android ↔ browser local signalling is not claimed as supported: browsers cannot
open arbitrary raw TCP sockets, and the Android raw TCP protocol is not a browser
WebSocket endpoint. A future browser-compatible bridge would need an explicit
HTTP/WebSocket implementation and a cross-platform security review.

## Troubleshooting and evidence

- `Camera or microphone permission was denied`: reset the browser permission for
  the app origin, close other camera users, and retry.
- `The room codes do not match`: regenerate the room or paste a bundle from the
  current broadcaster/viewer pair.
- `The local network path was interrupted`: confirm both devices have an address
  on the same subnet and disable guest/AP isolation or a VPN.
- A successful browser build and TypeScript/lint check prove only that the flow is
  wired correctly. Physical Wi-Fi, IPv6-only, VPN, client-isolation, browser
  compatibility, and Android device validation remain release QA and must not be
  reported as completed until performed on real devices.
