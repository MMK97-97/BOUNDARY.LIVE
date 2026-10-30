# MK97 1.6.2 validation — October 30, 2026

## Automated checks completed

`npm run check`: **52 JavaScript modules, 244 unique UI IDs**, relative imports and local HTML assets checked.

`npm test`: **199 passed, 0 failed, 0 skipped**. The full suite completed after the YouTube/league changes. Removed replay behavior remains covered.

| Check | Result and scope |
| --- | --- |
| Live media pipeline | Authenticated WebSocket camera upload passed through real FFmpeg and two independent local output writers. Both 1920 × 1080 H.264 outputs included AAC audio and a decoded-pixel check of the selected match's burned score. Only an explicit test wrapper replaced fake RTMPS targets with local test files; no external broadcast occurred. |
| Native 720p WebM | Real Android-style VP8/Opus input passed through the live-only encoder to 1280 × 720 H.264 with AAC audio. Forged/unknown capture-profile claims are rejected before a stream starts. |
| Native live graphics | Original camera/audio and transparent PNG graphics entered one encoder. Team popup, batting and bowling graphics each covered 60 frames at 30 fps, verified in encoded output. Source video continued behind them. AAC final-packet padding may hold the final camera frame for one extra output tick; event coverage was checked separately. |
| Removed replay feature | No rolling video/PCM history class or clip/export methods. Obsolete authenticated replay routes return 404. No production test transport or recording fallback. |
| Multi-league selection | Both user URLs preserve their league path through parsing, direct preview, cloud binding and polling. Bare IDs resolve 1507/TampaCricket and 157/TCL; full URLs support unknown leagues. Late old-league cards, malformed paths, duplicate identifiers and write routes are rejected. CLI and HTTP selection use the same mappings. |
| Source feeds | Captured real CricClubs 986 ticker regression, canonical data validation, hostile markup handling, match/club switching, stale values, duplicate requests, source size/time limits and source/HTML identity reconciliation. |
| Full HTML parser | Synthetic supported scorecard tables, both innings, bowling, extras, dismissals, fall of wickets, did-not-bat and commentary. Robots rules, verification responses, Retry-After, blocked-state handling and incomplete/contradictory tables. This does not prove that full 986 HTML is currently readable. |
| Live updates | Five-second source deadline, change/freshness push, authenticated subscriptions, split UTF-8/events, size limits, expiry, match change, late-response rejection, reconnect/poll fallback and hidden-page lifecycle. |
| Destination keys | Session isolation, expiry/logout removal, no secret echo, platform RTMPS allowlists/port restrictions, malformed/oversized values and 409 while the owner streams. |
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
