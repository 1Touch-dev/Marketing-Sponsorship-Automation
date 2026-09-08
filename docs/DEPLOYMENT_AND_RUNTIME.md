# Market Sponsorship Automation Platform — Deployment and Runtime Guide

**Document Classification:** Internal — Operations  
**Version:** 1.0  
**Date:** 13 May 2026  
**Status:** Production-grade EC2 deployment verified

---

## 1. Overview

This document describes how the Phase 1 MVP is deployed and kept running on an AWS EC2 Ubuntu instance. All application services are managed by **systemd** and are configured to start automatically on boot and restart automatically on failure. No running SSH session, terminal, tmux/screen session, or Cursor IDE instance is required for the application to remain operational.

**Verified behaviour (tested 13 May 2026):**

| Event | App survives? |
|---|---|
| Cursor IDE closed | Yes |
| SSH session disconnected | Yes |
| Laptop shut down | Yes |
| EC2 instance rebooted | Yes — all services auto-start within ~30 s |

---

## 2. Infrastructure Summary

| Component | Runtime | Port | Managed by |
|---|---|---|---|
| Next.js 14 app | Node 20 / npm | 3000 | systemd `nextjs.service` |
| ngrok HTTPS tunnel | ngrok binary | 4040 (local API) | systemd `ngrok.service` |
| n8n workflow engine | Docker container | 5678 | systemd `n8n.service` + Docker `--restart=always` |
| Docker daemon | system | — | systemd `docker.service` (upstream) |

**EC2 type:** Ubuntu (AWS)  
**Application root:** `/home/ubuntu/Market_Sponsorship_Automation`  
**Frontend root:** `/home/ubuntu/Market_Sponsorship_Automation/frontend`

---

## 3. Systemd Service Files

All service unit files live in `/etc/systemd/system/`.

### 3.1 `nextjs.service`

```ini
[Unit]
Description=Next.js Market Sponsorship Automation
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=10

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/Market_Sponsorship_Automation/frontend
EnvironmentFile=/home/ubuntu/Market_Sponsorship_Automation/frontend/.env.local
Environment=NODE_ENV=
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nextjs

[Install]
WantedBy=multi-user.target
```

Key points:
- `EnvironmentFile` loads all secrets from `.env.local` at service start.
- `Environment=NODE_ENV=` prevents a stale shell value from being inherited.
- `Restart=always` — restarts on crash, OOM kill, or any other exit.
- `RestartSec=5` — waits 5 seconds between restart attempts.
- `StartLimitBurst=10` — prevents infinite restart loops (caps at 10 attempts per 60 s).

### 3.2 `ngrok.service`

```ini
[Unit]
Description=ngrok tunnel — Next.js app (port 3000)
After=network-online.target nextjs.service
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=ubuntu
ExecStartPre=/bin/bash -c "pkill -x ngrok || true; sleep 1"
ExecStart=/usr/local/bin/ngrok http 3000
Restart=always
RestartSec=30
KillMode=process
TimeoutStopSec=15
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ngrok

[Install]
WantedBy=multi-user.target
```

Key points:
- `After=nextjs.service` — tunnel starts only after the Next.js app is ready.
- `ExecStartPre` kills any orphaned ngrok process before starting, preventing the `ERR_NGROK_334 "endpoint already online"` error.
- `RestartSec=30` — the 30-second gap gives ngrok's cloud infrastructure time to release the previous endpoint before re-registering it.
- The ngrok authtoken is stored in `/home/ubuntu/.config/ngrok/ngrok.yml` and persists across reboots.

### 3.3 `n8n.service`

```ini
[Unit]
Description=n8n workflow automation (Docker container)
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=ubuntu
ExecStart=/bin/bash -c "if sudo docker inspect n8n > /dev/null 2>&1; then sudo docker start n8n || true; else sudo docker run -d --name n8n --restart always -p 5678:5678 -e WEBHOOK_URL=https://eligibly-facing-unloved.ngrok-free.dev -e N8N_EDITOR_BASE_URL=https://eligibly-facing-unloved.ngrok-free.dev -e N8N_SECURE_COOKIE=false -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n; fi"
ExecStop=/bin/bash -c "sudo docker stop n8n || true"
StandardOutput=journal
StandardError=journal
SyslogIdentifier=n8n

[Install]
WantedBy=multi-user.target
```

Key points:
- `Type=oneshot` with `RemainAfterExit=yes` — runs once at boot to ensure the container is started, then reports as active.
- The Docker container itself uses `--restart=always`, meaning Docker's own daemon re-starts the container if it crashes, without needing systemd to intervene.
- n8n workflow data is persisted in the Docker volume `n8n_data` and survives container restarts and reboots.

---

## 4. How Auto-Restart and Reboot Recovery Work

### On crash / unexpected exit

```
Process crashes
       ↓
systemd detects exit (Restart=always)
       ↓
systemd waits RestartSec seconds
       ↓
systemd re-launches ExecStart
       ↓
App is serving requests again
```

### On EC2 reboot

```
EC2 reboots
       ↓
Linux kernel + init bring up systemd
       ↓
docker.service starts  (WantedBy=multi-user.target, enabled)
       ↓
nextjs.service starts  (After=network.target, enabled)
       ↓
n8n.service starts     (After=docker.service, enabled) → docker start n8n
ngrok.service starts   (After=nextjs.service, enabled) → ngrok http 3000
       ↓
All four services active; app accessible on public URL (~30 s from boot)
```

**Reboot test result (13 May 2026):**  
All services were active within 60 seconds of the EC2 instance starting. The ngrok URL was unchanged. All APIs passed post-reboot validation.

---

## 5. Environment Variables

All application configuration is stored in:

```
/home/ubuntu/Market_Sponsorship_Automation/frontend/.env.local
```

This file is loaded by `nextjs.service` via `EnvironmentFile=`. It must exist before the service starts.

**File permissions:**
```
-rw-rw-r-- ubuntu ubuntu  .env.local
```

The file is readable by the `ubuntu` user that runs the service. It is **not** committed to Git (included in `.gitignore`).

### Required environment variables

| Variable | Purpose |
|---|---|
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | Public base URL (ngrok URL in testing) |
| `GOOGLE_REDIRECT_URI` | Gmail OAuth callback URI (must match Google Cloud Console) |
| `DEFAULT_FROM_EMAIL` | Gmail sender address |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS credentials for Bedrock |
| `AWS_REGION` | AWS region (e.g. `us-east-1`) |
| `BEDROCK_MODEL_ID` | Claude model ID for Bedrock |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth app credentials |

### Updating environment variables safely

1. Edit `.env.local`:
   ```bash
   nano /home/ubuntu/Market_Sponsorship_Automation/frontend/.env.local
   ```
2. If the variable is a `NEXT_PUBLIC_*` variable (inlined at build time), a full rebuild is required:
   ```bash
   cd /home/ubuntu/Market_Sponsorship_Automation/frontend
   npm run build
   ```
3. Restart the service to load the new values:
   ```bash
   sudo systemctl restart nextjs
   ```
4. For server-only variables (no `NEXT_PUBLIC_` prefix), only step 3 is needed.

---

## 6. Manual Service Management

### Check status

```bash
sudo systemctl status nextjs
sudo systemctl status ngrok
sudo systemctl status n8n
sudo systemctl status docker
```

### Start / stop / restart

```bash
sudo systemctl start  nextjs
sudo systemctl stop   nextjs
sudo systemctl restart nextjs

sudo systemctl start  ngrok
sudo systemctl stop   ngrok
sudo systemctl restart ngrok

sudo systemctl start  n8n
sudo systemctl stop   n8n
```

### Enable / disable auto-start on boot

```bash
sudo systemctl enable  nextjs ngrok n8n   # enable (already set)
sudo systemctl disable nextjs             # disable (not recommended)
```

### Reload service file changes (after editing a .service file)

```bash
sudo systemctl daemon-reload
sudo systemctl restart <service>
```

---

## 7. Viewing Logs

### Live log tailing

```bash
journalctl -u nextjs -f
journalctl -u ngrok  -f
journalctl -u n8n    -f
```

### Last N lines

```bash
journalctl -u nextjs -n 100 --no-pager
journalctl -u ngrok  -n 50  --no-pager
```

### Logs since last boot

```bash
journalctl -u nextjs -b --no-pager
```

### n8n logs (Docker)

```bash
sudo docker logs n8n --tail 100
sudo docker logs n8n -f
```

---

## 8. Rebuilding and Redeploying

### Pull latest code

```bash
cd /home/ubuntu/Market_Sponsorship_Automation
git pull origin main
```

### Full rebuild

```bash
cd /home/ubuntu/Market_Sponsorship_Automation/frontend
npm install          # only if package.json changed
npm run build        # always required before restarting in production
```

### Apply and restart

```bash
sudo systemctl restart nextjs
```

### Verify

```bash
sudo systemctl status nextjs --no-pager
curl -s https://eligibly-facing-unloved.ngrok-free.dev/api/health
```

---

## 9. Applying Database Migrations

Database migrations cannot be applied directly from the EC2 server due to Supabase's network configuration. Apply them through the Supabase Dashboard:

1. Open the [Supabase Dashboard → SQL Editor](https://supabase.com/dashboard/project/lmjwjztokzombtstmume/sql/new).
2. Retrieve the SQL from:
   ```
   https://eligibly-facing-unloved.ngrok-free.dev/api/internal/apply-migration
   ```
3. Paste the SQL into the editor and click **Run**.
4. Refresh the Settings page — migration badges will update automatically.

Migration files are stored in:
```
/home/ubuntu/Market_Sponsorship_Automation/supabase/migrations/
```

---

## 10. ngrok Tunnel Behaviour

### Current setup

- **Reserved domain:** `eligibly-facing-unloved.ngrok-free.dev`
- **Authenticated:** Yes — authtoken stored in `/home/ubuntu/.config/ngrok/ngrok.yml`
- **Auto-restarts:** Yes — `ngrok.service` with `Restart=always`
- **Persists on reboot:** Yes — confirmed in reboot test (13 May 2026)

### Does the URL change on reboot?

**With a reserved ngrok domain (free or paid plan): No.** The domain `eligibly-facing-unloved.ngrok-free.dev` is reserved to this ngrok account and will be re-claimed automatically each time the agent starts. The URL does not change on reboot.

**Without a reserved domain (random URLs):** The URL would change on every ngrok restart. This is not the case here.

### What happens if ngrok's cloud releases the endpoint between restarts?

The `ExecStartPre` command in `ngrok.service` kills any stale local ngrok process before launching a fresh one. The 30-second `RestartSec` gives ngrok's cloud infrastructure enough time to release the previous endpoint registration before the new agent claims it.

### Limitations of ngrok free tier

| Limitation | Impact |
|---|---|
| Bandwidth limits | Suitable for internal testing; not for high-traffic production use |
| No custom domain (free tier) | The URL is a subdomain of `ngrok-free.dev` |
| Single concurrent tunnel per agent | One tunnel per authtoken on free tier |
| Potential latency | All traffic is proxied through ngrok's servers |

### Production recommendation

For a production deployment, replace ngrok with one of:

1. **Elastic IP + reverse proxy (nginx/Caddy)** — static IP, custom domain, no tunnel required.
2. **AWS Application Load Balancer + ACM** — managed SSL, auto-scaling ready.
3. **ngrok paid plan with a custom domain** — easiest migration path from the current setup.

---

## 11. Gmail OAuth Token Persistence

Gmail OAuth tokens are stored in the Supabase database under `public.users.metadata.gmail_tokens` for the row with `email = DEFAULT_FROM_EMAIL`.

**Tokens persist across:**
- EC2 reboots (stored in Supabase, not on disk)
- Next.js service restarts
- ngrok tunnel restarts

**Token expiry:** Access tokens expire. The system uses the `refresh_token` to obtain a new access token automatically on the next Gmail API call. The refresh token does not expire unless the Google OAuth app's consent is revoked.

**If Gmail stops working after a long period of inactivity:**
1. Navigate to `/settings`.
2. Click **Reconnect Gmail**.
3. Select the Gmail account and approve permissions.

---

## 12. Disaster Recovery Procedures

### All services down after reboot

```bash
# SSH into EC2
ssh ubuntu@<ec2-public-ip>

# Check what failed
sudo systemctl status nextjs ngrok n8n

# Check logs
journalctl -u nextjs -n 50 --no-pager

# Restart everything
sudo systemctl start nextjs
sudo systemctl start ngrok
sudo systemctl start n8n

# Verify
curl -s https://eligibly-facing-unloved.ngrok-free.dev/api/health
```

### Next.js won't start (build issue)

```bash
cd /home/ubuntu/Market_Sponsorship_Automation/frontend
npm run build
sudo systemctl restart nextjs
journalctl -u nextjs -n 30 --no-pager
```

### ngrok tunnel stuck in restart loop (ERR_NGROK_334)

```bash
# Kill all ngrok processes
pkill -x ngrok
sleep 35   # wait for cloud to release endpoint
sudo systemctl start ngrok
```

### n8n container missing

```bash
# The n8n service will recreate it automatically, but if manual:
sudo docker run -d \
  --name n8n \
  --restart always \
  -p 5678:5678 \
  -e WEBHOOK_URL=https://eligibly-facing-unloved.ngrok-free.dev \
  -e N8N_EDITOR_BASE_URL=https://eligibly-facing-unloved.ngrok-free.dev \
  -e N8N_SECURE_COOKIE=false \
  -v n8n_data:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
```

### .env.local accidentally deleted

```bash
# Restore from a secure backup (the file is not in Git).
# Then rebuild and restart:
cd /home/ubuntu/Market_Sponsorship_Automation/frontend
npm run build
sudo systemctl restart nextjs
```

---

## 13. Health Check Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Supabase + Bedrock connectivity |
| `/api/gmail/status` | GET | Gmail connection state (no tokens exposed) |
| `/api/internal/migration-status` | GET | Live database migration status |
| n8n: `http://localhost:5678/healthz` | GET | n8n internal health |

### Example health check

```bash
curl -s https://eligibly-facing-unloved.ngrok-free.dev/api/health | python3 -m json.tool
```

Expected response when healthy:

```json
{
    "status": "ok",
    "checks": {
        "supabase": { "ok": true, "latency_ms": 150 },
        "bedrock":  { "ok": true, "latency_ms": 1200 }
    }
}
```

---

## 14. Security Notes

- `.env.local` contains secrets and is excluded from Git via `.gitignore`. Never commit it.
- The Supabase service role key is used only in server-side API routes and is never exposed to the browser.
- The ngrok authtoken is stored in `/home/ubuntu/.config/ngrok/ngrok.yml` (readable only by the `ubuntu` user).
- All Gmail OAuth tokens are stored in Supabase, not on disk.
- API rate limiting is enforced on all generation, approval, and Gmail routes.
- No raw stack traces are returned from any API route.

---

## 15. Reboot Validation Results (13 May 2026)

| Check | Result |
|---|---|
| All services auto-started | PASS |
| nextjs serving on :3000 | PASS |
| ngrok tunnel on same URL | PASS (`eligibly-facing-unloved.ngrok-free.dev`) |
| n8n container running | PASS |
| `/api/health` | PASS (Supabase + Bedrock both `ok`) |
| `/api/gmail/status` | PASS (connected: true, adminkyma549@gmail.com) |
| Bedrock generation (proposal) | PASS (prompt_version: v1.1.0 saved) |
| Workflow events | PASS (13 events returned) |
| Settings page badges | PASS (Connected + Applied) |
| Process parent PIDs | PASS (both nextjs and ngrok parented to PID 1 / systemd) |
| Session independence | PASS (processes survive SSH disconnect and Cursor shutdown) |

---

## 16. Quick Reference Card

```bash
# Check all services
sudo systemctl status nextjs ngrok n8n docker

# Restart app after code change
cd /home/ubuntu/Market_Sponsorship_Automation/frontend && npm run build
sudo systemctl restart nextjs

# Restart tunnel
sudo systemctl restart ngrok

# View live app logs
journalctl -u nextjs -f

# Health check
curl -s https://eligibly-facing-unloved.ngrok-free.dev/api/health

# Gmail status
curl -s https://eligibly-facing-unloved.ngrok-free.dev/api/gmail/status

# Pull latest code and redeploy
cd /home/ubuntu/Market_Sponsorship_Automation
git pull origin main
cd frontend && npm install && npm run build
sudo systemctl restart nextjs
```

---

## 14. Backups (Pattern 7 hardening)

**Why this exists**: master_report.md Section 8, Pattern 7, cites Code Spaces —
a company killed overnight because one compromised credential had access to
both production infrastructure *and* its backups, so the attacker deleted
both. As of this writing, this project has no database backup mechanism
independent of the production Supabase service-role credential — the exact
gap that pattern describes.

**What's built** (`frontend/lib/backup/export-snapshot.ts`,
`frontend/scripts/run-backup.ts`): a full logical export of every
application table via the Supabase REST API, gzipped, and uploaded to S3
under a **separate** AWS credential from the one used for Bedrock/production
(`BACKUP_AWS_*` env vars, distinct from `AWS_ACCESS_KEY_ID`). Until those
vars are set, the script writes the snapshot to `frontend/.local-backups/`
instead (gitignored) and prints a loud warning — a same-box, same-credential
copy is not an isolated backup and should not be relied on for real
disaster recovery.

**One-time setup required from a human with AWS console access** (this
cannot be done from this dev box — no AWS CLI/console access here):

1. Create a new S3 bucket in a separate AWS account if possible (or at
   minimum a bucket the production IAM user has zero permissions on).
   Enable **Versioning** and **Object Lock** at creation time (Object Lock
   cannot be enabled after the fact).
2. Create a new, dedicated IAM user (not the one behind `AWS_ACCESS_KEY_ID`)
   with a policy that allows **only** `s3:PutObject` on that one bucket —
   no `s3:DeleteObject`, no access to any other resource. This is what
   makes it access-isolated: even a fully compromised production credential
   cannot read, modify, or delete what's already backed up.
3. Generate an access key for that user and set `BACKUP_AWS_ACCESS_KEY_ID`,
   `BACKUP_AWS_SECRET_ACCESS_KEY`, `BACKUP_AWS_REGION`, `BACKUP_S3_BUCKET`
   in `.env` / `.env.local`. Set `BACKUP_S3_OBJECT_LOCK_DAYS` (e.g. `90`)
   to have each upload locked in COMPLIANCE mode for that many days — not
   even the bucket owner can delete it early.
4. Schedule `npx tsx scripts/run-backup.ts` to run daily — either a system
   cron job on this box, or an n8n Schedule trigger that shells out to it
   (n8n is already the orchestration layer for this project). It is
   intentionally a standalone script, not a Next.js API route, since a
   full export can run longer than a request/response cycle should.
5. Quarterly: actually restore a snapshot into a scratch Supabase project
   and verify the data is usable — an untested backup is not a backup.

**Separately, unresolved**: Supabase's own automated/point-in-time-recovery
backups are a dashboard- and billing-plan-gated setting, not something
controllable from this codebase or this box. Whether PITR is currently
enabled on the project, and at what retention, needs to be confirmed
directly in the Supabase dashboard by whoever holds that account.

---

*End of document.*
