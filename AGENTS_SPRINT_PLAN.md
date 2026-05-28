# Agents Sprint — Implementation Plan
**Coritiba FC Sponsorship Automation**  
**Prepared:** 28 May 2026 | **By:** Abhishek  
**Status:** Planning — awaiting approval before implementation

---

## What We're Building

A **Sponsorship Outreach Agent** — one click on any company page triggers a fully automated pipeline:

```
User clicks "Run Outreach Agent" on a company
         ↓
[Agent Step 1] Enrich — Hunter.io decision maker emails
         ↓
[Agent Step 2] Scrape — Apify active campaigns, social signals
         ↓
[Agent Step 3] Research — Bedrock/Claude analyses company + context
         ↓
[Agent Step 4] Proposal — Bedrock generates tailored proposal (or selects existing)
         ↓
[Agent Step 5] Email — Bedrock drafts personalised outreach in PT-BR
         ↓
[Agent Step 6] Send + CRM — Email logged to Pipedrive as Activity; deal stage updated
         ↓
[Agent Step 7] Audit — Full trace saved; user notified
```

Zero human input required after the trigger. Every step retries on failure. User sees live progress.

---

## Technology Decision

### Why NOT an external framework (LangGraph / CrewAI / AutoGen)

| Framework | Issue for our stack |
|-----------|-------------------|
| LangGraph | Python-first; integrating into our Next.js/TypeScript codebase adds significant complexity and a separate Python service |
| CrewAI | Also Python; same problem. Adds a second language runtime we'd need to manage |
| AutoGen | Research-oriented, not production-hardened for a CRM outreach pipeline |
| OpenAI Agents SDK | OpenAI models only — we're on Bedrock/Claude |

All external frameworks would require running a **separate backend service** alongside our Next.js app. For our single-server PM2 deployment, that's unnecessary complexity.

### What we use instead

**Vercel AI SDK v4 `streamText` + Bedrock/Claude + our existing tooling**

This is the cleanest fit:
- **Already in our stack** — we use Bedrock Claude for brief/email generation today
- **`streamText` with `stopWhen: stepCountIs(N)`** — native multi-step agent loop in TypeScript
- **Zod tool schemas** — type-safe tool definitions for each agent action
- **`onStepFinish` callback** — log each step to DB in real time
- **No new Python runtime, no new service, no new infra**

**For durable background execution (so the agent survives page refresh):**

**Trigger.dev** — the best-fit option for our stack in 2026:
- TypeScript-native, Next.js first-class integration
- Each agent step is a durable `step.run()` — retries automatically on failure
- `step.waitForEvent()` — pause for human approval (e.g. "approve proposal before sending email")
- Full observability dashboard out of the box
- Free tier: 50,000 runs/month — enough for our volume
- Can self-host on our existing server if needed later

**Alternative (simpler, no new dependency):**
Use our existing Supabase `workflow_events` table as the job queue — poll from the frontend. Less robust but zero new infrastructure.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    NEXT.JS APP                          │
│                                                         │
│  Company Page                                           │
│  ┌──────────────┐                                       │
│  │ "Run Agent"  │ → POST /api/agents/outreach           │
│  │    button    │                                       │
│  └──────────────┘                                       │
│         │                                               │
│         ▼                                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Agent Orchestrator                      │   │
│  │   /api/agents/outreach/route.ts                   │   │
│  │                                                   │   │
│  │  streamText(claude-sonnet-4) + tools:             │   │
│  │  ┌─────────┐ ┌────────┐ ┌──────────┐             │   │
│  │  │ enrich  │ │ scrape │ │ research │             │   │
│  │  └─────────┘ └────────┘ └──────────┘             │   │
│  │  ┌──────────┐ ┌───────┐ ┌──────────┐             │   │
│  │  │ proposal │ │ email │ │ send_crm │             │   │
│  │  └──────────┘ └───────┘ └──────────┘             │   │
│  │                                                   │   │
│  │  stopWhen: stepCountIs(10)                        │   │
│  │  onStepFinish → persist to workflow_events        │   │
│  └──────────────────────────────────────────────────┘   │
│         │                                               │
│         ▼                                               │
│  ┌───────────────────┐  ┌────────────┐                  │
│  │  Supabase DB      │  │  Pipedrive │                  │
│  │  workflow_events  │  │  Activity  │                  │
│  │  emails           │  │  Deal stage│                  │
│  │  proposals        │  └────────────┘                  │
│  └───────────────────┘                                  │
│         │                                               │
│         ▼                                               │
│  ┌───────────────────┐                                  │
│  │  Agent Progress   │  ← SSE stream to UI              │
│  │  UI Component     │  shows step-by-step live         │
│  └───────────────────┘                                  │
└─────────────────────────────────────────────────────────┘
```

---

## The 7 Agent Tools (Tool Definitions)

Each tool is a Zod-typed function Claude can call. The agent decides the order and whether to call them.

### Tool 1: `enrich_contacts`
```typescript
// Input: company domain
// Output: decision makers with emails, seniority, confidence
// Uses: Hunter.io (already live)
// Fallback: skip if no domain; agent proceeds with no contacts
```

### Tool 2: `scrape_company_intelligence`
```typescript
// Input: company name, domain, industry
// Output: active campaigns, social signals, competitor context, ad spend level
// Uses: Apify (already live) — SERP + website crawler
// Fallback: AI-only analysis with no live data
```

### Tool 3: `get_or_create_proposal`
```typescript
// Input: company_id
// Output: existing approved proposal OR trigger proposal generation
// Logic: if approved proposal exists → use it
//        if not → call existing /api/proposals/generate
// Uses: Supabase + existing Bedrock proposal generation
```

### Tool 4: `generate_execution_brief`
```typescript
// Input: proposal_id
// Output: brief with strategies, pricing, timeline
// Uses: existing /api/proposals/[id]/brief
// Only called if no brief exists on the proposal yet
```

### Tool 5: `generate_outreach_email`
```typescript
// Input: proposal_id, recipient_email, recipient_name, contact_context
// Output: email_id (draft created in DB)
// Uses: existing /api/emails/generate
// Personalises based on enriched contact data (position, department)
```

### Tool 6: `send_email_to_pipedrive`
```typescript
// Input: email_id
// Output: pipedrive_activity_id, status
// Uses: existing /api/emails/[id]/send (already logs to Pipedrive)
// Creates Activity in Pipedrive + marks email sent
```

### Tool 7: `update_pipeline_stage`
```typescript
// Input: company_id, proposal_id, new_stage
// Output: crm_sync confirmation
// Uses: existing /api/crm
// Moves deal to "Negociação" stage after email sent
```

---

## Human-in-the-Loop (HITL) Options

The agent can run in two modes — user's choice at trigger time:

### Mode A: Fully Automatic (default)
```
Enrich → Scrape → Research → Proposal → Email → Send → Done
```
No approvals. Everything runs end-to-end. Best for bulk outreach.

### Mode B: Supervised (recommended for demo)
```
Enrich → Scrape → Research → Proposal → [PAUSE: user reviews proposal]
     → Email draft created → [PAUSE: user reviews email] → Send
```
Agent pauses and shows what it generated. User clicks "Approve & Continue".
Uses `step.waitForEvent()` in Trigger.dev OR a simple polling mechanism with DB status flags.

---

## UI — Agent Progress Panel

New component: `<OutreachAgentPanel />` on the company page.

```
┌─────────────────────────────────────────────────────┐
│  🤖 Outreach Agent — Red Bull Brasil                │
│  Mode: [Supervised ▼]    [Run Agent]                │
├─────────────────────────────────────────────────────┤
│  ✅ Step 1: Enriched 8 decision makers (Hunter.io)  │
│  ✅ Step 2: Scraped campaigns + social signals      │
│  ✅ Step 3: Analysed company context (Bedrock)      │
│  ✅ Step 4: Proposal found — Red Bull × Coritiba    │
│  ⏳ Step 5: Generating personalised email...        │
│  ○  Step 6: Send to Pipedrive                       │
│  ○  Step 7: Update deal stage                       │
├─────────────────────────────────────────────────────┤
│  Recipient: dave.szych@redbull.com                  │
│  VP Partnerships · 92% confidence                   │
└─────────────────────────────────────────────────────┘
```

Steps stream in real time via SSE or polling. Each step shows result summary.

---

## File Structure (New Files)

```
frontend/
├── app/
│   └── api/
│       └── agents/
│           └── outreach/
│               └── route.ts          ← Main agent orchestrator
│           └── outreach/status/
│               └── route.ts          ← Poll agent run status
├── lib/
│   └── agents/
│       ├── tools.ts                  ← All 7 tool definitions (Zod schemas)
│       ├── orchestrator.ts           ← streamText agent loop
│       └── types.ts                  ← AgentRun, AgentStep, AgentStatus types
├── components/
│   └── agents/
│       └── outreach-agent-panel.tsx  ← UI component
└── app/
    └── companies/[id]/
        └── page.tsx                  ← Add OutreachAgentPanel here
```

**New DB table (Supabase migration):**
```sql
CREATE TABLE agent_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id),
  status        TEXT DEFAULT 'running', -- running | completed | failed | paused
  mode          TEXT DEFAULT 'supervised', -- auto | supervised
  steps         JSONB DEFAULT '[]',
  result        JSONB,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

---

## Dependencies

| Package | Purpose | Already installed? |
|---------|---------|-------------------|
| `ai` (Vercel AI SDK) | `streamText`, tool calling, step streaming | Likely yes — check |
| `@ai-sdk/amazon-bedrock` | Bedrock provider for AI SDK | Check |
| `zod` | Tool schema validation | ✅ Already in project |
| `trigger.dev` (optional) | Durable background execution | ❌ New |

**Minimum viable approach (no new packages):** Use existing `@aws-sdk/client-bedrock-runtime` + custom agent loop. Vercel AI SDK just makes it cleaner.

---

## Implementation Phases

### Phase 1 — Core Agent Loop (Day 1: 28 May)
- [ ] Create `agent_runs` DB table (migration)
- [ ] Build `lib/agents/tools.ts` — all 7 tool definitions
- [ ] Build `app/api/agents/outreach/route.ts` — orchestrator with `streamText`
- [ ] Test via curl: single company, auto mode, all 7 steps
- [ ] Persist each step result to `agent_runs.steps`

### Phase 2 — UI + Progress (Day 2: 29 May)
- [ ] Build `<OutreachAgentPanel />` component
- [ ] Wire to company page
- [ ] Polling-based live step updates (no SSE needed initially)
- [ ] Mode selector: Supervised / Auto
- [ ] Show recipient auto-selected (top decision maker by confidence)

### Phase 3 — Human-in-the-Loop (Day 3: 30 May)
- [ ] Supervised mode: pause after proposal + after email draft
- [ ] "Approve & Continue" button resumes agent
- [ ] Status flags in `agent_runs` table control pause/resume
- [ ] Test full supervised flow end-to-end

### Phase 4 — Hardening (After core works)
- [ ] Retry logic per step (3 attempts, exponential backoff)
- [ ] Error recovery: if step N fails, surface to user with "Retry Step N" option
- [ ] Rate limiting: 1 agent run per company per 24h
- [ ] Cost tracking: estimate tokens + Hunter credits used per run
- [ ] Optionally: migrate background execution to Trigger.dev for durability

---

## Estimated Cost Per Agent Run

| Step | Tool | Estimated Cost |
|------|------|---------------|
| Enrich contacts | Hunter.io | 1 search credit (free: 50/month) |
| Scrape intelligence | Apify | ~$0.005/run (SERP actor) |
| Research + proposal | Bedrock Claude Sonnet | ~$0.02–0.05 |
| Email draft | Bedrock Claude Sonnet | ~$0.01–0.02 |
| Pipedrive logging | Pipedrive API | Free |
| **Total per company** | — | **~$0.04–0.08** |

Running outreach on 100 companies = ~$4–8. Negligible.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Hunter.io 50 search/month limit exhausted | Medium | Upgrade to paid ($49/mo for 500) before bulk runs |
| Agent runs >30s (Next.js serverless timeout) | Medium | Use Trigger.dev for durable execution OR break into chained API calls |
| Bedrock rate limits on bulk runs | Low | Add 1s delay between tool calls; use exponential backoff |
| Email sent to wrong decision maker | Low | Supervised mode shows recipient before send; auto mode uses top confidence contact |
| Pipedrive duplicate activities | Low | Idempotency check: don't log if `pipedrive_activity_id` already exists on email |
| Agent loop runs forever | Low | `stopWhen: stepCountIs(10)` hard cap |

---

## Questions for James Before Building

1. **Default mode:** Should the first version be supervised (user reviews before send) or automatic? Recommend supervised for demo.
2. **Target contact:** If multiple decision makers found (e.g. Marketing Director + VP Partnerships), should the agent pick one automatically, or ask the user to choose?
3. **Existing proposal:** If the company already has an approved proposal, use it? Or always generate a fresh one?
4. **Bulk outreach:** Do you want a "Run Agent on 10 companies" bulk trigger, or always one at a time?
5. **Apollo:** If Apollo is confirmed, it replaces/supplements Hunter for contact discovery — changes Tool 1 slightly.

---

## Summary Recommendation

| Decision | Recommendation | Reason |
|----------|---------------|--------|
| Framework | None (custom agent loop) | We're TypeScript/Next.js — external Python frameworks add unnecessary complexity |
| LLM Orchestration | Vercel AI SDK `streamText` + Bedrock Claude | Already our LLM provider; cleanest TypeScript integration |
| Background execution | Start with long-running Next.js route (90s timeout) → upgrade to Trigger.dev when needed | Fastest to ship; Trigger.dev is the right long-term answer |
| HITL | Supervised mode default | Safer for demo; easy to switch to auto once trusted |
| Estimated build time | **3 days** (28–30 May) | Leverages all existing tools (Hunter, Apify, Bedrock, Pipedrive) |

**This is not a new platform — it's an orchestration layer connecting tools we already have.**

---

*See `28th_May.md` for today's full sprint plan. See `27th_May.md` for all features currently live.*
