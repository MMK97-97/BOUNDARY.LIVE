# Score fixtures

- `fwcwl-986.json`: whitelisted captured CricClubs ticker response for Club 300 / completed Match 986, used by existing normalization regression checks.
- `tampa-3866-normalized.json`, `tcl-6098-normalized.json`: whitelisted normalized snapshots of actual public ticker reads on October 30, 2026. They are completed matches with incomplete player cards and no supplied commentary; no raw email/profile fields are included. These are not full HTML captures and are never a live fallback.
- `scorecard-layout.html`: explicitly synthetic HTML for structural parsing/reconciliation tests. Its illustrative figures are not actual league-match data. Multi-league routing tests adapt only this synthetic fixture's identity/path fields.
