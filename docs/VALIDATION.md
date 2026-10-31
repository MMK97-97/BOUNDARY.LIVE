# MK97 1.8.0 validation — October 31, 2026

## Automated checks completed

`npm run check`: **68 JavaScript modules, 304 unique UI IDs**, relative imports and local HTML assets checked.

`npm test`: **262 passed, 0 failed, 0 skipped**. The full suite completed after account sign-in and the camera/layout/overlay changes. The prior browser check and device/UI tests remain covered. Removed replay behavior remains covered.

| Check | Result and scope |
| --- | --- |
| Live media pipeline | Authenticated WebSocket camera upload passed through real FFmpeg and two independent local output writers. Separate 1920 × 1080 and 1080 × 1920 runs each produced two H.264 outputs including AAC audio and a decoded-pixel check of the selected match's burned score. Only an explicit test wrapper replaced fake RTMPS targets with local test files; no external broadcast occurred. |
| Native 720p WebM | Real Android-style VP8/Opus input passed through the live-only encoder to 1280 × 720 H.264 with AAC audio. Forged/unknown capture-profile claims are rejected before a stream starts. |
| Native live graphics | Original camera/audio and transparent PNG graphics entered one encoder. Team popup, batting and bowling graphics each covered 60 frames at 30 fps, verified in encoded output. Source video continued behind them. AAC final-packet padding may hold the final camera frame for one extra output tick; event coverage was checked separately. |
| Removed replay feature | No rolling video/PCM history class or clip/export methods. Obsolete authenticated replay routes return 404. No production test transport or recording fallback. |
| Multi-league selection | Both user URLs preserve their league path through parsing, direct preview, cloud binding and polling. Bare IDs resolve 1507/TampaCricket and 157/TCL; full URLs support unknown leagues. Late old-league cards, malformed paths, duplicate identifiers and write routes are rejected. CLI and HTTP selection use the same mappings. |
| Source feeds | Captured real CricClubs 986 ticker regression, canonical data validation, hostile markup handling, match/club switching, stale values, duplicate requests, source size/time limits and source/HTML identity reconciliation. |
| Full HTML parser | Synthetic supported scorecard tables, both innings, bowling, extras, dismissals, fall of wickets, did-not-bat and commentary. Robots rules, verification responses, Retry-After, blocked-state handling and incomplete/contradictory tables. This does not prove that full 986 HTML is currently readable. |
| Live updates | Five-second source deadline, change/freshness push, authenticated subscriptions, split UTF-8/events, size limits, expiry, match change, late-response rejection, reconnect/poll fallback and hidden-page lifecycle. |
| Destination keys | Encrypted shared keys for remembered devices; temporary session isolation, expiry/logout removal, no secret echo, platform RTMPS allowlists/port restrictions, malformed/oversized values and 409 while the owner streams. |
| Saved studio | AES-256-GCM ciphertext, tamper/wrong-key refusal, atomic revision writes, private file permissions and PostgreSQL SQL against the local PGlite engine. This does not test a remote Neon TCP/TLS deployment. Real server process restarts recover two independent device cookies, platform keys, match/preferences, Google refresh grants and YouTube setup without recreating events. |
| Device access | Secure/HttpOnly/SameSite cookie attributes, 30-day expiry, one-use/expired/racing code checks, revocation of sessions/cookies/tickets, cancelled Google callbacks and sign-out preserving shared credentials. UI tests exercise cookie-based restoration, preference events and private key generation without persisting secrets in the browser. |
| Cloud origin/config | Exact configured HTTPS service origin, no Host-header inference, no wildcard/path/credential origin, secret-free discovery and private config generation without printing/overwriting the token. |
| Sessions/tickets | Origin-bound expiry/revocation, master token limited to session creation, one-use tickets, HTTP/WS authorization, body/connection limits, CORS and private-file protection. |
| YouTube | Render callback derivation/mismatch guidance; real HTTP callback routing without an opener; single-use state/PKCE, expiry/cancellation/session isolation; safe failure outcomes; endpoint re-read without duplicate writes; idempotent setup and partial retries; immediate/concurrent/intermediate transitions; late browser response rejection and safe cancellation messages. Google responses are mocked; no real Google account was used. |
| Deployment files | Render/Compose/Actions YAML parsed locally. Docker is unavailable in this executor, so the image build itself was not run here. The added cloud-container workflow builds/smoke-tests it after the source is pushed to GitHub. |

## Browser checks

The isolated cloud-browser checkout runs the real app and Node service with explicitly labelled synthetic/recorded source responses. It blocks external provider fetches and uses public, nonfunctional test placeholders. Production CSP/framing/origin settings remain intact; the viewport wrapper uses separate QA-only framing changes.

Checked portrait **390 × 844**, landscape **1120 × 700**, and compact landscape **844 × 390**. The live-only build opens directly in the studio, has Score/Stats/Stream/Share, and has no Clips/seek/export controls. Setup, a fixture relay connection, in-app destination save/removal, key-field clearing and readiness gating were exercised. Synthetic Match 9001 updated from 104/2 (10.3) to 111/3 (10.5) over the authenticated live link without another Load. These are fixture updates, not actual active CricClubs data.

Camera, microphone, optical zoom, hardware encoding, battery, full-screen behavior and platform publication still require tests on the real phone over its deployed HTTPS origin. The HTTP isolated preview cannot establish those results.

## Actual provider verification carried forward

Earlier browser retrieval of CricClubs Club 300 / completed Match 986 returned Royal Bulls CC 207/9 (35), ICAT 208/5 (30.5), ICAT won by 5 Wickets. The accessible ticker omitted full innings cards and commentary. The full HTML showed verification; it was not bypassed. There is no new active-live-match end-to-end provider verification in 1.6.

Version 1.6.1 also made one successful actual read-only ticker read each for Tampa Cricket 3866 / 1507 (Jaguars 130/5, Roaring Royals 95/5) and TCL 6098 / 157 (Kings 138/7, NewTampaHawks 79/7). Both are completed matches with incomplete cards and no commentary. The mobile browser selected both URLs in sequence using those recorded normalized snapshots, with the correct club, IDs and totals. No new full HTML retrieval was verified.

No cloud account, free VM allocation, deployed Docker instance, Google/platform account or external broadcast has been verified in this session. No statement here establishes measured phone battery savings, full-match endurance, unlimited free hosting, bug-free operation or absolute security.

## Before match day

Deploy the reviewed source, run the container workflow, check `/health` and Encoder ready, connect the phone and verify the intended account/audience. Rehearse one unlisted/private YouTube output, actual native capture, sound, source freshness and playback. Measure server CPU/RAM/egress and phone temperature/battery. Add other destinations only with sufficient headroom. Check restart/network-loss behavior, milestone/card timing, microphone mute, monitoring and clean shutdown. Verify the provider still permits your source reads and that the chosen hosting resources remain within their free quota.

## Additional 1.6.2 browser checks

On the isolated 390 × 844 phone layout: synthetic Google approval returned through the real cloud callback, the channel connected without a popup message, event/key setup completed, and the selected YouTube destination became ready. A QA-only active-signal control enabled Preview; provider state changed testing → live → complete, and the completed key became unavailable. No external broadcast was made and no actual camera was opened. The mock returns its fixed event title/visibility; Google accepting the operator's real event settings still requires account testing.

Tampa Cricket Club 1507 / Match 3866 and TCL Club 157 / Match 6098 loaded through the authenticated cloud selection and score subscription using captured normalized totals. League presets and full URLs (including formatted-message separators) both selected the correct IDs. An intentionally unsupported fixture match displayed its error inline, then a valid selection recovered and cleared it. The UI stayed open through polling, and Back/Close worked with a setup message visible after moving feedback below the header.

Two actual read-only ticker calls also returned valid totals for those same club/match pairs on October 30. Both are completed matches; neither test proves a live game's timing or full innings/commentary availability. The published Pages build reported 1.6.1, while the user's actual Render address/settings were not available. The exact cause of their reported deployed failure therefore remains unconfirmed.

Browser screenshots are supplied separately from the source. The QA transport, test consent page, preview-only origin/header changes and no-external-output wrapper are excluded from the ZIP.

## Additional 1.7 saved-studio browser checks

On an isolated 390 × 844 layout, the first fixture device connected with Remember enabled. A nonfunctional Facebook key saved through the real HTTP endpoint, cleared from its field and displayed Saved studio key · ready. Reloading the page restored access without the relay token. A second tab automatically restored the same device cookie and saved destination, and an altered end-of-over preference was restored. The QA server was stopped and restarted; the browser recovered the same encrypted profile and access automatically. Landscape 1120 × 700 was also inspected.

This preview uses a private encrypted file backend and synthetic credentials. Secure production cookie flags are covered by HTTP tests; the HTTP-only QA copy uses its explicit development cookie and same-origin viewport allowances. Two genuinely separate device cookies, pairing and revocation are tested by HTTP integration, not by two tabs sharing the same browser profile. No real Neon database, user credentials or real Google account were configured. Production remains undeployed by this update.

## Additional 1.7.1 Supabase checks

Three additional tests verify: Supabase-style session pooler URL/CA configuration with TLS and hostname verification preserved; an atomic migration from a legacy public table retaining the exact ciphertext/revision; denial of schema/table privileges to anon, authenticated and service_role; RLS returning no rows if a non-owner API role is accidentally given read grants; and conflict refusal retaining both old/new rows. The PostgreSQL tests run against local PGlite, with Supabase-like roles/grants created in the test.

No real Supabase account, database, remote TLS session, deployed schema or hosted broadcast was exercised. Production rollout still requires the user's private project settings and a container redeploy. Static UI copy/version was updated; no additional cloud-browser run was needed for this database-focused change.

## Additional 1.8 account and mobile checks

- Real scrypt hashing, independent random salts, encrypted reopen/restart, generic email/password denial, persistent backoff, password change, master-authorized recovery, device revocation, oldest-device replacement and stale credential-proof rejection passed. HTTP tests create distinct device cookies and restore the same saved platform profile with email/password and no master token. A pre-change WebSocket ticket is rejected after password rotation. Temporary platform grants are promoted during first authorized account creation. Browser form tests verify that ordinary sign-in never reads a relay token and that credentials clear after failures/success.
- An isolated cloud browser created a fixture MK97 account through the actual account API, saved a nonfunctional destination, signed out, signed in with email/password, restored the destination, and automatically recovered the remembered session after a page reload and server restart. No real account password or external identity provider was used.
- Native camera tests cover portrait-first requests, landscape-only fallback, larger sensor modes, explicit-resolution validation, Auto fallback, cleanup of rejected low-resolution streams, permission denial and bounded dimensions. Camera enumeration failure no longer discards a working camera. Fullscreen no longer locks landscape.
- Real authenticated WebSocket/FFmpeg runs accept both 1920 × 1080 and 1080 × 1920 source/outputs, with selected-match graphics burned into both platform writers and AAC preserved. Another real encoder test retains a full portrait source in a landscape Fit frame, proving padding rather than stretching. Decoded-pixel tests verify the score reaches the bottom.
- Instagram conversion tests cover a landscape program and a 480 × 854 portrait source: each encodes 720 × 1280 successfully and retains a bottom marker at the output's bottom. This catches rounding overflow and score placement during portrait conversion; no Instagram service was contacted.
- Browser synthetic camera capture (canvas MediaStream → actual MediaRecorder → actual WebSocket/FFmpeg → local output sink) reached SENDING in portrait 390 × 844 and compact landscape 844 × 390. Stop returned to standby. Geometry checks show the portrait Stop button entirely within y=784.5–827.5 of its 844px viewport, and the compact landscape button within y=345–379 of its 390px viewport. The score frame shares the camera program rectangle and its bottom edge. A ResizeObserver scales the program independently of control sizes.

The QA checkout is separate, labelled synthetic, blocks provider fetches and replaces outgoing RTMPS addresses with a local sink. Its HTTP-only synthetic camera adapter and development cookies are not shipped. Actual phone permissions, lens/native zoom, battery endurance, orientation metadata quirks, network interruptions, remote Supabase TLS, real Google consent and external platform publication are not established by these tests. The new source remains undeployed until the user updates GitHub/Render.

Final layout follow-up: feedback is positioned below the toolbar using the measured viewfinder top. Browser geometry placed Settings at y=14–48 and a visible framing message at y=144–216 on the 390 × 844 layout; Settings opened while that message remained present. The message body ignores pointer input and its separate dismissal button remains usable. Account HTTP tests also reject null/array/string request bodies with a safe validation error.
