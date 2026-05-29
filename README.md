# Coritiba FC — Sponsorship Automation Platform

AI-powered sponsorship platform with one-click outreach automation. Stack: **Next.js 14**, **Supabase**, **AWS Bedrock (Claude Sonnet 4)**, **Pipedrive CRM**, **Hunter.io**, **Apollo.io**, **Apify**, **Replicate LoRA**, **OpenAI DALL-E**.

## What's Live (as of 28 May 2026)

| Feature | Status |
|---------|--------|
| Company intelligence & enrichment (Hunter.io + Apollo.io + LinkedIn + Apify) | ✅ |
| Proposal generation (Bedrock) + approval workflow | ✅ |
| Jersey mockup generation (Replicate LoRA, 5 placements) | ✅ |
| Campaign creative generation (OpenAI gpt-image-1) | ✅ |
| Email drafting → Pipedrive Activity logging | ✅ |
| Pipedrive CRM sync (orgs, deals, stages, activities) | ✅ |
| **🤖 Outreach Agent — one-click full outreach pipeline** | ✅ NEW |
| Monthly reports, audit trail, RBAC | ✅ |

## Outreach Agent (agents sprint — 28 May 2026)

One "Run Agent" button on any company page triggers a dual-approval outreach pipeline:

```
1. enrich_contacts              → Hunter.io + Apollo decision makers
2. scrape_company_intelligence  → LinkedIn + ad signals (Apify)
3. generate_personalized_proposal → NEW AI proposal tailored to this company (Bedrock)
   ⏸ APPROVE PROPOSAL — human reviews full proposal
4. generate_outreach_email      → Personalised PT-BR email draft
   ⏸ APPROVE & SEND — human reviews before Pipedrive
5. send_email                   → Pipedrive activity + deal linked
```

**Approval gates (always on):**
- Step 1: Review & approve the **personalized proposal** (never reuses/auto-approves old decks)
- Step 2: Review & approve the **email** before it is logged to Pipedrive

**Technical stack:**
- `ConverseCommand` from `@aws-sdk/client-bedrock-runtime` — native Claude tool-use loop
- SSE streaming (`ReadableStream`) — live step updates to browser, no polling
- `agent_runs` Supabase table — full audit trail per run with all steps + results

**New files:**
```
frontend/lib/agents/types.ts           ← AgentRun, SSEEvent types
frontend/lib/agents/tool-definitions.ts ← 5 Zod/JSON Schema tool specs
frontend/lib/agents/tools.ts           ← Tool implementations
frontend/lib/agents/orchestrator.ts    ← ConverseCommand loop + SSE emitter
frontend/app/api/agents/outreach/      ← POST (start), GET (status), POST approve
frontend/components/agents/outreach-agent-panel.tsx ← UI component
```

**Supabase migration required (run once):**
```sql
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'running',
  mode TEXT NOT NULL DEFAULT 'supervised',
  steps JSONB NOT NULL DEFAULT '[]',
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Quick start

```bash
cp .env.example .env
# Fill in secrets; then:
cp .env frontend/.env.local
cd frontend && npm ci && npm run dev
```

Production build:
```bash
cd frontend && npm run build && npm start
```

## Key environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
AWS_ACCESS_KEY_ID=...          # Bedrock (Claude Sonnet 4)
AWS_SECRET_ACCESS_KEY=...
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6
PIPEDRIVE_API_KEY=...          # CRM sync
HUNTER_API_KEY=...             # Decision maker email discovery
APOLLO_API_KEY=...             # Company intelligence (org enrich, dept headcount)
APIFY_API_TOKEN=...            # LinkedIn + ads scraping
OPENAI_API_KEY=...             # Campaign creatives
REPLICATE_API_TOKEN=...        # Jersey mockup LoRA
```

## Repository layout

| Path | Purpose |
|------|---------|
| `frontend/` | Next.js app (UI + `/api` Route Handlers) |
| `frontend/lib/agents/` | Outreach Agent logic |
| `frontend/lib/intelligence/` | Hunter.io, Apollo.io, Apify scrapers |
| `frontend/lib/bedrock/` | Bedrock/Claude client |
| `frontend/lib/pipedrive/` | Pipedrive API client |
| `supabase/migrations/` | Postgres schema, RLS |
| `docs/` | Architecture & setup |
| `27th_May.md` / `28th_May.md` | Sprint logs |
| `AGENTS_SPRINT_IMPL.md` | Agent sprint implementation plan |

## License

MIT

Private / all rights reserved unless otherwise stated by the repository owner.
