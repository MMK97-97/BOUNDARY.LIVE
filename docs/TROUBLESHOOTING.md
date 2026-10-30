# Troubleshooting MK97 1.6

| Problem | Check / action |
| --- | --- |
| Website still shows Clips or a laptop setup | You are viewing an older deployment. Upload the complete new source, include hidden workflows, remove the old replay-ring module and redeploy both website and server. A ZIP committed as one file does not install it. |
| Set up stream opens when START is pressed | A readiness item is missing. Connect the cloud studio, select a valid destination, load the match or switch off overlay, and open a supported camera. |
| Cloud service unreachable | Open its exact HTTPS `/health` address. Check the cloud dashboard for startup errors, a sleeping service, restart, expired free quota or failed build. Check exact origins and WebSocket support. |
| Relay token rejected | Copy the current private RELAY_TOKEN from the hosting dashboard or server configuration. Restart/redeploy may have changed it. Do not copy a test placeholder or put the token in a URL. |
| Session expired | Reconnect. Browser refresh/close loses the in-memory token. Google grants and session destination keys must be set up again; existing platform events may still exist. |
| Origin not allowed | Set PUBLIC_URL to the real HTTPS cloud origin, or use Render's supplied URL. For Pages, add only its exact origin to ALLOWED_ORIGINS, without repository path/trailing slash. Restart between broadcasts. |
| Encoder not ready | Inspect the specific runtime error. The Docker image supplies FFmpeg, libx264 and fonts. Ensure the host actually runs the Dockerfile and the image built successfully. |
| Native 1080p fails | Rotate the phone, reopen the rear camera or try another exposed lens. Choose Auto/720p/480p if the camera/browser cannot provide 1920 × 1080. Lower-resolution output is not native 1080p. |
| Camera unavailable on preview/test host | Camera access requires a secure context. The isolated HTTP browser fixture does not validate real phone hardware. Use the real hosted HTTPS app on the phone. |
| Camera/microphone permission denied | Allow both for your own app origin in browser settings; close another app using the camera, then retry. |
| Zoom disabled | The browser did not expose native camera zoom or capture is closed. Use an available optical rear lens. No software enlargement is substituted. |
| No destination selectable | Connect the cloud studio, save a current RTMPS server/key in the app or complete connected YouTube event setup. Keys are not read back. |
| Manual YouTube key rejected while connecting an account | Finish/cancel Google authorization or disconnect the account first. Account setup intentionally takes precedence to avoid sending video to an unintended channel. |
| Facebook/Instagram cannot sign in inside MK97 | Their OAuth/account publishing controls are not implemented. Use an eligible Live Producer account and its current RTMPS key. Their own publication steps remain necessary. |
| Platform rejects output | Verify encoder eligibility, exact RTMPS URL/key and platform preview. Instagram may require a fresh session key and supports account-dependent portrait formats. |
| Browser upload stalls | Improve the phone uplink or lower requested capture bitrate/resolution. Keep the app visible and phone unlocked. A fresh stream is required after connection loss. |
| Free server restarts or encoding falls behind | Check CPU/RAM and provider limits. Try one output/lower resolution for testing. A plan incapable of real-time 1080p is not a suitable free 1080p host. Do not add keep-alives to evade quotas. |
| Score delayed | Last verified data is over 30 seconds old or a read failed. Check server/provider access and correct Match ID/Club ID. Last values stay clearly labelled delayed. |
| Wrong/old match data | Enter the correct Club ID or full scorecard URL. Each selection resets old source data; there is no 986 fallback. Stop the active stream before changing matches. |
| Full batting/bowling card incomplete | The public ticker contains limited players. Full HTML may be blocked, unsupported or contradictory. Check CRICCLUBS_CLUB_ID/CRICCLUBS_LEAGUE and source note. The app does not bypass verification or invent missing rows. |
| Commentary empty | The accessible source supplied no commentary. Score changes are not rewritten as fictional ball commentary. |
| Match-loaded success message | Removed in 1.4.1 and still absent in 1.6. Errors and other actionable notices remain dismissible. |
| Microphone muted unexpectedly | Check both the bottom speaker button and Camera & sound → Mic. Local preview is always muted to prevent acoustic feedback. |
| No monitor audio | Intentional for the camera preview. Check audio on platform playback using separate headphones/device when possible. |
| Card buttons disabled | They require an active camera upload and supplied match data. The live-only encoder supports score graphics; no footage buffer is required. |
| Website score appears before platform playback | Source polling and browser updates are independent of the platform's video playback delay. This is near-real-time polling, not an instantaneous provider push API. |
| Phone gets hot or battery drains | Shade/ventilate the phone, lower screen brightness, hide the preview, use Battery screen and test a lower capture profile. Hardware acceleration and battery endurance depend on the device/browser. |
| Cast unavailable | Local MediaStream routing is often unsupported. Open the public platform player and use its own Cast/AirPlay control where available. |

Never bypass a browser certificate warning or provider verification screen to make the app appear connected. End platform events separately if a camera/server/network failure leaves a broadcast open.
