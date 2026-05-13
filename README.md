# Market Sponsorship Automation (Phase 1 MVP)

AI-assisted, **approval-first** workflow platform for sponsorship campaigns, proposals, Gmail outreach, and audit trails. Stack: **Next.js 14**, **Supabase**, **AWS Bedrock (Claude Sonnet)**, **Gmail API**, optional **n8n** orchestration on **EC2**.

## Quick start

See **[docs/SETUP.md](docs/SETUP.md)** and **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

```bash
cp .env.example .env
# Fill in secrets; then:
cp .env frontend/.env.local
cd frontend && npm ci && npm run dev
```

Production build (do not set `NODE_ENV=development` when building):

```bash
cd frontend && npm run build && npm start
```

Validate required env keys (names only):

```bash
node scripts/verify-env.mjs .env
```

## Repository layout

| Path | Purpose |
|------|---------|
| `frontend/` | Next.js app (UI + `/api` Route Handlers) |
| `supabase/migrations/` | Postgres schema, RLS, storage buckets |
| `workflows/n8n/` | Importable n8n JSON + README |
| `prompts/` | Prompt specs (implementations in `frontend/lib/bedrock/prompts.ts`) |
| `docs/` | Architecture & setup |
| `database/` | Pointer to migrations |
| `backend/` | Explains API surface (no separate server) |
| `scripts/` | `verify-env.mjs` |

Root `components/`, `lib/`, `hooks/`, `services/`, `utils/`, `types/` hold **README** placeholders for future workspace splits.

## Phase boundary

**In scope:** Phase 1 operational workflows only (see `Project Scope.md`).

**Out of scope:** OpenClaw, autonomous agent swarms, competitor intelligence, Phase 2+ features.

## Gmail OAuth redirect

Register in Google Cloud **Authorized redirect URIs**:

`{YOUR_PUBLIC_APP_URL}/api/auth/gmail/callback`

## n8n

Set environment variable `MSA_APP_URL` in n8n to the same base URL as this Next app, then import workflows from `workflows/n8n/`.

## License

Private / all rights reserved unless otherwise stated by the repository owner.
