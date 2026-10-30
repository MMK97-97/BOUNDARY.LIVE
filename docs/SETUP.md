# Setup: GitHub first, then your phone and laptop

## 1. Publish the website free on GitHub Pages

1. Extract the ZIP. Open the `mk97` folder.
2. Create a **public** GitHub repository, for example `MK97`. GitHub Free supports Pages for public repositories.
3. Upload the contents of `mk97` to the repository root. Include `.github/workflows/pages.yml`, `web/`, `relay/`, the docs and the package files. A ZIP uploaded as one file will not deploy the app.
4. Do **not** upload `relay/.env`, platform stream keys, `node_modules`, runtime data or camera footage. The supplied ZIP contains no real credentials.
5. Open the repository's **Settings → Pages**. Under the build/deployment source, select **GitHub Actions**.
6. Open **Actions → Deploy MK97 Cricket Studio → Run workflow**, or push another commit to `main`. Wait for the workflow to finish.
7. Use the HTTPS URL shown in Pages, usually `https://YOUR_USERNAME.github.io/MK97/`.

If updating an existing `BOUNDARY.LIVE` repository, keep that name and use its exact Pages and OAuth callback path. See [UPGRADE.md](UPGRADE.md).

Only `web/` is published by the workflow. The relay remains on your computer. Relative asset URLs make the site work inside a GitHub project subpath.

If uploading through a desktop file picker hides `.github`, use Git instead:

```sh
git init
git add .
git commit -m "Add MK97 cricket studio"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/MK97.git
git push -u origin main
```

The commands assume you created that repository. They do not create or publish to someone else's account. Check the staged file list before committing; `.gitignore` protects a locally generated `.env` when using Git.

## 2. Prepare the laptop relay

Use a reasonably recent laptop with a power supply and stable internet. For all three outputs, software video processing can load the CPU; the phone's battery saving comes from moving that work to the laptop. Start with YouTube only, then add destinations.

Install:

- **Node.js 22.12 or newer LTS:** [nodejs.org](https://nodejs.org/). Enable the installer option that adds it to PATH.
- **FFmpeg and ffprobe:** use a maintained build linked from [ffmpeg.org/download.html](https://ffmpeg.org/download.html). It needs `libx264`, AAC, the `drawtext` filter and font support.
- **Tailscale** on both your laptop and your phone, using its [official downloads](https://tailscale.com/download).

On Windows, open a new PowerShell window after installation. Check:

```powershell
node --version
npm --version
ffmpeg -version
ffprobe -version
tailscale version
```

If PowerShell blocks `npm.ps1`, run `npm.cmd` instead of `npm`; no execution-policy change is needed. If FFmpeg is not found, add the directory containing `ffmpeg.exe` and `ffprobe.exe` to your user PATH, then reopen PowerShell.

In the extracted project directory:

```sh
npm ci
npm run setup
```

The setup command creates **`relay/.env`** with a new random access token. It preserves an existing file. Open `.env` locally in a text editor.

Set `ALLOWED_ORIGINS` to the exact origin of your Pages site, without the repository path:

```ini
ALLOWED_ORIGINS=https://YOUR_USERNAME.github.io,http://localhost:8787,http://127.0.0.1:8787
```

If your GitHub username is `mmk97-97`, the origin would be `https://mmk97-97.github.io`. Use the actual origin shown for your site if GitHub provides a different Pages domain.

Leave `HOST=127.0.0.1`. The relay is intentionally not exposed to your Wi-Fi or the public internet. Keep the generated `RELAY_TOKEN` private. Platform keys are entered into this file, not the website.

Run:

```sh
npm start
```

Keep the terminal open. It should report `Encoder: ready`. If it does not, read the specific error. On Windows/macOS/Linux the relay looks for a system font automatically; set `FONT_FILE` to a real font file if necessary. Paths in `.env` should use forward slashes, for example `C:/Windows/Fonts/arial.ttf`.

## 3. Give your phone a private HTTPS path to the relay

This is the documented zero-hosting-subscription route for **eligible personal use**. Your existing laptop provides the compute. Check Tailscale's current plan eligibility for a club, organization or commercial activity; do not assume every use qualifies for the personal plan.

1. Sign in to Tailscale on the laptop and phone using the same private network/account. Keep the phone connected to Tailscale.
2. On the laptop run:

```sh
tailscale serve --bg http://127.0.0.1:8787
tailscale serve status
```

3. The first run can offer a link to enable HTTPS certificates for your network. Complete that setup in your own account. Tailscale's valid HTTPS certificate avoids self-signed certificate warnings.
4. Copy the **HTTPS origin** it prints, similar to `https://YOUR-LAPTOP.YOUR-NETWORK.ts.net`. Do not copy the example literally.
5. On the phone, open that address with `/health` appended. It should show a small JSON response with `ok: true`. This endpoint shows no keys or match data.
6. Return to the **GitHub Pages website** on your phone. Tap **Settings → Connect laptop relay**, enter the HTTPS origin without `/health`, and the `RELAY_TOKEN` from your laptop's `.env`. Press **Connect securely**.
7. If the browser asks to access your local/private network, allow it for your own relay. The server returns the private-network preflight permission only to configured origins. If your browser still blocks cross-origin private networking, use the same-origin alternative below.

Use **Serve**, which is private. You do not need Tailscale Funnel. Spectators use the public YouTube/Facebook/Instagram video and do not need Tailscale.

For consistent upload performance, check that your devices have a direct Tailscale connection with `tailscale status` / `tailscale ping YOUR-PHONE`. Tailscale may fall back to a relay on restrictive networks; test the real connection at the ground. The free route does not guarantee 1080p uplink capacity or uninterrupted service.

### Same-origin alternative

The laptop also serves the website. Add its actual `https://YOUR-LAPTOP.YOUR-NETWORK.ts.net` origin to `ALLOWED_ORIGINS`, restart `npm start`, and open that HTTPS address on the phone. Enter the same address in Connect relay. This avoids a GitHub-to-private-network cross-origin request while keeping the source and GitHub Pages deployment available. Set the origin explicitly; do not use a wildcard.

### Existing HTTPS host alternative

You can use your own HTTPS/WebSocket reverse proxy that permits sustained video upload. Keep the app's origin restriction and authentication. Configure certificate renewal and sufficient bandwidth. A rented server/domain may cost money.

Cloudflare Quick Tunnels are development tools without an uptime guarantee. Public Cloudflare proxy routes also have video-service restrictions. They are **not the recommended free video transport for this project**. Private Tailscale Serve avoids routing the camera feed through a public web-hosting tunnel. The static interface stays on GitHub Pages.

## 4. Configure YouTube, Facebook and Instagram

YouTube can now connect through Google sign-in and create its event/key from the website. Facebook and Instagram retain the Live Producer key workflow. Enable live streaming in each account first and follow the platform's eligibility requirements.

### YouTube

For the website login flow, complete the one-time [Google OAuth setup](YOUTUBE.md), then use **Settings → YouTube account & live setup → Connect YouTube**. Enter the broadcast details, create the setup and select YouTube as a destination. The key goes directly from Google's API to the private relay. START sends camera video; **Preview / Go live / End** in the YouTube panel control publication.

Manual fallback, if you are not connecting an account:

1. Open YouTube Studio → Create → Go live → streaming software/encoder.
2. Create an **unlisted/private test broadcast** first. Initial live activation can take time; follow YouTube's account instructions.
3. Copy the current **RTMPS** server URL and stream key to:

```ini
YOUTUBE_SERVER=rtmps://a.rtmps.youtube.com/live2
YOUTUBE_KEY=PASTE_YOUR_ACTUAL_KEY_HERE
```

Prefer the exact RTMPS URL from your control room. The code accepts YouTube subdomains and rejects unencrypted RTMP. If Studio initially shows RTMP, use its RTMPS option.

Once a YouTube account is connected, its account setup takes precedence and the manual key is suppressed. Pending Google sign-in also blocks the older destination until it finishes or is cancelled, protecting against streaming to the wrong channel.

### Facebook

1. Open your eligible Page/profile's Live Producer and choose streaming software.
2. Copy its **RTMPS server URL** and **stream key** to `FACEBOOK_SERVER` and `FACEBOOK_KEY`.
3. Keep the preview available and follow the platform's publishing step. Eligibility and audience controls are determined by Facebook.

### Instagram

1. Open Instagram on desktop and look for **Create → Live video / Live Producer**. If the account has no encoder/stream-key access, this website cannot enable it.
2. Copy the current **RTMPS server URL** and **stream key** to `INSTAGRAM_SERVER` and `INSTAGRAM_KEY`. Keys may need refreshing for each session.
3. Keep Live Producer open, start the camera upload from the phone, wait for the preview, then confirm **Go Live** in Instagram.
4. End the Instagram broadcast in its control room before stopping the relay. Check the platform's current session-duration limits for a full cricket match.

Default output is **720 × 1280 at 30 fps**, with the landscape field fitted inside a portrait frame. It keeps the field edges; it does not crop the batsman/bowler to fill the portrait. For an account that accepts 1080p portrait, set:

```ini
INSTAGRAM_HEIGHT=1920
INSTAGRAM_VIDEO_KBPS=6000
```

This requests 1080 × 1920 output. It does not guarantee that Instagram accepts or distributes 1080p, or recover details after fitting a landscape image into a portrait frame. Verify the actual account's preview and stream health.

After editing any `.env` values, stop and restart `npm start`, then reconnect the phone. No platform key is ever entered into GitHub or the phone interface.

## 5. Load FWCWL match 986

The site is preset to **Club ID 300**. Tap **Score**, enter **986** and press **Load**. Or paste:

```text
https://cricclubs.com/FWCWL/viewScorecard.do?matchId=986&clubId=300
```

The relay reads CricClubs' JSON overlay data over HTTPS and converts only score fields into a safe internal format. It is a server-side data reader; it does not iframe a scorecard page. There is no public CORS-proxy dependency, no CricClubs password/token extraction, and no changing CricClubs' overlay control panel.

For this completed match, the score should show ICAT 208/5, 30.5 overs, and the win over Royal Bulls CC. For a current match in the same league, change only the Match ID. Other leagues need their own Club ID or full scorecard URL. The relay polls every five seconds by default, with its two-second scheduler adding up to two seconds of polling jitter; it cannot update faster than the scorer provides data. No historic replays or milestone graphics play when loading 986.

## 6. Stream from your phone

1. Put the phone on a stable tripod, in landscape, with a clear view of the whole pitch.
2. Open the site in current Chrome on Android or Safari on iPhone. Browser/device support still needs testing on your actual model.
3. Connect the relay. Load the score. Open the camera and allow camera + microphone permission.
4. Leave the header quality pill on **1080p** and check that the actual capture readout is 1920 × 1080. If it fails, rotate the phone and reopen, try a different rear lens, or choose **Auto**, **720p** or **480p** before streaming. Auto tries the supported native sizes in that order. The app does not upscale 720p and label it native 1080p.
5. Use native zoom presets or the slider if enabled. Prefer an exposed optical telephoto lens over aggressive digital zoom. Lens switching is locked during a stream to avoid invalidating the recorder.
6. In Settings choose **Balanced** (8 Mbps upload at 1080p) or **More detail** (14 Mbps) with strong network/thermal headroom. Bitrate requests are hints to the browser; actual encoder output can differ. Lower resolutions use proportionally lower requested bitrates.
7. Keep the three broadcast automation switches enabled for replays, milestones and end-of-over cards. Set the scoring delay after a rehearsal; see [AUTOMATION.md](AUTOMATION.md). Select configured destinations, close the panel and press **START** in the bottom transport bar.
8. Confirm video/audio and score in each platform's preview. For connected YouTube use the website's **YouTube live setup → Preview / Go live** controls. For the other destinations use their control rooms. “Packets sent” does not certify a public broadcast.
9. Use the bottom **Pause local monitor** button or **Settings → Battery screen** after framing. Both keep camera upload running. Lower screen brightness manually. Keep the website visible, Tailscale connected and the phone unlocked; mobile browsers may suspend background camera capture.
10. In **Clips**, Preview checks a ball privately, **On air** switches the outgoing program to its replay, and Download exports an MP4. The bottom LIVE button returns only your local monitor to the camera. During an on-air replay the operator's raw camera monitor stays live; verify the program on the platform preview.
11. To finish a connected YouTube event, use **End YouTube broadcast → Yes, end YouTube**. Other active destinations continue. End Facebook/Instagram in their control rooms, then stop any remaining camera upload. Close the camera when done.

The Score panel's overlay switch controls the scorebar. During a session using the new program processor it can be changed on air. With all automation off at 1080p, set it before starting. [CONTROLS.md](CONTROLS.md) explains every layout button.

## Quality, bandwidth and battery

The phone captures once and uploads once. With automation enabled, laptop processing decodes a high-quality JPEG/PCM replay buffer, composites locally generated PNG graphics, encodes one continuous landscape program, copies it to YouTube/Facebook, and separately converts Instagram to portrait. Replays use original source audio. This adds laptop CPU/RAM and an extra lossy image stage; benchmark the intended laptop. Copying the encoded program to the two landscape destinations avoids a separate landscape encode for each one.

Default replay settings retain up to 30 seconds with a **192 MB JPEG memory cap**, plus bounded PCM audio and up to **64 MB of private clips**. High-detail frames can shorten the available buffer before 30 seconds. FFmpeg, graphics and process queues require additional memory. Settings are in `relay/.env`; the UI reports the available seconds, which matter more than the configured maximum. Disable all automation at native 1080p for the simpler encoder path if replay is unnecessary.

At 8 Mbps, a three-hour phone upload is approximately **10.8 GB**, plus audio and protocol overhead. At 14 Mbps it is about **18.9 GB** plus overhead. Multi-platform forwarding uses the laptop's internet upload: YouTube + Facebook at 6 Mbps each and Instagram at 3.5 Mbps is roughly 15.5 Mbps plus audio/overhead. If all devices share a hotspot/router, test both directions together. Keep substantial bandwidth headroom.

The landscape relay uses 6 Mbps if Facebook is selected, otherwise defaults to 10 Mbps. YouTube's recommendations vary by codec/resolution and can be higher; adjust `LANDSCAPE_VIDEO_KBPS` within the code's 4–14 Mbps range and verify network headroom. Source capture and platform compression still determine real detail. A higher bitrate is not a promise of lossless video.

No measured battery-runtime guarantee is provided. Native capture, fixed 30 fps, one upload, server-side graphics and hiding the preview reduce avoidable work, but encoding, camera use, VPN/network conditions, sunlight, temperature and screen brightness still consume power. A shaded phone, ventilation and an external battery help for long innings.

## Shut down and update

Stop the Node relay with Ctrl+C when finished. To disable its private HTTPS endpoint:

```sh
tailscale serve reset
```

This resets Serve configuration on that device, so use it only if you are not sharing other services there. Update Node.js, FFmpeg, Tailscale and the `ws` dependency periodically. Run the tests after an update. If a token or platform key is exposed, rotate it in the relevant account/configuration and restart the relay.
