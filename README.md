# Coritiba FC — Sponsorship Automation Platform

AI-powered commercial sponsorship platform for Coritiba FC. Stack: **Next.js 14**, **Supabase**, **AWS Bedrock (Claude Sonnet 4)**, **Pipedrive CRM**, **Hunter.io**, **Apollo.io**, **Apify**, **Replicate LoRA**, **OpenAI (gpt-image-1)**.

**Production URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Status:** Production Ready — fully E2E validated, business workflows certified (see `4th_June.md`).

---

## Features

| Feature | Description |
|---------|-------------|
| **Enrichment pipeline** | Domain-independent resolution (website, Apollo, Hunter, CRM contact email); manual domain recovery; re-enrich on website change |
| **Outreach Agent** | One-click supervised pipeline: enrich → intelligence → proposal → email → Pipedrive (dual approval gates) |
| **Proposal generation** | Bedrock-powered proposals; edit, version, approve; public landing with share token |
| **Email generation** | Template engine with `{{variables}}`; team sender from DB; Bedrock personalization |
| **Team senders** | `team_members` CRUD at `/settings/team`; default sender in all outreach emails |
| **Email templates** | CRUD at `/settings/email-templates`; default template drives generation |
| **Inventory** | Catalog at `/inventory`; campaign picker persists to `campaign_inventory_items` |
| **Activation briefs** | AI resource/hour brief from campaign inventory; UI on campaign detail |
| **Proposal packages** | Prata / Ouro / Diamante tiers; public landing package switcher |
| **CRM / Pipedrive** | Org, deal, activity sync; outreach send logs Pipedrive activity |
| **Landing pages** | Public sponsor-facing proposal view; packages, visuals, CTAs |
| **Mockups & creatives** | Official jersey composite (Replicate); campaign creatives (OpenAI gpt-image-1) |
| **Bulk workflows** | Bulk campaigns by industry; bulk proposals; Vista em Cards approvals |
| **Competitor flow** | Add competitor to DB → Create Proposal from company intelligence |
| **Approvals** | Proposals, campaigns, emails; list + card views |
| **Reports & audit** | Monthly reports, workflow events, RBAC |

---

## Outreach Agent

One **Run Agent** button on a company page runs the full pipeline:

```
1. enrich_contacts              → Hunter + Apollo
2. scrape_company_intelligence  → Apify / LinkedIn signals
3. generate_personalized_proposal → Bedrock (new proposal per company)
   ⏸ APPROVE PROPOSAL
4. generate_outreach_email      → Template + Bedrock (default sender from team_members)
   ⏸ APPROVE & SEND
5. send_email                   → Pipedrive activity + deal link
```

Implementation: `frontend/lib/agents/` — ConverseCommand tool loop, SSE streaming, `agent_runs` audit table.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  AWS EC2                                                     │
│  ┌──────────────┐    ┌─────────────────────────────────────┐ │
│  │ PM2          │    │  Next.js 14 (frontend/)              │ │
│  │ sponsorship- │───▶│  App Router UI + /api Route Handlers │ │
│  │ platform     │    └──────────┬──────────────────────────┘ │
│  └──────────────┘               │                             │
│  ┌──────────────┐               ▼                             │
│  │ PM2          │    ┌──────────────────┐  ┌───────────────┐ │
│  │ ngrok-tunnel │───▶│ Supabase (Postgres)│  │ AWS Bedrock   │ │
│  └──────────────┘    └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────┘
         │
         ├── Pipedrive (CRM activities, orgs, deals)
         ├── Hunter.io / Apollo.io / Apify (enrichment)
         ├── OpenAI (campaign creatives)
         └── Replicate (jersey mockup LoRA)
```

| Path | Purpose |
|------|---------|
| `frontend/` | Next.js app (UI + API routes) |
| `frontend/lib/agents/` | Outreach Agent |
| `frontend/lib/intelligence/` | Enrichment (domain-resolution, Hunter, Apollo, Apify) |
| `frontend/lib/email/` | Template engine, sender resolution |
| `frontend/lib/bedrock/` | Claude client |
| `frontend/lib/pipedrive/` | CRM client |
| `supabase/migrations/` | Postgres schema (0021–0025+) |
| `scripts/deploy-latest.sh` | Build + PM2 restart on EC2 |
| `ecosystem.config.cjs` | PM2 process definitions |

**Auth:** Supabase Auth; session required for admin routes. Public health and proposal landing pages are unauthenticated where designed.

---

## Deployment

Production runs **24/7 on AWS EC2** — not on a developer laptop. Closing Cursor or shutting down a local machine does **not** stop the platform.

```bash
# On EC2 (from repo root)
npm run deploy
# equivalent: bash scripts/deploy-latest.sh
```

This script:

1. `git pull` on the deployment branch
2. `npm ci` + `npm run build` in `frontend/`
3. `pm2 restart sponsorship-platform`
4. Health check on `localhost:3000` and ngrok public URL

**PM2 processes:**

| Name | Role |
|------|------|
| `sponsorship-platform` | Next.js production server |
| `ngrok-tunnel` | Public HTTPS tunnel to port 3000 |

Configure secrets in `frontend/.env.local` on the server (never commit).

---

## Quick start (local development)

```bash
cp .env.example .env
# Fill secrets; then:
cp .env frontend/.env.local
cd frontend && npm ci && npm run dev
```

Production build:

```bash
cd frontend && npm run build && npm start
```

---

## Key environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
AWS_ACCESS_KEY_ID=...          # Bedrock
AWS_SECRET_ACCESS_KEY=...
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6
PIPEDRIVE_API_KEY=...
HUNTER_API_KEY=...
APOLLO_API_KEY=...
APIFY_API_TOKEN=...
OPENAI_API_KEY=...             # Campaign creatives (gpt-image-1)
REPLICATE_API_TOKEN=...        # Jersey mockups
APP_URL=https://...            # Public base URL (ngrok or production domain)
```

---

## Production status

| Item | Status |
|------|--------|
| **Production Ready** | Yes |
| **E2E validated** | 47 PASS (5 June) + 94 PASS (platform cert) + 16 business workflows (unconditional) |
| **Business workflows certified** | Unconditional Production Approval (June 2026) |
| **Master documentation** | `4th_June.md` |
| **Test plan** | `INTERN_TEST_PLAN.md` |

### External limitations (non-blocking)

- Apify monthly quota may limit discovery scrapes
- Apollo People Search advanced scenarios may require Basic+ plan

**Outreach delivery:** Core workflow uses **Pipedrive** for send logging and rep follow-up. Gmail OAuth is optional for inbox reply sync only.

---

## Documentation

| File | Purpose |
|------|---------|
| `4th_June.md` | **Master project history** — sprints, migrations, E2E, certifications, production status |
| `INTERN_TEST_PLAN.md` | Current E2E / certification test reference |
| `1st_June.md` … `3rd_June.md` | Historical sprint logs |
| `docs/` | Architecture notes |

---

## License

MIT — Private / all rights reserved unless otherwise stated by the repository owner.
