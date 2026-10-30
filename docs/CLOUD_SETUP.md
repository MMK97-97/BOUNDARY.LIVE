# MK97 1.6 — stream from one phone

The phone runs the camera and MK97 interface. Your hosted MK97 container reads CricClubs, burns the live score into the video, encodes once and forwards to selected platforms. No laptop, local Node.js, FFmpeg installation or VPN is required at the ground. Replay has been removed: there is no footage history, clip browser, video export or automatic replay. Optional two-second milestone/scorecard graphics remain over the live camera.

A one-time cloud deployment and platform authorization are still necessary. Those happen in the providers' dashboards; match-day controls stay in MK97. This project has not been deployed to your cloud account.

## Choose the hosting route

| Route | What is free | Appropriate use |
| --- | --- | --- |
| GitHub Pages | Static MK97 interface, within GitHub's limits | Free frontend; needs a separate video service |
| Render Free Docker service | Limited running container and HTTPS, under its current quotas | Setup/UI and short streaming trials; sustained 1080p is unverified |
| Eligible always-free VM + Docker + Caddy + free DNS | Server resources only when the provider explicitly grants them free | A possible complete no-subscription route; account approval, regional capacity, compute and egress quotas apply |

There is no guaranteed unlimited free 1080p multistreaming service in this package. A hosting plan must have enough CPU and bandwidth for your match. At 8 Mbps, the phone uploads about 3.6 GB/hour before audio/overhead. Three outputs at 6 + 6 + 3.5 Mbps use about 7 GB/hour of server egress before audio/overhead. Instagram adds a separate portrait encode. Start with YouTube only; test on the actual server and phone before match day.

Follow **[FREE_HOSTING.md](FREE_HOSTING.md)** for every step, including the free test deployment and the conditional always-free VM route.

## Match-day steps, all on the phone

1. Open your hosted MK97 HTTPS address. Add it to the home screen if desired; the app manifest supports standalone display.
2. Tap **Set up stream**. On the hosted service, its own address is detected automatically. Enter the private `RELAY_TOKEN` from your hosting dashboard/server configuration. The app clears the input after it exchanges the token for an eight-hour, origin-bound session.
3. Under **Destinations**, connect YouTube with Google or expand **Add / replace a stream key**. Select the platform, paste its current RTMPS server and key, and tap **Save securely**. The saved destination is selected automatically. Repeat for additional platforms. Session keys expire at logout/restart/session expiry; reconnect and re-enter them next time.
4. **CricClubs match** opens Score. Enter the Match ID and Club ID, or the full scorecard URL, then Load. Match 986 / Club 300 is a completed example, not a fallback. Different clubs need their own Club ID. Full URLs supply the league path automatically. FWCWL / 300, Tampa Cricket / 1507 and TCL / 157 also work from numeric Club ID/Match ID without editing Render settings. Full tables still require permitted readable source data; see [LEAGUES.md](LEAGUES.md).
5. Return to the studio and open the camera. Allow camera and microphone. Select 1080p if the phone supports native landscape 1920 × 1080. Select a rear optical lens where available. Native zoom depends on the browser/device and is not guaranteed lossless.
6. Check the four setup indicators. With overlay enabled, the match must be loaded through the cloud service. Disable the overlay if streaming without a score.
7. Press **START**. This sends the camera; it does not certify that the platform is publicly live.
8. For a connected YouTube account, open **YouTube account & live setup → Preview / Go live**. For manual platform keys, complete the platform's own preview/publish steps. Facebook and Instagram do not gain OAuth login or live eligibility from a stream key. Some Instagram accounts expose Live Producer only through a desktop-style platform interface; one-app Instagram publication is not implemented.
9. Use the speaker button to mute/unmute the outgoing microphone. The local camera stays muted to prevent feedback. Hide the monitor or use Battery screen after framing; keep the app visible and phone unlocked.
10. End each platform event, then **STOP → Yes, stop streaming**. Close the camera. Disconnecting the studio removes session keys. Stop or delete cloud resources when no longer needed.

## One-time YouTube sign-in configuration

Use a Google Web application OAuth client. Enable YouTube Data API v3 and set these private environment values on the service:

```ini
GOOGLE_CLIENT_ID=your-web-client-id
GOOGLE_CLIENT_SECRET=your-private-client-secret
YOUTUBE_REDIRECT_URI=https://YOUR-REAL-HOST/youtube-callback.html
```

Register that exact callback with Google. Add your Google account as a test user if the OAuth consent app is in Testing. Never upload downloaded credentials, the client secret or `.env` to GitHub. Redeploy/restart after configuration. [YOUTUBE.md](YOUTUBE.md) explains the existing flow; its older local-relay references mean the cloud environment in this deployment.

Google login, event title/description/privacy/schedule/audience, automatic key acquisition, preview and publication are implemented. Actual Google/platform credentials were not supplied for end-to-end account testing in this session.

## Host requirements

A long-running Docker/Linux service; Node 22.12+ and FFmpeg are installed in the supplied image. The host must allow HTTPS, sustained WebSocket upload, authenticated HTTP streaming and outgoing RTMPS on TCP 443. Keep one instance: sessions and selected match live in memory. Do not use static-only hosting, a serverless request function, cron job, GitHub Actions runner or a public CORS proxy as the live video server.

Set `PUBLIC_URL=https://your-real-host` on generic hosts. On Render the service-provided `RENDER_EXTERNAL_URL` is used automatically. Only configured exact origins are trusted; incoming Host/forwarded headers do not expand access. When serving the app and API together, no CORS wildcard is needed. To use GitHub Pages separately, add its exact origin to `ALLOWED_ORIGINS`.

The Docker image runs as the non-root `node` user. The optional Compose file adds a read-only application filesystem, bounded temporary directory, process limit and resource limits. Keep the private relay token in the host's secret environment. In-app destination keys are separately validated and session-scoped, never returned by status APIs or written to disk by MK97. Like other FFmpeg RTMPS applications, an output URL is passed to its child process; use a private single-owner server and do not expose process inspection to untrusted users.

## Verification and remaining checks

See [VALIDATION.md](VALIDATION.md). The source, isolated browser UI and local media pipeline are testable without starting an external broadcast. A successful UI test is not a successful cloud deployment or proof of phone battery life. Measure actual CPU/RAM, source readability, bitrate, platform preview and audio/video timing on your chosen free host.
