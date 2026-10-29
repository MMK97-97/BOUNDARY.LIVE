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
6. It refreshes on the laptop every 10 seconds by default and updates two atomic text files used by FFmpeg. The phone receives a small normalized score response.

This reads the same service's public score data server-side, avoiding browser CORS restrictions. The HTML scorecard route presented a verification page to the build environment; the read-only JSON endpoint returned the requested match without requiring that HTML page. The code does not bypass that verification or mutate CricClubs settings.

## Failure behavior

- Incorrect IDs, missing batting data, upstream HTTP errors, HTML instead of JSON and timeouts produce visible errors.
- If a previous valid score exists, it stays visible with **SCORE DELAYED** when a fetch fails or the last successful fetch is older than 30 seconds.
- `fetchedAt` means the last successful retrieval. It is not the time the scorer recorded a delivery. A reachable feed can still contain unchanged or delayed scores.
- A newly selected match clears the previous match's score immediately on the relay. In-flight data for an earlier match cannot overwrite it.
- Some CricClubs overlay views omit live fields. The app uses the available validated totals and labels a limited view; it never changes CricClubs' view to obtain other data.
- Completed matches are labelled **MATCH COMPLETE**. No simulated data is substituted when a feed fails.

CricClubs can change or restrict this undocumented endpoint. Their published plans distinguish API/streaming-graphics access, so continuing availability and permission are not guaranteed by this code. Check with your league/CricClubs for your use. The match ID alone is not globally unique: it is resolved together with a club ID.

## Approved feed alternative

If the public feed is unavailable, configure an endpoint your league/provider authorizes. Keep its credentials only in `relay/.env`:

```ini
SCORE_URL_TEMPLATE=https://YOUR_APPROVED_FEED/score?clubId={clubId}&matchId={matchId}
SCORE_HEADER_NAME=Authorization
SCORE_HEADER_VALUE=Bearer YOUR_APPROVED_TOKEN
```

It can return the CricClubs `values` shape, or this compact contract:

```json
{
  "schema": "boundary.score.v1",
  "batting": "ICAT",
  "bowling": "RBCC",
  "runs": 208,
  "wickets": 5,
  "overs": "30.5",
  "runRate": "6.75",
  "target": "208",
  "status": "complete",
  "result": "ICAT won by 5 Wickets",
  "series": "FWCWL 2026-27 Season",
  "detail": "",
  "balls": ["1", "2", ".", "1", "1", "1wd"]
}
```

Overs are cricket notation: 30.5 means 30 overs and five legal balls, not 30.5 decimal overs. Status values are `live`, `complete`, `break` or `scheduled`. IDs in the configured URL are substituted only after numeric validation. Redirects are rejected; HTTPS is required. Polling never goes below five seconds.
