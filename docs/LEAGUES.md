# CricClubs league support — MK97 1.6.2

Paste a **full scorecard URL** in Score or the match home panel. MK97 extracts the numeric identifiers and retains the exact validated league path. The cloud reader, live overlay and source panels stay bound to that selection. A bare Match ID still needs its Club ID; match IDs are not globally unique.

| League path | Club ID | User's example Match ID |
| --- | --- | --- |
| FWCWL | 300 | 986 |
| TampaCricket | 1507 | 3866 |
| TCL | 157 | 6098 |

The three club/path mappings are built in. **No Render environment switch is needed** when moving between them. Enter another Match ID with the correct Club ID for a different match in that league. These example numbers are not hardcoded fallbacks.

Full links for the two added leagues:

```text
https://cricclubs.com/TampaCricket/viewScorecard.do?matchId=3866&clubId=1507
https://cricclubs.com/TCL/viewScorecard.do?matchId=6098&clubId=157
```

Other leagues are supported by their full scorecard URL. The browser remembers a pasted path separately for its Club ID and forwards it when reconnecting to the cloud service. The server validates the path and constructs only the fixed read-only CricClubs scorecard URL. It does not accept arbitrary hosts, write routes, repeated IDs, credentials, fragments or extra query parameters.

Changing club, match or league path clears previous cards/score and cancels the previous generation. An older ticker/HTML response cannot replace the new selection. Stop an active camera upload before changing its match/league.

## Actual provider checks — October 30, 2026

One successful read of the existing public ticker was made for each sample. The shared normalizer returned:

| Club / match | Team 1 | Team 2 | Status |
| --- | --- | --- | --- |
| 1507 / 3866 | Jaguars 130/5 (16) | Roaring Royals 95/5 (16) | Complete |
| 157 / 6098 | Kings 138/7 (16) | NewTampaHawks 79/7 (16) | Complete |

Those responses supply valid totals but **do not supply complete player cards or commentary**. The saved test fixtures are whitelisted normalized snapshots, not full HTML captures, actual-live-match tests or a production fallback. No new full HTML read for these samples was verified during this update. The earlier FWCWL full page presented verification; it was not bypassed.

The same full HTML parser now receives the correct path for each selected league when source access permits it. Parser/enrichment tests use explicit synthetic tables for each routing case. CricClubs restrictions, unsupported layouts or missing data remain visible failures; this update does not manufacture full cards or commentary.

## Deploy this update

Replace the website and server together using the 1.6.2 source ZIP, commit to your repository and manually redeploy the Render service between broadcasts. Preserve your existing private RELAY_TOKEN and other host secrets. The old `CRICCLUBS_CLUB_ID=300` / `CRICCLUBS_LEAGUE=FWCWL` pair can remain: it no longer limits the reader to that club.

Connect MK97, paste either complete URL and Load. The Club ID and league summary should change automatically. For a live overlay, select a readable active match; the supplied samples are completed and will not generate new balls.

## CLI examples

```sh
npm run scrape -- --club 1507 --match 3866 --out scorecard-output/tampa.json
npm run scrape -- --club 157 --match 6098 --out scorecard-output/tcl.json
```

These commands attempt one permitted full HTML read; they do not guarantee access. For an unknown league, provide `--league NAME` or `--url FULL_SCORECARD_URL`. The manual Actions workflow already accepts a separate league path; use the table above when supplying its inputs.

## If 1507 or 157 did not load

1. In Score choose **Tampa Cricket · Club 1507**, then enter **Match ID 3866**, or choose **TCL · Club 157**, then enter **Match ID 6098**. A Club ID alone does not select a match. You can also paste the corresponding complete URL above. The league selector fills Club ID; it does not guess Match ID.
2. Connect the cloud studio in Stream setup. That panel now shows both website and cloud-reader versions. For this update both should be **1.6.2**; a successful Pages deployment does not update the Render server. Deploy the same commit on Render.
3. Check the persistent error in Score if a read fails. It also appears in the match home card. With a confirmed cloud selection, the live subscription stays attached through an initial source failure and receives recovery without another submission.
4. If the app says a custom feed is configured, inspect `SCORE_URL_TEMPLATE` on Render. To use the built-in CricClubs reader, remove that custom override and redeploy. Do not post its private header values or tokens. A custom approved feed must return the selected club and match.
5. Preserve `RELAY_TOKEN`. Leave the legacy FWCWL club/path values as they are. They do not filter supported leagues in this version.

On October 30 both sample ticker reads succeeded again from this development server, and the published Pages build reported 1.6.1. This does not reveal the user's Render deployment or identify the exact cause of their failed attempt. These are completed sample matches: totals should load, but no new balls will appear. Full cards/commentary still require readable complete source data; no source restriction is bypassed.
