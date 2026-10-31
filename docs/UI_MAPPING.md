# MK97 1.9 — supplied design to existing functionality

The ten supplied screens now use the attached MK97 Cricket Live Studio logo and navy/cyan visual system. Every one of the previous 304 controller IDs is retained. The reference images are not used as application screenshots or fabricated match data.

| Reference | Implemented screen | Existing functionality |
| --- | --- | --- |
| 01 Login | Sign in / account creation / recovery | Existing studio account endpoints, 30-day remembered devices, optional direct token and one-time device linking. Eye controls reveal/mask the existing inputs and mask again on submit/navigation. |
| 02 Home | Match Setup, Stream Setup, Studio, My Events | Opens existing match/stream flows and current saved YouTube event. Menu, health, account, scorecard, commentary and sharing remain available. |
| 03 Match Setup | League, Match ID/URL, Club ID, Fetch Match | Existing dynamic CricClubs loading, club/league validation and source refresh. Details use the fetched match; missing venue or other fields remain blank rather than invented. |
| 04 Stream Setup | Readiness checklist and cloud connection | Existing account/token connection, encoder readiness, destination selection, camera opening, remembered devices and hosting helpers. |
| 05 Studio | Camera preview and Start/Stop | Existing native capture, bottom score overlay, native zoom, Fit/Fill, mute, local monitor, fullscreen and upload. Start sends camera video; YouTube publication remains its separate Go live action. |
| 06 Stream Settings | Graphics, Events, Quality, Destinations, Advanced | Navigation to the original controllers, with added links for scorecard/commentary, health/statistics, share, account and cloud setup. |
| 07 Live Score Graphics | Actual scorebar preview, overlay toggle, events/cards | Existing combined team/player milestone toggle and end-of-over card toggle. Batting and bowling can each be put on air during upload. Durations remain exactly 2 seconds. |
| 08 Quality / Destinations | Auto/1080p/720p/480p, encoding profile, three destinations | Quality buttons forward to the original capture controls. Existing Balanced/Detail profiles remain. Platform arrows open YouTube OAuth or the existing Facebook/Instagram key form. |
| 09 YouTube Live Setup | Connect/disconnect, callback Copy, Create Live Setup | Original Google OAuth/PKCE, callback and private key storage. Existing cancellation, setup recovery and account configuration remain. |
| 10 Create Live Setup | Title, description, now/scheduled, visibility, audience | Original form validation and idempotent YouTube setup. Success opens the current event and its Preview / Go live / End controls. New setup still requires reviewing the previous setup. |

## Controls retained beyond the pictures

Camera/lens selection, native zoom presets, pitch guide, microphone mute, battery screen, pause/resume local monitor, Cast/AirPlay fallback, fullscreen, health and source statistics, innings selection, batting/bowling/commentary tabs, manual on-air cards, public link sharing, remembered-device revocation/linking, account password change/recovery, encryption-key helpers, hosting guide, YouTube setup retry/new-setup checks, stream Stop confirmation and YouTube End confirmation remain accessible.

Back follows the visited settings pages; Close returns to the underlying Home or Studio. Step buttons navigate Match → Stream → Studio. Return to Studio and the camera step open the actual studio.

## Reference options mapped without changing behavior

- The app has one current scorebar design; unused Modern/Classic/Minimal/Pro choices are not presented as working controls.
- Milestones remain one combined team/player setting. Both over cards remain one setting, batting followed by bowling. The 2-second duration is shown as information rather than an unsupported editable selector.
- Manual platform key entry supports the existing YouTube/Facebook/Instagram RTMPS allowlists. An unrestricted custom RTMP destination is not added.
- My Events shows the existing saved/current YouTube event. Historical events remain in YouTube Studio; local recordings, replay and history capture are not introduced.
- Existing privacy and audience defaults, authentication, encryption, source fetching, provider APIs and stream processing remain unchanged. Server version metadata and the rendered logo are updated for this release.

## Validation

The previous 262-test suite passed after the redesign. New interface contract tests verify retained IDs/input types/form owners/select options, route destinations, quality delegation/locks, destination mapping, masking, actual-score preview, Back and post-setup navigation. Isolated browser checks exercised sign-out/sign-in, token-mode switching, quality, saving a nonfunctional platform key, settings/graphics navigation, synthetic Google callback and the separate setup form. No real Google account, external broadcast or remote deployment was performed.

Upload the contents of the MK97 source folder to the existing repository and redeploy the same service. Keep the existing environment values and database encryption key. This is a source update, not a deployed change.
