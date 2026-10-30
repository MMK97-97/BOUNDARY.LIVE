# MK97 1.6.1 cloud-browser checks

The test UI uses an isolated checkout, the real Node relay and explicitly labelled synthetic/recorded match data. Test credentials are public nonfunctional placeholders; provider fetches are blocked. No camera/broadcast/account or free cloud allocation is simulated as a verified real service.

- Portrait 390 × 844, landscape 1120 × 700 and compact landscape 844 × 390 inspected against the user's references.
- Studio opens directly; tools are Score, Stats, Stream and Share. Replay/Clips/seek/export controls are removed.
- Set up stream opens the four readiness steps. START opens that panel while the camera is not ready.
- Fixture relay connects through the actual session API. Destination form saves a fixture RTMPS key, selects it, clears the password field and updates readiness. Remove session key disables it again.
- Synthetic live score changes arrive through the authenticated live link without pressing Load again. The Match ID, Club ID and supplied source fields remain bound to that match.
- Quality selection and viewfinder controls are checked independently of real camera capture. Score graphics ignore pointer input and are hidden over the standby artwork, so they cannot block framing buttons.
- The earlier removed Match-loaded success message remains absent. Errors remain visible and dismissible.

Production retains frame-ancestors 'none' and X-Frame-Options DENY. Only the separate QA copy allows its same-origin viewport wrapper and fixture transport. Neither is in the source ZIP.

See [VALIDATION.md](VALIDATION.md) for the complete test count, real FFmpeg evidence and limitations. An actual phone, active readable CricClubs match and hosted platform test remain necessary.

The 1.6.1 check pasted the user’s TampaCricket URL and then TCL URL into the same mobile form. League summaries changed to Tampa Cricket / Club 1507 and TCL / Club 157, Match IDs changed to 3866 and 6098, and the correct recorded team totals replaced the previous selection. This test used whitelisted normalized snapshots of actual ticker reads (so the canonical fixture is labelled Approved score feed); the banner identifies the isolated recorded-data transport. Actual current provider reads were separately verified from Node. No live or full-card verification is implied.
