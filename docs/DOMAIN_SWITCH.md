# Moving the platform from the ngrok address to the club's own domain

Written 2 Nov 2026 for the person doing the switch (Abhishek, Rushendra). The production server is the instance `i-0222de7b6acefd4bd`, Elastic IP **54.157.138.205**. The target address is **`https://sponsorship.coritiba.com.br`**. If IT picks another name, replace it everywhere below.

> **Status, 4 Nov 2026: cutover done.** The A record exists, Caddy serves HTTPS (Let's Encrypt, renews by itself), `APP_URL`, `NEXT_PUBLIC_APP_URL` and `GOOGLE_REDIRECT_URI` use `https://sponsorship.coritiba.com.br`, the 14 unsent emails were rewritten, and the Supabase Site URL is updated. ngrok still runs in parallel. Keep the DNS record **DNS only** (grey cloud): Cloudflare's proxy cuts requests at 100 seconds, which would break the long AI calls. Sponsors who already hold ngrok links keep working until the tunnel is stopped; check ngrok's traffic page before stopping it. n8n's own `WEBHOOK_URL` still names the ngrok address (n8n is not exposed publicly; change it only if a workflow starts using webhooks).

## The rule

**Add the new address next to ngrok. Switch only when the new one works. Remove ngrok weeks later.** The app builds every link from `APP_URL`, so both addresses serve the same app at the same time and nothing breaks in between.

## What is already done (no domain needed)

| Item | State |
|---|---|
| Elastic IP attached to the instance | done |
| Security group allows 22, 80, 443 | done |
| Google Cloud: redirect `https://sponsorship.coritiba.com.br/api/auth/gmail/callback` added next to the ngrok one | done |
| Supabase: redirect URL `https://sponsorship.coritiba.com.br/**` added | done (Site URL is **not** changed yet) |
| Code: no hardcoded ngrok fallback; the app calls its own routes through `INTERNAL_APP_URL` (default `http://127.0.0.1:3000`), never through the public address | in this branch |
| `deploy/Caddyfile` for HTTPS | in this branch, not yet running on the server |
| `scripts/replace-app-host.ts` for the unsent emails | in this branch |

## Waiting on IT

One DNS record: `sponsorship.coritiba.com.br  A  54.157.138.205`. Check with `dig +short sponsorship.coritiba.com.br` (must print the IP). The mail records for SES are a separate request, made after SES generates them. Send those for a **separate mail subdomain**, never for `coritiba.com.br` itself: the club's own mail (Microsoft 365, SendPulse) is protected by an SPF record ending in `-all`.

## Cutover, in order (about 30 minutes)

Do not start until `dig` shows the IP.

1. **HTTPS.** On the server: `sudo apt install caddy`, copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`, `sudo systemctl enable --now caddy`. Caddy fetches the certificate by itself. Check `curl -s https://sponsorship.coritiba.com.br/api/health` prints `"status":"ok"`. The app still runs with `APP_URL` = ngrok at this point.
2. **Settings.** In `frontend/.env.local` change three values to the new address: `APP_URL`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_REDIRECT_URI` (the last one keeps its path `/api/auth/gmail/callback`). Leave `INTERNAL_APP_URL` empty.
3. **Rebuild and restart** (`NEXT_PUBLIC_APP_URL` is baked in at build time): `free -h` first, then `npm run deploy` from the repo root. Confirm `.next/BUILD_ID` is fresh.
4. **Unsent emails.** From `frontend/`, dry run first:
   `npx tsx --env-file=.env.local scripts/replace-app-host.ts --from https://eligibly-facing-unloved.ngrok-free.dev --to https://sponsorship.coritiba.com.br`
   It lists the emails (only `pending_approval` and `approved`; sent and replied are never touched). If the list looks right, add `--apply`. On 2 Nov it was 14 of 23.
5. **Supabase.** Authentication → URL Configuration: change **Site URL** to `https://sponsorship.coritiba.com.br`. Keep the redirect entries.
6. **Test** (all on the new address): sign in; **Settings → Connect Gmail** (the Google consent screen is in *Testing* mode with one test user, so only that account can connect); an email's **Send test**; open a proposal share link in a private window; request a portal login link and click it; open `/crm-sync`.
7. **Tell the team** to sign in again on the new address (cookies belong to one address) and to use it from now on.

## Rollback

Put the three settings back to the ngrok address, rebuild, restart. ngrok is still running, so nothing else is needed. Caddy can stay.

## Keep ngrok running

Sponsors and WhatsApp contacts already hold ngrok links. Keep the tunnel for at least a few weeks after the cutover. Proposal share links store only a token, so they work on both addresses. When it is time to stop: remove `ngrok-tunnel` from pm2 (`pm2 delete ngrok-tunnel && pm2 save`).

## Check at any time

`npm run pm2:status` prints the health of the local port, of `APP_URL`, and of the legacy ngrok address.

## Known limits

- The Google consent screen is in **Testing** mode: only listed test users can connect Gmail, and Google expires the connection after 7 days. Publishing needs Google's verification for the Gmail scopes the app asks for (`gmail.compose`, `gmail.readonly`).
- **Fixed in the follow-up change (PR after #12):** the app's calls to its own routes used to carry no credentials and were answered with 401, so automatic discovery, enrichment, gone-cold drafts and sequence steps did nothing. They now send `INTERNAL_API_SECRET` and the tenant; `INTERNAL_API_SECRET` must therefore be set in `frontend/.env.local` for those steps to run.
