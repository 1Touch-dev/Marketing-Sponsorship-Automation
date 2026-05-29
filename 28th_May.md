# Coritiba FC Platform — Sprint Plan (28 May 2026)
**Date:** 28 May 2026 | **By:** Abhishek  
**Branch:** `feature/apify-commercial-intelligence`  
**Platform URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Login:** `patrocinios@coritiba.com.br`

---

## What's Already Done (as of end of 27 May)

| Feature | Status |
|---------|--------|
| Pipedrive live — orgs, deals, stage changes, email activities | ✅ |
| Replicate LoRA — jersey mockup generation (5 scenes, chest placement) | ✅ |
| Full AI loop — brief → DALL-E → email → Pipedrive approve → sent | ✅ |
| Hunter.io contact enrichment — decision maker emails per company | ✅ |
| Security hardening — `getUser()`, audit UUID guard, `/api/health` public | ✅ |
| Platform health — 6 services all green (DB, Bedrock, OpenAI, Pipedrive, Replicate, Hunter) | ✅ |
| E2E test — 41/49 groups pass, 0 fail | ✅ |

---

## Today's To-Do List (28 May)

### 🔴 P1 — Agents Sprint ✅ DONE (28 May) — Updated per James (29 May)

**James requirements:** (1) agents must request approval, (2) individual personalized proposals per company.

**29 May update:**
- `generate_personalized_proposal` replaces reuse/auto-approve — fresh Bedrock proposal per company using Hunter+Apollo+Apify intelligence
- **Dual approval:** proposal review → `POST /approve-proposal` → email draft → `POST /approve` → Pipedrive send
- Auto mode removed — always supervised
- New: `lib/proposals/generate-for-company.ts`, `lib/agents/resume.ts`, `approve-proposal` route

**Goal:** One-click outreach loop — select a company → everything happens automatically.

**Delivered:**

**New files (all on `feature/agents-sprint` branch):**
| File | Purpose |
|------|---------|
| `frontend/lib/agents/types.ts` | AgentRun, AgentStep, SSEEvent TypeScript types |
| `frontend/lib/agents/tool-definitions.ts` | 5 tool JSON Schema defs for ConverseCommand |
| `frontend/lib/agents/tools.ts` | Tool implementations (Hunter, Apify, Supabase, Bedrock, Pipedrive) |
| `frontend/lib/agents/orchestrator.ts` | ConverseCommand multi-turn loop + SSE emitter |
| `frontend/app/api/agents/outreach/route.ts` | POST — start agent run, returns SSE stream |
| `frontend/app/api/agents/outreach/[runId]/route.ts` | GET status / DELETE cancel |
| `frontend/app/api/agents/outreach/[runId]/approve/route.ts` | POST — approve email in supervised mode |
| `frontend/components/agents/outreach-agent-panel.tsx` | Full UI panel with live step progress |
| `frontend/lib/bedrock/client.ts` | Extended with `converseWithTools()` (ConverseCommand wrapper) |
| `frontend/app/companies/[id]/page.tsx` | OutreachAgentPanel wired in at top of company page |

**Technology used:**
- **ConverseCommand** (AWS Bedrock SDK) — Claude's native tool-use API, no new packages needed
- **SSE ReadableStream** — zero-polling live step updates to browser
- **`agent_runs` Supabase table** — full run audit trail (you already ran the migration)

**Live test results (28 May, Red Bull Brasil, Supervised mode):**
| Step | Result |
|------|--------|
| enrich_contacts | ✅ 8 decision makers, 10 contacts (Hunter.io) |
| scrape_company_intelligence | ✅ LinkedIn found, social score 2.6/10, ads: unknown |
| get_or_create_proposal | ✅ Reused existing proposal "Red Bull Brasil × Coritiba FC" |
| generate_outreach_email | ✅ Draft: "Red Bull Brasil × Coritiba FC: Uma Parceria…" |
| Supervised mode pause | ✅ Email preview shown with "Approve & Send" |
| send_email (after approval) | ✅ Pipedrive activity **#1574** created |

**Modes available:**
- **Supervised** (default) — agent pauses after email draft for user approval
- **Auto** — all 5 steps run without interruption

**Est:** ~~2–3 days~~ **Done in 1 day**

---

### 🔴 P2 — Jersey Placement Selector (James confirmed)

**Goal:** Let user pick sponsor placement location — not just chest.

**Placements requested by James:** Chest / Left Sleeve / Right Sleeve / Shorts / Socks / Back

**Tasks:**
- [ ] Add placement dropdown/selector to `<ReplicateJerseyGenerator>` component
- [ ] Update `buildPrompt()` to inject placement into the scene prompt
- [ ] Blocked on kit photos (shorts, socks) from James — jersey placement only for now
- [ ] Once James sends images: retrain LoRA with full kit, then unlock all placements

**What can be done today without images:**
- [ ] Build the placement selector UI (all 6 options visible)
- [ ] Wire chest/sleeve/back into existing prompts (jersey photos cover these already)
- [ ] Show "Coming soon" state for shorts/socks until retraining is done

**Est:** 0.5 day

---

### 🔴 P3 — Intern Full E2E Test

**Goal:** Intern runs `INTERN_TEST_PLAN.md` v2.0 golden path end-to-end (not us).

**Remaining items for intern:**
- [ ] T-08 Create new company (Test Intern SA) → archive after
- [ ] T-09 AI intelligence on new company
- [ ] T-11/T-12 Generate single + bulk campaigns
- [ ] T-13/T-14 Full proposal wizard → approval flow
- [ ] T-25 Jersey mockup grid — confirm images visible after refresh
- [ ] T-34 Monthly report generate for Heineken
- [ ] T-03 Logout + protected route redirect in Incognito
- [ ] T-06 Mobile layout (375px DevTools)
- [ ] T-49 Golden path — run full James demo script in one sitting

**Action:** Assign intern today, share `INTERN_TEST_PLAN.md` + login credentials.

---

### ✅ P4 — Apollo.io Integration (DONE)

**Approach:** Hunter for fast email discovery + Apollo for deeper company intelligence (complementary, not either/or).

**Implemented:**
- `frontend/lib/intelligence/apollo.ts` — org enrich, people search (paid), health check
- `POST /api/intelligence/enrich` — runs Hunter + Apollo + Apify in parallel
- Contacts tab UI — Apollo org card (employees, marketing team size, dept headcount, funding, revenue)
- Outreach Agent `enrich_contacts` tool — Hunter + Apollo combined
- `/api/system/health` — `apollo` service status

**Free plan note:** Org enrich works (tested Red Bull: 22k employees, ~4.5k marketing). People search / email reveal require Apollo Basic+ — graceful fallback with UI message.

**Env:** `APOLLO_API_KEY` in `.env` + `frontend/.env.local` (not committed).

---

### 🟢 P5 — Apify Enrichment Improvements ✅ DONE

LinkedIn scraper returned `social_score: 0` yesterday — root cause was `voyager/linkedin-company-scraper` actor requiring a paid Apify plan.

**Fix implemented (28 May):**
- ~~`voyager/linkedin-company-scraper`~~ → replaced with **`automation-lab/linkedin-company-scraper`** (~$0.003/company, no login, works on Apify free tier)
- Added **SERP-based LinkedIn URL discovery** (`findLinkedInUrl`) — searches Google `company site:linkedin.com/company` to auto-find any company's LinkedIn URL, no prior knowledge needed
- Social score is now **≥ 2.5** for any company with a findable LinkedIn URL (was `0` before due to actor failure)
- Retained full SERP-based ad signal detection, social presence scoring (0–10), and scrapeData integration
- UI updated: LinkedIn section now shows **specialties badges** + **"View on LinkedIn" link**
- TypeScript compile: ✅ zero errors

**Live test results (28 May):**
| Test | Result |
|------|--------|
| Red Bull Brasil LinkedIn | ✅ Name, Industry, Description, 31k employees |
| Sicredi LinkedIn | ✅ Name + Industry (actor returned partial data, gracefully handled) |
| Hunter.io (redbull.com) | ✅ 5 contacts, decision makers with 93-94% confidence |
| Social score | ✅ ≥ 2.5 (was 0) |

**Est:** ~~2–3h~~ **Done in ~1.5h**

---

### 🟢 P6 — Minor / Housekeeping ✅ IN PROGRESS

| Task | Status |
|------|--------|
| Commit all 27 + 28 May changes to git + push | ✅ Done (see below) |
| Update `E2E_INTERN_TEST_RESULTS.md` summary counts after intern run | ⏳ After intern test |
| Remove Apollo from pending tasks if James confirms not needed | ⏳ Waiting on James |
| News/articles section on public landing page | Low priority — 3–4h |
| Asana integration (tasks from execution brief) | Low priority — 1 day |

---

## Blocked — Waiting on James

| Item | What's Needed | Impact |
|------|--------------|--------|
| Kit photos (shorts, socks, sleeve) | James to email photos | Can't unlock full kit placements or retrain LoRA |
| Apollo decision | James to confirm yes/no | Determines if Apollo integration is built |

---

## Priority Order for Today

```
1. Start Agents sprint (outreach loop architecture + first route)
2. Build jersey placement selector UI (chest/sleeve/back — no retraining needed)
3. Assign intern E2E test
4. Fix LinkedIn social scraper actor
5. Git commit + push all 27 May work
6. Chase James on Apollo + kit photos
```

---

## Platform Health (start of 28 May)

All 6 services healthy. No failed workflows. 511 active companies. 48 Hunter searches remaining (free plan, resets 27 Jun).

---

## References

- `27th_May.md` — full log of everything done yesterday
- `INTERN_TEST_PLAN.md` v2.0 — intern checklist
- `E2E_INTERN_TEST_RESULTS.md` — current test results (41 pass / 5 partial / 0 fail)
