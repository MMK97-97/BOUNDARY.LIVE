# CricClubs score data

## The exact match requested

- League: Florida West Coast Winter League.
- CricClubs path: `FWCWL`.
- Club ID: **300**.
- Match ID: **986**.
- Series returned: **FWCWL 2026-27 Season**.
- [Scorecard](https://cricclubs.com/FWCWL/viewScorecard.do?matchId=986&clubId=300).

On October 29, 2026, the read-only score-data endpoint returned Royal Bulls CC 207/9 (35 overs), ICAT 208/5 (30.5 overs), and “ICAT won by 5 Wickets”. This is a completed match, not a live fixture. A whitelisted response is saved in `relay/test/fixtures/fwcwl-986.json` for regression tests only.

## What happens when you press Load

1. The browser uses the selected/saved Club ID (default 300) and numeric Match ID, or extracts both from a CricClubs URL.
2. It sends those two IDs to your authenticated relay over HTTPS.
3. The relay reads:

```text
https://cricclubs.com/liveScoreOverlayData.do?clubId=300&matchId=986
```

4. It extracts the batting team, total, wickets, overs, rate, opposition, result, batter/bowler fields and recent balls when present.
5. It chooses the batting innings from explicit innings flags, including the separate super-over flags. Missing fields fail validation rather than becoming invented zeros.
6. It refreshes on the laptop every five seconds by default (up to two seconds of scheduler jitter). The program renderer uses normalized score fields for locally generated graphics; the direct encoder path uses atomic text files. The phone receives normalized score data.

This reads the same service's public score data server-side, avoiding browser CORS restrictions. The HTML scorecard route presented a verification page to the build environment; the read-only JSON endpoint returned the requested match without requiring that HTML page. The code does not bypass that verification or mutate CricClubs settings.

## Failure behavior

- Incorrect IDs, missing batting data, upstream HTTP errors, HTML instead of JSON and timeouts produce visible errors.
- If a previous valid score exists, it stays visible with **SCORE DELAYED** when a fetch fails or the last successful fetch is older than 30 seconds.
- `fetchedAt` means the last successful retrieval. It is not the time the scorer recorded a delivery. A reachable feed can still contain unchanged or delayed scores.
- A newly selected match clears the previous match's score immediately on the relay. In-flight data for an earlier match cannot overwrite it.
- Some CricClubs overlay views omit live fields. The app uses the available validated totals and labels a limited view; it never changes CricClubs' view to obtain other data.
- Completed matches are labelled **MATCH COMPLETE**. No simulated data is substituted when a feed fails.
- Initial data establishes the event baseline. Snapshot changes can trigger milestones and over cards, and confirmed changes in batter runs/four/six counters can trigger a replay. See [AUTOMATION.md](AUTOMATION.md) for calibration and missed-delivery limits.
- The current public feed does not guarantee delivery timestamps or complete innings cards. Only available/observed players are shown unless full arrays are supplied. The code never changes a league's shared overlay view to obtain another scorecard.

CricClubs can change or restrict this undocumented endpoint. Their published plans distinguish API/streaming-graphics access, so continuing availability and permission are not guaranteed by this code. Check with your league/CricClubs for your use. The match ID alone is not globally unique: it is resolved together with a club ID.

## Approved feed alternative

If the public feed is unavailable, configure an endpoint your league/provider authorizes. Keep its credentials only in `relay/.env`:

```ini
SCORE_URL_TEMPLATE=https://YOUR_APPROVED_FEED/score?clubId={clubId}&matchId={matchId}
SCORE_HEADER_NAME=Authorization
SCORE_HEADER_VALUE=Bearer YOUR_APPROVED_TOKEN
```

It can return the CricClubs `values` shape, or this contract. This is an illustrative live payload, not a claim about match 986's historical player statistics. `batters`, `bowler`, `cards` and `deliveries` are optional; send real provider values and stable player IDs when available:

```json
{
  "schema": "boundary.score.v1",
  "clubId": "300",
  "matchId": "YOUR_SELECTED_NUMERIC_MATCH_ID",
  "innings": "1",
  "batting": "ICAT",
  "bowling": "RBCC",
  "runs": 104,
  "wickets": 1,
  "overs": "8.0",
  "runRate": "13.00",
  "target": "",
  "status": "live",
  "result": "",
  "series": "FWCWL 2026-27 Season",
  "detail": "",
  "balls": ["1", "2", ".", "1", "1", "6"],
  "batters": [
    {"id":"player-1","name":"Example Batter","runs":55,"balls":41,"fours":3,"sixes":1,"status":"not out"}
  ],
  "bowler": {"id":"player-2","name":"Example Bowler","overs":"2.0","maidens":0,"runs":14,"wickets":1},
  "cards": {
    "complete": false,
    "batting": [{"id":"player-1","name":"Example Batter","runs":55,"balls":41,"fours":3,"sixes":1,"status":"not out"}],
    "bowling": [{"id":"player-2","name":"Example Bowler","overs":"2.0","maidens":0,"runs":14,"wickets":1}]
  },
  "deliveries": [
    {"id":"innings1-ball48","batRuns":6,"occurredAt":"2026-10-29T14:00:00.000Z","batterName":"Example Batter"}
  ]
}
```

Replace the illustrative Match ID with the requested numeric ID or omit that optional response field. Supplied response match/club IDs must match the requested IDs. The adapter attaches the validated request IDs to all normalized scores.

Overs are cricket notation: 30.5 means 30 overs and five legal balls, not 30.5 decimal overs. Status values are `live`, `complete`, `break` or `scheduled`. Runs/wickets must be nonnegative integers; team totals and overs are length bounded. Player values are individually whitelisted and length bounded. Cards are capped at 15 rows per side; graphics display up to 11. Set `cards.complete` true only when those arrays actually represent the full innings; an incomplete card is always labelled.

For exact provider delivery events, use a stable unique `id`, bat runs (4 or 6 for a boundary), and the actual delivery's ISO timestamp in `occurredAt`. Keep the latest deliveries available across at least two polls; the adapter retains at most 12 per response and deduplicates IDs. Repeated delivery IDs must not identify different balls. The first response's delivery history is marked as baseline. Feed and relay clocks should be synchronized; upload/decoder delay still affects video alignment. Timestamps are never invented for the public snapshot feed.

IDs in the configured URL are substituted only after numeric validation. The phone cannot configure an arbitrary fetch host. Redirects are rejected; HTTPS is required. Polling never goes below five seconds. Provider credentials stay on the laptop. Do not include unnecessary private player data in your feed.
