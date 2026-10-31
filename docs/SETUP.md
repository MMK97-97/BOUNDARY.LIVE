# MK97 1.7 setup

Use **[FREE_HOSTING.md](FREE_HOSTING.md)** for every GitHub upload, free cloud test deployment, conditional free VM and HTTPS step. Use **[CLOUD_SETUP.md](CLOUD_SETUP.md)** to run match day from one phone.

1. Upload the complete new source to your existing GitHub repository; include hidden workflow files and remove obsolete replay files.
2. Deploy the Docker web service to your eligible host. GitHub Pages alone cannot run the live encoder.
3. Keep `RELAY_TOKEN` in the host's private environment. Set its actual `PUBLIC_URL`, or use Render's supplied external URL.
4. Follow [SAVED_STUDIO.md](SAVED_STUDIO.md) once to add the database/encryption key and remember your first device. Open the hosted HTTPS app; linked devices reconnect automatically.
5. Connect a configured Google/YouTube account or save platform RTMPS keys directly inside MK97. Select the destinations.
6. Load the CricClubs Match ID and Club ID. Full source tables/commentary depend on source access.
7. Open the rear camera, select a supported native resolution and check the four setup indicators.
8. START sends camera video. Preview/publish through the connected YouTube controls or the platform's own control room.
9. Keep the app visible and phone unlocked. Use the live microphone toggle, Fit/Fill, native zoom and monitor/battery controls.
10. End platform events, STOP the upload and close the camera when finished.

There is no replay buffer or clip/export feature in this version. Optional live score graphics remain. No laptop, Tailscale or desktop media tools are required at the ground. Cloud capacity, free-plan eligibility, egress and actual platform access must be checked before a match.
