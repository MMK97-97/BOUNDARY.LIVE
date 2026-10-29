# Validation report — October 29, 2026

## Passed

| Check | Observed result |
| --- | --- |
| JavaScript/source checks | All 14 modules parsed; 81 unique UI IDs matched source references; local assets resolved. |
| Automated tests | **66 passed, 0 failed, 0 skipped** in the final local run. |
| Actual CricClubs retrieval | The actual Node ScoreService fetched club 300 / match 986 from CricClubs over HTTPS and normalized ICAT 208/5, 30.5 overs, result “ICAT won by 5 Wickets”. |
| Real-match regression | A whitelisted fixture validates both teams, innings selection, total, overs, completed status and series. |
| Actual media encoding | FFmpeg processed fragmented MP4/AVC with audio into H.264/AAC at 1920 × 1080, 30 fps. A decoded output pixel verifies the score graphic was burned into video. |
| Android-style fallback | A real VP8/Opus WebM input passed the same ingest path. This tests format compatibility, not a physical Android phone. |
| Portrait conversion | FFmpeg produced a 720 × 1280 Instagram-compatible portrait frame and kept the field fitted inside. |
| Multiple destinations | An authenticated WebSocket upload passed through the real server and FFmpeg pipeline to two local output writers, each verified at 1920 × 1080 with audio. Only a temporary test wrapper redirected fake platform URLs to local files; nothing was broadcast publicly. |
| Shutdown | The complete upload test finalized both outputs and released the relay's active-session flag. |
| Authentication | Invalid/missing sessions, master-token misuse, expired/revoked sessions, wrong origins and ticket reuse were rejected. |
| API/static boundary | Environment/source paths were inaccessible. The status API did not expose keys. Large/malformed JSON requests were rejected. |
| Destination restrictions | Unencrypted RTMP, untrusted/private hosts, file URLs, URL credentials and tee-injection syntax were rejected. TLS verification and inbound protocol restriction were checked. |
| Score outages | Deduplicated polling, cached values, stale labels, malformed data, oversized responses and in-flight match changes were tested. |
| Dependency audit | `npm audit --omit=dev`: 0 reported vulnerabilities in the locked dependency set at the time of inspection. This does not cover system binaries or future advisories. |
| Browser layout | Desktop and mobile iframe viewports of 390 px and 320 px were inspected. The mobile document had no horizontal overflow. |
| Browser error path | Opening the camera from the internal HTTP preview produced the intended HTTPS requirement, with no silent failure or fake camera state. |

The local environment used Linux, Node.js 24.22.1 and FFmpeg 6.1.1. The package requires Node.js 22.12+ and a maintained FFmpeg build. Its GitHub workflow configures Node 22 and validates code before deployment; that workflow has not been run in the user's GitHub account by this delivery.

## Still requires your equipment/accounts

- Real camera permission, microphone capture, zoom/lens controls and MediaRecorder behavior on the exact Android/iPhone model. The build environment did not have that phone.
- A sustained private HTTPS/WSS upload through your actual Tailscale network and ground connectivity. The private connection was documented against current official instructions, not provisioned in your account.
- Actual YouTube, Facebook and Instagram account eligibility, valid RTMPS keys, TLS/provider connectivity, preview acceptance, publishing and playback. No user stream keys were supplied and no external broadcast was started.
- Instagram acceptance of optional 1080 × 1920, and the quality actually distributed by each platform. Default 720 × 1280 portrait is a compatibility setting.
- A full-match endurance test, thermal behavior, battery consumption, cellular data use and simultaneous laptop CPU/upload capacity.
- Ball-to-video synchronization under real scorer and platform latency. There is no automatic scorer/video delay calibration in this version.
- Continuous CricClubs availability and future schema/access changes. A completed match proves retrieval/normalization, not an active scorer's update cadence.
- Independent penetration testing and OS/device security. These are engineering checks, not a formal security audit.

## Suggested private acceptance test

1. Publish the GitHub website and connect the laptop over private HTTPS. Start with one unlisted/private destination.
2. Load 986 in club 300 and compare the completed totals and result to CricClubs.
3. Check landscape 1080p, audio, each available zoom position and pitch framing on the phone.
4. Run for 15–30 minutes. Check the platform playback, not only the local preview. Monitor heat, battery and upload headroom.
5. Test a genuinely live match in your league; observe a scoring change reaching the overlay.
6. Add the other outputs. Verify Instagram's fitted portrait view and complete each platform's Go Live step.
7. Stop and restart normally. Then test one brief connectivity interruption privately and confirm you can start a fresh session afterward.
8. Before match day, run a longer rehearsal with the intended phone, power supply, laptop and ground network.

The source is tested and includes defensive error handling. No claim of zero bugs, zero security risk, lossless zoom, a guaranteed battery duration or guaranteed free third-party service availability is made.
