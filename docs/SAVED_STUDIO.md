# Save the studio once — MK97 1.7

Your cloud connection, platform keys, YouTube authorization, YouTube setup progress and selected match can now survive a page reload or server restart. Remembered browsers reconnect automatically for 30 days. Another phone/computer links once with a short-lived code and then uses the same saved studio. A new, unlinked device cannot open your private studio without authorization.

MK97 encrypts the saved profile with AES-256-GCM before writing it to PostgreSQL. The browser stores a protected device cookie, not the relay token or platform keys. One private studio and up to 12 fully trusted devices are supported. All linked devices have operator control. Only one camera upload runs at a time.

## 1. Update your existing GitHub/Render service

1. Download and extract `MK97_v1.7.1_Supabase_Source.zip`.
2. Open your existing repository, `MMK97-97/BOUNDARY.LIVE`. Upload the **contents inside `MK97`**, including `web`, `relay`, `scripts`, package files, `Dockerfile`, `render.yaml`, documentation and hidden `.github/workflows` files. Do not upload the ZIP as the application. Commit the update.
3. In the [Render dashboard](https://dashboard.render.com), open the existing **Web Service** for `boundary-live`. Open **Manual Deploy → Deploy latest commit**. Let the Docker build finish. Keep your existing `RELAY_TOKEN` and Google settings.
4. Open [your hosted studio](https://boundary-live.onrender.com/) on the phone. The website and cloud-reader versions should both show **1.7.1**. If your host is different, use its actual HTTPS address and update the public `studioUrl` in `web/studio-config.json`. That file contains the address only, never a token.

Updating `render.yaml` does not add environment variables to an independently created existing service. Complete the next two sections once. No GitHub access token is needed in MK97.

## 2. Create a free database

**Using Supabase instead of Neon? Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the Session pooler URI, root certificate and private schema.** The remembered-device steps below apply to either database.

Render Free erases local files when its instance restarts or redeploys. Use external PostgreSQL for durable saved connections; do not set `STUDIO_DATA_FILE` on Render.

1. Open [Neon](https://neon.com/) and create/sign in to your own account.
2. Select the **Free** plan and create a project named `mk97-studio`. Pick a region near your Render service. Leave the normal database/role defaults unless you already manage PostgreSQL.
3. Open the project and click **Connect** in the console navigation. Select the production branch, database and role. Choose the pooled connection option if offered; its hostname contains `-pooler`.
4. Copy the full PostgreSQL connection string, including its password. It starts with `postgresql://`. Paste it **only into Render's private environment field below**. Do not paste it into chat, GitHub, a website URL or a screenshot.

As checked October 31, 2026, Neon's Free plan is $0 with no time limit or required card, and has storage/compute quotas. Select Free rather than a paid plan and review its current usage page. Database storage does not provide free video encoding or unlimited streaming bandwidth.

## 3. Add two private Render settings

1. In [Render](https://dashboard.render.com), select the `boundary-live` **Web Service**, not the account's general settings or the static Pages site.
2. Open **Environment** in the service's left navigation. On a phone, expand the dashboard navigation or use the browser's desktop-site option if the navigation is hidden.
3. Under **Environment Variables**, add:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | The private PostgreSQL connection string copied from Neon |
| `STUDIO_ENCRYPTION_KEY` | A new independent encryption key generated once as described below |

4. To generate the encryption key entirely on your phone, open the MK97 1.7 hosted app in another tab, then **Set up stream → One-time setup to save connections → Generate private encryption key → Copy encryption key**. Generation happens in your browser and sends nothing to a server. Paste it into Render's `STUDIO_ENCRYPTION_KEY` value. The display clears after five minutes/closing the page. Retain a private backup in your password manager. Never replace an existing encryption key just to reconnect.
5. If creating a new Render service through the supplied Blueprint instead, `generateValue: true` generates the encryption key automatically and `DATABASE_URL` is supplied during setup. Do not create a second service just to update your current one.
6. Save the environment settings and deploy. Use **Save, rebuild, and deploy** if updating code as well; **Save and deploy** applies settings to an already built 1.7 image. Wait until the service is Live.

Alternative generation on a trusted computer with Node installed:

```sh
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
```

The relay token unlocks the first device; the encryption key protects the database. They are different secrets. Do not reuse one as the other. Keep `STUDIO_ENCRYPTION_KEY` unchanged across redeploys and database restores. Losing or changing it prevents the existing data from being unlocked; MK97 refuses to overwrite unreadable saved data.

## 4. Remember the first device

1. Open `https://boundary-live.onrender.com/` directly, or your actual hosted address. Saved-device cookies belong to that exact HTTPS host. On GitHub Pages, tap **Open hosted studio**.
2. Open **Set up stream**. The cloud studio address fills automatically.
3. Enter the existing `RELAY_TOKEN` from Render once. Name the device, for example `My match phone`.
4. Leave **Remember this device for 30 days** checked. Tap **Connect & remember**.
5. Confirm **This device is remembered** and its expiry date. If saving fails, MK97 shows the error; it does not silently call a temporary connection saved.
6. Connect YouTube once, or save the platform's current RTMPS server/key. Set your match and capture/overlay preferences. Keys clear from the form after submission and are stored encrypted on the server.
7. Reload the page. The device reconnects automatically and the saved destinations remain available. The camera and START still need your action; reconnecting does not automatically broadcast.

Temporary connections established before enabling storage are separate. Connect again with **Remember this device** selected and enter their platform credentials once to move to saved studio use. Temporary memory credentials are not copied automatically into durable storage.

## 5. Link a different phone, tablet or computer

1. On a connected remembered device, open **Set up stream → Remembered devices → Link another device**.
2. A one-use code appears. It expires after five minutes. Generating a new code replaces the previous one.
3. On the other device, open the **same hosted MK97 address**.
4. Open **Set up stream → Link this device with a one-time code**.
5. Name that device, enter the code and tap **Link & remember this device**.
6. Both devices now share the studio's saved platform connections and settings. Each stores its own protected cookie. Reload or reopen the app to restore saved preferences; the same active camera upload remains owned by the device that started it.

You do not need to re-enter the relay token or sign in to YouTube separately on every linked device. Each new device must be linked once. Treat the pairing code like a temporary password and share it only with a device/operator you fully trust.

## 6. Sign-out, expiration and provider changes

- **Sign out this device** deletes that device's access and stops its camera upload. It preserves the shared studio connections for other linked devices.
- The remembered-device list lets you sign out another device. Its sessions and unused upload tickets stop working. You cannot list or recover another device's cookie.
- The cookie lasts 30 days from linking. Private browsing, clearing site data, a different browser/profile or a new hostname can require linking again. If all devices are signed out/expired, recover with the relay token and **Remember this device**.
- **Disconnect YouTube** removes the saved Google grant and attempts provider revocation. It affects every linked device. It does not delete YouTube events automatically.
- Google/Meta can expire or revoke grants/keys or restrict streaming. Google OAuth applications in Testing can have short-lived refresh grants. If the provider requires authorization again, reconnect that platform once from a remembered device. Saving cannot override provider expiry.
- After a restart, a saved ready YouTube event is re-read and its stream binding verified before its ingestion key can be used. An uncertain in-progress creation is not repeated automatically; inspect the event in YouTube Studio before starting a new setup.
- Changing `RELAY_TOKEN` alone does not sign out remembered devices. Revoke unwanted devices in MK97 as well. Retain the encryption key and protect the hosting/database dashboards.

## Self-hosted persistent volume

The supplied Compose configurations mount a private named `studio_data` volume at `/appdata` and set `STUDIO_DATA_FILE=/appdata/studio.enc`. The image runs as `node`; the mountpoint is owned by that user and is not publicly served. `scripts/cloud-env.mjs` generates independent access/encryption keys for a new deployment without printing them or replacing an existing private `.env`.

For an existing Compose deployment, add `STUDIO_ENCRYPTION_KEY` privately before updating. Back up both the encrypted volume and its unchanged key separately. Do not run `docker compose down -v` unless intentionally deleting saved state. Use one application instance. If a forced process termination leaves `studio.enc.lock`, stop all instances, confirm no writer remains, remove only that stale lock and restart; do not delete the encrypted data file. PostgreSQL is recommended when you do not manage persistent local storage.

## Troubleshooting

| Message or symptom | Action |
| --- | --- |
| Remember checkbox disabled | Deploy both web/server 1.7, set the database and encryption key, redeploy and open the hosted address directly. |
| Saved storage unavailable | Check Render variable names, complete Neon connection URL, active database/project, and its quotas. MK97 verifies the TLS certificate. |
| Saved data cannot be unlocked | Restore the original encryption key. Do not generate another or reset the database to hide the error. |
| Device code incorrect/expired | Generate a fresh code on a remembered device and use it once within five minutes. |
| Repeated token prompt on Pages | Tap **Open hosted studio**. A cookie for Render cannot authenticate a different Pages origin. |
| Repeated prompt on the same host | Allow site cookies, avoid private mode/automatic site-data clearing and confirm the device was remembered rather than temporarily connected. |
| Service takes time to open | Render Free can sleep; let it wake, then retry. This is independent of whether saved state exists in PostgreSQL. |
| No remaining trusted device | Use the retained relay token to remember a new device. Saved platform connections are recovered from the encrypted database. |

## Validation and primary references

Automated tests cover encrypted file/PostgreSQL storage, process restarts, two distinct device cookies, one-use code races, revocation, short-session renewal, YouTube grant/event restoration, persisted uncertain writes and absence of keys in status responses. Browser QA uses only synthetic credentials and an isolated provider. A real Neon account/database and real Google account were not provisioned or exercised for this update.

- [Render environment settings](https://render.com/docs/configure-environment-variables)
- [Render Blueprint generated secrets](https://render.com/docs/blueprint-spec)
- [Render Free limits and ephemeral files](https://render.com/docs/free)
- [Neon Free pricing](https://neon.com/pricing)
- [Neon connection string instructions](https://neon.com/docs/get-started/connect-neon)
- [Secure cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
