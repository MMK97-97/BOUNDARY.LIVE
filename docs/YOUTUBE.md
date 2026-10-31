# YouTube setup — MK97 1.8 on Render

MK97 signs in with Google, creates and binds a YouTube event and ingestion stream, and keeps the RTMPS key private on the cloud server. Remembered devices save it with the Google grant and setup progress in encrypted storage; see [SAVED_STUDIO.md](SAVED_STUDIO.md). Camera START sends video; **Go live** is a separate action that publishes it. No laptop is required at the ground.

## 1. Update the app and server together

Extract the latest source ZIP. Upload the files inside `MK97` to the root of your GitHub repository, including `web/`, `relay/`, `Dockerfile`, package files and hidden workflows. On Render deploy the latest commit. Keep your existing private `RELAY_TOKEN`.

Open your **Render HTTPS app address** on the phone. Sign in to your MK97 studio account. Create it once using an already connected device or your private studio token; see [ACCOUNT_SIGNIN.md](ACCOUNT_SIGNIN.md). Stream setup shows both the website version and cloud-reader version; both should be **1.8.0** for this update.

## 2. Copy the callback from MK97

Open **YouTube account & live setup**. Under **Google authorized redirect URI**, copy the full URL. For a Render-hosted studio it is:

```text
https://YOUR-SERVICE.onrender.com/youtube-callback.html
```

Replace the example hostname with your actual service. Do not use a GitHub Pages callback while opening the Render app. The app displays a mismatch and the correct replacement if a different callback was configured.

## 3. Create the Google OAuth client once

1. Open your Google Cloud project and enable **YouTube Data API v3**.
2. Configure Google Auth Platform branding, audience and data access for MK97. For your own test, use the appropriate audience and add your Google account as a test user when required. The app requests `https://www.googleapis.com/auth/youtube.force-ssl` to manage your channel's live setup.
3. Under **Clients**, create an OAuth client with application type **Web application**.
4. In that client's **Authorized redirect URIs**, add the exact URL copied from MK97. Scheme, host, path and trailing slash must agree. Adding it only as a JavaScript origin does not register a redirect URI.
5. Save. Copy the client ID and client secret privately into Render's **Environment** settings:

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | The Web application's client ID ending in `.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | That client's secret |
| `YOUTUBE_REDIRECT_URI` | The exact callback copied from MK97 |

Save and redeploy the service. These are different from `RELAY_TOKEN`. Keep all secrets out of GitHub, browser URLs, screenshots and chat messages. Do not enter your Google password in MK97.

When `YOUTUBE_REDIRECT_URI` is empty, v1.6.2 derives it from the operator-configured `PUBLIC_URL` or Render's `RENDER_EXTERNAL_URL`. **You must still register that exact URI in Google Cloud.** An explicit old value takes precedence; update it or remove it if it points to Pages.

## 4. Enable the channel's live access

In YouTube Studio enable live streaming for the intended channel and complete Google's verification/eligibility requirements. Google can impose an activation wait, account restrictions, consent verification or API quotas. The code does not remove those requirements.

## 5. Connect and create the broadcast from the phone

1. Reopen MK97 on the Render app address and unlock the cloud studio.
2. Open YouTube and tap **Connect YouTube**. Allow popups/tabs for this website.
3. Sign in on Google's page, select the intended Google/Brand Account channel and grant the requested YouTube permission. Keep the original MK97 tab open.
4. Return to that original tab. With a same-origin cloud callback, the server exchanges the one-use code and MK97 reads the result automatically. This works without a popup opener or BroadcastChannel. A denied/error result is shown in the app. **Cancel sign-in** abandons the flow.
5. Check the channel name. Enter title and description, choose visibility and the explicit audience declaration. Choose **Set up to start now** or **Schedule for later**. The local scheduling timezone is displayed. Public visibility can create a publicly visible upcoming event.
6. Tap **Create YouTube setup**. MK97 creates a stream/event, binds them and selects YouTube as a destination automatically. The key stays on the server. An incomplete ingestion response is re-read using the same stream ID; it never falls back to unencrypted RTMP.
7. Tap **Use YouTube & return to studio**. Load the match, open the rear camera, and choose a native capture resolution. If you do not want a score, disable the overlay in Score.
8. Press **START**. This uploads camera video; it does not publish the event.
9. Open the YouTube panel. Wait for **Video signal: active**. **Refresh status** requests a fresh check. **Preview** starts YouTube's test stage; use its Studio link to check actual video, audio and score.
10. Tap **Go live** to publish to the selected audience. Intermediate `testStarting` / `liveStarting` states can take time; the app polls while visible and avoids repeating the transition.
11. Use **End YouTube broadcast → Yes, end YouTube** before stopping the remaining camera upload. Other selected destinations continue. If YouTube was the only destination, the upload finishes.

Start with a private/unlisted test. Actual hosting capacity, camera support, network quality and YouTube channel access determine what can run successfully.

Setup feedback now stays below the panel heading so it cannot cover the Back or Close buttons on a phone.

## Common failures

| What you see | Fix |
| --- | --- |
| Connect YouTube disabled; one-time setup shown | Add the real Google Web client ID/secret in Render, enable the API, register the displayed callback and redeploy. |
| Callback mismatch in MK97 | Set `YOUTUBE_REDIRECT_URI` to the exact callback shown for the website you opened, and register it for that same Google client. |
| `redirect_uri_mismatch` on Google | Compare the full displayed URI with **Authorized redirect URIs**, including protocol/path/slash. Use the same Google project/client as Render. |
| Google rejects the client ID/secret | Confirm both belong to a Web application client; replace the incorrect private environment value and redeploy. |
| Google blocks consent or says access denied | Check the consent audience/test users, organization policy and any required verification. Follow Google's requirements. |
| Channel has no live permission | Enable/verify the channel in YouTube Studio and complete any activation wait or restriction. |
| Returned to a tab but MK97 still waits | Return to the original MK97 tab, without reloading it. Let it check the result. Check that both server and web are v1.8.0. Cancel and reconnect if the flow expires. |
| Setup failed partway | A definite failure keeps confirmed progress; **Retry setup** reuses the request/details. Fix the stated cause first. |
| Setup result unconfirmed | A write may have succeeded. Inspect YouTube Studio before acknowledging **New setup**. The app blocks automatic duplicate creation. |
| Go live is disabled | Start camera upload, wait for an active YouTube signal and a ready/testing event; refresh status. |
| Key ready but nothing is public | START only sends video. Use **Go live**, then inspect the public watch link. |
| Server or page restarted | Remembered devices restore the saved Google grant and setup. MK97 rechecks the event binding before enabling the key. Temporary sessions need authorization again. Inspect any uncertain event in YouTube Studio before creating another. |

## Security and lifecycle

State is random, one-use, expiring and bound to the initiating device session/origin, even when the studio is shared. Google exchanges use S256 PKCE. Cloud callback redirects contain only a fixed result; tokens and keys are not returned to the page. Remembered-device grants and setup progress are encrypted in durable storage and survive restarts; temporary grants remain memory-only. Device sign-out preserves shared connections. Explicit account disconnect removes the saved grant and also asks Google to revoke it; the UI reports if revocation cannot be confirmed. Provider expiration can still require authorization again.

Repeated writes with the same request/details reuse confirmed progress. Network-ambiguous writes require Studio review before another setup. Existing YouTube events are not automatically deleted. Stop camera upload before changing the connected account or event. Auto-start/auto-stop remain disabled for operator control.

## Optional Pages and local use

If you deliberately open GitHub Pages, use its exact path, for example `https://mmk97-97.github.io/BOUNDARY.LIVE/youtube-callback.html`, register that URI and set it on Render. Add `https://mmk97-97.github.io` to `ALLOWED_ORIGINS`. A static callback uses same-origin popup messaging/BroadcastChannel; the cloud server callback is preferred for phone use. Origin-bound sessions cannot move between Pages and Render. Remembered-device cookies work only on the hosted studio, so use **Open hosted studio** from Pages.

For local development register `http://localhost:8787/youtube-callback.html` and open that origin. Phone localhost points to the phone itself; use the deployed HTTPS app at the ground.

Facebook/Instagram retain their separate eligible Live Producer/key workflows.

## Verification and primary references

Automated checks cover real HTTP callback delivery, one-use/expired/cancelled state, session ownership, simulated Google token exchange, idempotent setup, partial response recovery, retries, race conditions and live transitions. The browser uses an explicitly isolated synthetic Google/YouTube provider. A separate real FFmpeg pipeline writes local test outputs. No actual Google client/account or external YouTube broadcast was used.

- [Google OAuth Web application configuration and exact redirect matching](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Enable and use YouTube Data API](https://developers.google.com/youtube/data/getting-started)
- [YouTube live eligibility](https://support.google.com/youtube/answer/2474026)
- [YouTube RTMPS ingestion](https://developers.google.com/youtube/data/live/guides/rtmps-ingestion)
- [Preview/live/end transitions](https://developers.google.com/youtube/data/live/reference/rest/v3/liveBroadcasts/transition)
