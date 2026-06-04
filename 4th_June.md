# Coritiba FC Platform — Sprint Plan (4 June 2026)

**Date:** 4 June 2026 | **By:** Abhishek  
**Goal:** Consolidate completed work (28 May → 3 June), carry forward all open items, and plan **4 June** sprint (enrichment-first + inventory foundations).  
**Status:** 📋 **PLANNING ONLY** — no application code changes on this branch yet  

**Platform:** https://eligibly-facing-unloved.ngrok-free.dev  
**Parent branch:** `feature/bug-fixes-3june` (latest shipped fixes)  
**Planning branch:** `feature/4th-june-planning`  

**Sources:** `28th_May.md` · `29th_May.md` · `1st_June.md` · `2nd_June.md` · `3rd_June.md` · James WhatsApp (3 June evening — enrichment) · `Coritiba_Platform_Issues_Report_EN.pdf`

---

## Executive Summary

The platform has moved from **audit bug-fixes** (2 June) through a **major 3 June regression + UX sprint** (bulk campaigns, proposal-centric images, landing, CRM sync, mockup editor). Production runs **24/7 on AWS EC2** via PM2 + ngrok; latest application commits are on `feature/bug-fixes-3june` (`9b43772`).

**4 June focus (proposed):**

1. **P1 — Company enrichment overhaul** (James evening requirements): domain-independent pipeline, domain change re-enrichment, CRM-contact-driven discovery, fallback chain, future domain confidence tracking.  
2. **P2 — Carry forward deferred product** from 3 June: inventory picker, campaign ↔ inventory, activation briefs, pricing models, team senders, templates.  
3. **P3 — Newsletter, bilingual admin**, and other long-horizon items.

Nothing from **3 June deferred list** is dropped — see [Pending / Deferred From 3 June](#pending--deferred-from-3-june).

---

## Git / Branch Status

| Item | Status |
|------|--------|
| **Latest shipped branch** | `feature/bug-fixes-3june` |
| **Latest pushed commit** | `9b43772` — *Fix Pipedrive CRM sync to run server-side without auth failures.* |
| **Local vs `origin/feature/bug-fixes-3june`** | ✅ Up to date (no unpushed commits on that branch at branch point) |
| **Working tree on planning branch** | ⚠️ **Not clean** — see [Blocked / Pre-flight](#blocked--pre-flight) |
| **This document branch** | `feature/4th-june-planning` (planning only) |

### Blocked / Pre-flight

**Before any 4 June implementation**, resolve uncommitted work on the dev machine (left on `feature/bug-fixes-3june` when branching):

| File | Type | Notes |
|------|------|-------|
| `3rd_June.md` | Modified | End-of-day doc updates (24/7 ops, deploy notes) — not yet committed |
| `ecosystem.config.cjs` | Modified | PM2 `npm start` args cleanup |
| `package.json` | Modified | Added `npm run deploy` script |
| `scripts/deploy-latest.sh` | Untracked | Build + PM2 restart helper |

**Action:** Commit or stash these on `feature/bug-fixes-3june` (or merge into planning branch) before coding — **do not lose deploy/ops helpers**.

---

## Completed Work (28 May → 3 June)

Consolidated summary of major delivered capabilities. Details live in per-day sprint docs.

### 28 May — Agents sprint foundation

| Area | Delivered |
|------|-----------|
| **Outreach Agent v1** | ConverseCommand + SSE + supervised tool loop |
| **Agent tools** | Enrich, scrape, proposal, email (initial set) |
| **Jersey / media backlog** | Sprint planning; LoRA + Replicate path documented |
| **Branch** | `feature/agents-sprint` |

*Reference:* `28th_May.md`, `AGENTS_SPRINT_IMPL.md`

---

### 29 May — Outreach hardening + Apollo + 24/7 ops

| Area | Delivered |
|------|-----------|
| **Dual approval** | Proposal gate → email gate → Pipedrive send (no auto-approve) |
| **Personalized proposals** | `generate-for-company.ts` — new proposal per company from intelligence |
| **Apollo.io** | Org enrich, parallel with Hunter + Apify on enrich API |
| **Hunter.io** | Contact discovery (domain-dependent today) |
| **Apify** | Company intelligence scrape in enrich pipeline |
| **PM2 + systemd** | `sponsorship-platform` + `ngrok-tunnel`; survives laptop close |
| **Auto mode removed** | Supervised / dual-approval only |

*Reference:* `29th_May.md`

---

### 1 June — Visual layer + landing + bulk images

| Area | Delivered |
|------|-----------|
| **Official jersey mockups** | Sharp composite on real kit; crest fixed; sponsor on opposite chest |
| **Proposal graphics** | Generate → select → link to strategy / campaign / inventory |
| **Landing visuals** | `ProposalLandingVisuals`; removed prompt cards from public view |
| **Bulk image approve** | `/proposals/bulk-approve` + API + sidebar |
| **Migration 0020** | Image job metadata (strategy, placement, inventory labels) |
| **KPI templates** | Less generic sponsor-facing blocks |

*Reference:* `1st_June.md`

---

### 2 June — PDF audit bug-fixes

| Area | Delivered |
|------|-----------|
| **Bulk campaigns** | PT industry chips + company search |
| **Approvals** | Proposals + campaigns + emails sections |
| **Edit proposal** | `/proposals/{id}/edit` |
| **Save contacts** | Hunter results persist |
| **Add competitor to DB** | POST company from competitor UI |
| **Campaign company search** | Searchable dropdown |
| **CRM sync** | Pipedrive queue; 35+ synced (James verified) |
| **Partial** | Prompt before generate (jersey); team sender DB; full image library |

*Reference:* `2nd_June.md`

---

### 3 June — Regressions, UX, CRM (shipped on `feature/bug-fixes-3june`)

#### Phase 1 — Bugs & regressions ✅

| ID | Area |
|----|------|
| J3-30 / J3-31 / J3-34 | Bulk campaigns: industry chips match DB; multi-select; E2E generate |
| J3-20 / J3-21 / J3-22 | Enrich button always visible; partial enrich without website; search + industry filter |
| J3-10 / J3-04 | Mockups working; proposal completeness indicator; concise AI prompts |
| BUG-01, 04, 11, 12, 14 | Edit route, approvals, contacts, competitor, campaign search |

#### Phase 2 — Image & proposal workflow ✅

| ID | Area |
|----|------|
| J3-11–J3-16 | Graphics on proposal detail/edit; prompt preview; image gallery; media-gen proposal links; bulk approve + reset stuck |
| J3-08 | Images linked to campaign / strategy |

#### Phase 3 — Landing, bulk outreach, email ✅

| ID | Area |
|----|------|
| J3-01–J3-03 | Landing redesign; organized proposal UI; concise content |
| J3-32 / J3-33 | Tinder-style approvals; email preview + Pipedrive send |
| J3-23 / J3-62 | Inline industry edit; proposal images in email HTML |

#### Phase 4 — MVP / partial ✅

| ID | Area |
|----|------|
| J3-05 / J3-06 | Pricing tiers (Apoiador / Master / Diamante) on landing |
| J3-07, J3-40–55, FR-02, FR-07/10 | **Deferred** — see below |

#### Session 2 fixes (same branch) ✅

| Area | Delivered |
|------|-----------|
| **Bulk approve status** | `Aguardando aprovação` until `approved_at`; correct queue filter |
| **Mockup editor** | Same-origin demo logos; image proxy; mobile UX |
| **CRM / Pipedrive** | `enqueueCrmSync()` — auto sync on company create, proposal generate, approve; Fogo verified (org #384, deal #980) |
| **24/7 deploy** | `npm run deploy`; PM2 documented in `3rd_June.md` |

*Reference:* `3rd_June.md`

---

### Cross-cutting capabilities now in production

| Capability | Status |
|------------|--------|
| Outreach Agent (only agent in UI) | ✅ Dual approval + personalized proposal |
| Apollo + Hunter + Apify enrich | ✅ Parallel; **website often required today** |
| Proposal workflow | ✅ Generate, edit, approve, landing, share |
| CRM / Pipedrive | ✅ Patrocínios pipeline; org + deal + notes |
| Landing page | ✅ Redesigned sponsor view |
| Mockup workflow | ✅ Proposal pages + mockup editor + jersey composite |
| Bulk campaigns | ✅ Industry + multi-company |
| Approval workflow | ✅ List + tinder cards |
| Contacts saving | ✅ Hunter enrich → save |
| Company enrichment (UI) | ✅ Always-visible enrich; partial without website |
| Jersey mockups | ✅ Official composite |
| Image management | ✅ Gallery, bulk approve, campaign link |
| Image generation | ✅ Campaign + jersey paths; prompt confirm |

---

## Pending / Deferred From 3 June

**Every unresolved item from `3rd_June.md` is listed here** so nothing is lost.

### Inventory & campaigns (J3-07, J3-40–J3-55)

| ID | Item | Notes from 3 June |
|----|------|-------------------|
| **J3-07** | Full **inventory menu** picker — browse all inventory, filter by price/match | Requires seeded inventory DB (multi-day) |
| **J3-40** | Campaigns must **use inventory** items | Builder picks inventory lines; stored on campaign |
| **J3-41** | **Activation brief** — resources required per campaign | Brief: player hours, videographer, edit, etc. |
| **J3-50** | **Physical inventory**: price by **match** + **expected viewers** | Fixture/audience-based pricing |
| **J3-51** | Physical **screens**: frequency (1 match / multi / season) | Exposure count, duration, match linkage |
| **J3-52** | **Digital inventory**: multiple lines + time quantities | Resource, hours, platform per line |
| **J3-53** | Digital **frequency**: weekly, monthly, per game, one-off | Enum + pricing period |
| **J3-54** | **Resource requirements** model | Linked to inventory, campaign, proposal |
| **J3-55** | Resource graph | Digital asset → social → campaign → proposal |

### Packages (partially done)

| ID | Item | Status |
|----|------|--------|
| **J3-05** | Gold / Silver / Diamond packages | ✅ MVP tiers on landing — **full picker + edit UX still open** |
| **J3-06** | Proposal option menu (switch tier A/B/C) | Partial — needs inventory-backed packages |

### Email & team (J3-60–J3-63)

| ID | Item | Notes |
|----|------|-------|
| **J3-60** / **FR-02** | **Team sender database** (5–10 people); replace `[Nome]` in emails | Stretch on 3 June |
| **J3-61** / **FR-03** | **Email / proposal templates** + placeholders | Not started |
| **J3-63** / **FR-07** | **Newsletter** by segment | Phase 2 — defer |
| **FR-10** | **Bilingual admin** | Defer |

### Other carryover from 2 June / PDF

| Ref | Item |
|-----|------|
| **FR-01** | Bulk personalized proposals + per-contact email queue (partially addressed by bulk + agent) |
| **FR-06** | Full **enrichment automation** — **superseded by 4 June enrichment section** |
| **FR-09** | Competitor → create proposal shortcut |
| **Video demo** | Landing video for James |
| **Gmail OAuth** | Token expired — reply sync only; banner on settings |
| **Apollo Basic+** | People search API — org enrich works on free tier |

### 3 June items explicitly deferred (Phase 4 table)

| ID | Item |
|----|------|
| J3-07 | Full inventory picker modal |
| J3-40/41 | Campaign builder ↔ inventory + activation brief |
| J3-50–55 | Physical/digital pricing matrix + resource engine |
| FR-02 | Full `team_members` DB |
| FR-07/10 | Newsletter, bilingual |

---

## Company Enrichment Flow Improvements

**Source:** James — 3 June evening requirements.  
**Problem today:** Enrichment is **over-dependent** on `companies.website` being present and correct. Many companies lack websites; some URLs are wrong or stale.

---

### Requirement 1 — Domain-independent enrichment

**Current issue:**

- Some companies do not have websites.
- Some websites may be incorrect.
- Some websites may change.

**New desired flow:**

```
Company Name
  → Apollo lookup
  → Find contacts
  → Find email addresses
  → Extract domain from email
  → Run enrichment pipeline
```

**Enrichment pipeline should then perform:**

- Apollo organization enrichment
- Hunter enrichment
- Website discovery
- LinkedIn discovery
- Apify scraping
- Intelligence generation (Bedrock / `full_intelligence`)

The platform should **no longer depend solely** on a website already existing in the company record.

**Acceptance (4 June):**

- Enrich succeeds for company with **name only** when Apollo/Hunter return contacts with corporate emails.
- Discovered domain written back to company (or `full_intelligence`) before Hunter/Apify run.

---

### Requirement 2 — Re-run intelligence when domain changes

**Triggers:**

- Website updated **manually** (inline edit or company form).
- Enrichment discovers a **better** website than stored.
- Domain extracted from **contacts** differs from stored website.

**Expected behavior:**

- Refresh company intelligence.
- Re-run enrichment pipeline (idempotent, debounced).
- Update company profile data and `full_intelligence`.

The company should always use the **best available domain**.

**Acceptance:**

- Changing website on company detail triggers re-enrich (or queued job) with visible status.
- Conflicting domains resolved by policy (see Requirement 4).

---

### Requirement 3 — CRM contact driven enrichment

**Scenario:** Lead/contact already exists in CRM (Pipedrive or platform contacts), e.g. `john@company.com`.

**Expected behavior:**

- Extract **company domain** from email (`company.com`).
- Identify or **create/link** company record.
- Run enrichment **automatically** even when company record is incomplete (no website, sparse fields).

**Acceptance:**

- Import or sync of CRM contact with email → company enriched without manual website entry.
- Outreach agent / enrich API can start from contact email domain.

---

### Requirement 4 — Domain confidence and source tracking

**Future enhancement (document now, implement when schema ready):**

Store per company:

| Field | Example |
|-------|---------|
| `domain` | `company.com.br` |
| `domain_source` | `manual` \| `apollo` \| `hunter` \| `crm_contact` \| `website_scrape` \| `email_inference` |
| `domain_confidence` | 0.0–1.0 (optional score) |
| `domain_candidates` | JSON array of `{ domain, source, seen_at }` |

Enables better decisions when multiple domains are discovered (subsidiary vs parent, `.com` vs `.com.br`).

---

### Requirement 5 — Fallback enrichment strategy

**Desired fallback order** (try next before failing):

1. **Existing website** (if present and valid)
2. **Apollo company lookup** (by name + country)
3. **CRM contact email domain** (from Pipedrive / saved contacts)
4. **Hunter discovery** (domain finder / company name)
5. **Website discovery search** (Serp / logo.dev / manual heuristics)
6. **Manual user entry** (UI prompt when all automated sources fail)

**Acceptance:**

- Enrich API returns structured result: which step supplied domain, which steps ran, which failed (for CRM Sync–style audit UI optional).

---

### Technical notes (planning — no code yet)

| Touchpoint | Likely change |
|------------|----------------|
| `frontend/app/api/intelligence/enrich/route.ts` | Orchestrate fallback chain |
| `frontend/lib/intelligence/apollo.ts` | Name-first org search |
| `frontend/lib/intelligence/hunter.ts` | Domain discovery + contacts without pre-filled domain |
| `frontend/app/companies/[id]/` | Show domain source; re-enrich on website change |
| `frontend/lib/agents/tools.ts` | `enrich_contacts` uses new pipeline |
| DB migration | `domain_source`, `domain_confidence`, `domain_updated_at` (optional) |
| Pipedrive | Contact → company linking on sync |

---

## Suggested Next Sprint Priorities

### P1 — Must ship (4 June)

| # | Item | Maps to |
|---|------|---------|
| 1 | **Domain-independent enrichment** (Req 1 + 5) | James evening |
| 2 | **Domain change detection + re-enrich** (Req 2) | James evening |
| 3 | **CRM contact → domain → enrich** (Req 3) | James evening |
| 4 | **Domain source/confidence schema** (Req 4 — MVP fields) | James evening |
| 5 | Remaining **proposal workflow gaps** (if any found in QA) | J3-06 full tier switch, FR-09 |
| 6 | Commit **uncommitted ops/doc** on `bug-fixes-3june` | Pre-flight |

### P2 — Should ship (4–5 June)

| # | Item | Maps to |
|---|------|---------|
| 1 | **Inventory system foundations** — seed DB + basic picker | J3-07 |
| 2 | **Campaign ↔ inventory** + **activation brief** MVP | J3-40, J3-41 |
| 3 | **Team sender profiles** | J3-60, FR-02 |
| 4 | **Email templates** + placeholders | J3-61, FR-03 |
| 5 | Physical/digital pricing **schema stub** | J3-50–53 (not full matrix) |

### P3 — Later

| # | Item | Maps to |
|---|------|---------|
| 1 | **Newsletter** by segment | J3-63, FR-07 |
| 2 | **Bilingual admin** | FR-10 |
| 3 | Full **physical/digital pricing matrix** | J3-50–55 complete |
| 4 | **Resource requirements engine** | J3-54, J3-55 |
| 5 | Landing **video demo** | Ops |
| 6 | **Apollo Basic+** people search | Commercial |

---

## Priority Order for 4 June (execution sequence)

### Wave 1 — Enrichment (James blocker)

1. Design domain resolution module + fallback chain (Req 1, 5)  
2. Implement email-domain extraction from Apollo/Hunter contacts  
3. Wire re-enrich on website change (Req 2)  
4. CRM contact email → company enrich entry point (Req 3)  
5. Add `domain_source` (and optional confidence) to company model (Req 4)  
6. E2E: name-only company, wrong website, CRM email, domain change  

### Wave 2 — Stabilization

7. Resolve uncommitted `bug-fixes-3june` ops files (deploy script, `3rd_June.md`)  
8. Regression pass: bulk, CRM sync, outreach agent, mockup editor  

### Wave 3 — Inventory foundations (if Wave 1 complete)

9. Seed inventory items + minimal picker (J3-07)  
10. Campaign inventory selection + brief stub (J3-40, J3-41)  

### Wave 4 — Comms

11. Team senders + templates (J3-60, J3-61)  

---

## Blocked Items

| Item | Blocker | Owner action |
|------|---------|--------------|
| Uncommitted local files on `bug-fixes-3june` | Doc/ops not committed | Stash or commit before merge |
| Apollo people search | Basic+ plan | James / budget |
| Gmail reply sync | OAuth token expired | Reconnect in settings |
| Full inventory pricing | Schema + business rules | James sign-off on match/frequency model |
| ngrok URL | Fixed dev domain | Do not change without updating ecosystem + James |

---

## Success Criteria — End of 4 June

**Minimum:**

- Enrich works without pre-existing website for ≥3 test companies (name + Apollo/Hunter path).  
- Website change triggers re-enrichment with updated `full_intelligence`.  
- CRM-style contact email (`user@corp.com`) triggers company enrich.  
- Domain source stored for at least manual vs discovered.  
- No regression on outreach agent, CRM sync, bulk campaigns.  

**Stretch:**

- Inventory picker MVP on one proposal.  
- Activation brief text generated from selected inventory lines.  

---

## References

| Document | Purpose |
|----------|---------|
| `28th_May.md` | Agents sprint plan + outreach v1 |
| `29th_May.md` | Dual approval, Apollo, PM2 24/7 |
| `1st_June.md` | Jersey composite, landing visuals, bulk approve |
| `2nd_June.md` | PDF audit fixes, CRM baseline |
| `3rd_June.md` | 3 June regressions + fixes + deferred list |
| `INTERN_TEST_PLAN.md` | E2E groups — update after 4 June implementation |
| `Coritiba_Platform_Issues_Report_EN.pdf` | Original bugs + FRs |
| `AGENTS_SPRINT_IMPL.md` | Agent architecture |

---

## Git / Branch (start of 4 June planning)

```
Planning branch:  feature/4th-june-planning  (this document only)
Shipped branch:   feature/bug-fixes-3june @ 9b43772
Platform:         https://eligibly-facing-unloved.ngrok-free.dev
Deploy:           npm run deploy  (on server, after ops files committed)
```

**Next step after James sign-off:** Implement Wave 1 on `feature/4th-june-enrichment` (or continue from planning branch per team convention).
