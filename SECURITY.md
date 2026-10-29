# Security design and limits

This is a small, self-hosted single-operator broadcaster. It has layered protections, but it has not undergone an independent penetration test or security certification.

## Layers implemented

| Layer | Concrete behavior |
| --- | --- |
| Private network | Recommended setup is Tailscale Serve, reachable only from the permitted private network. Node binds to loopback by default. No router port forwarding is needed. |
| Encrypted transport | Browser-to-relay uses HTTPS/WSS, with HTTP permitted only for localhost development. Platform outputs accept RTMPS only. FFmpeg certificate verification is enabled; a trusted CA file can be configured. |
| Long-term access | A 256-bit random relay secret is generated locally. Constant-time comparison verifies it. It is used only to establish a session. |
| Session isolation | Random session tokens live only in browser/server memory, expire after eight hours and are bound to the browser origin. Disconnect revokes them. Restarting the relay clears all sessions. |
| Upload authorization | Each upload needs a random, origin-bound, one-use ticket with a 30-second lifetime. The first WebSocket message carries it; keys/tokens do not appear in URLs. Replays fail. |
| CORS and CSRF boundary | Explicit allowed origins, no wildcard, no cookie authentication and no credentialed cross-origin fetches. Unknown origins are rejected at HTTP and WebSocket upgrade. |
| Resource limits | One active broadcaster, eight connections/sessions, 24 pending tickets, authentication/HTTP rate limits, five-second WebSocket authentication deadline, 16 MB message ceiling, 4 KB JSON body ceiling, bounded upload buffers, ingestion-rate and inactivity limits. |
| Secret containment | Platform keys stay in the laptop's untracked `.env`. API responses return configuration flags, never platform URLs/keys. The relay does not emit raw FFmpeg stderr, which can contain credentials. |
| Output restrictions | Only RTMPS endpoints on expected platform subdomains are accepted. File URLs, private IP destinations, credentialed server URLs and tee-injection separators are rejected. Destinations cannot be supplied by the phone. |
| Media isolation | Uploads are treated as binary media, use explicit MOV or Matroska demuxers and permit only the `pipe` input protocol. Input media cannot ask FFmpeg to fetch arbitrary network/file URLs. Child processes use argument arrays without a shell. |
| Score isolation | The phone supplies numeric IDs, never an arbitrary upstream URL. Custom score endpoints are trusted operator configuration, use HTTPS, time out, and have a 2 MB response ceiling. Returned data is whitelisted and length bounded. Raw player records/emails are not returned. |
| Rendering protections | No third-party JS, fonts or analytics; local modules only. Text uses `textContent`, not HTML insertion. FFmpeg score text disables expansion. CSP, referrer suppression, anti-framing headers on the relay and no-store API responses are provided. |
| Publishing boundary | GitHub Pages workflow publishes `web/` only. No environment file, node_modules, API or relay state is deployed. |

## Operator responsibilities and boundaries

- Protect the laptop account, disk, platform accounts and private Tailscale network with appropriate device security and MFA. An attacker with control of the laptop can read `.env`, memory and process state. RTMPS destination URLs can be visible to local process-inspection tools because FFmpeg needs them as arguments.
- Use current FFmpeg/Node/Tailscale builds. FFmpeg parses complex media; this app does not provide an OS sandbox around it. Keeping the relay private and patched is part of the design.
- Access to the long-term relay token grants broadcast control. There is one operator role, without multi-user RBAC, approval workflows or per-user audit history. This app is not a public SaaS service.
- GitHub Pages cannot set all custom HTTP response headers. A CSP meta tag restricts the frontend, but `frame-ancestors`/HSTS/X-Frame-Options for that public origin depend on its host. The relay itself sends anti-framing/security headers. Use the private same-origin site or a host you control if you require custom headers everywhere.
- GitHub projects can share an origin. Do not host untrusted scripts on your account's other Pages projects. No master/session/platform secrets are saved to localStorage; only the relay address, match ID and club ID are remembered.
- Private-network reachability and CORS are different controls. CORS is not a network firewall. Private Serve supplies that outer network boundary; the application still checks its own authentication.
- The public score reader is not an authorization bypass. It does not solve CAPTCHAs, use hidden account credentials, change overlay views or keep scraping blocked HTML routes. If the feed is restricted, obtain the necessary access or configure an approved feed.
- HTTPS protects transport; it does not prevent YouTube/Meta from processing or recompressing the video you send them.
- No recording is made by the app. Selected platforms may record/archive streams under their own settings.

## If something leaks

Stop the relay. Revoke/rotate platform keys in their platform control rooms. Replace `RELAY_TOKEN` with a new random secret in `.env`, restart and reconnect. Remove an unauthorized device from the private network. If a secret was ever committed, deleting the current file does not remove Git history; rotate it and clean the repository history separately.

## Reporting and validation

Review `docs/VALIDATION.md` and run `npm test`. Tests cover token/session expiry and revocation, ticket replay, origins, hostile URLs, payload limits, private-file exposure, real score normalization, and actual video processing. These checks do not establish “bug free” or “unhackable” status.
