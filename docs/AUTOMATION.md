# Live score graphics

The camera remains live. MK97 1.6 has no replay buffer, video history, clip capture or footage export.

The two optional settings in Stream setup control graphics only:

- Team milestones at 50 / 100 / 150 / 200 / 250 / 300 / 350 runs.
- Player milestones at 50 / 100 / 150 / 200 runs.
- On an observed completed over, batting for 60 frames followed by bowling for 60 frames.

Each graphic occupies 60 frames in the 30 fps graphics input. The encoded-media regression test checks actual two-second graphic coverage. The live camera/audio feed goes directly through one FFmpeg encoder alongside transparent graphics, without the old JPEG/PCM footage history stage.

Loading a score establishes a baseline. Completed-match history does not trigger celebrations. Innings identity resets the detector; stale values, score corrections and already-seen milestones do not repeat old events. Polling may miss delivery detail, and upstream/scorer delay still determines when a milestone arrives. Source player IDs and known run values are required for player milestone comparisons.

The parser and UI do not invent complete cards from current batters/bowler. An incomplete source card remains labelled as supplied/observed data. Exact full innings cards depend on provider access. Disable the two settings if you only want the ordinary live scorebar. The manual batting/bowling buttons remain available while a broadcast is active.
