# Setup

## 1. Prerequisites

- Node.js 20+
- Supabase project
- AWS account with Bedrock access + Claude model enabled in the target region
- Google Cloud project with Gmail API + OAuth consent + OAuth client (Web application)
- (Optional) n8n instance for scheduled / webhook orchestration

## 2. Environment

Copy `.env.example` to `.env` at the **repository root**, then copy or symlink into the frontend:

```bash
cp .env.example .env
# edit .env with real values
cp .env frontend/.env.local
```

**Gmail OAuth:** In Google Cloud Console, set the authorized redirect URI to:

`{NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`

(e.g. `http://localhost:3000/api/auth/gmail/callback` for local dev)

Do **not** point the OAuth redirect at n8n unless n8n is handling OAuth (this app handles it).

Required variables are validated when API routes load `serverEnv()` — see `frontend/lib/env.ts`.

## 3. Database

Apply migrations in order using Supabase SQL editor or CLI:

```bash
# from repo root, with Supabase CLI linked
supabase db push
# or run each file in supabase/migrations/*.sql manually in SQL editor
```

Ensure the `auth.users` → `public.users` linkage strategy matches your rollout (Phase 1 may use service-role–only writes; RLS policies assume `auth_user_id` populated when using Supabase Auth in the browser).

## 4. Run the app

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`.

**Production build:** `npm run build` forces `NODE_ENV=production` so do not export `NODE_ENV=development` when building.

## 5. Gmail

1. Open `/settings` and click **Connect Gmail** (`GET /api/auth/gmail`).
2. Complete OAuth; tokens are stored on `public.users` under `metadata.gmail_tokens` for the mailbox that authenticated.

## 6. n8n

Import JSON files from `workflows/n8n/` and set `MSA_APP_URL`. See `workflows/n8n/README.md`.

## 7. EC2 / production

- Run `npm run build && npm run start` behind a process manager (systemd, PM2).
- Put HTTPS reverse proxy (Caddy, nginx, ALB) in front; update `NEXT_PUBLIC_APP_URL` and OAuth redirect URIs to match the public hostname.
