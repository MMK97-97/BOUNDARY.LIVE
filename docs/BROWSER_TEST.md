# Cloud-browser test — MK97 1.4.1

Tested October 30, 2026 in the cloud Chrome browser, using an isolated copy of MK97's source, its real Node relay, and its real HTML parser. Production source was not replaced with fixtures. The test copy intercepted upstream reads and returned explicitly labelled synthetic/recorded responses; it made no live CricClubs request, started no broadcast and used no platform account credentials.

## Findings and fixes

1. **Match-loaded notification:** removed the `Match ... loaded from CricClubs` success banner. Both the notice and dismiss control are hidden after a successful match load. Errors remain visible.
2. **Same-origin connection failure:** the browser POST created a session bound to its Origin, but subsequent same-origin GET requests omitted that header. The relay then returned 401. The website now sends `X-MK97-Origin`. The relay accepts it only from its allowed origin set, rejects disagreement with a supplied browser Origin, and still requires the session bearer token. The browser connected successfully after the fix. Two new HTTP regressions cover this behavior and rejection of hostile/conflicting origin claims.

Update both website files and laptop relay files, then restart the relay. An older relay does not advertise the new header in its CORS preflight response. The version is 1.4.1.

## Browser observations

| Scenario | Result |
| --- | --- |
| Recorded Club 300 / Match 986 ticker | Available totals/players displayed, with an incomplete-card message. No successful full-scorecard retrieval was claimed. |
| Full synthetic Club 123 / Match 456 HTML through actual relay/parser | First innings: 4 batting rows and 2 bowling rows. Second innings: 3 batting rows and 3 bowling rows. Source strike rates/economies preserved. These are the fixture's complete tables, not actual match 986 data. |
| First-innings detail | Extras, did-not-bat names and fall-of-wickets text displayed. |
| Commentary | Both supplied entries displayed with their overs. No commentary generated from score changes. |
| Match-loaded success banner | Hidden after successful loads, including after a prior relay connection notice. |
| Mobile viewport | At 390 × 844, clientWidth and scrollWidth were both 390; no horizontal overflow. The player list and source detail could be scrolled. |
| Change to Match 457 with recorded verification HTML | Previous full player lists cleared. The new ticker's current batter remained available, with `CricClubs returned a verification page; full scorecard scraping stopped.` No old players were reused. |
| Invalid Match ID `../456` | Visible numeric-ID validation error; the previous valid match was not silently replaced. |
| Hostile origin claims | Automated HTTP tests returned 403 for unknown or conflicting client/browser origins. |

The same-origin iframe was initially rejected by production anti-framing headers, as intended. Only the isolated test copy's framing headers were relaxed to SAMEORIGIN / frame-ancestors self to inspect its mobile viewport. Production continues to send DENY / frame-ancestors none. The QA transport alias, public fixture token, test controls and fixtures are not included in the delivered app.

The full automated suite passed **143 tests, 0 failed, 0 skipped** after these changes. The original HTTP preview cannot validate real phone camera hardware, actual HTTPS/Tailscale delivery or platform broadcasts.

## Remaining full-scorecard limitation

Match 986's actual full HTML previously returned a verification screen. This test used that recorded response to verify correct failure handling and did not retry or bypass the provider. The browser-only feed still lacks complete innings lists. A connected relay can enrich the score only when the public HTML is readable and its layout is supported, or when an authorized complete feed is configured. Passing the synthetic fixture test does not establish live full-card access for FWCWL.

The screenshot accompanying the test is labelled SYNTHETIC / RECORDED DATA. It shows the mobile fixture result, not newly retrieved match 986 figures. The production site was not republished during this test.
