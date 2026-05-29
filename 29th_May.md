# Coritiba FC Platform — Sprint Report (29 May 2026)

**Date:** 29 May 2026 | **By:** Abhishek  
**Active branch:** `feature/agents-sprint`  
**Platform URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Login:** `patrocinios@coritiba.com.br` / (see team for password)

**Server:** AWS EC2 — app runs 24/7 via PM2 + systemd (survives laptop/Cursor closed)

---

## Executive Summary

29 May focused on **James's agent requirements** (dual human approval + personalized proposals per company), **Apollo.io integration**, **production hardening** (PM2 persistence, health verified), and **intern test readiness**. The outreach agent no longer reuses or auto-approves old proposals; every run generates a fresh company-specific deck before email outreach.

---

## ✅ Done Today (29 May)

### 1. Outreach Agent — James requirements (dual approval + personalized proposals)

| Requirement | Implementation |
|-------------|----------------|
| Agents must request approval | **Two gates:** (1) approve proposal, (2) approve email before Pipedrive |
| Individual personalized proposals | **`generate_personalized_proposal`** — new Bedrock proposal per company using Hunter + Apollo + Apify intelligence |

**Flow:**
```
enrich_contacts → scrape_company_intelligence → generate_personalized_proposal
  ⏸ paused_for_proposal_approval → POST /approve-proposal
  → generate_outreach_email
  ⏸ paused_for_approval → POST /approve → send_email (Pipedrive org+deal linked)
```

**Key files:**
| File | Purpose |
|------|---------|
| `frontend/lib/proposals/generate-for-company.ts` | AI proposal generation from `full_intelligence` |
| `frontend/lib/agents/resume.ts` | Resume agent after proposal approval |
| `frontend/app/api/agents/outreach/[runId]/approve-proposal/route.ts` | Proposal approval endpoint |
| `frontend/lib/agents/orchestrator.ts` | Phase-1 only (3 tools); pauses after proposal |
| `frontend/components/agents/outreach-agent-panel.tsx` | Blue = proposal review, Amber = email review |

**Removed:** Auto mode (always supervised). Removed `get_or_create_proposal` auto-approve behavior.

**Commits:** `afdaa5d`, `a2c88e0`

---

### 2. Apollo.io integration (completed 28–29 May)

- `frontend/lib/intelligence/apollo.ts` — org enrich, health check, people search with free-tier fallback
- Enrich API runs Hunter + Apollo + Apify in parallel
- Contacts tab shows Apollo org intelligence (employees, marketing team size, dept headcount, revenue)
- Agent `enrich_contacts` uses Hunter + Apollo together

**Free tier:** Organization enrich works (e.g. Red Bull ~22k employees, ~4.5k marketing). People search API requires Apollo Basic+ (~$49/mo) — UI shows note when unavailable.

**Commit:** `6c935f9`

---

### 3. Production persistence (24/7 uptime)

| Component | Status |
|-----------|--------|
| PM2 `sponsorship-platform` | ✅ `npm start` on port 3000 |
| PM2 `ngrok-tunnel` | ✅ Fixed domain `eligibly-facing-unloved.ngrok-free.dev` |
| systemd `pm2-ubuntu` | ✅ **enabled** — auto-starts on server reboot |
| `pm2 save` | ✅ Process list frozen |

Closing Cursor or a developer laptop does **not** stop the platform — it runs on AWS.

---

### 4. Documentation & intern readiness

| Document | Update |
|----------|--------|
| `README.md` | Dual-approval agent flow, Apollo, stack |
| `INTERN_TEST_PLAN.md` | **T-50** Outreach Agent (7 steps) |
| `28th_May.md` | Cross-ref to 29 May; historical 28 May log |
| `29th_May.md` | This file |

---

### 5. Pipedrive agent fix (28 May, on branch)

Agent emails now create/link **Organization + Deal** before logging activity (no floating activities).

**Commit:** `c41fec3`

---

## ✅ Done Earlier This Sprint (28 May, on `feature/agents-sprint`)

| Item | Status |
|------|--------|
| Agents Sprint v1 — ConverseCommand + SSE + `agent_runs` table | ✅ |
| P5 LinkedIn scraper fix (`automation-lab/linkedin-company-scraper`) | ✅ |
| P6 Git commit + push | ✅ |
| Hunter.io enrichment | ✅ |
| Supabase `agent_runs` migration | ✅ (manual, confirmed) |

See `28th_May.md` and `27th_May.md` for full detail.

---

## ⏳ Yet To Do

### High priority

| # | Task | Owner | Blocker |
|---|------|-------|---------|
| P2 | Jersey placement selector UI (6 placements) | Dev | Kit photos from James for shorts/socks LoRA retrain |
| P3 | Intern full E2E — `INTERN_TEST_PLAN.md` (50 groups incl. T-50) | Intern | Assignment + credentials |
| — | Merge `feature/agents-sprint` → main after James sign-off | Dev | Demo approval |

### Medium priority

| # | Task | Notes |
|---|------|-------|
| — | Apollo Basic plan | If James wants API people search (CMO, directors) on top of Hunter |
| — | Jersey LoRA retrain | After James sends shorts/socks/sleeve kit images |
| — | Bulk outreach agent | Loop single-company agent over a list (future) |

### Low priority

| # | Task |
|---|------|
| — | News/articles on public landing page |
| — | Asana integration from execution brief |
| — | `E2E_INTERN_TEST_RESULTS.md` refresh after intern run |

---

## Blocked — Waiting on James

| Item | What's needed | Impact |
|------|---------------|--------|
| **Kit photos** | Shorts, socks, extra sleeve angles, stadium/activation inventory | Full jersey placement selector + LoRA retrain |
| **Apollo paid tier** | Confirm if ~$49/mo Basic is approved | Unlocks decision-maker people search via API |
| **Agent sign-off** | Try outreach agent on 1–2 real prospects | Before merge to production branch |

---

## Platform Health (29 May 2026, ~10:00 UTC)

Verified live at `GET /api/system/health`:

| Service | Status |
|---------|--------|
| Database | ✅ healthy (~47ms latency) |
| Bedrock AI | ✅ configured |
| OpenAI | ✅ configured |
| Pipedrive | ✅ configured |
| Replicate (LoRA) | ✅ configured |
| Hunter.io | ✅ configured |
| Apollo.io | ✅ configured |

**Platform stats:** 511 companies · 62 proposals (61 active) · 74 campaigns

**Public checks (no login):**
- `GET /api/health` → `{ "status": "ok" }`
- `GET /api/system/health` → `healthy`

---

## Git / Branch Status

```
Branch: feature/agents-sprint
Remote: origin/feature/agents-sprint (pushed)

Recent commits:
  a2c88e0  intern test plan T-50
  afdaa5d  personalized proposals + dual approval
  6c935f9  Apollo.io integration
  c41fec3  Pipedrive org+deal linking for agent
  fb078a6  Outreach Agent Sprint v1
```

---

## How to Test (James / Intern)

1. Open https://eligibly-facing-unloved.ngrok-free.dev and log in
2. Go to any company with a website (e.g. **Red Bull Brasil**)
3. Optional: click **Enrich Contacts** first (Hunter + Apollo + LinkedIn)
4. Click **Run Agent** on the Outreach Agent panel
5. Wait 1–3 min → **Approve Proposal** (review linked proposal page)
6. Wait ~30s → **Approve & Send** email
7. Confirm Pipedrive activity on the company org/deal

Full checklist: `INTERN_TEST_PLAN.md` → **T-50**

---

## References

| Doc | Purpose |
|-----|---------|
| `27th_May.md` | 27 May sprint log |
| `28th_May.md` | 28 May plan + P5/P6/P1 initial delivery |
| `AGENTS_SPRINT_IMPL.md` | Agent architecture & definition of done |
| `INTERN_TEST_PLAN.md` | Intern E2E (v2.0 + T-50) |
| `README.md` | Setup, env vars, outreach agent overview |

---

## Ops Runbook (if site down)

```bash
# On AWS server
pm2 list
pm2 restart sponsorship-platform ngrok-tunnel
pm2 save

# Health
curl -s http://localhost:3000/api/system/health | jq .status
curl -s http://localhost:4040/api/tunnels   # ngrok URL
```

Ngrok domain is pinned: `--domain=eligibly-facing-unloved.ngrok-free.dev`
