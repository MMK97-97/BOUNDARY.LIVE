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

## 1.6.2 YouTube and league follow-up

The 390 × 844 phone was tested with the actual application modules and an explicitly labeled isolated provider. The local synthetic approval navigated to the server callback; the original tab displayed **Account connected / Test cricket channel** without a popup message. Event creation returned a ready key, and YouTube became selected. A visible QA-only button simulated an active video signal; Preview, Go live and End then produced testing, live and complete. No real account permission or stream publication occurred. The provider fixture has a fixed sample event title/visibility; this browser test does not verify Google's acceptance of real settings.

Both league presets loaded their recorded completed-match totals over the authenticated relay subscription. Full URLs switched between the leagues even with escaped separators. An unsupported fixture ID kept a visible error; loading a valid match recovered it. The cloud/website version display read 1.6.2 / 1.6.2.

A discovered phone issue was fixed: global feedback could cover the panel's header buttons. Feedback now flows below the heading. Close was verified with the message still visible, without dismissing it first.

Actual ticker totals were checked separately against the read-only CricClubs endpoint. Cloud-browser score data remained explicitly recorded fixtures, and Google responses remained synthetic. No user Render service, real Google consent, actual phone camera, battery consumption, provider TLS ingestion or external live broadcast was verified.
