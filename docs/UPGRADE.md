# Upgrade the uploaded project to MK97

This release replaces simulated platform connections and stream state with the authenticated relay and real YouTube authorization/setup flow. START changes to SENDING only after the relay accepts the selected camera upload. The application uses the attached MK97 logo unchanged in its home, studio, favicon and broadcast watermark.

## Replace the website

1. Keep your current repository name, including `BOUNDARY.LIVE` if that is the repository you already use. Upload the **contents** of the ZIP's `mk97/` directory to the repository root. Replace existing files rather than uploading the ZIP as a single file.
2. Delete obsolete `web/wizard.mjs` and `web/match-model.mjs`, the old `data/matches/` and `web/data/matches/` sample archives, and unused old brand/team assets. They are absent from this ZIP. Do not delete your own unrelated repository files.
3. Include `.github/workflows/pages.yml`. In GitHub Settings → Pages select GitHub Actions, then let the validation and deployment jobs finish. The workflow publishes only `web/`.
4. Restart the laptop relay from this same source version. Do not commit your existing real `relay/.env`. Merge the empty Google configuration fields from `.env.example` into it locally if needed. Old credentials are not included in the ZIP.
5. Open the new HTTPS site and refresh. The home page must say **MK97**, show your supplied logo, and begin with the camera off and no match loaded. Reconnect the relay because sessions are kept only in memory.

Existing Google credentials must register your actual repository callback exactly. For example, a `BOUNDARY.LIVE` repository uses `https://YOUR_USERNAME.github.io/BOUNDARY.LIVE/youtube-callback.html`; a repository named `MK97` uses `/MK97/youtube-callback.html`. See [YOUTUBE.md](YOUTUBE.md).

## Check the corrections

- Fetch Match 986 / Club 300. The source identifies **Royal Bulls CC 207/9 (35)** and **ICAT 208/5 (30.5)**, with **ICAT won by 5 Wickets**. Team names are never substituted with Thunderbolts.
- Open Scorecard. The innings selector keeps Royal Bulls CC and ICAT separate. A missing first-innings card remains marked not supplied. Current-player records and the last dismissed batter are shown only if the source supplies them.
- Open Commentary. Only source commentary appears. An empty source field stays empty with a clear explanation; score changes do not produce invented commentary.
- Open Stats → Partnership. Compare the source's 88 runs / 73 balls and individual source contributions. Values are not recomputed to force them to agree.
- Connect the relay. The studio switches from direct public score reads to the same relay snapshot used by the video encoder. Changing the selected match is blocked while uploading.
- Connect YouTube using Google's real consent page after the one-time setup. Facebook/Instagram require the documented Live Producer keys. Entering a channel name never marks a platform connected.
- START remains unavailable until the camera, relay, selected destinations and required score source are ready. Clips remain empty until actual buffered footage exists. The timer and viewer readout are not demonstration values.

## Data access limits

The public endpoint can omit full innings cards, commentary and detailed statistics. MK97 extracts and displays the exact fields it receives; it cannot recover data that is absent or inaccessible. Version 1.4 adds a background HTML scraper to the relay, a one-match CLI and a manual Actions workflow; run `npm ci --ignore-scripts` after updating the laptop's source. See [SCRAPER.md](SCRAPER.md). The full match 986 scorecard HTML presented a verification screen during inspection and remains unverified. No verification, access token or shared overlay control is bypassed. An authorized complete feed remains an alternative for inaccessible or JavaScript-only data; [CRICCLUBS.md](CRICCLUBS.md) describes its supported contract and configuration.

The optional match snapshot workflow is now **manual only**, creates a short-lived downloadable workflow artifact, and stores whitelisted source values. It does not run an always-on scraping schedule, build inferred commentary, write a data branch or populate the live interface with historical samples.
