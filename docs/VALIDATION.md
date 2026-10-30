# MK97 1.6.1 validation — October 30, 2026

## Automated checks completed

`npm run check`: **48 JavaScript modules, 230 unique UI IDs**, relative imports and local HTML assets checked.

`npm test`: **171 passed, 0 failed, 0 skipped**. The full suite completed after removing replay and replacing the media processor. Counts are lower than adding features to 1.5 because obsolete replay tests/implementation were removed.

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
| YouTube | Mock Google authorization/state/PKCE lifecycle, request validation, account/key precedence, idempotent event setup, ambiguous-write handling, stream health, preview/live/end transitions and grant/session cleanup. No real Google account was used. |
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
