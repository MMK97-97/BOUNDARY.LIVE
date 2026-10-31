# MK97 — phone-first live cricket streaming

**Version 1.7.1: Supabase-ready encrypted saved connections and remembered devices.** Portrait and landscape studios follow the supplied references, using the original MK97 logo. The third tool is now **Stream**; replay, clip capture, video history and exports have been removed from the app and server.

**YouTube update:** Render callback detection, secure callback completion without a popup opener, Start now / scheduled setup, automatic destination selection, safer retry/transition handling and a visible callback to register. Follow [YOUTUBE.md](docs/YOUTUBE.md) for the required Google/Render configuration.

**League support:** paste a full CricClubs scorecard URL; MK97 keeps its league path and extracts the IDs. Bare IDs use built-in mappings for FWCWL / Club 300, Tampa Cricket / Club 1507 and TCL / Club 157. Other full URLs work without changing host settings. Match IDs are never guessed across clubs. See [LEAGUES.md](docs/LEAGUES.md).

Start with **[the complete free-hosting steps](docs/FREE_HOSTING.md)** and **[phone-only stream setup](docs/CLOUD_SETUP.md)**. No laptop needs to run at the ground. Host the container once; operate MK97 from your phone.

**Supabase:** follow [SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) to use Supabase PostgreSQL for your saved studio. The website/live encoder remains on the existing Render container; Supabase Edge Functions cannot run the full-match video server.

## Included

- Responsive studio with rear-camera capture, Auto/1080p/720p/480p selection, exposed native camera zoom, Fit/Fill, full screen, microphone mute, framing guide and battery screen.
- Guided setup with cloud connection, destinations, CricClubs match and camera readiness. START opens setup when something is missing.
- YouTube Google sign-in, event details, automatic ingestion-key setup, Preview, Go live and End after one-time Google configuration. Manual RTMPS keys for YouTube, Facebook and Instagram can be entered securely inside MK97; no `.env` edit is required for in-app keys. Remembered devices share an encrypted saved studio and reconnect automatically for 30 days; see [SAVED_STUDIO.md](docs/SAVED_STUDIO.md).
- One camera/audio upload, one live landscape encode, independent landscape writers and a separate Instagram portrait conversion. The original camera/audio go directly through FFmpeg: no JPEG video intermediate or rolling footage buffer.
- CricClubs source checks every five seconds by default, with an authenticated live link pushing received changes to the phone and on-air renderer. Match IDs are dynamic within their Club ID; no example is used as a fallback.
- Background full-scorecard HTML parsing, including supported innings tables, extras, dismissals, fall of wickets and source commentary, when robots rules/access and identity/totals reconciliation permit it. Verification pages remain explicit failures.
- Optional two-second team/player milestones and end-of-over batting/bowling graphics over the continuing live camera. Complete cards are shown only when source data supports them.
- Docker runtime with Node/FFmpeg/fonts, a free-tier Render test blueprint, optional hardened Compose deployment and HTTPS via Caddy on your own eligible server.
- Origin-bound sessions, one-use upload tickets, RTMPS host allowlists, request/stream limits, encrypted saved credentials or temporary session keys, no secret return in status APIs, CSP and no public recording endpoint.
- GitHub Actions validation/Pages publication, a cloud container build check and a separate manual CricClubs scraper workflow.

## Hosting and platform limits

GitHub Pages hosts the interface, not the encoder. The complete system requires a running cloud service with enough CPU and egress. Render Free is a test option with resource/uptime/bandwidth restrictions; sustained free 1080p is not verified. An eligible always-free VM may work within its actual account/region quotas, but allocation and performance cannot be guaranteed. No paid resource has been created by this session.

YouTube account setup and publication controls are implemented. Facebook/Instagram still require their eligible Live Producer accounts and current keys; their OAuth login and in-app publication controls are not implemented. Some platform workflows require an external control room, so full Instagram operation from one phone cannot be promised for every account.

1080p requires a supporting phone, lens, uplink and server. Native zoom can include digital processing. No lossless zoom, measured battery runtime, zero-latency source or bug-free/security guarantee is claimed.

## CricClubs verification

The public ticker returned completed FWCWL **Match 986 / Club 300**: Royal Bulls CC 207/9 (35), ICAT 208/5 (30.5), ICAT won by 5 Wickets. Match 985 also loaded during earlier browser validation. These are captured regression checks, not a live fallback.

The tested ticker view contains limited current players and no full innings arrays/commentary for 986. Its full HTML presented verification and was not successfully scraped here. Live read-only ticker checks on October 30, 2026 also returned completed Tampa Cricket 3866 / 1507 and TCL 6098 / 157 with valid team totals. Those responses still omit full player cards/commentary; see LEAGUES.md. The parser is verified against explicit synthetic HTML; actual full 986 cards and an active CricClubs match remain unverified. The app labels incomplete/stale feeds and never fills missing rows with invented values. See [SCRAPER.md](docs/SCRAPER.md) and [LIVE_SCORES.md](docs/LIVE_SCORES.md).

## Development

For local development only, install Node 22.12+ and FFmpeg with libx264/drawtext, then:

```sh
npm ci
npm run setup
npm start
```

Configure your private `relay/.env` before starting. Public/cloud phone operation uses HTTPS; the server also serves the entire website. Production container deployment does not require installing these tools on a phone or laptop.

```sh
npm run check
npm test
```

Tests use local/synthetic sources and FFmpeg outputs; they do not publish to your platform accounts. [VALIDATION.md](docs/VALIDATION.md) records checks and limits.

## Main files

| Path | Purpose |
| --- | --- |
| `web/index.html`, `studio-layout.css`, `app.mjs` | Mobile/landscape interface and camera upload |
| `web/stream-setup.mjs` | Setup checklist, cloud discovery and private destination forms |
| `web/feed.mjs`, `score-live.mjs` | Match source lifecycle and live-link/poll fallback |
| `relay/server.mjs` | Authenticated APIs, upload, output ownership and lifecycle |
| `relay/lib/program.mjs` | Live camera/audio + graphics through one encoder |
| `relay/lib/score.mjs`, `cricclubs.mjs`, `cricclubs-parser.mjs` | Bounded, read-only source retrieval and reconciliation |
| `relay/lib/cloud.mjs`, `destinations.mjs`, `security.mjs` | Exact cloud origins, validated private keys and upload tickets |
| `relay/lib/youtube.mjs` | Google authorization and YouTube live-event control |
| `Dockerfile`, `render.yaml`, `deploy/cloud/` | Hosted runtime and deployment templates |
| `docs/FREE_HOSTING.md` | Detailed free hosting and conditional VM walkthrough |
| `docs/CLOUD_SETUP.md`, `CONTROLS.md` | Match-day setup and every studio control |

No service worker caches tokens, scores or video. No third-party analytics or fonts are loaded. This project is independent of CricClubs, Google, Meta and hosting providers.

Version 1.7 adds encrypted PostgreSQL saved connections for Render Free, remembered devices, one-use device linking, device revocation and saved YouTube grant/event recovery. Existing hosts add `DATABASE_URL` and `STUDIO_ENCRYPTION_KEY` once; the update does not configure your host automatically. See [the complete saved studio setup](docs/SAVED_STUDIO.md).
