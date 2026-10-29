# Boundary replays, milestones and over cards

All automation is enabled by default. Enable or change it in **Settings → Broadcast automation before START**. The laptop does the video work; the phone still captures once and uploads once.

## Rules

| Trigger observed after connection | Outgoing program |
| --- | --- |
| Confirmed batter four or six | An eight-second ball clip, approximately four seconds before and four seconds after the estimated/marked delivery, with REPLAY label and original audio. |
| Team crosses 50, 100, 150, 200, 250, 300 or 350 | A team celebration graphic for exactly 60 program frames: two seconds at 30 fps. |
| Player crosses 50, 100, 150 or 200 | A player celebration graphic for exactly 60 program frames. |
| A new completed over is observed | Batting scorecard for 60 frames, immediately followed by bowling scorecard for 60 frames. |

Crossings such as 49 → 53 qualify. Each milestone/over is announced once per innings. Score corrections do not repeat an already known milestone or an over preceding connection. A first snapshot establishes a baseline: joining mid-innings does not play historic events. Loading the completed example match 986 will not trigger its old boundaries or celebrations.

If several events arrive together, milestone panels are queued in team/player order, then the consecutive cards. A complete boundary window is queued when its footage becomes available. Graphics are sequential, never stacked; each panel retains its two-second program duration. The queue is bounded to avoid building a long, outdated broadcast. Replays return to the recent live source after completion, so the outgoing program intentionally skips forward from the replay to live footage.

## What CricClubs supplies

The public read-only feed is a score snapshot. It does **not** promise stable delivery IDs, exact ball times, every missed delivery, or complete batting/bowling cards. This project cannot reconstruct those missing facts from a team total.

For automatic replay from snapshots, the detector requires an existing batter's run increase of four/six, a corresponding increase in their four/six count, at most one new legal ball, and a compatible team-score increase. Four byes or wides are not treated as a batter boundary. A four plus a no-ball can qualify. Missing counters, multiple missed boundaries or ambiguous updates do not cause a guessed replay. A boundary can be missed if the batter disappears from the feed immediately afterward or the scorer updates several fields separately.

Cards collect the batters and bowlers observed since this innings connection. If the feed supplies full arrays they can be displayed as a full card; otherwise the graphic explicitly says the full card was not supplied. Joining late cannot recover unobserved players. A complete card/provider delivery feed can be connected using [CRICCLUBS.md](CRICCLUBS.md).

## Calibrate the particular ball

1. Rehearse on a genuinely live scored match with a platform test broadcast.
2. Measure the delay between a visible delivery and its score change arriving at the relay. The starting value is **6 seconds**, adjustable from 0–30 seconds before streaming.
3. In Clips, preview the detected clip and check whether the complete run-up/delivery/shot is included. Increase scoring delay if the selected clip is too late; decrease it if too early. Restart with the revised value. Upload/decoder delay can vary, so calibrate against the previewed footage, not only a stopwatch.
4. **Mark ball** provides a manual anchor at the relay's latest decoded capture position. Press near delivery release; a recent mark (under 25 seconds old) is consumed by the next observed scoring/delivery change. It cannot compensate for every network delay or disambiguate several balls combined in one poll. Mark each intended ball for consistent results.
5. **Clip last ball** or the bottom timeline saves a manual selection. Preview first, then On air. This remains useful when score timing/counters are incomplete.

An authorized provider's explicit ISO delivery timestamp is preferred when available. Its wall clock must match the relay clock and the feed contract. The buffer's wall-clock origin is the first decoded frame's arrival; upload/decoder delay still requires a ground rehearsal. Exact automatic synchronization cannot be guaranteed from this CricClubs snapshot feed. Do not label estimated timing as verified ball tracking.

## Memory, quality and delays

The program processor uses one camera decoder and one continuous H.264/AAC encoder. It buffers high-quality JPEG frames and 44.1 kHz stereo PCM audio on the laptop. Each 30 fps frame carries its corresponding 1,470 stereo audio samples. Switching to replay changes source video/audio frames while output timestamps continue; RTMPS connections are not restarted.

Default limits in `relay/.env`:

```ini
SCORE_POLL_SECONDS=5
REPLAY_BUFFER_SECONDS=30
REPLAY_MEMORY_MB=192
SCORER_DELAY_SECONDS=6
```

The video ring is limited by both time and JPEG bytes; high-detail footage can reduce the actual retained seconds. PCM audio is separately bounded. Private clips have a shared 64 MB logical cap and a maximum of three clips. FFmpeg queues, native graphics, process memory and OS overhead are additional. The Stats panel reports the ring's JPEG MB; it is not total application RAM.

If the complete eight-second boundary window is outside retained memory, it is skipped with a visible warning. A clip can also exceed the clip cap on very complex footage. Reduce the scoring delay where appropriate, use a shorter manual selection, reduce native resolution explicitly, or increase the video ring cap within its configured bounds if the laptop has headroom. Do not assume setting 30 seconds guarantees 30 seconds at every scene complexity.

The processor warms a roughly 1.5-second buffer before output; recorder chunks, decoding, processing, replay, platform ingestion and platform playback add latency. A two-second graphic means 60 program frames; a paused/network-stalled viewer may perceive different wall-clock timing.

JPEG buffering adds a lossy intermediate and more laptop work. It does not make digital zoom lossless. The program stays at the selected native output resolution, normally 1080p, without a phone canvas. Turning all automation off at native 1080p selects the simpler direct encoder path. Benchmark laptop CPU and phone heat/battery on the actual equipment.

## Privacy and operator monitoring

Buffers/clips expire in memory; the relay writes no video recordings to disk. Download explicitly saves an MP4 on the operator's device. A clip requires the session owning the active broadcast, is never exposed as a public spectator URL, and is inaccessible to another relay session. Stop/logout clears the buffer and stops export work.

On-air replays happen on the laptop. The phone's normal camera monitor remains live and shows a REPLAY ON AIR status; it does not pretend to be a returned program feed. Private clip Preview replaces only the local video element. Microphone mute affects capture; monitor volume affects only replay listening. Confirm the actual outgoing program in a platform preview.
