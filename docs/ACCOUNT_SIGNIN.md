# MK97 account sign-in — version 1.8.0

Create one private MK97 studio account. Then sign in with that email and password on each phone or computer to restore the same cloud connection, saved platform keys, YouTube authorization and match preferences. Remembered browsers reconnect automatically for 30 days. You do not enter the studio token on each device.

## Update your existing app

1. Download `MK97_v1.8_Account_Mobile_Fixes_Source.zip` and extract it.
2. Open your existing GitHub repository `MMK97-97/BOUNDARY.LIVE`. Upload the **contents of the MK97 folder** into the repository root, replacing the corresponding files. Include `web/`, `relay/`, `scripts/`, documentation, package files, `Dockerfile`, `render.yaml` and `.github/workflows/`. Upload source files, rather than the ZIP itself. Remove an old `relay/lib/replay-ring.mjs` if it remains.
3. Commit the upload. Let the validation workflow finish.
4. In Render, open your existing `boundary-live` Web Service. Choose **Manual Deploy → Deploy latest commit** and wait for the Docker deployment to finish.
5. Open `https://boundary-live.onrender.com/` directly on the phone and reload. In Stream settings, both the website and cloud reader must show **1.8.0**. An old cached frontend or old server will not have the new account routes.
6. Keep your existing `DATABASE_URL`, `DATABASE_CA_CERT` (if configured), `STUDIO_ENCRYPTION_KEY`, `RELAY_TOKEN` and Google environment settings. This upgrade does not require new account environment variables or a new encryption key. Do not change the encryption key for an existing saved database.

If saved storage is not yet configured, first complete [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Supabase holds the encrypted PostgreSQL record; Render still runs the website and encoder. Never put a database password, Google secret, encryption key or relay token in GitHub source.

## Create your account once

1. Open **Stream → Cloud studio** on the hosted Render app. Choose **Create account**.
2. Enter an email address you will use as the studio login.
3. Choose a **new MK97 password with 15–128 characters** and confirm it. A long passphrase is supported. This is independent of your Google/YouTube password.
4. Enter a device name such as “Match phone”.
5. If this device is already connected to the studio, it can authorize account creation. Otherwise enter your existing Render **RELAY_TOKEN** once in the **One-time studio token** field. Copy it directly from your own service's Environment settings into MK97; do not share it in chat.
6. Press **Create account & sign in**. The screen should show **Your MK97 account** and your account email.
7. Existing saved platform connections remain available. Temporary in-app platform connections from the device creating the account are promoted into the saved profile when that platform has no existing saved connection. If an old temporary connection came from another browser session, save/connect that platform once in this account.

This is one fully trusted operator account for your private studio. It is not a public registration service. The email is a login identifier; this build does not send verification or password-reset emails.

## Use a different device

1. Open the same hosted Render app URL.
2. Tap **Sign in to MK97** or open **Stream → Cloud studio**.
3. Enter your MK97 account email/password and name the new device.
4. Press **Sign in**. The same saved destinations and YouTube connection load. No relay token, pairing code, database password or Google client secret is needed.
5. Open that device's camera, check its actual resolution and microphone, then start the upload when ready. Browser camera/microphone permissions must be granted separately on every device. One camera upload can run at a time.

Up to 12 devices can be remembered. A successful password login replaces the least recently seen device when that limit is reached. A cookie remains private to its browser and expires after 30 days. Clearing cookies, using a private tab or switching browsers can require signing in again. The account and shared connections remain saved.

## Password changes and recovery

- **Change password:** while signed in, open **Stream → Cloud studio → Change password**. Enter the current password and a new passphrase. Other devices are signed out; saved platform connections remain. Stop any camera upload first.
- **Forgotten password:** open **Forgot your password?**. Enter the account email, new password/confirmation and your existing private **RELAY_TOKEN** once. Recovery does not send email. It replaces the account credentials and signs out devices without deleting the platform profile.
- **Sign out this device** removes this browser's remembered access and ends its upload if one is active. It leaves shared platform connections available to your other authorized devices.
- Google may independently expire or revoke YouTube authorization. Reconnect YouTube when requested; MK97 login cannot override Google's grant lifetime. A Google consent app in Testing can have short-lived grants.

## Portrait camera and overlay fixes

The camera now tries native dimensions in either orientation and validates the actual returned pixels. An explicit 1080p selection never silently becomes 720p; Auto may fall back. The program frame follows the camera's native orientation at stream start: 1920 × 1080 or 1080 × 1920 at 1080p, with equivalent 720p/480p modes. Some phones expose a landscape camera track even while held upright; the actual track dimensions determine the program frame. Camera permission and hardware/browser support still apply.

The preview and encoder use the same escaped SVG drawing. The score is anchored to the bottom of the program frame, scales with its width, and uses a separate readable portrait arrangement. The program frame stays fixed during that upload; rotating the phone resizes the controls and monitor. To change the outgoing orientation, stop and reopen the camera in the desired orientation, then start again. Fullscreen no longer forces landscape.

Fit preserves the full camera image with padding when needed. Fill explicitly crops to the program frame and may enlarge the source; it can reduce detail. Choose framing before starting. Instagram converts to its configured portrait size and bottom-aligns a landscape program so its score remains at the bottom, with padding above. Platform preview and eligibility remain authoritative.

Short landscape screens and portrait screens use the available dynamic viewport height and safe-area insets. Feedback sits below the toolbar so it cannot cover Settings. START/STOP remains in the control bar; the camera and score graphics cannot intercept its taps.

## Security and verification

Passwords use a random salt and asynchronous scrypt (N=131072, r=8, p=1). The account record and platform grants are encrypted with AES-256-GCM before database storage. Remembered cookies are HttpOnly, Secure in production, SameSite=Strict and scoped to the hosted origin. Passwords, the relay token and platform keys are not written to localStorage or returned in status APIs. Failed login backoff persists across restarts; hash work is bounded; password changes revoke prior device sessions and upload tickets.

See [VALIDATION.md](VALIDATION.md) for automated and isolated browser evidence. This ZIP is source code; it has not updated your GitHub repository or Render service. Real-phone permissions, current CricClubs source access and a private platform broadcast still require verification after you deploy.
