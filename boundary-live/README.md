# Boundary Live — mobile cricket streaming

A focused mobile website for one job: stream cricket with a CricClubs score overlay.

**Start with [docs/SETUP.md](docs/SETUP.md).** It includes GitHub upload, Windows setup, the free personal hosting route, and platform instructions.

## What is included

- Native rear-camera capture at **1920 × 1080, up to 30 fps**. Lower-resolution cameras fail preflight instead of silently becoming “1080p.”
- Camera-provided zoom presets and a precision slider, when the browser exposes zoom. Camera/lens selection before streaming.
- Server-side CricClubs score retrieval. **FWCWL Club ID 300** is preset: enter just the Match ID, such as **986**, and press Load. Full CricClubs scorecard URLs also work.
- Score burned into the outgoing video on your laptop. The phone sends the native camera stream without drawing 1080p graphics on a canvas.
- One upload from the phone, then independent YouTube, Facebook and Instagram outputs. A failed destination is isolated from the others.
- YouTube/Facebook: 1080p landscape. Instagram: separate portrait canvas, default **720 × 1280 compatibility**, with the full field fitted inside. Optional 1080 × 1920 setting if your Instagram account accepts it.
- Hide-preview and dark battery-screen controls, microphone mute, a framing guide, screen wake lock where supported, feed-delay labels and upload health.
- A private-network setup, encrypted RTMPS, origin-bound sessions and one-use streaming tickets. See [SECURITY.md](SECURITY.md).
- Automated tests, a real-match regression fixture, a GitHub Pages workflow and full source code.

## The three practical limits

**GitHub Pages hosts the interface; it cannot run a video relay.** An existing laptop must stay powered and connected during the match. The documented free personal route uses GitHub Pages + your laptop + Tailscale Serve over your private network. No paid multistreaming subscription is required by this code. Internet/data, electricity, hardware and any account/provider charges still belong to you. Free service eligibility and limits can change.

**1080p does not make digital zoom lossless.** This app applies no software zoom or upscaling. The camera's native zoom API may itself use digital processing. Optical detail depends on the phone, lens, lighting and distance. The browser cannot certify that every zoom position is optical. Use a telephoto lens/camera where your browser makes it available. Encoding and platform recompression are also lossy.

**A working public feed is not a guaranteed permanent API.** The CricClubs read-only overlay-data endpoint returned match 986 successfully during validation on October 29, 2026. Availability, schema, licensing and league access can change. The adapter displays real errors and stale labels. It never fabricates a score or bypasses login/bot checks. An approved-feed adapter is available if needed.

## Verified sample

[FWCWL match 986](https://cricclubs.com/FWCWL/viewScorecard.do?matchId=986&clubId=300), FWCWL 2026–27 Season:

| Team | Score | Overs |
| --- | --- | --- |
| Royal Bulls CC | 207/9 | 35 |
| ICAT | 208/5 | 30.5 |

Result from the feed: **ICAT won by 5 Wickets**. This match is completed, so its overlay is labelled MATCH COMPLETE. It is not a simulated live match. The application fetches the selected match from the relay; the test fixture is never used as a live-data fallback.

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
| `relay/lib/encoder.mjs` | FFmpeg composition, landscape encoding and per-platform forwarding |
| `relay/lib/security.mjs` | Session and one-use ticket lifecycle |
| `relay/.env.example` | Configuration template, without real secrets |
| `.github/workflows/pages.yml` | Publishes only `web/` |
| `docs/SETUP.md` | Complete setup instructions |
| `docs/CRICCLUBS.md` | Score feed behavior and approved JSON contract |
| `docs/TROUBLESHOOTING.md` | Camera, network, score and output remedies |

No service worker caches tokens, score feeds or stream data. No third-party analytics or fonts are loaded. Video is not recorded to disk by the application.

## Official references

- [GitHub Pages introduction](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Custom GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) and [CLI](https://tailscale.com/docs/reference/tailscale-cli/serve)
- [Tailscale free-plan eligibility](https://tailscale.com/docs/account/manage-plans/free-plans-discounts)
- [YouTube encoder settings](https://support.google.com/youtube/answer/2853702)
- [YouTube RTMPS](https://developers.google.com/youtube/data/live/guides/rtmps-ingestion)
- [Instagram Live Producer help](https://help.instagram.com/1294856766728582) — account access may be required
- [CricClubs pricing](https://scores.cricketsingapore.com/SingaporeCricketAssoc/pricing.do)

This project is independent of CricClubs, YouTube, Meta and Tailscale. It does not create platform accounts, supply stream keys, or override their eligibility and delivery rules.
