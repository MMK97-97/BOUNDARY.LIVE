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
2. Before relay connection, the browser requests the public endpoint directly without credentials. A CORS/network refusal shows a visible error, with no public proxy fallback.
3. After relay connection, it sends those two IDs to your authenticated relay over HTTPS, then reads the relay's normalized snapshot. The relay reads:

```text
https://cricclubs.com/liveScoreOverlayData.do?clubId=300&matchId=986
```

4. Both paths use `web/score-data.mjs` to extract teams, totals, wickets, overs, rates, result, batter/bowler records, source commentary, partnership and supplied innings cards. Raw player emails/profile metadata are not forwarded.
5. It chooses the batting innings from explicit innings flags, including the separate super-over flags. Missing fields fail validation rather than becoming invented zeros.
6. The laptop refreshes every five seconds by default (up to two seconds of scheduler jitter). The phone refreshes one source every five seconds while visible; idle hidden pages pause scheduled reads. The program renderer uses the relay's normalized score fields for graphics. Changing a match cancels the previous browser generation; older responses cannot replace the new selection. The relay also blocks match changes during camera upload.

The MK97 browser loaded match 986 directly during validation. Separate Node requests from this build environment timed out; local laptop/provider connectivity must still be verified. The full HTML scorecard route previously presented a verification page. The code does not bypass that verification, generate a provider access token, change a shared overlay view or mutate CricClubs settings.

## Failure behavior

- Incorrect IDs, missing batting data, upstream HTTP errors, HTML instead of JSON and timeouts produce visible errors.
- If a previous valid score exists, it stays visible with **SCORE DELAYED** when a fetch fails or the last successful fetch is older than 30 seconds.
- `fetchedAt` means the last successful retrieval. It is not the time the scorer recorded a delivery. A reachable feed can still contain unchanged or delayed scores.
- A newly selected match clears the previous match's score immediately on the relay. In-flight data for an earlier match cannot overwrite it.
- Some CricClubs overlay views omit live fields. The app uses the available validated totals and labels a limited view; it never changes CricClubs' view to obtain other data.
- Completed matches are labelled **MATCH COMPLETE**. No simulated data is substituted when a feed fails.
- Initial data establishes the event baseline. Snapshot changes can trigger milestones and over cards, and confirmed changes in batter runs/four/six counters can trigger a replay. See [AUTOMATION.md](AUTOMATION.md) for calibration and missed-delivery limits.
- The public feed does not guarantee delivery timestamps or full innings cards. The source panels show supplied rows only, separated by innings. Even a returned array is not marked complete without explicit completeness metadata. On-air automation can show available players observed by the relay, with an incomplete-data label.

## Scorecard, commentary and statistics in this build

The mobile Score panel has Batting, Bowling and Commentary tabs. Stats has Overview, Partnership, Runs and Wickets. Team totals, returned player values, toss, player of the match and current partnership are read from the selected source response. Strike rate/economy show a dash if the source does not supply them; no substitute player records or ball text are generated.

The validated match 986 response includes a partnership of **88 runs / 73 balls** and player contribution fields. These are forwarded as supplied, rather than recomputing the provider's partnership total. Its `comments` field is empty. Its public full-scorecard HTML page returned a verification screen to this build environment. This version reads the available public JSON; it does not claim to extract a full innings card or commentary from that blocked HTML page.

An authorized provider can supply full cards and commentary using the existing HTTPS feed adapter. Optional canonical fields are:

```json
{
  "commentary": [{"id":"unique-provider-row","over":"7.6","text":"The provider's own ball commentary"}],
  "stats": {
    "toss":"Provider toss text",
    "playerOfMatch":"Provider player name",
    "partnership":{"runs":88,"balls":73,"batters":[{"name":"Provider batter","runs":53,"balls":38}]}
  }
}
```

The snippet extends the full contract below; it is not a standalone score payload or a claim that this example commentary occurred in match 986. Commentary is capped at 120 rows with bounded plain text. Player rows accept optional `strikeRate` / `economy` values. Full-card completeness must be explicitly supplied by the feed. The source fixture is only for tests, never a live fallback.

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
  "schema": "mk97.score.v1",
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

`boundary.score.v1` remains accepted for existing authorized adapters. To supply both innings, add `teams` and `inningsCards` to the canonical payload:

```json
{
  "teams": [{"name":"Provider team","code":"TEAM","runs":207,"wickets":9,"overs":"35"}],
  "inningsCards": [{
    "id":"1","team":"Provider batting team","bowling":"Provider bowling team",
    "runs":207,"wickets":9,"overs":"35","complete":true,
    "batting":[{"id":"provider-player","name":"Provider batter","runs":50,"balls":40,"fours":4,"sixes":2,"status":"Provider dismissal","strikeRate":"125.00"}],
    "bowlers":[{"id":"provider-bowler","name":"Provider bowler","overs":"7","maidens":0,"runs":30,"wickets":2,"economy":"4.28"}]
  }]
}
```

This is an illustrative schema extension, not match 986's batting figures. Supply actual upstream values. Up to four innings cards are accepted, allowing explicit super-over identifiers. `cards` remains the current-innings structure used by video automation; `inningsCards` drives source panel selection. No source credential belongs in a browser form or canonical JSON payload.

For exact provider delivery events, use a stable unique `id`, bat runs (4 or 6 for a boundary), and the actual delivery's ISO timestamp in `occurredAt`. Keep the latest deliveries available across at least two polls; the adapter retains at most 12 per response and deduplicates IDs. Repeated delivery IDs must not identify different balls. The first response's delivery history is marked as baseline. Feed and relay clocks should be synchronized; upload/decoder delay still affects video alignment. Timestamps are never invented for the public snapshot feed.

IDs in the configured URL are substituted only after numeric validation. The phone cannot configure an arbitrary fetch host. Redirects are rejected; HTTPS is required. Polling never goes below five seconds. Provider credentials stay on the laptop. Do not include unnecessary private player data in your feed.
