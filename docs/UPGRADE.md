# Upgrade to MK97 1.9.0

Version 1.9 applies the supplied ten-screen layout and attached logo. See [UI_MAPPING.md](UI_MAPPING.md). Keep the same hosting secrets, saved database and encryption key. Existing authentication, score fetching, output and security behavior remains.

Follow [ACCOUNT_SIGNIN.md](ACCOUNT_SIGNIN.md) for the exact GitHub/Render upload, first account creation and subsequent sign-in steps. This upgrade adds email/password access to the existing encrypted studio without changing its database or encryption key.

Native portrait capture is accepted at the selected resolution. The monitor and encoder share bottom-aligned landscape/portrait score drawings, and short screens keep their control bar in view. Fit/Fill now applies to the actual outgoing program and is chosen before streaming.

Stop the active camera upload and end platform events before updating. Back up your own changes, then replace the complete source, including `web/`, `relay/`, tests, package files, Docker/hosting files and hidden workflows.

Remove the obsolete `relay/lib/replay-ring.mjs` from the old repository. The new program processor has no footage history, clip/export routes or automatic replay. The Clips tool is replaced with Stream setup. Do not keep the old relay running with the new frontend.

The preferred deployment is now a hosted Docker service that serves both MK97 and its APIs. No laptop/VPN needs to run at the ground. See [FREE_HOSTING.md](FREE_HOSTING.md). Keep the same repository and Pages URL if you also want the optional static frontend.

Keep private environment secrets on the host. Add the exact `PUBLIC_URL` on generic hosts; Render supplies its own external URL. Use one instance. For remembered devices, add `DATABASE_URL` and an independent `STUDIO_ENCRYPTION_KEY` once on Render; [SAVED_STUDIO.md](SAVED_STUDIO.md) explains the free database and device setup. Temporary sessions remain available. Compose now requires the encryption key and retains encrypted data in a named volume. Keep explicitly chosen server fallback keys in private environment settings. Google OAuth client settings are configured once on the host.

Run `npm run check` and `npm test`; the supplied Actions workflows also validate source, media and the Docker runtime. Redeploy the server after replacing code. Remembered devices restore after restart; temporary connections must reconnect. Verify actual encoder readiness, selected match, audio and platform preview before a live match. A repository web upload does not automatically include hidden workflow files; check `.github/workflows/` explicitly.

The new version does not make blocked CricClubs source pages readable or complete a partial ticker. It does not deploy cloud resources or publish an external platform broadcast by itself.

Version 1.6.1 adds automatic FWCWL, TampaCricket and TCL mappings and retains paths from pasted scorecard URLs. Preserve host secrets and deploy both sides together. Existing FWCWL environment values can remain. See [LEAGUES.md](LEAGUES.md).

Version 1.6.2 fixes the phone YouTube setup and cloud callback. Register your Render app’s exact `/youtube-callback.html` URI in Google Cloud; change an old Pages `YOUTUBE_REDIRECT_URI` if you now open the Render app. Keep the same `RELAY_TOKEN`. The app now shows both web/cloud versions, provides separate league/Match ID selection and retains initial cloud-read failures on a live subscription so they can recover. See [YOUTUBE.md](YOUTUBE.md) and [LEAGUES.md](LEAGUES.md).

Version 1.7.0 preserves platform credentials across reloads and server restarts when saved storage is configured. Remember the first device once and link other devices with a five-minute code. All linked devices share one trusted studio. Keep the encryption key unchanged; do not remove the database row or Compose volume during upgrades. Existing temporary credentials must be entered once into the remembered studio.

Version 1.7.1 supports Supabase PostgreSQL with an optional `DATABASE_CA_CERT`, verified TLS, a private schema and revoked API-role grants/RLS. Existing PostgreSQL state in the same database is migrated atomically from `public.mk97_private_state` into `mk97_private.studio_state`. Keep the same encryption key and take a private backup before upgrading. Moving to a different database needs a separate data transfer; changing the URL does not copy it. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

After the private-schema migration, use 1.7.1 or newer with that database. Older 1.7.0 code reads the old public table name and must not be used as a rollback without first restoring the matching private backup/schema.
