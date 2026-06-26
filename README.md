# Coritiba FC — Sponsorship Automation Platform

AI-powered commercial sponsorship platform for Coritiba FC. Stack: **Next.js 14**, **Supabase**, **AWS Bedrock (Claude Sonnet 4)**, **Pipedrive CRM**, **Hunter.io**, **Apollo.io**, **Apify**, **Replicate LoRA**, **OpenAI (gpt-image-1)**.

**Production URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Branch:** `26th-june-sprint`  
**Status (26 June 2026):** Production ready — **0 known failures** after 26th June sprint. See `26th_june.md` for complete audit coverage.

---

## Features

| Feature | Description |
|---------|-------------|
| **Enrichment pipeline** | Domain-independent resolution (website, Apollo, Hunter, CRM contact email); manual domain recovery; re-enrich on website change |
| **Outreach Agent** | One-click supervised pipeline: enrich → intelligence → proposal → email → Pipedrive (dual approval gates); cancel + duplicate-run prevention |
| **Proposal generation** | Bedrock-powered proposals; 7 wizard types; edit, version, approve; public landing with share token |
| **Email generation** | Template engine with `{{variables}}`; team sender from DB; Bedrock personalization; auto-injects "Ver Proposta →" CTA button if template omits it |
| **Team senders** | `team_members` CRUD at `/settings/team`; default sender in all outreach emails |
| **Email templates** | CRUD at `/settings/email-templates`; JSON import; default template drives generation |
| **Inventory** | Catalog at `/inventory`; campaign picker persists to `campaign_inventory_items` |
| **Activation briefs** | AI resource/hour brief from campaign inventory; UI on campaign detail |
| **Proposal packages** | Prata / Ouro / Diamante tiers; public landing package switcher |
| **CRM / Pipedrive** | Org, deal, activity sync; outreach send logs Pipedrive activity |
| **Landing pages** | 5 templates; public sponsor view with "Tenho Interesse" / "Falar com equipe" / "Agendar Reunião" sticky CTA bar |
| **Jersey mockups (official)** | Sharp composite on official kit base — 7 placement zones; white badge background; logo required; CFC crest never altered |
| **AI campaign creatives** | OpenAI gpt-image-1 — stadium scenes, 1536×1024 (16:9); full-screen prompt approval modal with edit |
| **Graphics panel** | Three separate UI cards: Jersey Mockup (green), AI Creatives (indigo), Saved Images (slate) |
| **Bulk workflows** | Bulk campaigns by industry with **data completeness warning**; bulk logo upload; Vista em Cards approvals |
| **Competitor tracking** | `competitor` status (before prospect); red badge; filter on `/companies`; save from Apify discovery |
| **Approvals** | Proposals, campaigns, emails; list + card views; post-approve email template picker |
| **Dashboard KPIs** | Pipeline Value (R$), Conversion Rate %, Active Contracts, Emails Sent — visible on main dashboard |
| **Inline industry edit** | Click-to-edit industry field on company detail — no full-form reload |
| **Reports & audit** | Monthly reports, workflow events, audit log, RBAC |

---

## Graphics & mockups (June 2026)

Proposal detail **Visuais / Graphics** uses three distinct cards:

| Card | What it does |
|------|----------------|
| **👕 Jersey Mockup — Official** | Composites uploaded sponsor logo onto official kit (`sharp`). White rectangular badge for visibility on dark green fabric. Generate blocked without logo — no text fallback. Crest locked. |
| **✨ AI Campaign Creatives** | OpenAI `gpt-image-1` at 1536×1024. Prompts include Estádio Couto Pereira, LED boards, crowd, strategy label. Full-screen review modal before generation; prompts editable. |
| **🖼️ Saved Images** | Gallery of generated/uploaded assets; bulk approve before landing page |

Implementation: `frontend/lib/media/jersey-composite.ts`, `frontend/components/proposals/official-jersey-mockup.tsx`, `frontend/components/proposals/ai-creatives-generator.tsx`, `frontend/components/proposals/proposal-brand-graphics-wrapper.tsx`.

---

## Outreach Agent

One **Run Agent** button on a company page (`/companies/[id]`) runs the full pipeline:

```
1. enrich_contacts              → Hunter + Apollo
2. scrape_company_intelligence  → Apify / LinkedIn signals
3. generate_personalized_proposal → Bedrock (new proposal per company)
   ⏸ APPROVE PROPOSAL
4. generate_outreach_email      → Template + Bedrock (default sender from team_members)
   ⏸ APPROVE & SEND
5. send_email                   → Pipedrive activity + deal link
```

- **Supervised mode** — proposal and email both require human approval before continuing.
- **Cancel** — aborts SSE stream and sends `DELETE /api/agents/outreach/{run_id}` (run ID from response header).
- **Duplicate prevention** — second run on same company returns 409 while one is active.

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
         ├── OpenAI (campaign creatives — gpt-image-1)
         └── Replicate (jersey mockup LoRA — legacy creative path)
```

| Path | Purpose |
|------|---------|
| `frontend/` | Next.js app (UI + API routes) |
| `frontend/lib/agents/` | Outreach Agent orchestrator + tools |
| `frontend/lib/intelligence/` | Enrichment (domain-resolution, Hunter, Apollo, Apify) |
| `frontend/lib/media/` | Jersey composite, placements |
| `frontend/lib/email/` | Template engine, sender resolution |
| `frontend/lib/bedrock/` | Claude client |
| `frontend/lib/pipedrive/` | CRM client |
| `supabase/migrations/` | Postgres schema (0021–0028+) |
| `scripts/deploy-latest.sh` | Build + PM2 restart on EC2 |
| `ecosystem.config.cjs` | PM2 process definitions |

**Auth:** Supabase Auth; session required for admin routes. Public health and proposal landing pages are unauthenticated where designed.

**Key API routes (read):** `/api/health`, `/api/proposals?limit=N`, `/api/audit?limit=N`, `/api/search?q=…`, `/api/system/health`, `/api/system/status`.

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
REPLICATE_API_TOKEN=...        # Jersey mockups / LoRA
APP_URL=https://...            # Public base URL (ngrok or production domain)
```

---

## Production status

| Item | Status |
|------|--------|
| **Production ready** | Yes |
| **James complaints (9 Jun)** | 8/8 resolved and browser-verified |
| **E2E (9 Jun)** | 5 test rounds; final state **0 known failures** |
| **Outreach Agent** | Full supervised flow verified (enrich → proposal → email → Pipedrive) |
| **Graphics / mockups** | Jersey composite + AI creatives + 3-card UI verified |
| **Competitor CRM** | `competitor` status, red badge, filter verified |
| **Bulk campaigns** | Data completeness warning + Continue anyway verified |
| **AI model** | `claude-sonnet-4-6` (Bedrock); creatives via `gpt-image-1` |

### Recent fixes (June 9)

- Jersey logo consistency — no silent text fallback; generate blocked without upload
- AI creatives — 1536×1024 stadium prompts; full-screen prompt approval; edit persists to generation
- Bulk logo upload — correct `/api/proposals/{id}/upload-asset` endpoint
- Logo upload → Generate button — shared client state via `ProposalBrandGraphicsWrapper`
- Competitor enum + badge + filter
- Agent cancel — `DELETE` fires with run ID from response header
- New list APIs: `GET /api/proposals`, `GET /api/audit`

### Pending / upcoming

| Feature | Notes | Priority |
|---------|-------|----------|
| Stadium image picker / upload | Real stadium photos, saved themes | Medium |
| Assign images to Marketing Campaigns | Select generated assets per campaign | Medium |
| Trial / sample proposal design | People-on-trial layout option | Low |
| Pipeline drag-and-drop Kanban | Stage columns exist; drag-drop not built | Low |
| Gmail OAuth reconnect | Token expired ~22 May; Pipedrive logging still works | Low |

### Known limitations (not bugs)

- **Emails from approval** → status `pending_approval` until human sends (by design)
- **Gmail** — optional for inbox reply sync; outreach logs to Pipedrive + DB
- **Apify quota** — may limit competitor discovery scrapes
- **Replicate LoRA** — 2024 kit model; 2026 retrain pending stadium photos from James
- **Packages template** — empty until pricing tiers exist on proposal
- **AI creatives cost** — ~$0.04/image (OpenAI); ~$0.12 for 3 strategy variants
- **`competitor` DB enum** — migration at `supabase/migrations/0028_competitor_company_status.sql` / `APPLY_9TH_JUNE.sql` if needed on fresh DB
- **Pipeline** — no drag-drop between columns yet

**Outreach delivery:** Core workflow uses **Pipedrive** for send logging and rep follow-up. Gmail OAuth is optional for inbox reply sync only.

---

## Documentation

| File | Purpose |
|------|---------|
| `9th_june.md` | **Latest daily summary** — James fixes, E2E results, pending items (9 Jun 2026) |
| `8th_June_E2E_test.md` | Full manual + automated E2E test plan (sections 0–23, RF regressions) |
| `8th_June.md` | 8 June sprint log and backlog |
| `4th_June.md` | Master project history — sprints, migrations, certifications |
| `TESTING_GUIDE.md` | Testing overview |
| `INTERN_TEST_PLAN.md` | Earlier certification test reference |
| `1st_June.md` … `5th_June.md` | Historical sprint logs |
| `docs/` | Architecture and setup notes |

---

## License

MIT — Private / all rights reserved unless otherwise stated by the repository owner.
