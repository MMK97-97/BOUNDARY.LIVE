# CricClubs scorecard scraper

MK97 1.4 adds a Node.js module for **server-rendered public scorecard HTML**. It runs on the hosted server, not on the phone. A blocked page or an HTML shell whose tables load later through JavaScript does not become a complete scorecard. Match 986's full page previously returned a verification screen; this module has not retrieved that match's complete innings in this environment.

## Run it

Use Node 22.12 or newer and the repository's locked dependencies:

```bash
npm ci --ignore-scripts
npm run scrape -- --url "https://cricclubs.com/FWCWL/viewScorecard.do?matchId=986&clubId=300" --out scorecard-output/300-986.json
```

Or choose another match explicitly:

```bash
npm run scrape -- --club 300 --match 985 --league FWCWL --out scorecard-output/300-985.json
```

The CLI makes one permitted page request after checking robots.txt. There is no retry loop. Failure writes a structured code/message to stderr, exits with code 2, and leaves an existing output untouched. It never falls back to match 986. Without `--out`, the whitelisted JSON goes to stdout.

To develop against an HTML scorecard you have legitimately saved, without making network requests:

```bash
npm run scrape -- --club 300 --match 986 --league FWCWL --html /path/to/scorecard.html --out scorecard-output/300-986.json
```

Saved HTML is labelled `origin: saved-html` with its parse time. That timestamp is not a source update time or a live-fetch timestamp. A saved verification page will fail too. Treat saved HTML as development input; do not put it in `web/` or commit player profile data.

## Connect it to the live overlay

The updated relay enables the reader by default for Club 300 / FWCWL. In `relay/.env`:

```ini
CRICCLUBS_SCORECARD_ENABLED=true
CRICCLUBS_CLUB_ID=300
CRICCLUBS_LEAGUE=FWCWL
```

Run `npm start`, connect the mobile studio to the relay, and load the Match ID. Live ticker totals load first. The background reader attaches the HTML's player lists only when the team names and innings totals match the ticker. The next score refresh exposes them to the mobile tabs and on-air cards. A verification failure leaves ticker totals working and displays the full-card problem in the source note. Changing Match ID clears the old selection; pending old results cannot overwrite it.

Version 1.6.1 accepts the league path directly from the pasted full URL. Numeric IDs use built-in mappings for FWCWL / 300, TampaCricket / 1507 and TCL / 157. Other full URLs do not require changing server settings. The legacy environment pair is an optional additional/override mapping, not a global club filter; it does not grant provider access. See [LEAGUES.md](LEAGUES.md). A custom `SCORE_URL_TEMPLATE` takes precedence and disables this HTML enrichment. Set `CRICCLUBS_SCORECARD_ENABLED=false` to use only the ticker.

GitHub Pages serves the mobile interface; it cannot execute this Node module. The new **Scrape CricClubs scorecard (manual)** Actions workflow accepts the three identifiers and saves a one-time JSON artifact. It does not run a live five-second feed or write historical data into the website. A failed/blocked run does not publish an artifact or alter the match. Do not use another execution location to get around a provider access restriction.

## Module API

```js
import {
  CricClubsScraper,
  parseCricClubsScorecard,
  enrichCricClubsScore
} from './relay/lib/cricclubs.mjs';

const scraper = new CricClubsScraper();
const document = await scraper.scrape({ clubId: '300', matchId: '986', league: 'FWCWL' });
// Or parse an already obtained HTML string/Buffer with the same identifiers:
// const document = parseCricClubsScorecard(html, { clubId: '300', matchId: '986', league: 'FWCWL' });
// const enriched = enrichCricClubsScore(normalizedTicker, document);
```

The document uses `schema: mk97.cricclubs.scorecard.v1` and contains requested identifiers, the canonical source URL, `inningsCards`, `commentary`, `metadata`, `coverage`, and warnings. A successful network read adds `fetchedAt`.

Each innings contains source batting/bowling rows, dismissals, strike rates/economies, totals, overs, extras, did-not-bat names and fall-of-wickets text when available. Metadata supports series, ground, result, toss and player of the match. Commentary is only the text in the returned HTML, capped at its last 120 unique rows with counts/truncation recorded in coverage; paginated history or JavaScript-only commentary needs a documented authorized data source. No ball timestamps, delivery events, missing economy values or player figures are invented.

## Completeness and supported layouts

The parser discovers tables by column headers rather than a single CSS class. It supports Batting/Batsman/Batter headers, R/B/4s/6s/SR and their long forms; Bowling/Bowler headers, O/M/R/W/Econ and long forms; and Over/Commentary tables. It associates tables with named `Team innings` headings, captions, labelled tab panes, or `data-team` containers. Unknown or ambiguous layouts remain unavailable. It does not evaluate scripts or probe hidden provider endpoints.

`complete: true` requires both player tables, source totals/wickets/overs, no rejected or conflicting rows, batting runs plus source extras equal to the innings total, and bowler legal balls equal to innings overs. This verifies those reconciliations, not independent proof of every zero-run/non-bowling participant. Did-not-bat names are retained separately. Unsupported layouts and source changes require a real, readable HTML sample and a parser update; the included layout fixture is synthetic and is not evidence of a successful full CricClubs scrape.

## Request and data protections

- Fixed HTTPS origin `cricclubs.com`, fixed read-only route, numeric identifiers, bounded league path; arbitrary hosts, credentials in URLs, duplicate IDs and extra query parameters are rejected.
- robots.txt is checked before the page. Denied or unreadable rules stop scraping; 404 is treated as no published rules. Rules are cached for one hour and source crawl-delay is respected.
- Requests identify `MK97Scorecard`, send no cookies/authentication, refuse redirects, and have bounded timeouts/body sizes. Parsing does not execute scripts or load embedded resources.
- The cache holds at most 16 matches, uses a 15-second minimum TTL and a five-second minimum host interval. Requests for the same match are deduplicated. HTTP 401/403 and verification screens stop full-card requests for the relay session; resolve legitimate access before a fresh session. HTTP 429/503 pause requests for at least five minutes, respecting longer Retry-After values up to one day. No request method or execution location is changed to avoid a block.
- Output contains whitelisted plain-text score fields, not raw HTML, scripts, profile emails, headers or credentials. The website renders source values with textContent.
- Canonical/hidden match identifiers are checked when supplied. An HTML card is merged with a ticker only if Club ID, Match ID, full team identity and totals agree. Missing or contradictory data stays partial.

Tests cover synthetic complete/partial layouts, source field fidelity, dynamic IDs, cross-match races, slow/background enrichment, blocked pages, robots rules, hostile URLs, bounded responses and atomic CLI writes. Continuous live provider access remains an external requirement; these tests do not certify it.
