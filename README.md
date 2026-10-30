# MK97 — mobile cricket streaming

A focused mobile website for one job: stream cricket with a CricClubs score overlay.

**Start with [docs/SETUP.md](docs/SETUP.md).** It includes GitHub upload, Windows setup, the free personal hosting route, and platform instructions.
Updating the uploaded repository? Follow [docs/UPGRADE.md](docs/UPGRADE.md) to replace the simulated setup flow and remove obsolete sample archives.

**Match IDs are dynamic.** Enter any accessible match in the selected club; 986 is an explicit example, not a fallback. Browser validation also loaded Match 985 / Club 300: Game Changers CC 216/7 (35), Toons CC 220/5 (27.1), TCC won by 5 Wickets. For another league, change the Club ID or paste its full CricClubs URL.

**New in 1.4: [CricClubs HTML scraper](docs/SCRAPER.md).** It reads supported server-rendered innings tables, extras, dismissals, fall of wickets and source commentary. The relay enriches the ticker in the background when source identities/totals agree. A CLI and a manual GitHub Actions workflow save whitelisted scorecard JSON. Verification pages, robots restrictions and unsupported layouts remain explicit failures; full match 986 HTML access has not been verified.

## What is included

- Landscape studio matching the supplied layout: full camera view, quality pill, left tool rail, native zoom, blue/white/orange scorebar and replay transport controls. See [every control](docs/CONTROLS.md).
- MK97 match setup home and the supplied logo, preserved unchanged in the interface and broadcast watermark.
- Native rear-camera capture at **1920 × 1080, up to 30 fps** by default. Explicit 720p/480p and Auto choices use the actual supported resolution; they are never labelled native 1080p.
- Camera-provided zoom presets and a precision slider, when the browser exposes zoom. Camera/lens selection before streaming.
- CricClubs score retrieval before connecting a relay, using the public read endpoint where browser CORS/network access permits. After connection, the phone reads the same relay snapshot used by the encoder. Both paths share one validator. **FWCWL Club ID 300** is preset; Match IDs and full CricClubs scorecard URLs work.
- Background full-scorecard HTML extraction on the relay, with bounded caching, robots.txt checks, request deduplication, and validation of player runs/overs against innings totals. It stops on provider access restrictions. Different leagues need their matching relay league-path/Club-ID settings.
- Score, replay and celebration graphics burned into the outgoing video on your laptop. The phone sends one native camera stream without drawing 1080p graphics on a canvas.
- Automatic eight-second replay for a confirmed batter four or six; private clip preview, on-air replay and MP4 download. A bounded laptop RAM buffer keeps video and its original audio together.
- Team celebrations at 50/100/150/200/250/300/350 and player celebrations at 50/100/150/200. Each runs for **60 frames = two seconds** at 30 fps.
- After an observed over completion: batting card for two seconds, immediately followed by bowling card for two seconds. Only available player data is shown; incomplete feeds are labelled. See [automation and timing](docs/AUTOMATION.md).
- One upload from the phone, then independent YouTube, Facebook and Instagram outputs. A failed destination is isolated from the others.
- YouTube account sign-in, broadcast title/description/privacy/schedule/audience, automatic private ingestion-key setup, Preview, Go live and End. Follow the one-time [Google OAuth setup](docs/YOUTUBE.md). Google tokens and stream keys remain in relay memory.
- Both-innings selection, Batting/Bowling/Commentary tabs and Overview/Partnership/Runs/Wickets statistics, populated only from supplied source fields. Missing data remains marked unavailable; full cards are not inferred from partial player records. The tested CricClubs view omits full innings cards and commentary.
- YouTube/Facebook: selected landscape capture resolution, normally 1080p. Instagram: separate portrait canvas, default **720 × 1280 compatibility**, with the full field fitted inside. Optional 1080 × 1920 setting if your Instagram account accepts it.
- Hide-preview and dark battery-screen controls, microphone mute, a framing guide, screen wake lock where supported, feed-delay labels and upload health.
- A private-network setup, encrypted RTMPS, origin-bound sessions and one-use streaming tickets. See [SECURITY.md](SECURITY.md).
- Automated tests, a real-match regression fixture, a GitHub Pages workflow and full source code.
- Share/copy your public platform viewing link, with native Cast/AirPlay where the browser and source support it. Viewer counts are not invented from stream keys.

## Practical limits

**GitHub Pages hosts the interface; it cannot run a video relay.** An existing laptop must stay powered and connected during the match. The documented free personal route uses GitHub Pages + your laptop + Tailscale Serve over your private network. No paid multistreaming subscription is required by this code. Internet/data, electricity, hardware and any account/provider charges still belong to you. Free service eligibility and limits can change.

**1080p does not make digital zoom lossless.** This app applies no software zoom or upscaling. The camera's native zoom API may itself use digital processing. Optical detail depends on the phone, lens, lighting and distance. The browser cannot certify that every zoom position is optical. Use a telephoto lens/camera where your browser makes it available. Encoding and platform recompression are also lossy.

**A working public feed is not a guaranteed permanent API.** The CricClubs read-only overlay-data endpoint returned match 986 successfully during validation on October 29, 2026. Availability, schema, licensing and league access can change. The adapter displays real errors and stale labels. It never fabricates a score or bypasses login/bot checks. An approved-feed adapter is available if needed.

**Replay alignment depends on the source data.** The public snapshot feed does not supply precise delivery timestamps or guarantee full innings cards. Automatic boundary detection uses changes in batter runs and four/six counters, with a calibrated scoring delay. Mark ball and manual clip preview provide operator control. Several deliveries missed between polls cannot be recovered reliably from one total. An approved feed can supply delivery IDs/timestamps and complete cards. Loading completed match 986 establishes a baseline without replaying its historic events.

## Verified sample

[FWCWL match 986](https://cricclubs.com/FWCWL/viewScorecard.do?matchId=986&clubId=300), FWCWL 2026–27 Season:

| Team | Score | Overs |
| --- | --- | --- |
| Royal Bulls CC | 207/9 | 35 |
| ICAT | 208/5 | 30.5 |

Result from the feed: **ICAT won by 5 Wickets**. This match is completed, so its overlay is labelled MATCH COMPLETE. The browser loaded these fields from CricClubs during MK97 validation. Node requests from the build environment timed out; actual laptop/provider connectivity still needs an equipment check. Production never loads the test fixture or a historical archive as a live-data fallback.

## Local commands

Install Node.js 22.12+ and a current FFmpeg build with libx264/drawtext, then:

```sh
npm ci
npm run setup
```

Edit `relay/.env`, then:

```sh
npm start
```

The relay also serves the website at `http://localhost:8787` for testing on the laptop. On a phone, use your GitHub Pages HTTPS URL and the private HTTPS relay address from Tailscale Serve.

```sh
npm run check
npm test
```

Tests run without broadcasting to your platform accounts. FFmpeg-dependent tests require FFmpeg and ffprobe. Read [docs/VALIDATION.md](docs/VALIDATION.md) for the actual checks and the remaining device/platform verification.

## Files

| Path | Purpose |
| --- | --- |
| `web/` | Build-free, dependency-free mobile website |
| `relay/server.mjs` | Authenticated HTTP API, WebSocket upload and process lifecycle |
| `relay/lib/score.mjs` | CricClubs normalization, caching and stale handling |
| `relay/lib/cricclubs.mjs` | Read-only HTML scraper, robots checks and bounded requests/cache |
| `relay/lib/cricclubs-parser.mjs` | Scorecard table extraction, reconciliation and safe ticker enrichment |
| `scripts/scrape-cricclubs.mjs` | One-match CLI with saved-HTML development mode |
| `relay/lib/encoder.mjs` | FFmpeg composition, landscape encoding and per-platform forwarding |
| `relay/lib/program.mjs` | Continuous program output, private replay, source audio and clip export |
| `relay/lib/events.mjs` | Boundary, milestone and over detection with baseline/deduplication |
| `relay/lib/replay-ring.mjs` | Bounded JPEG/PCM replay memory |
| `relay/lib/graphics.mjs` | Local SVG-to-PNG score and celebration rendering |
| `relay/lib/security.mjs` | Session and one-use ticket lifecycle |
| `relay/lib/youtube.mjs` | Google authorization, private key setup and YouTube event control |
| `relay/.env.example` | Configuration template, without real secrets |
| `.github/workflows/pages.yml` | Publishes only `web/` |
| `docs/SETUP.md` | Complete setup instructions |
| `docs/CRICCLUBS.md` | Score feed behavior and approved JSON contract |
| `docs/SCRAPER.md` | Scraper commands, integration, supported layouts and verification limits |
| `docs/CONTROLS.md` | Button-by-button operation of the supplied layout |
| `docs/AUTOMATION.md` | Replay calibration, exact graphic duration and feed limits |
| `docs/YOUTUBE.md` | Website sign-in and broadcast setup |
| `docs/TROUBLESHOOTING.md` | Camera, network, score and output remedies |

No service worker caches tokens, score feeds or stream data. No third-party analytics or fonts are loaded. Camera footage stays in bounded laptop memory until it expires or the session ends. Download explicitly exports a selected MP4 to your device; the relay does not create a video file on disk. Replay processing uses an additional high-quality JPEG intermediate and extra laptop CPU/RAM; it is not lossless. Turn all three automation switches off at 1080p for the simpler direct encoder path.

## Official references

- [GitHub Pages introduction](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Custom GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) and [CLI](https://tailscale.com/docs/reference/tailscale-cli/serve)
- [Tailscale free-plan eligibility](https://tailscale.com/docs/account/manage-plans/free-plans-discounts)
- [YouTube encoder settings](https://support.google.com/youtube/answer/2853702)
- [YouTube RTMPS](https://developers.google.com/youtube/data/live/guides/rtmps-ingestion)
- [Instagram Live Producer help](https://help.instagram.com/1294856766728582) — account access may be required
- [CricClubs pricing](https://scores.cricketsingapore.com/SingaporeCricketAssoc/pricing.do)

This project is independent of CricClubs, YouTube, Meta and Tailscale. It does not create platform accounts or override their eligibility and delivery rules. With your permission, it obtains a YouTube ingestion key through Google's API; it does not manufacture platform credentials.
