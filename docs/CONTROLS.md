# MK97 1.6 controls

Portrait: header, quality selector, viewfinder, four tools and bottom transport. Landscape: tools move to the left of the viewfinder. The raw camera is the local monitor; score and event graphics are composed in the hosted live encoder. Check platform playback for the final program and delay.

| Control | Function |
| --- | --- |
| Back | Opens match-connection home when idle; active upload stays in the studio. |
| Auto / 1080p / 720p / 480p | Chooses actual native landscape capture before streaming. Auto tries supported sizes. |
| Open camera | Requests rear camera and microphone after a tap. Displays actual capture settings. |
| Set up stream / Settings / Stream tool | Opens the phone setup checklist, cloud connection, destinations and camera controls. |
| Cast / AirPlay | Uses supported native playback routing; opens sharing help when local camera routing is unavailable. |
| More | Opens an accessible menu for monitor pause/resume, fullscreen, setup, YouTube and sharing. Arrow keys/Escape work. |
| Score | Loads Match ID/Club ID or full CricClubs URL; controls on-air scorebar; shows source batting/bowling/commentary and innings selection. |
| Stats / monitor info | Shows broadcast health, actual capture data and supplied match statistics. Viewer counts are not invented. |
| Share | Copies/shares a validated public platform viewing URL; never includes access tokens. |
| Native zoom + / − / slider / presets | Uses camera-exposed zoom constraints only. Disabled when unsupported; magnification may be digital inside the device. |
| Fit / Fill | Changes local framing display only. Capture is not cropped or modified. |
| START | Opens setup if incomplete; begins one authenticated camera upload when preflight passes. It does not itself publish a YouTube event. |
| STOP | Requires confirmation, then ends the camera upload and all remaining outputs. Platform-event publication is checked separately. |
| LIVE | Opens the camera or resumes the hidden local monitor; it does not publish a platform event. |
| Speaker | Mutes/unmutes the outgoing microphone. The local camera player remains muted to prevent feedback. |
| Timer | Time since camera upload started, not platform viewer time. |
| Fullscreen | Enters supported browser fullscreen; uses an in-page theater fallback when needed. |
| Cloud connection | Exchanges a private relay token for an origin-bound session. Hosted same-origin address is discovered automatically over HTTPS. |
| Save securely | Validates a platform RTMPS URL/key and keeps it only in that session's server memory; clears the form key and selects the destination. |
| Remove session key | Removes only that session's selected manual key. A configured server fallback remains available. |
| YouTube account & live setup | Configured Google sign-in, event details, key setup, status, Preview, Go live and End. |
| Microphone / lens / profile | Native lens selection and requested upload bitrate before streaming; microphone toggle remains available while streaming. |
| Pitch guide | Toggles a local framing grid; it is not burned into the broadcast. |
| Pause local monitor | Stops local preview rendering while camera upload continues. |
| Battery screen | Opens a dark view during upload and pauses local monitoring; screen wake lock is used where supported. Keep the phone unlocked. |
| Milestones / end-of-over cards | Optional source-driven graphics over the live camera, each for 60 graphics frames at 30 fps. |
| Batting 2s / Bowling 2s | Queues the chosen supplied scorecard over the continuing live video. |
| Phone-only hosting guide | Opens concise setup steps; the full walkthrough is docs/FREE_HOSTING.md. |

There is no Clips tool, seek bar, footage buffer, ball mark, automatic replay or video download in 1.6. Facebook and Instagram use their own eligible Live Producer key/publication workflows; their account login and publish controls are not implemented inside MK97.
