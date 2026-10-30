# Connect YouTube and create a live broadcast

The website can sign in with Google, create a YouTube event and ingestion stream, bind them, and send the resulting RTMPS key directly to the cloud encoder. You do not copy a key into the phone. Preview, Go live and End are separate controls so camera upload does not accidentally publish a broadcast.

## One-time Google configuration

1. In your Google Cloud project, enable **YouTube Data API v3**.
2. Configure Google Auth Platform branding, audience and data access. For a private test, add your Google account as a test user where Google requires it. Request the scope `https://www.googleapis.com/auth/youtube.force-ssl`.
3. Create an OAuth client with application type **Web application**. Register the exact callback URL on the website you will open:

```text
https://YOUR_USERNAME.github.io/MK97/youtube-callback.html
```

4. Use your actual repository path. Publish the new callback files with the rest of `web/`. The protocol, host, path and trailing slash must match the registered URI. This callback is on GitHub Pages; Google does not need access to your private relay.
5. Put the client details only in the cloud service's private environment (or `deploy/cloud/.env` on your own VM):

```ini
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_WEB_CLIENT_SECRET
YOUTUBE_REDIRECT_URI=https://YOUR_USERNAME.github.io/MK97/youtube-callback.html
ALLOWED_ORIGINS=https://YOUR_USERNAME.github.io,http://localhost:8787,http://127.0.0.1:8787
```

Restart `npm start` and reconnect the relay. Never place the client secret, Google tokens or stream keys in `web/`, a public repository, a screenshot or a chat message. No real credentials are supplied in this ZIP.

For local development, register `http://localhost:8787/youtube-callback.html` and open `http://localhost:8787`. A phone's localhost address points to the phone, so use the deployed HTTPS callback for phone operation. The callback origin must match the studio origin. If you open the private relay's own HTTPS site instead, configure and register that site's exact callback where Google permits it.

Google controls consent, verification, permitted users, API quota and channel live eligibility. If Google requires verification/review or blocks access, complete its requirements. The app cannot enable a restricted channel or bypass a Google security screen. Test-mode grants may expire; reconnect when prompted. The code does not require a paid multistreaming service, but it cannot promise third-party eligibility or unlimited free API use.

## Use the website

1. Connect the cloud studio. Open **Settings → YouTube account & live setup**.
2. Press **Connect YouTube**, allow this studio's popup, and sign in on Google's page. Select the Google/Brand Account for the intended channel and grant the requested YouTube permission. Keep the original studio tab open.
3. The callback returns a one-use authorization code to that tab. A private same-origin channel is available if browser isolation removes the popup opener. The authenticated relay exchanges the code for tokens and reads the channel identity. Check the displayed channel name. **Cancel sign-in** abandons a pending flow.
4. Enter title, description, visibility, scheduled local time and the explicit audience declaration. The browser shows its scheduling timezone. Unlisted is the initial visibility; choose the actual setting you want. A Public setup can create a visible upcoming event before you send video.
5. Press **Create YouTube setup**. The relay creates an ingestion stream, creates the event and binds them. **Ready · kept on relay** means the RTMPS ingestion key is available in relay memory. The key and Google tokens are never returned to the page.
6. Load the match and open the camera. Select YouTube in Destinations, close the panel, then press the bottom **START** to upload camera video. Capture remains at your selected native resolution; YouTube detects the incoming format.
7. Reopen the YouTube panel. Wait for **Video signal: active**. Status is cached for up to 15 seconds. **Preview** requests YouTube's testing stage; use **YouTube Studio** to inspect the actual monitor video/audio.
8. Press **Go live** when ready. Check the returned event status and the public **Open broadcast** link. The Share panel automatically receives this public URL unless you have supplied another viewing link.
9. Press **End YouTube broadcast → Yes, end YouTube** to finish the event. Another active destination continues. If YouTube was the only destination, the relay finishes the upload. Stop remaining outputs separately and end Facebook/Instagram in their own control rooms.

The website does not embed an account-management browser, collect a Google password or automatically publish as soon as camera packets arrive. Google can report intermediate `testStarting`/`liveStarting` states; wait for the status update. An iframe preview is not embedded because channel embedding permissions vary.

## Retry, switch accounts and reconnect

Repeated creation with the same request ID/details reuses progress. A definite failure can be retried without creating an already confirmed stream again. If a network failure leaves a write unconfirmed, the app blocks an automatic retry and asks you to inspect YouTube Studio. **New setup** requires you to acknowledge that check. Previous events/streams remain in Studio; the application does not delete them.

Stop camera upload before changing an account or event setup. **Disconnect account** clears that session's private data and asks Google to revoke the grant. If revocation cannot be confirmed, the website says so; remove the app using your Google account's connected-app controls if needed. Reconnect to select another channel. A pending sign-in blocks use of an older/manual YouTube destination until sign-in finishes or is cancelled.

Google access/refresh tokens, stream keys and the selected event stay in server memory, scoped to the relay session. Restarting the relay, logging out or session expiry clears them. A browser refresh loses the relay session, so reconnect and authorize again; existing YouTube events can still remain in Studio. If the relay/network fails while an event is live, end it in YouTube Studio. Auto-start and auto-stop are intentionally disabled for explicit operator control.

Facebook and Instagram retain the documented Live Producer key workflow in this version. This YouTube integration does not claim to sign in to those platforms.

## References and verification limits

- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Create an ingestion stream](https://developers.google.com/youtube/data/live/reference/rest/v3/liveStreams/insert)
- [Create a broadcast](https://developers.google.com/youtube/data/live/reference/rest/v3/liveBroadcasts/insert)
- [Preview/live/end transitions](https://developers.google.com/youtube/data/live/reference/rest/v3/liveBroadcasts/transition)

Automated tests simulate Google's responses and exercise the real relay and FFmpeg outputs locally. No Google client credentials or user account were supplied, so live Google consent, channel eligibility, quota, provider TLS and an actual public broadcast remain to be verified in your account.
