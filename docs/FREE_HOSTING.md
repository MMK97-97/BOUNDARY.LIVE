# MK97 — every step to host without a laptop

This guide is for **version 1.6, live streaming only**. Replay, clip capture and footage downloads have been removed.

You can host the interface free. The complete streaming system also needs a long-running video server. The free Render route below is a test deployment; full-match 1080p multistreaming there has not been validated. The always-free VM route is conditional on your provider granting suitable free resources. If it cannot, there is no honest guaranteed fully free substitute for the required compute and bandwidth.

## Part 1 — put the updated source on GitHub, from your phone

1. Download `MK97_v1.6.1_Multi_League_Live_Only_Source.zip` and extract it using your phone's Files app.
2. Open your existing repository: `https://github.com/MMK97-97/BOUNDARY.LIVE`.
3. Back up any changes you made since the earlier upload. The new package replaces the app and server together. Old replay files must be removed, not left behind.
4. Upload the extracted **contents inside `MK97`** into the repository root, keeping the folders. Do not upload the ZIP as the app. Use GitHub's web upload where the mobile browser supports it; Request Desktop Site if needed. If your phone cannot select folders, use the file editor to create the directory paths or a browser-based GitHub Codespace to upload/extract the ZIP and review/commit the files. Codespaces has its own quotas: stop it when finished and do not use it as the streaming host.
5. Include `web/`, `relay/`, `scripts/`, `package.json`, `package-lock.json`, `Dockerfile`, `render.yaml`, `.dockerignore`, `deploy/cloud/` and the `.github/workflows/` files. Mobile file pickers may hide dotfiles. For a missing workflow choose **Add file → Create new file** and enter its full path, such as `.github/workflows/pages.yml`, then paste that file's source. The source ZIP includes all these files.
6. Remove the obsolete `relay/lib/replay-ring.mjs` from the repository if it is still present. Replace `relay/lib/program.mjs`, `relay/test/program.test.mjs`, `relay/test/automation.test.mjs`, `relay/test/pipeline.test.mjs` and the other updated files. Do not merge the new live-only UI with the old server.
7. Commit the update to `main`. Never commit a real `.env`, relay token, Google secret, platform key, `node_modules` or camera recording.
8. Open **Actions**. The Pages workflow validates the app and publishes only `web/`. The new **Validate MK97 cloud container** workflow builds and checks the Docker image without broadcasting. The manual CricClubs scraper workflow remains a separate source-data tool.
9. If a workflow is absent, its YAML file is missing from `.github/workflows/` in your remote repository. A ZIP upload alone does not create it. Check **Code → .github → workflows** first.

The package has been prepared locally. No new commit or deployment has been made to your GitHub account by this session.

## Part 2A — free cloud test deployment on Render

Use your phone's browser. A container service hosts both the website and API, so no separate laptop or VPN is involved.

1. Open `https://render.com/` and create/sign in to your own account. Review any account-verification requirements yourself.
2. From the dashboard, create a **Blueprint** from your repository and the included `render.yaml`, if available. Review its proposed resources before confirming. It declares one **Free** Docker web service, not a paid plan.
3. If using the regular Web Service form instead, select the public Git repository URL `https://github.com/MMK97-97/BOUNDARY.LIVE`, branch `main`, Docker runtime and repository-root `Dockerfile`. Select the **Free** instance. Keep the root directory empty. The Dockerfile supplies its startup command.
4. Set the health-check path to `/health`. Keep a single instance.
5. The Blueprint generates `RELAY_TOKEN` automatically. For a manual service, create a random token with at least 32 characters using your password manager and store it in the service's private Environment settings. Do not put it in build arguments, a repository file or a URL.
6. Set `HOST=0.0.0.0`, `PORT=10000`, `SCORE_POLL_SECONDS=5`, `CRICCLUBS_CLUB_ID=300` and `CRICCLUBS_LEAGUE=FWCWL`. The Blueprint already does this. Render provides the public service URL through its environment; MK97 trusts that exact origin automatically.
7. Keep unused platform-key environment fields empty. You can enter encoder keys in MK97 after connection. For Google sign-in, add the three OAuth values described in [CLOUD_SETUP.md](CLOUD_SETUP.md); otherwise use a manual YouTube RTMPS key initially.
8. Deploy. Wait for the Docker build and service startup to finish. Build output should show dependency and FFmpeg installation; runtime logs should say **Encoder: ready**. No secret needs to be logged.
9. Copy the actual HTTPS service address from your dashboard. Do not copy an example hostname. Open that address on the phone, then append `/health` once to check it returns `ok: true` and `MK97 relay`. Return to the address without `/health`.
10. In MK97 tap **Set up stream**. Its cloud address should already be filled in. Copy `RELAY_TOKEN` privately from your hosting environment into the Studio access token field. Tap **Connect securely**.
11. Under Destinations, add a current YouTube RTMPS server and stream key, or connect a configured Google account. Save securely; the destination becomes selected. Never use the public QA placeholders from test reports.
12. Load a match. Open the rear camera. For a first capacity test, choose **480p or 720p**, YouTube only, and turn off optional milestone/card graphics. Use an unlisted/private platform test event. Inspect actual platform playback and audio before trying native 1080p.
13. If stable, try 1080p and check CPU/RAM, bitrate, dropped frames and preview. If the service runs out of resources, restart/disconnects, or cannot keep up, that free plan is unsuitable. Lowering resolution can help; it is not 1080p. Do not assume three-platform output will fit because the website opens.
14. Automatic redeployment is disabled in the template so a Git commit does not unexpectedly end a live match. Deploy updates manually between matches and reconnect; in-memory sessions/keys reset on restart.
15. End the platform event and STOP the camera upload when done. Shut down/delete unused test resources through the provider dashboard.

**Free-tier conditions checked October 30, 2026:** Render describes Free instances as preview/testing resources. Its free web services can sleep after idle time, restart, hit monthly runtime/build/bandwidth limits, or be suspended for unusually high outbound traffic. Added billing methods can permit usage charges; without one, limit exhaustion can suspend service. Review current limits and billing settings before use. These conditions make it unsuitable to promise uninterrupted free cricket broadcasts. Source: [Render Free documentation](https://render.com/docs/free). No artificial keep-alive or quota-evasion script is included.

## Part 2B — conditional free VM route for more encoding capacity

A provider's eligible always-free VM may offer more compute than a free application container. Oracle Cloud's Always Free program is one candidate to investigate, **not a verified allocation or account approval**. Its public free-tier pages returned “Site Unavailable” during this session, so current shape/region quotas could not be independently revalidated. Use the live console's **Always Free eligible** labels and zero recurring estimate as the authority. Do not select paid resources or upgrade the account just to follow this guide.

The deployment below is generic Ubuntu + Docker. It also works on an already-owned suitable free VM. Target at least **two available CPU cores and 2 GB RAM** for initial tests; that is a starting budget, not a 1080p performance guarantee. Three outputs, especially Instagram portrait conversion, may need more. The operator is responsible for data/egress, storage and public-IP quotas.

### Create the server using the provider dashboard

1. Create/sign in to your own cloud account. Providers may require identity/payment verification even for free resources. Do this directly with them.
2. Select your account's free-eligible region. Open **Compute → Instances → Create instance** (names may differ).
3. Name it `mk97-cloud-studio`. Choose **Ubuntu 24.04 LTS** for this example and a VM shape explicitly marked free eligible. An Arm VM needs an Arm image; the supplied Docker image/dependencies support Linux Arm64 as well as AMD64.
4. Choose CPU/RAM inside your actual free quota. Check every disk, IP, networking and backup selection and the recurring-cost estimate. If any resource is paid, stop and change it or do not create the server. An out-of-capacity message is not permission to choose a paid shape.
5. Create/select a public network and subnet with an internet gateway, a route to it and an assigned public IP. Avoid optional paid load balancers, NAT gateways, managed databases and extra disks; the app does not need them.
6. Create/save an SSH key as instructed by the provider. Keep its private part in your private files. The app does not require you to upload that key to GitHub or ChatGPT.
7. In the provider's network security rules allow **TCP 80 and TCP 443** to the VM for HTTPS. Allow SSH TCP 22 only from the administration source you use. Leave the app's internal port 8787 closed to the public internet. UDP 443 is optional for HTTP/3, not required for streaming.
8. Create the VM only when the console confirms the selected resources are free eligible. Wait for Running. Record its actual public IP.
9. Open the provider's browser Cloud Shell or SSH console on the phone. Connect to the VM's SSH address using your key. For the Ubuntu image, the username is normally `ubuntu`; use the provider's actual image instructions. You are now running commands on the VM, not on the phone or a laptop.

### Give it a free DNS name

10. Open `https://www.duckdns.org/` in a separate phone tab and sign in using an offered method. Create an available subdomain of your choice.
11. Set that hostname's IPv4 value to the VM's actual public IP and save/update it. A reserved/static IP is useful only if free under your account; otherwise update DNS whenever the VM IP changes. Do not put the DuckDNS update token in the app or GitHub.
12. Record the full name, for example **your chosen name** plus `.duckdns.org`. The example below uses a placeholder; replace it with the real hostname. DNS must resolve to your VM before HTTPS certificates can be issued.

### Install and start MK97 on the server

13. In the VM's browser shell run:

```sh
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
```

These package names are for Ubuntu 24.04. If your image does not provide Compose v2, use Docker's official Ubuntu installation instructions linked below. Do not use an unknown installation script. No desktop Docker installation is needed.

14. Clone the public source after uploading the **new live-only version**:

```sh
git clone https://github.com/MMK97-97/BOUNDARY.LIVE.git mk97
cd mk97
```

15. Create a private configuration with your real DNS hostname. This runs Node inside the official container, generates the relay token on the VM and does not print it:

```sh
sudo docker run --rm --volume "$PWD:/work" --workdir /work node:22-bookworm-slim node scripts/cloud-env.mjs YOUR-REAL-NAME.duckdns.org
```

16. Confirm the file exists and is private:

```sh
sudo ls -l deploy/cloud/.env
```

It should not be readable by other users. The generator refuses to overwrite an existing configuration. To inspect/edit it yourself, use the VM editor with `sudo nano deploy/cloud/.env`. Keep the generated relay token; optional Google values can be added later. Never paste the file into a GitHub issue or chat.

17. Build and start the two containers:

```sh
cd deploy/cloud
sudo docker compose up -d --build
sudo docker compose ps
```

The `mk97` container contains Node + FFmpeg. Caddy provides automatic HTTPS and forwards WebSocket/SSE connections. Only Caddy publishes ports 80/443. The Compose deployment keeps the app filesystem read-only, stores small temporary files in bounded RAM and limits process resources. It does not record camera footage.

18. Check startup logs:

```sh
sudo docker compose logs --tail=50 mk97
sudo docker compose logs --tail=50 https
```

Expect **Encoder: ready** and successful HTTPS certificate provisioning. If HTTPS fails, check DNS, public port rules and any host firewall. Keep the provider's existing administration access intact. Do not bypass a certificate warning on the phone.

19. Open `https://YOUR-REAL-NAME.duckdns.org/health` on the phone and confirm `ok: true`. Then open the same HTTPS address without `/health`.
20. Tap **Set up stream**, privately copy the generated `RELAY_TOKEN` from your server's `.env` and connect. Follow the match-day steps in [CLOUD_SETUP.md](CLOUD_SETUP.md).
21. Rehearse with an unlisted/private YouTube broadcast. Check actual capture resolution, sound, score freshness, server CPU/RAM and provider egress usage. Add Facebook/Instagram only after measuring headroom. A VM having enough memory does not prove real-time encoder performance.

### Update or stop without a laptop

22. End the platform event and camera upload first. In the VM's browser shell:

```sh
cd ~/mk97
git pull --ff-only
cd deploy/cloud
sudo docker compose up -d --build
```

If Git reports local changes/conflicts, review them; do not overwrite them blindly. Reconnect MK97 after restart.

23. To stop services:

```sh
sudo docker compose down
```

The existing private `.env` and Caddy certificate volume remain on the server. Delete provider resources through its dashboard if you no longer need them, after reviewing any data you want to retain. Free VMs may be reclaimed or unavailable; keep a source backup and a plan for interruptions.

## Part 3 — optional free GitHub Pages address

The cloud service already serves MK97; Pages is optional.

1. In GitHub open **Settings → Pages → Build and deployment → Source → GitHub Actions**.
2. Run **Actions → Deploy MK97 Cricket Studio → Run workflow** on `main`.
3. Wait for validation and deployment. Open the actual Pages URL GitHub displays.
4. In the cloud service's private environment add `ALLOWED_ORIGINS=https://mmk97-97.github.io` for this user's existing Pages origin. Use the exact origin of your own site if different, with no `/BOUNDARY.LIVE` path or trailing slash. Restart between broadcasts.
5. In the Pages version of MK97 enter your cloud service's HTTPS origin and private token. The UI then uses that hosted service. Pages does not scrape server-side or encode video itself.
6. If signing in to YouTube from Pages instead of the cloud address, register and configure that exact Pages `youtube-callback.html` path in Google and the service. Origin-bound sessions intentionally cannot be moved between origins.

## Platform limits that hosting cannot remove

YouTube needs live access and either a configured Google OAuth client or a current encoder key. Facebook/Instagram need their own eligible Live Producer accounts and RTMPS keys. Facebook/Instagram login and one-app publication are not implemented. Their control rooms may require another tab/desktop-style interface. Do this before starting the camera; mobile browsers may suspend a live camera when switching apps/tabs. If your Instagram account requires an external control room during transmission, this website cannot promise the entire Instagram workflow on one phone.

1080p capture still requires a supporting phone. Digital zoom and platform recompression remain lossy. Full CricClubs scorecards/commentary depend on readable source data; a free host does not bypass verification or create missing rows.

## Official references

- [Render free limits](https://render.com/docs/free)
- [Render Blueprint fields](https://render.com/docs/blueprint-spec)
- [Oracle Always Free resource documentation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) — unavailable to retrieve during this session; verify current allocations in the provider console
- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [DuckDNS update specification](https://www.duckdns.org/spec.jsp)
- [YouTube encoder settings](https://support.google.com/youtube/answer/2853702)
