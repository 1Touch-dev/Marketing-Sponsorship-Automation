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

### 🔴 P1 — Agents Sprint (James's top priority)

**Goal:** One-click outreach loop — select a company → everything happens automatically.

```
Company selected
  → Hunter enriches decision maker emails
  → Apify scrapes active campaigns / social signals
  → Bedrock generates tailored proposal + email
  → Email auto-sent to decision maker
  → Pipedrive deal created + activity logged
  → Audit trail recorded
```

**Tasks:**
- [ ] Design agent architecture (route + orchestrator)
- [ ] Build `POST /api/agents/outreach` — single endpoint that runs the full loop
- [ ] Wire into company page: "Run Outreach Agent" button
- [ ] Handle partial failures gracefully (enrich fails → still generate proposal)
- [ ] Show progress steps in UI (streaming or polling)

**Est:** 2–3 days (start today, finish 30 May)

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

### 🟡 P4 — Apollo vs Hunter Decision (Pending James reply)

**Context:** James asked for founders/directors/org chart data. Hunter gives emails only. Apollo gives full company intelligence.

**Waiting for:** James to confirm if Apollo is needed on top of Hunter.

**If yes:** Integrate Apollo API (1 day)  
**If no:** Hunter is sufficient, skip Apollo entirely.

**Action:** Chase James for reply to message sent this morning.

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
