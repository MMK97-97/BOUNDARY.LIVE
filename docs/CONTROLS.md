# Streaming screen controls

The landscape layout follows your supplied reference. The camera view is the operator monitor. The outgoing program is composed on the laptop; check a platform preview to see its exact replay/video timing.

| Control | Action |
| --- | --- |
| Back arrow / Settings / Set up stream | Opens stream setup without leaving or stopping the broadcast. |
| STANDBY / SENDING | Reports camera-upload state. SENDING does not certify that a platform has published the broadcast. |
| Eye / viewer count | Opens Stats. Stream keys do not expose viewer analytics, so the count is shown as unavailable. |
| Auto / 1080p / 720p / 480p | Chooses actual native capture size before streaming. Auto tries 1080p, then 720p, then 480p on an unsupported-size error. An open camera is reopened at the selected size. Locked during upload. |
| Cast | Opens the browser's native Cast/AirPlay picker if supported. Otherwise opens instructions to cast the public platform player. Local camera streams cannot be cast on every browser. |
| Fullscreen, top or bottom | Enters/exits fullscreen, requesting landscape where supported. Falls back to a browser-filling theater view if fullscreen is unavailable. It cannot override OS restrictions. |
| Score | Loads the selected CricClubs match, toggles the on-air scorebar, offers Batting/Bowling/Commentary tabs and manual two-second cards. Missing commentary/fields are labelled. |
| Stats | Shows health plus Overview/Partnership/Runs/Wickets tabs using source values. It does not estimate missing player statistics. |
| Clips | Saves/marks a ball, filters All/4s/6s/Wickets, previews a private thumbnail/clip, puts it on air, or downloads an MP4. Wicket clips stay private until you choose On air. |
| Share | Copies or shares the public YouTube/Facebook/Instagram viewing URL you provide. It never constructs a sharing URL containing relay credentials. |
| Zoom + / − / vertical slider / two-finger pinch | Applies the camera's native zoom constraint when available. The buttons respect the device step; pinch works in the camera view. These are disabled when the browser exposes no zoom capability. |
| Fit / Fill | Fits or fills the local camera monitor. This framing choice does not crop the outgoing capture. Use native zoom for the broadcast. |
| Bottom pause/play | Pauses/resumes the local video monitor to save screen work. Camera capture, microphone and broadcast continue. |
| START | Begins one camera upload to the authenticated relay after preflight passes. Select destinations in Settings first. |
| Stop stream | Opens a stop confirmation. Yes, stop streaming finishes camera upload; Keep streaming cancels. End each platform broadcast in its control room too. |
| Replay timeline | Selects buffered footage for a private clip preview on release. Oldest selections can be shorter than eight seconds. It does not interrupt the outgoing live camera. |
| Bottom LIVE | Returns the local monitor from a clip to the camera. It does not cancel an on-air replay. |
| Elapsed timer | Counts the current upload session. |
| Speaker / volume slider | Toggles/adjusts audio during a private clip preview. The live camera monitor stays muted to prevent feedback; this never mutes outgoing microphone audio. |
| Message × | Dismisses the current message. |

## Settings panel

| Control | Action |
| --- | --- |
| Connect securely | Exchanges the local relay token for an origin-bound in-memory session. The input is cleared afterward. |
| Disconnect | Revokes that session when upload is inactive. |
| Camera / optical lens | Reopens capture using the browser-exposed camera. Lens and quality changes are locked during a stream. |
| Encoding profile | Chooses the requested phone upload bitrate. Balanced is 8 Mbps at 1080p; More detail is 14 Mbps. Lower native sizes reduce the request. |
| Mic on / muted | Enables/disables the actual captured audio track, including on air. Silent audio remains in the container for stable processing. |
| Pitch guide | Toggles a local framing grid. The grid is not burned into the video. |
| Close camera | Stops camera/microphone tracks when not streaming. |
| Zoom presets | Uses the native camera zoom value, within hardware limits. Disabled for unsupported values/devices. |
| Battery screen / Return to camera | Shows a dark timer/score screen and pauses the local monitor while upload continues, then restores it. Keep the phone unlocked and page visible. |
| Automation switches | Enable automatic boundary replays, milestone graphics and end-of-over cards for the next stream. |
| Scoring delay | Seconds between a ball and its arriving score update, calibrated before starting. See AUTOMATION.md. |
| Mark ball | Marks the relay's current capture position. The next observed delivery consumes the mark; if it is a confirmed boundary, it anchors the replay. Requires the program processor. |
| Platform checkboxes | Select configured destinations; manual keys stay in local relay/.env and generated YouTube keys stay in relay memory. |
| YouTube account & live setup | Opens Google sign-in and the title/description/privacy/schedule/audience form. See YOUTUBE.md for one-time configuration and every event control. |
| Free setup guide / Close guide | Expands/collapses the short guide. Read SETUP.md for complete instructions. |
| Panel back arrow / × / outside panel / Escape | Returns to the streaming screen and restores focus. Portrait panels fill the phone width. Keyboard focus stays within the panel; tab rows also support arrow/Home/End keys. |

## Score and replay panels

The Club 300 disclosure edits the club namespace for another league. Load accepts a numeric Match ID or a complete HTTPS CricClubs scorecard URL. Change matches before starting. The scorebar indicates delayed/complete status and displays the selected match's real values.

Batting · 2s and Bowling · 2s queue a card on the outgoing program. Clips → Preview downloads a private MP4 into browser memory and plays it locally; returning to LIVE revokes the temporary media URL. Clips → On air switches source frames and original audio inside one continuous encoder. A REPLAY graphic identifies that footage. Download saves an explicit MP4 to your device. Up to three clips remain available; older ones expire under the memory limit or when the stream stops.

Buttons are disabled until their camera, authenticated session, active program or replay-buffer dependency is available. Native camera zoom, receiver casting, sharing, wake lock and fullscreen are subject to browser/device support; no fake software capability is substituted.

## MK97 home and source panels

| Control | Behavior |
| --- | --- |
| Fetch match / FWCWL example | Validates Match ID and Club ID or a full CricClubs URL, fetches source values and starts one visible-page polling stream. Works before relay connection where direct feed access permits. |
| Open broadcast studio | Opens camera controls without declaring a stream live. |
| Connect laptop relay / relay settings | Opens authenticated relay setup. |
| YouTube account setup | Opens real Google authorization and event controls after relay configuration. |
| Home arrow | Returns to MK97 home while idle; remains in the camera studio during active upload. |
| Innings selector | Separates source records for each supplied innings; missing cards stay marked not supplied. |
| Commentary tab | Shows only source text; it does not translate scores into invented ball commentary. |
| Clip filters | Filters actual private buffered clips by 4s, 6s or wickets. Empty filters stay empty. |

The MK97 logo is the supplied image. The broadcast watermark is independent of the score graphic; the score overlay toggle controls score display.
