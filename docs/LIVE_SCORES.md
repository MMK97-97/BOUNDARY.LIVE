# Automatic live score updates — MK97 1.6

When you select a live match, MK97 continuously reads that match's available score data. The relay checks CricClubs every **five seconds by default**, then immediately passes a successful read to the video program and the phone. You do not need to press Load after each ball.

This is near-real-time polling. A new source value normally appears on the next successful source check plus request/rendering time. CricClubs must first receive and publish the scorer's update. Your internet connection, provider restrictions and YouTube/Meta playback buffering add latency. No instantaneous CricClubs push service, zero delay or delivery-by-delivery timestamp accuracy has been verified.

## Use it

1. Deploy the complete 1.6 container; see CLOUD_SETUP.md.
2. Keep the host secret configuration private and run one instance.
3. Connect the website to the hosted HTTPS studio in Stream setup. Select the actual Match ID and Club ID (or full CricClubs URL).
4. In Score, look for **live relay link · source checks every 5s**. Runs, wickets, overs and supplied player fields update automatically. Optional milestone and over-card graphics use those received values. Replay has been removed in 1.6.
5. Open the camera and start the intended broadcast as described in SETUP.md. Rehearse with a genuinely active scorer and check the platform playback.

Club 300 / Match 986 is a completed example. It will not generate new live balls merely by being loaded. In FWCWL, enter a currently active Match ID. Other leagues need their Club ID; full HTML enrichment also needs the corresponding league path in the relay's configuration.

GitHub Pages hosts the website interface. The server relay runs the continuous reader, authenticated update link and video renderer. The manual GitHub Actions snapshot workflows are not a continuous live data server. Keep the server and phone internet connection available throughout the match.

## Delivery behavior

- There is one upstream reader. A scheduler uses its next source deadline, avoiding the old independent two-second timer's extra polling jitter.
- A received snapshot immediately notifies the renderer and connected score viewers. HTML-card enrichment remains a separate background operation and cannot hold up live totals.
- The browser uses an authenticated streaming HTTP connection. It stops its periodic relay requests after the first live event. If the live connection fails or is unavailable, five-second authenticated refreshes resume; a live-link retry is held for 30 seconds.
- Unchanged source values send a small freshness event, rather than repeating all player/commentary rows. `fetchedAt` remains the retrieval time, not the ball's delivery time. An unchanged reachable source does not prove a scorer is actively publishing.
- A monotonic revision prevents a slow, older poll from replacing newer pushed data. Selecting another match cancels the previous generation and closes its live connection.
- Idle hidden pages pause their live connection/reads. Returning to the page performs a fresh read and reconnects. Active broadcasts retain their source subscription; keep the phone visible because mobile browsers can suspend camera capture when backgrounded.
- Source failures retain the last verified score with a delayed/error label. HTTP 429 respects Retry-After. Recovery uses new verified data; no score, player record or commentary is fabricated.
- Complete cards/commentary still depend on what the source provides. Pushing a partial ticker faster cannot recover inaccessible full innings data. Match 986's complete HTML remains unverified because its full page previously returned verification.

## Security and limits

`GET /api/score/stream?clubId=...&matchId=...` requires the existing session bearer header and allowed origin. The client uses fetch streaming so the token stays out of the URL; no browser-stored token or cookie authentication is introduced. Unknown/conflicting origins fail the same checks as other relay APIs.

Each session can have one score connection, with eight total. Connections close when their match changes, their session expires/is revoked, the relay shuts down, or the client disconnects. Messages are capped at 512 KiB and pending output at approximately 1 MiB plus one bounded message; slow clients are disconnected. Heartbeats run every ten seconds. The browser treats 35 seconds without bytes as a failed link and retains polling as a fallback.

These changes do not change CricClubs permissions, shared overlay settings, Google/Meta scopes or destination stream keys. Protected source pages remain protected.

## Verification

The cloud browser observed the mobile preview move from **100/2 (10.2)** to **111/3 (10.5)** without another Load click. The isolated source fixture supplied intermediate 104/2 and 110/2 updates, with request spacing of 5003, 4999 and 5001 milliseconds. The browser displayed the live-link label. This was explicitly labelled synthetic data, not a live CricClubs match or an external broadcast.

Tests cover immediate changed-score delivery, small unchanged-score events, selected-match binding, session expiry, connection/buffer limits, split UTF-8 data, malformed/oversized events, stale-response ordering, hidden-page resume, polling fallback, source deadlines, Retry-After and a real HTTP subscription closing when the match changes. Existing media tests exercise the real FFmpeg pipeline separately.

Live CricClubs update cadence, full-scorecard availability, ground connectivity, actual phone battery use and platform playback delay still need a rehearsal with your equipment and a readable active match.
