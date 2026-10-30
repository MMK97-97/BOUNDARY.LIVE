# Upgrade to MK97 1.6

Stop the active camera upload and end platform events before updating. Back up your own changes, then replace the complete source, including `web/`, `relay/`, tests, package files, Docker/hosting files and hidden workflows.

Remove the obsolete `relay/lib/replay-ring.mjs` from the old repository. The new program processor has no footage history, clip/export routes or automatic replay. The Clips tool is replaced with Stream setup. Do not keep the old relay running with the new frontend.

The preferred deployment is now a hosted Docker service that serves both MK97 and its APIs. No laptop/VPN needs to run at the ground. See [FREE_HOSTING.md](FREE_HOSTING.md). Keep the same repository and Pages URL if you also want the optional static frontend.

Keep private environment secrets on the host. Add the exact `PUBLIC_URL` on generic hosts; Render supplies its own external URL. Use one instance. Enter manual destination keys in the app for a session, or keep explicitly chosen server fallback keys in private environment settings. Google OAuth client settings are configured once on the host.

Run `npm run check` and `npm test`; the supplied Actions workflows also validate source, media and the Docker runtime. Redeploy the server after replacing code. Reconnect the phone after restart and verify actual encoder readiness, selected match, audio and platform preview before a live match. A repository web upload does not automatically include hidden workflow files; check `.github/workflows/` explicitly.

The new version does not make blocked CricClubs source pages readable or complete a partial ticker. It does not deploy cloud resources or publish an external platform broadcast by itself.

Version 1.6.1 adds automatic FWCWL, TampaCricket and TCL mappings and retains paths from pasted scorecard URLs. Preserve host secrets and deploy both sides together. Existing FWCWL environment values can remain. See [LEAGUES.md](LEAGUES.md).
