# MK97 on Supabase — free database setup

Use **Supabase for MK97's saved studio database** and keep the existing **Render Docker service for the website, CricClubs reader and live video encoder**. You can continue operating everything from the phone; a laptop is not needed at the ground.

The complete streaming server cannot run on hosted Supabase Edge Functions. Their Free runtime limit is 150 seconds, memory is 256 MB and CPU time is bounded. MK97 needs continuously running Node/FFmpeg processes and a camera upload lasting the match. Supabase Storage is file storage, not an RTMPS encoder. The setup below replaces the database suggested in the previous guide; it does not move the encoder into Supabase.

| Component | Runs on |
| --- | --- |
| MK97 website and secure remembered-device sessions | Existing Render service |
| Encrypted platform keys, YouTube grant/setup, trusted devices and saved preferences | Supabase PostgreSQL |
| CricClubs polling and score overlay rendering | Existing Render service |
| Camera upload, FFmpeg encoding and YouTube/Facebook/Instagram forwarding | Existing Render service |

Existing saved storage also supports the private MK97 account in version 1.9.0. No Supabase Auth service, public signup or new environment keys are needed. Follow [ACCOUNT_SIGNIN.md](ACCOUNT_SIGNIN.md).

## 1. Update MK97 first

1. Extract `MK97_v1.9_Updated_Frontend_Source.zip`.
2. Open your existing GitHub repository, `MMK97-97/BOUNDARY.LIVE`.
3. Upload the **files inside the `MK97` folder**, including `web`, `relay`, `scripts`, package files, `Dockerfile`, `render.yaml`, documentation and `.github/workflows`. Do not upload only the ZIP or nest another MK97 folder inside the repository.
4. Commit the changes. In [Render](https://dashboard.render.com), select your existing `boundary-live` **Web Service** and use **Manual Deploy → Deploy latest commit**.
5. Keep `RELAY_TOKEN`, the existing `STUDIO_ENCRYPTION_KEY` if already configured, and your Google client settings unchanged. This update adds a private database schema and support for Supabase's root certificate.
6. After deployment, open `https://boundary-live.onrender.com/`. Both web/cloud versions should show **1.7.1** in Stream setup. If your service address differs, use its actual address.

Do this between broadcasts: redeploying ends a running camera upload.

## 2. Create the Supabase Free project

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and sign in to your own account.
2. Create or select a **Free** organization/project. If you already created a project for MK97, use that project.
3. Name a new project `mk97-studio` and select a region near your Render service.
4. Generate a strong **database password** and retain it privately. This is the database password, not your Supabase account password, relay token or Google secret.
5. Confirm the plan is **Free / $0** and create the project. Wait for the database to become available.

As checked October 31, 2026, Free includes 500 MB database storage and 5 GB egress, with up to two active projects; projects can pause after one week of inactivity. Review the current dashboard limits. This database stores a small encrypted profile, not video. Streaming CPU/bandwidth remains subject to the encoder host's separate limits.

## 3. Copy the right database connection string

1. Inside your Supabase project, click **Connect**.
2. Choose a PostgreSQL **URI** connection string for the **Session pooler**, using port **5432**. This IPv4 connection is suitable for the persistent Node server on Render. Keep the actual host/username shown by your project; do not copy a hostname from an example.
3. Copy the complete URI. Its shape is:

```text
postgresql://postgres.PROJECT_REF:YOUR_DATABASE_PASSWORD@YOUR-POOLER-HOST.pooler.supabase.com:5432/postgres
```

4. If the copied URI contains `[YOUR-PASSWORD]`, replace that placeholder privately with the database password in URL-encoded form. For example, `@` inside a password becomes `%40`, `#` becomes `%23`, and `%` becomes `%25`. Prefer a ready-to-copy URI with the password filled by the dashboard when available. Do not include a `psql` command or surrounding shell quotes in the Render value.
5. Retain the username suffix `.PROJECT_REF`. Copying only `postgres` can break pooler authentication.

The project URL, publishable/anon key and service-role API key are **not** PostgreSQL connection strings. MK97's database integration uses the server-side URI, so you do not need to paste any Supabase API key into the website or GitHub.

## 4. Download the database root certificate

1. In Supabase, open **Database settings → SSL Configuration**. Depending on the dashboard navigation, Database settings may be under Project Settings.
2. Use **Download Certificate** to download the project's server root/CA certificate.
3. Open the certificate as text. Copy its complete PEM content, starting with `-----BEGIN CERTIFICATE-----` and ending with `-----END CERTIFICATE-----`.
4. The next section puts this into `DATABASE_CA_CERT` on Render. It is certificate text, not a file path. MK97 accepts actual newlines or literal `\n` separators, validates the certificate and adds it to Node's normal trust roots. Hostname and certificate verification remain enabled.

If SSL enforcement is available for your project, enable it after confirming that the app connects with verified TLS. MK97 itself always requests TLS; it does not downgrade to plaintext.

## 5. Add three settings on Render

1. Open [Render Dashboard](https://dashboard.render.com) and select the existing **Web Service** for `boundary-live`.
2. Open **Environment** in the service's left navigation. On a phone, expand the navigation or enable the browser's desktop-site view if needed.
3. Add/edit these private environment values:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | The full Supabase **Session pooler** PostgreSQL URI |
| `DATABASE_CA_CERT` | The complete downloaded PEM root certificate |
| `STUDIO_ENCRYPTION_KEY` | Your existing unchanged key, or generate it once as below if this is the first saved-studio setup |

4. For a first setup, generate the key from MK97 on the phone: **Set up stream → One-time setup to save connections → Generate private encryption key → Copy encryption key**. Paste it into Render's `STUDIO_ENCRYPTION_KEY`. Retain a private backup. The app generates 32 random bytes locally; the page does not upload or retain this value.
5. Keep the existing `RELAY_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and hosted-app YouTube callback. Adding Supabase as a database does not require changing Google's callback to a Supabase URL.
6. Save and deploy. If the 1.7.1 image is already built, **Save and deploy** applies the settings. If uploading new code at the same time, use **Save, rebuild, and deploy** or deploy the latest commit afterward. Wait for the service to be Live.

Keep these values in Render's private settings. Do not paste the database URI, database password or encryption key in chat, public files, screenshots or `web/studio-config.json`. Changing the encryption key prevents old saved data from being unlocked. MK97 refuses to replace unreadable data.

## 6. Connect the first device and save the platforms

1. Open `https://boundary-live.onrender.com/` directly. The cloud address is detected automatically. On GitHub Pages, use **Open hosted studio** so the protected device cookie belongs to the correct host.
2. Open **Set up stream**. Confirm the Remember checkbox is enabled.
3. Enter the existing Render `RELAY_TOKEN` once, name your device and leave **Remember this device for 30 days** selected.
4. Tap **Connect & remember**. MK97 initializes the private table automatically on the first saved connection. No manual public table, storage bucket, Data API policy or Edge Function deployment is required.
5. Confirm **This device is remembered**. Connect YouTube or save current platform RTMPS keys from the app. Select a match and your preferred settings.
6. Reload the page. It should reconnect without the relay token and show the saved destinations. Closing/reopening the browser or a Render restart should retain this behavior until device expiry, revocation or site-data clearing.

The camera and START remain explicit controls. A saved connection never starts a broadcast automatically. Platform providers can still expire/revoke their own credentials, in which case reconnect that platform once from a remembered device.

## 7. Link another device

1. On the remembered device, choose **Set up stream → Remembered devices → Link another device**.
2. On the other phone/computer, open the same hosted MK97 address.
3. Choose **Link this device with a one-time code**, name it and enter the code within five minutes.
4. Tap **Link & remember this device**. It uses the same encrypted Supabase-backed studio and does not need the relay token or a separate YouTube authorization.

Up to 12 fully trusted devices share one studio; one camera upload can run at a time. Sign-out/revocation removes a device's access while retaining the studio's shared platform connections. The 30-day device cookie and five-minute pairing code are MK97 features; logging into Supabase Dashboard is separate from authorizing a device in MK97.

## 8. Verify the private database

After the first remembered connection, open Supabase's SQL Editor and run this metadata-only query:

```sql
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'mk97_private' and c.relname = 'studio_state';
```

Expected: `mk97_private | studio_state | true`. The table contains ciphertext. It is deliberately outside `public`; choose `mk97_private` in the Table Editor's schema selector if inspecting it there. Do not add this schema to Data API **Exposed schemas** or grant it to public API roles.

MK97 revokes schema/table privileges from `PUBLIC`, `anon`, `authenticated` and `service_role`, and enables row-level security without public read/write policies. The server's owning database role reads/writes the encrypted profile. No client app reads this table directly. The configured database user needs ownership/DDL privileges for initial setup; use a dedicated project and keep its database password private.

If this same database already contains MK97 1.7's `public.mk97_private_state`, the update moves that exact encrypted table atomically into `mk97_private.studio_state`, retaining data and revision numbers. Conflicting old/new tables stop setup without discarding either one. Do not delete records to hide a migration error.

## If you already saved data in another database

Changing `DATABASE_URL` alone does not copy data from Neon or another server into Supabase. Keep the old database and unchanged encryption key until its encrypted table has been backed up and restored privately into the new database. Stop MK97 while moving it, then reconnect after importing the table. Backups can still contain credentials in encrypted form; retain them privately. A new empty Supabase database starts a separate saved studio and requires devices/platforms to be linked again.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Database unreachable / IPv6 error | Use the project's Session pooler URI on port 5432. Keep the full pooler username. |
| Password authentication failed | Check the database password, project suffix, placeholder replacement and URL encoding. An API key is not the database password. |
| Certificate validation failed | Paste the full current project CA certificate into `DATABASE_CA_CERT`; keep normal verification enabled. A filename does not load the certificate. |
| Remember checkbox disabled | Confirm both versions are 1.9.0, environment settings were deployed and the app is open on its hosted address. |
| Saved storage unavailable | Check whether the Supabase project is paused, its quotas, the URI/CA and the server's database permissions. Conflicting legacy/private tables also require review. |
| Saved data cannot be unlocked | Restore the original encryption key. Do not generate a replacement just to reconnect. |
| Table not shown under public | Select the `mk97_private` schema after the first remembered connection; the table is intentionally private. |
| Google/YouTube stops working | Keep the hosted MK97 callback, verify Google client settings and reconnect if Google revoked/expired the grant. Supabase database settings do not change Google's requirements. |
| Free project paused | Resume it in Supabase Dashboard, then retry MK97. Do not add artificial keep-alive traffic to evade the free-plan policy. |

## What was verified

Tests run the actual schema upgrade, ciphertext retention, optimistic writes, RLS and public-role access checks against a local PGlite PostgreSQL engine. TLS configuration tests cover Supabase-style pooler URLs and project CA handling, including conflicting URL SSL flags. The existing HTTP/device/streaming tests remain applicable. No real Supabase project/account was connected or deployed by this source update; remote pooler TLS/permissions must be checked after entering your own private settings.

## Official references

- [Supabase database connections and Session pooler](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase SSL certificate and enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement)
- [Data API grants, RLS and private schemas](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase Free plan](https://supabase.com/pricing)
- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
