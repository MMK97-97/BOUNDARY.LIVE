# Troubleshooting

| Symptom | Check / remedy |
| --- | --- |
| Camera access needs HTTPS | Open the GitHub Pages HTTPS URL or private HTTPS Serve URL. An ordinary LAN HTTP address is not sufficient on a phone. |
| Camera/microphone denied | Allow both in browser site settings. Check OS privacy settings. Close other apps using the camera. |
| Camera cannot supply 1080p | Rotate to landscape and reopen. Try an exposed rear camera/lens. Or explicitly choose Auto/720p/480p in the header before streaming. The 1080p setting requires native 1920 × 1080 and does not silently upscale. |
| Zoom is disabled | The browser did not expose the camera's zoom capability. Try current Chrome on Android or a different camera. Safari/iPhone lens/zoom controls vary. CSS zoom would not change real capture quality, so none is substituted. |
| Zoom looks soft | Native camera zoom can still be digital. Use an available optical telephoto camera, improve lighting, reduce zoom or change camera position safely. Output resolution is not an optical-detail guarantee. |
| Relay unreachable | Keep laptop awake and Node running. Keep Tailscale connected on both devices. Open relay `/health` from the phone. Use the exact HTTPS origin from `tailscale serve status`. |
| Origin not allowed | `ALLOWED_ORIGINS` must contain the browser origin, without a repository path or trailing slash. Restart the relay after editing it. |
| Browser blocks private network access | Allow access for your own relay if prompted. If unavailable, open the relay's own private HTTPS website and add that exact origin to ALLOWED_ORIGINS. See SETUP.md. |
| Relay token incorrect | Use the value after `RELAY_TOKEN=` from local `.env`, without extra spaces/quotes. Tokens are not saved in the website; enter again after a refresh. |
| Too many failed logins | Wait one minute. Verify the token locally. The lockout protects the relay; do not disable it to diagnose. |
| Session/ticket expired | Reconnect. An upload ticket is single-use and expires after 30 seconds. A browser refresh loses the in-memory session by design. |
| Encoder not ready | Install FFmpeg with libx264/drawtext. Set FFMPEG_PATH or FONT_FILE if needed. Restart. |
| Platform TLS/certificate error | Update the OS CA store and FFmpeg. If the build needs a CA file, set TLS_CA_FILE to a trusted bundle. Do not disable certificate verification. |
| No destination is selectable | Add its server URL and key in laptop `relay/.env`, restart the relay, then reconnect the phone. |
| Invalid destination configuration | Use the exact RTMPS server and separate key supplied by the named platform. Server hostname must be on an expected YouTube/Meta domain. If a platform changes its legitimate hostnames, review and update the host allowlist. |
| CricClubs feed unavailable | FWCWL uses Club 300. Match 986 is a completed example. Check IDs and league permissions. The app cannot unlock restricted feeds. Use an approved feed if required. |
| Same score for a long time | A successful fetch does not prove the scorer has entered another ball. Check the match's public scorecard and whether it is live or completed. |
| SCORE DELAYED | A fetch failed or the last successful fetch is over 30 seconds old. Check laptop internet/feed access. Last valid totals remain visible with the delay label. |
| A match from another league loads incorrectly | Match IDs need a club namespace. Paste the full scorecard URL rather than assuming club 300. |
| Camera preview differs from outgoing replay | The normal phone monitor remains on the live camera while the laptop plays replay on air. The status says REPLAY ON AIR. Clips → Preview checks the saved footage privately. Watch a platform preview for the actual program. |
| Replay shows the wrong moment | Calibrate scoring delay before the next session. Increase it for a clip that is too late; decrease it for a clip too early. Mark ball or select the buffer manually, preview, then On air. Snapshot data cannot guarantee exact ball timestamps. |
| A four or six did not replay | Missing batter counters, several deliveries between polls or a boundary window outside buffered RAM are deliberately skipped. Four byes/wides do not count as bat boundaries. Use Clips and an authorized delivery-event feed if exact automation is essential. |
| Historical 986 does not trigger celebrations | Correct: it is completed and establishes a baseline. Automatic events require changes after joining a live innings. |
| Only some players appear in scorecards | The snapshot feed did not supply a complete innings card. The app accumulates players observed since connection and labels the card incomplete. Connect an approved feed with complete card arrays to include every player. |
| Replay buffer is shorter than 30 seconds | The JPEG memory cap was reached first. High-detail video takes more RAM. See AUTOMATION.md; actual retained seconds are shown in Clips/Stats. |
| Clip expired / no clip download | Clips are private to the active owner session and expire under memory limits or at Stop. Reconnect/start a new session after expiry. Download one clip at a time; one export is allowed for up to 30 seconds. |
| On-air buttons disabled | Start a session using the program processor. At 1080p with all automation off, the direct encoder path has no replay/card processor. Camera hardware controls remain disabled until capture is open. |
| Cast or AirPlay opens help | The browser/source/receiver does not support native casting of that local video. Open the public broadcast in its YouTube/Meta player and use its Cast/AirPlay feature. |
| Monitor volume is disabled | The live camera monitor is muted to prevent feedback. Preview a clip to enable listening. Use Settings → Mic to mute the actual outgoing microphone. |
| Upload cannot keep up | Improve phone upload, use Balanced, or move to a stronger connection. Keep bandwidth headroom. The app stops before queues grow without bound; it does not silently lower 1080p quality. |
| No camera data for 15 seconds | Keep the website in the foreground and the phone unlocked. Avoid switching apps, calls and OS camera conflicts. Use the built-in battery screen, not the lock button. |
| Platform output failed | Check the current stream key, RTMPS URL, account eligibility and its Live Producer preview. Refresh Instagram keys if required. Failed destinations do not automatically restart; stop and start a new session after correcting settings. |
| Video reaches relay but audience sees nothing | Sending packets does not publish a platform broadcast. Confirm Go Live in each platform and check the selected audience. |
| Instagram trims field edges | Keep the portrait conversion enabled (it is automatic). The entire landscape feed is fitted inside a portrait canvas. Do not stretch/crop it in Live Producer. |
| Laptop CPU is high | Replay requires JPEG decoding/buffering, PNG composition and a continuous program encode. Test fewer destinations, ensure cooling, or try ENCODER_PRESET=superfast. Disable all automation at native 1080p for the direct path. Instagram and clip export add encodes. Restart after config changes; faster presets can reduce compression efficiency. |
| Phone gets hot or battery drains | Hide preview, use battery screen, lower brightness, shade/ventilate the phone, use Balanced and a stable connection. A full-match runtime cannot be guaranteed without external power. |
| Video stalls after a network drop | A fresh recording/container is needed. Restore the connection and start a new session; buffered old footage is never replayed as if live. |
| Blank page after GitHub upload | Upload extracted files, not just the ZIP. Include the Pages workflow, select GitHub Actions in Settings → Pages and check the Actions run. Keep the deployed artifact path as `web`. |

Check `docs/VALIDATION.md` for verification limits. A private test with the actual phone, ground connection and platform accounts is required before match day.
