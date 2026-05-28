# Agents Sprint — Detailed Implementation Plan
**Coritiba FC Sponsorship Automation**  
**Date:** 28 May 2026 | **Branch:** `feature/agents-sprint`  
**Forked from:** `feature/apify-commercial-intelligence` @ `248d77c`  
**Status:** Ready to implement — no James input required for v1

---

## TL;DR

Build a one-click "Run Outreach Agent" button on any company page that:
1. Finds the best decision maker (Hunter.io)
2. Scrapes active ad campaigns + social signals (Apify)
3. Generates or reuses an existing proposal (Bedrock)
4. Drafts a personalised email (Bedrock)
5. Sends it to Pipedrive as an Activity + updates deal stage

User sees every step live as it happens. Default mode = **Supervised** (user reviews email draft before it's sent). Can be switched to **Auto** anytime.

---

## Technology Decision (Revised after codebase audit)

### Why NOT Vercel AI SDK
The planning doc (`AGENTS_SPRINT_PLAN.md`) suggested Vercel AI SDK (`streamText`). After auditing the codebase:

- `ai` and `@ai-sdk/amazon-bedrock` are **not installed**
- Current Bedrock usage is `@aws-sdk/client-bedrock-runtime` with `InvokeModelCommand`
- Adding two new packages introduces unnecessary version-lock risk

**Decision: Use `ConverseCommand` (already in our SDK).**

`ConverseCommand` is the AWS SDK's native tool-use API for Claude — it directly supports multi-turn tool calling with `stopReason: "tool_use"` and `stopReason: "end_turn"` without any wrapper library. This is exactly how LangGraph, CrewAI, and Vercel AI SDK work under the hood.

### Why NOT Trigger.dev
- New dependency (1,000+ lines to understand)
- Adds a new cloud service to manage
- Overkill for 7 tool calls that will run in ~30–45 seconds

**Decision: SSE (Server-Sent Events) streaming from a Next.js route with `maxDuration = 120`.**

The route streams each step result as it completes. No polling needed. Works in the browser natively. If a run exceeds 120s (unlikely), we upgrade to Trigger.dev in Phase 5.

### Technology Stack for the Agent

| Component | What We Use | Why |
|-----------|------------|-----|
| LLM tool loop | `ConverseCommand` (AWS SDK) | Already installed, Claude's native tool-use API |
| Streaming to browser | `ReadableStream` + SSE | Built into Next.js, zero new packages |
| Background persistence | `workflow_events` table (already exists) | No new infra |
| Agent run tracking | New `agent_runs` table (Supabase migration) | Required for pause/resume in supervised mode |
| Tool definitions | Inline JSON Schema objects | ConverseCommand format, no Zod needed |
| Existing tools used | Hunter, Apify, Bedrock, Pipedrive | All already live and working |

---

## Decisions Made Without James (Defaults — Easy to Change Later)

| Question | Default Chosen | How to Change |
|----------|---------------|---------------|
| Default mode | **Supervised** (user confirms before email is sent) | Toggle in UI — just change `mode` param in POST body |
| Contact selection | **Auto-pick top confidence contact** from Hunter | UI will show contact with override dropdown later |
| Existing proposal | **Reuse approved proposal** if one exists for this company; generate new one if not | One flag in tool logic |
| Multiple decision makers | Pick the **highest seniority** one (Director → VP → Manager → Other) | Ordering logic in tool |
| Bulk outreach | **Single company at a time** for now | Bulk endpoint is a loop over this — add in Phase 5 |
| Apollo integration | **Skip — Hunter.io only** until James confirms Apollo | Tool 1 can be swapped/extended once Apollo is confirmed |

---

## Architecture: The Agent Loop

```
POST /api/agents/outreach
        │
        ▼
  [Validate + auth]
        │
        ▼
  [Create agent_run row in DB: status=running]
        │
        ▼
  Start SSE stream to browser ─────────────────────────────────────────►  Browser
        │                                                                   │
        ▼                                                                   │
  Claude (ConverseCommand) with 5 tools available                          │
  System prompt: "You are a sponsorship outreach agent for Coritiba FC..." │
  User message: "Run full outreach for company_id=X"                       │
        │                                                                   │
   ┌────┴────┐                                                              │
   │ Claude  │──► stopReason=tool_use ──► execute tool ──► stream step ────►│
   │  loop   │◄── tool result ────────────────────────────────────────────  │
   └────┬────┘    (repeat max 10 iterations)                                │
        │                                                                   │
        ▼ stopReason=end_turn                                               │
  [Update agent_run: status=completed/paused]                              │
        │                                                                   │
        ▼                                                                   │
  Stream "DONE" event ─────────────────────────────────────────────────────►│
```

### SSE Event Format (what browser receives)
```json
// One event per tool execution:
data: {"type":"step","step":1,"tool":"enrich_contacts","status":"running","label":"Finding decision makers..."}
data: {"type":"step","step":1,"tool":"enrich_contacts","status":"done","label":"Found 5 contacts (2 decision makers)","result":{"decision_makers":2,"top_contact":"maria.silva@heineken.com"}}
data: {"type":"step","step":2,"tool":"scrape_intelligence","status":"running","label":"Scanning active campaigns..."}
// ... etc
data: {"type":"paused","reason":"email_review","email_id":"uuid","email_preview":"Cara Maria..."}
data: {"type":"done","run_id":"uuid","summary":"Agent completed 6 steps. Email awaiting approval."}
data: {"type":"error","step":3,"message":"Hunter.io rate limit hit — skipping contacts"}
```

---

## The 5 Tools (Reduced from 7 — Combined Logically)

> Note: The original plan had 7 tools. Combining proposal + brief into one tool and remove separate CRM update (merged into send_email) reduces Claude's decision space and makes the loop tighter.

### Tool 1: `enrich_contacts`
```
Input:  { company_id: string, domain: string }
Output: { decision_makers: Contact[], all_contacts: Contact[], top_contact: Contact | null }
Uses:   Hunter.io (lib/intelligence/hunter.ts) — already live
Fallback: Return empty arrays, agent continues without contacts
```

### Tool 2: `scrape_company_intelligence`
```
Input:  { company_id: string, company_name: string, domain: string }
Output: { linkedin: LinkedInProfile, ads: AdSignals, social: SocialPresence, from_cache: boolean }
Uses:   enrichCompanySocial (lib/intelligence/social-scraper.ts) — already live
Fallback: Return nulls, agent notes "enrichment unavailable" in email context
```

### Tool 3: `get_or_create_proposal`
```
Input:  { company_id: string, force_new: boolean }
Output: { proposal_id: string, proposal_title: string, was_created: boolean, key_packages: string[] }
Uses:   Supabase (check for existing approved proposal) + POST /api/proposals/generate if needed
Logic:  1. Query companies table for approved proposal
        2. If found → return it
        3. If not → call proposal generation endpoint → return new one
```

### Tool 4: `generate_outreach_email`
```
Input:  { proposal_id: string, recipient: Contact, company_intelligence: object }
Output: { email_id: string, subject: string, preview: string (first 150 chars) }
Uses:   POST /api/emails/generate (already live)
Notes:  Passes enrichment context to the email generator so it personalises by role/department
```

### Tool 5: `send_email`
```
Input:  { email_id: string, approved: boolean }
Output: { pipedrive_activity_id: string, deal_stage_updated: boolean, sent_at: string }
Uses:   POST /api/emails/{id}/send (already live, logs to Pipedrive)
        POST /api/crm (deal stage → "Negociação")
Notes:  In Supervised mode — only called after user clicks "Approve & Send"
        In Auto mode — called immediately
```

---

## Supabase Migration Required ⚠️

**You need to run this migration manually in Supabase SQL editor before we start coding.**

```sql
-- Agent runs table
CREATE TABLE IF NOT EXISTS agent_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by    UUID REFERENCES auth.users(id),
  status        TEXT NOT NULL DEFAULT 'running',
    -- running | completed | failed | paused_for_approval | cancelled
  mode          TEXT NOT NULL DEFAULT 'supervised',
    -- supervised | auto
  steps         JSONB NOT NULL DEFAULT '[]',
    -- Array of { step, tool, status, label, result, started_at, finished_at }
  result        JSONB,
    -- Final summary: { email_id, proposal_id, pipedrive_activity_id, contacts_used, cost_estimate }
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by company
CREATE INDEX IF NOT EXISTS agent_runs_company_id_idx ON agent_runs(company_id);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs(status);

-- RLS: users can only see runs for companies they have access to
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read agent runs"
  ON agent_runs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert agent runs"
  ON agent_runs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update agent runs"
  ON agent_runs FOR UPDATE
  USING (auth.role() = 'authenticated');
```

> **How to run:** Go to [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor → paste + run. No code change needed. This is the ONLY manual step required.

---

## File Structure (New Files Only)

```
frontend/
├── lib/
│   └── agents/
│       ├── types.ts              ← AgentRun, AgentStep, AgentTool types
│       ├── tools.ts              ← The 5 tool implementations (actual logic)
│       ├── tool-definitions.ts   ← JSON Schema tool specs for ConverseCommand
│       └── orchestrator.ts       ← ConverseCommand loop + SSE streaming
│
├── app/
│   └── api/
│       └── agents/
│           ├── outreach/
│           │   └── route.ts      ← POST — start a new agent run (returns SSE stream)
│           └── outreach/[runId]/
│               ├── route.ts      ← GET — fetch run status/steps; PATCH — approve (supervised)
│               └── approve/
│                   └── route.ts  ← POST — approve email in supervised mode (resumes agent)
│
└── components/
    └── agents/
        └── outreach-agent-panel.tsx   ← UI: "Run Agent" button + live step progress
```

**Modified files:**
```
frontend/app/companies/[id]/page.tsx         ← Add <OutreachAgentPanel /> below the existing tabs
frontend/lib/bedrock/client.ts               ← Add converseWithTools() function alongside invokeClaude()
```

---

## Phase Breakdown

### Phase 1 — Foundation (Day 1 AM)
**Goal:** Backend agent runs end-to-end, verified via curl. No UI yet.

Files to create:
- `lib/agents/types.ts` — TypeScript types for AgentRun, AgentStep
- `lib/agents/tool-definitions.ts` — JSON Schema for the 5 tools (input/output)
- `lib/agents/tools.ts` — Tool implementations (call Hunter, Apify, proposals, emails, Pipedrive)
- `lib/bedrock/client.ts` — Add `converseWithTools()` function using `ConverseCommand`
- `app/api/agents/outreach/route.ts` — POST handler, starts agent loop, streams SSE

What "done" looks like:
```bash
curl -X POST http://localhost:3000/api/agents/outreach \
  -H "Content-Type: application/json" \
  --no-buffer \
  -d '{"company_id":"03ab22a4-...","mode":"auto"}'

# Streams:
# data: {"type":"step","tool":"enrich_contacts","status":"running"}
# data: {"type":"step","tool":"enrich_contacts","status":"done","result":{"contacts":3}}
# data: {"type":"step","tool":"scrape_company_intelligence","status":"running"}
# ...
# data: {"type":"done","run_id":"...","summary":"6 steps completed"}
```

DB row created in `agent_runs` with all steps persisted.

---

### Phase 2 — Run Status API (Day 1 PM)
**Goal:** Frontend can fetch run progress without SSE (for reconnect resilience).

Files to create:
- `app/api/agents/outreach/[runId]/route.ts` — GET returns run with all steps

What "done" looks like:
```bash
curl http://localhost:3000/api/agents/outreach/{runId}
# Returns: { id, status, steps: [...], result: {...} }
```

---

### Phase 3 — UI Component (Day 2 AM)
**Goal:** "Run Agent" button appears on every company page, steps appear live as they complete.

Files to create:
- `components/agents/outreach-agent-panel.tsx` — Full UI panel

UI layout:
```
┌──────────────────────────────────────────────────────┐
│  🤖 Outreach Agent                   Mode: [Supervised ▼] │
│                                      [▶ Run Agent]         │
├──────────────────────────────────────────────────────┤
│  ✅  Step 1  enrich_contacts          2 decision makers found   │
│  ✅  Step 2  scrape_intelligence      Score 7.5 · High ad spend │
│  ✅  Step 3  get_or_create_proposal   Reusing: Red Bull × Coritiba│
│  ✅  Step 4  generate_email           Draft ready              │
│  ⏸️  Waiting for your approval...                              │
│                                                               │
│  📧 To: maria.silva@heineken.com (Marketing Director, 94%)   │
│     Subject: "Parceria Estratégica: Coritiba FC × Red Bull" │
│     [Preview email]  [✅ Approve & Send]  [✏️ Edit first]    │
└──────────────────────────────────────────────────────┘
```

Modified:
- `app/companies/[id]/page.tsx` — Import and add `<OutreachAgentPanel companyId={id} />`

---

### Phase 4 — Supervised Mode (Day 2 PM)
**Goal:** Agent pauses after email draft, user clicks "Approve & Send", agent continues.

Files to create:
- `app/api/agents/outreach/[runId]/approve/route.ts` — POST sets `status=approved`, agent loop continues

How it works:
1. After `generate_outreach_email` tool completes, agent sets `status = paused_for_approval` in DB
2. SSE emits `{"type":"paused","reason":"email_review","email_id":"..."}`
3. UI shows email preview + approve button
4. User clicks "Approve & Send" → `POST /api/agents/outreach/{runId}/approve`
5. Route updates DB flag → calls `send_email` tool directly → streams final result

---

### Phase 5 — Hardening (Day 3)
**Goal:** Production-ready error handling, rate limiting, cost visibility.

- **Per-tool retries**: Each tool wraps in try/catch — on failure, streams `{"type":"error","step":N}` and continues with degraded context (e.g., no contacts → email still generates, just less personalised)
- **Rate limiting**: 1 agent run per company per 24h (check `agent_runs` table before starting)
- **Cost estimate**: Track Bedrock token usage per run, store in `result.cost_estimate`
- **Idempotency**: Before calling `send_email`, check if `pipedrive_activity_id` already exists on the email row — don't double-send
- **Cancel**: `DELETE /api/agents/outreach/{runId}` sets status=cancelled
- **28th_May.md update**: Mark agents sprint as in-progress

---

## What Each Existing API Already Does (No Changes Needed)

| Existing Route | What the Agent Uses It For | Status |
|---------------|---------------------------|--------|
| `lib/intelligence/hunter.ts` | Tool 1: `enrich_contacts` | ✅ Live |
| `lib/intelligence/social-scraper.ts` | Tool 2: `scrape_intelligence` | ✅ Live (just fixed) |
| `POST /api/proposals/generate` | Tool 3: generate if no proposal exists | ✅ Live |
| `POST /api/emails/generate` | Tool 4: draft personalised email | ✅ Live |
| `POST /api/emails/{id}/send` | Tool 5: send + log to Pipedrive | ✅ Live |
| `POST /api/crm` | Tool 5: update deal stage | ✅ Live |
| `workflow_events` | Audit trail for each run | ✅ Live |

**The agent is an orchestration layer — it calls tools we already built.** No existing route needs modification.

---

## Estimated Timeline

| Phase | Work | Estimate |
|-------|------|----------|
| DB migration (manual — you run it) | Create `agent_runs` table | 5 min |
| Phase 1: Backend agent + SSE | Core loop, 5 tools, streaming | ~4h |
| Phase 2: Run status API | GET /api/agents/outreach/{runId} | ~30 min |
| Phase 3: UI component | OutreachAgentPanel | ~3h |
| Phase 4: Supervised mode | Pause/approve/resume | ~2h |
| Phase 5: Hardening | Retries, rate limit, cost | ~2h |
| **Total** | | **~12h (1.5 days)** |

---

## What Will NOT Be Built in This Sprint

These are saved for when James confirms or provides input:
- **Bulk outreach** (run agent on 10 companies at once) — needs UX design input
- **Apollo integration** — waiting on James's decision
- **Trigger.dev** — only needed if runs exceed 90s consistently
- **Email editing in the UI** — user can edit directly in Pipedrive for now
- **Agent "memory"** — no cross-company learning in v1

---

## Rollback Plan

Since this is on a **separate branch** (`feature/agents-sprint`), the original platform at `feature/apify-commercial-intelligence` is completely unaffected. To rollback:

```bash
git checkout feature/apify-commercial-intelligence
pm2 restart sponsorship-platform
```

The only irreversible action is the **Supabase `agent_runs` migration** — but even that is harmless (just an empty table). It can be dropped with `DROP TABLE agent_runs;` if needed.

---

## Definition of Done (When This Sprint Is Complete)

- [ ] `agent_runs` table exists in Supabase
- [ ] `POST /api/agents/outreach` returns an SSE stream with all 5 steps completing
- [ ] Red Bull Brasil agent run: contacts enriched + proposal found/created + email drafted + email approved + sent to Pipedrive
- [ ] `<OutreachAgentPanel />` visible on company page, shows live step progress
- [ ] Supervised mode: agent pauses, user clicks "Approve & Send", email appears in Pipedrive
- [ ] Auto mode: all 5 steps complete without any user input
- [ ] Failing tools are gracefully skipped (e.g. Hunter down → email still generates with "no specific contact" note)
- [ ] `28th_May.md` updated, commit pushed

---

*Parent plan: `AGENTS_SPRINT_PLAN.md` | Active branch: `feature/agents-sprint`*
