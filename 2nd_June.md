# Coritiba FC Platform — Sprint Report (2 June 2026)

**Date:** 2 June 2026 | **By:** Abhishek  
**Active branch:** `feature/bug-fixes-2june` ✅ PUSHED  
**Platform URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Login:** `patrocinios@coritiba.com.br` / `admin@1Touch`  
**Server:** AWS EC2 — app runs 24/7 via PM2 + systemd  

**Audit source:** `Coritiba_Platform_Issues_Report_EN.pdf` (Perplexity, June 2026) — 15 bugs + 10 feature requests  

---

## Executive Summary

Today focused on **persistent bugs** from the PDF audit + James WhatsApp feedback. **Not** the full feature roadmap.

### Verdict vs PDF audit

| Category | PDF total | ✅ Done | ⚠️ Partial | ❌ Not done |
|----------|-----------|---------|------------|-------------|
| P0 bugs | 8 | 3 | 5 | 0 |
| P1 bugs | 4 | 4 | 0 | 0 |
| P2 bugs | 1 | 0 | 1 | 0 |
| Feature requests (FR) | 10 | 2 | 1 | 7 |
| Ops / executive items | 4 | 1 | 3 | 0 |

**Bottom line:** Audit **blocking bugs are largely fixed or improved**; the PDF is **not 100% closed**. Remaining work is mostly **feature builds** (templates, bulk personalization, landing redesign, newsletter, enrichment automation) plus several **partial** items (full image library, team sender DB, images in emails, inline industry edit).

### E2E flow (PDF Section 5) — status after 2 June

| Step | Action | Was (audit) | Now |
|------|--------|-------------|-----|
| 1 | Identify company | OK | ✅ OK |
| 2 | Enrich + save contacts | BUG-11 | ✅ Save / Save all |
| 3 | Review competitors | BUG-12 | ✅ Add to DB |
| 4 | Create campaign | BUG-14 | ✅ Searchable company |
| 5 | Build proposal | OK | ✅ OK |
| 6 | Generate creatives | BUG-08 | ⚠️ Prompt confirm + reset stuck; no full image library |
| 7 | Approve content | BUG-04 | ✅ Approvals populated |
| 8 | Edit proposal | BUG-01 | ✅ Edit → `/edit` |
| 9 | Send email | BUG-09/10 | ⚠️ Link + no `[Nome]` in AI emails; no embedded images |
| 10 | Sponsor views proposal | BUG-15 | ⚠️ No sidebar + CTA strip; not full FR-04 redesign |

**Audit said 6/10 steps fail → now ~7–8 workable; full “sales-ready” flow still needs FR work.**

---

## Platform Health (Live — 2 June 2026)

| Service | Status | Notes |
|---------|--------|-------|
| Database (Supabase) | ✅ healthy | ~163ms latency |
| Bedrock AI | ✅ configured | |
| OpenAI | ✅ configured | |
| Pipedrive CRM | ✅ connected | James verified: **0 pending, 35 synced** on `/crm-sync` |
| Replicate (LoRA) | ✅ configured | `coritiba-jersey-lora:396810db` |
| Hunter.io | ✅ configured | |
| Apollo.io | ✅ configured | People search needs Basic+ |
| ngrok | ✅ online | `eligibly-facing-unloved.ngrok-free.dev` |

**Platform stats:** 512 companies · 64 proposals (63 active) · 79 campaigns

**Gmail:** Token expired 22 May 2026 — **warning banner** on `/settings`. App **send** logs to **Pipedrive activities**, not Gmail inbox. Gmail is for **reply/thread sync** only; reconnect if you want that tracking back.

---

## PDF Audit Cross-Check (complete)

Legend: ✅ Resolved · ⚠️ Partial · ❌ Not done (feature or out of scope for 2 June)

### Executive summary items (PDF p.3)

| Item | PDF state | Status | Notes |
|------|-----------|--------|-------|
| 300+ companies, PT industry labels | EN/PT mismatch in bulk | ✅ | Bulk chips + API search aligned to PT |
| Gmail OAuth expired 22 May | Silent email failures | ⚠️ | Banner added; token not reconnected; send path is Pipedrive |
| 28 jobs stuck in `generating` | No recovery | ⚠️ | "Reset N stuck jobs" on media page; run if any remain |
| CRM 35 pending, 0 synced | Broken | ✅ | **Resolved** — James: 35 synced, 0 pending, 0 failed |

---

### P0 — Critical bugs (8)

| PDF ID | Page | Issue | Status | What we did / gap |
|--------|------|-------|--------|-------------------|
| **BUG-01** | `/proposals/{id}` | Edit → `/mockup-editor` | ✅ | Edit → `/proposals/{id}/edit` verified |
| **BUG-03** | `/campaigns/bulk` | EN labels vs PT DB, 100% fail | ✅ | PT chips, `?q=` + `?industry=` search, multi-select |
| **BUG-08** | Visuals | Generate without prompt; 28 stuck | ⚠️ | Prompt confirm on **official jersey mockup**; reset stuck jobs. **Gap:** filter/sort image library by proposal/campaign/company |
| **BUG-09** | `/emails/{id}` | `[Nome]` literal | ⚠️ | AI prompt + `SENDER_NAME` / `recipient_title`. **Gap:** full **FR-02** team DB (5–10 senders) |
| **BUG-10** | `/emails/{id}` | No proposal link or images | ⚠️ | Mandatory proposal link/CTA in **AI-generated** emails. **Gap:** embedded **images** in body |
| **BUG-11** | Contacts tab | Cannot save Hunter/Apollo contacts | ✅ | Save / Save all, `/api/contacts`, migration `0021` |
| **BUG-IMAGES** | Bulk approve | No image mgmt; Sem img | ⚠️ | Reset stuck + prompt preview. **Gap:** dedicated workspace + filters; Sem img when job never completed |
| **BUG-15** | `/proposals/{id}/view` | Admin sidebar + no CTA | ⚠️ | Sidebar stripped; bottom CTA (WhatsApp, email, Calendly). **Gap:** **FR-04** full redesign |

*Sprint IDs: P0-01=BUG-01, P0-02=BUG-03, P0-03=BUG-08, P0-04=BUG-09, P0-05=BUG-10, P0-06=BUG-11, P0-07=BUG-IMAGES, P0-08=BUG-15*

---

### P1 — High bugs (4)

| PDF ID | Page | Issue | Status | What we did / gap |
|--------|------|-------|--------|-------------------|
| **BUG-04** | `/approvals` | Empty + no filter | ✅ | Proposals + Campaigns + Emails; type/status filters |
| **BUG-06** | `/crm-sync` | 0 synced, 35 pending | ✅ | Queue healthy on James account (35 synced) |
| **BUG-12** | Competitors | No Add to DB | ✅ | Add to DB per row, pre-filled create |
| **BUG-14** | `/campaigns` | Company dropdown no search | ✅ | Searchable input + live dropdown |

*Sprint: P1-01=BUG-04, P1-02=BUG-06, P1-03=BUG-12, P1-04=BUG-14*

---

### P2 — Medium (1)

| PDF ID | Page | Issue | Status | What we did / gap |
|--------|------|-------|--------|-------------------|
| **BUG-13** | `/companies/{id}` | No inline industry edit + auto-label | ⚠️ | API `?industry=` search; edit via company form. **Gap:** click-to-edit chip; auto-label on enrich |

*Sprint: P2-01=BUG-13*

---

### Feature requests (10) — PDF Section 6

| PDF ID | Feature | Status | Notes |
|--------|---------|--------|-------|
| **FR-01** | Bulk: search companies + unique proposal/email per contact + swipe approve | ❌ | Only search/select fixed (part of BUG-03) |
| **FR-02** | Team sender profile DB (5–10 people) | ❌ | `SENDER_NAME` env only |
| **FR-03** | Email/proposal templates, placeholders, CTA, images | ❌ | Prompt-level CTA/link only |
| **FR-04** | Sponsor landing full redesign | ❌ | CTA strip + no sidebar only (BUG-15 partial) |
| **FR-05** | Tinder-style approval UI | ❌ | List + filters on `/approvals` only |
| **FR-06** | Auto enrichment (logo, social, ads, score, auto industry) | ❌ | Hunter/Apollo/Apify as before |
| **FR-07** | Weekly newsletter by segment | ❌ | Not started |
| **FR-08** | Save Hunter/Apollo contacts | ✅ | Same as BUG-11 |
| **FR-09** | Add competitors to DB | ⚠️ | Add to DB done; **gap:** create proposal from competitor, list badge |
| **FR-10** | Bilingual admin PT/EN | ❌ | PDF = low priority |

**James WhatsApp (not in PDF FR list):** video generation demo on landing — ❌ not started (tracked as future / F-video in earlier notes).

---

## What Was Done Today (2 June 2026)

Two bug-fix rounds on `feature/bug-fixes-2june`, E2E-tested in browser.

### Round 1 — `9bd2801` (P0–P2 + ops banner)

- **BUG-01 / P0-01:** Edit routing correct  
- **BUG-03 / P0-02:** PT bulk industries, company search, multi-select, companies API  
- **BUG-08 / P0-03:** Jersey prompt confirm modal; reset stuck jobs  
- **BUG-09,10 / P0-04,05:** Email prompts — real names, proposal link, PT tone, `recipient_title`  
- **BUG-11 / P0-06:** Contacts save + `0021_contacts_table.sql` (applied in Supabase)  
- **BUG-IMAGES / P0-07:** Stuck reset + prompt preview on media flow  
- **BUG-15 / P0-08:** Public `/view` without sidebar; sponsor CTA strip  
- **BUG-04 / P1-01:** Approvals triple-section + filters  
- **BUG-12 / P1-03:** Competitors Add to DB  
- **BUG-14 / P1-04:** Campaign company search  
- **BUG-13 / P2-01:** Companies API search params  
- **Ops:** Gmail expiry warning on Settings (clarify: reply sync, not send)

### Round 2 — `622daf0` (post E2E)

- Approvals emails query: `proposals(companies)` join (emails have no `company_id`)  
- Campaigns filter: `draft | selected` only  
- **Landing Page ↗** always visible on proposal detail  
- `/view` `pb-20` so CTA does not overlap content  

### Docs — `6466388`, `9cddc4f`

- Sprint report updates  

**Key files:** `app/campaigns/bulk/page.tsx`, `app/approvals/page.tsx`, `app/proposals/[id]/view/page.tsx`, `app/proposals/[id]/page.tsx`, `components/shared/app-shell.tsx`, `companies/[id]/company-ai-analysis.tsx`, `app/api/contacts/route.ts`, `lib/bedrock/prompts.ts`, `lib/agents/tools.ts`, `replicate-jersey-generator.tsx`, `media-generation/image-generation-manager.tsx`

---

## E2E Browser Test Results (2 June 2026)

| # | Test | Result |
|---|------|--------|
| T1 | `/view` — no sidebar | ✅ |
| T2 | Bulk campaigns PT + search | ✅ |
| T3 | Approvals — 61 / 50 / 8 | ✅ |
| T4 | Campaign company search | ✅ |
| T5 | Contacts Save / Save all | ✅ |
| T6 | Competitors Add to DB | ✅ |
| T7 | Settings Gmail warning | ✅ |
| T8 | Media gen + stuck reset | ✅ |
| T-A | Landing Page ↗ button | ✅ |
| T-B | `/view` CTA strip | ✅ |

---

## Still Pending (from PDF + James)

### Partial bugs — finish in next sprint

1. **BUG-08 / BUG-IMAGES** — Image library with filter/sort by company, campaign, proposal  
2. **BUG-09 / FR-02** — `team_members` table + per-sender injection  
3. **BUG-10** — Embedded images in email HTML  
4. **BUG-13** — Inline industry edit + auto-label on enrichment  
5. **BUG-15 / FR-04** — Full landing redesign (hero, assets, lead form, PDF)  

### Feature requests — not started (ordered by PDF impact)

1. **FR-04** — Landing redesign (CRITICAL)  
2. **FR-03** — Email templates + placeholders + images (HIGH)  
3. **FR-01** — Bulk personalized proposals + per-contact emails (HIGH)  
4. **FR-05** — Tinder-style approval (HIGH)  
5. **FR-02** — Team sender DB (HIGH)  
6. **FR-06** — Full enrichment automation (MEDIUM)  
7. **FR-09** — Competitor extras (proposal from competitor, badge) (MEDIUM)  
8. **FR-07** — Newsletter (MEDIUM)  
9. **FR-10** — Bilingual admin (LOW)  
10. **James extra** — Video demo on landing (exploratory)  

**Estimated remaining:** ~58–77h (features + partial bug completions)

### Optional ops

- Reconnect Gmail in Settings (reply tracking only)  
- Run **Reset stuck jobs** on `/media-generation` if any jobs still show `generating`  
- **Archive Synced** on `/crm-sync` to tidy queue UI  

---

## Blocked — Waiting on James

| Item | Needed | Impact |
|------|--------|--------|
| Kit photos | Shorts, socks, back angles | Jersey placements + LoRA |
| Brand assets | Email/creative templates | FR-03, logos |
| Apollo Basic | ~$49/mo confirm | API people search |
| Agent sign-off | 1–2 real prospects on outreach agent | Merge to `main` |

---

## Migrations Applied

| Migration | Purpose | Status |
|-----------|---------|--------|
| `0020_image_job_proposal_links.sql` | Image job metadata for landing/bulk approve | ✅ 1 June |
| `0021_contacts_table.sql` | Saved Hunter/Apollo contacts | ✅ 2 June (Supabase SQL editor) |

**Future (from PDF):** `0022` email_templates, `0023` company enrichment cols, `0024` newsletters, team_members for FR-02

---

## Git / Branch Status

```
Branch: feature/bug-fixes-2june
Remote: origin/feature/bug-fixes-2june (pushed ✅)

2 June:
  9cddc4f  docs: complete 2nd_June sprint report + PDF cross-check
  622daf0  fix: approvals sections, Landing Page button, view padding
  6466388  docs: update 2nd_June.md
  9bd2801  fix(bugs): P0–P2 + F-11

1 June (on branch):
  3932d42  Portuguese image labels
  7b9fc07  Proposal visuals, landing, bulk approve
  83db561  Official jersey composite
```

---

## Ops Runbook

```bash
pm2 list
pm2 restart sponsorship-platform
curl -s https://eligibly-facing-unloved.ngrok-free.dev/api/system/health | python3 -m json.tool

cd ~/Market_Sponsorship_Automation/frontend && npm run build
pm2 restart sponsorship-platform && pm2 save
```

---

## References

| Doc | Purpose |
|-----|---------|
| `Coritiba_Platform_Issues_Report_EN.pdf` | Full audit — this cross-check |
| `1st_June.md` | Jersey mockups, landing visuals, bulk approve |
| `29th_May.md` | Outreach agent, Apollo, PM2 |
| `INTERN_TEST_PLAN.md` | Intern E2E |
| `README.md` | Setup, env vars |
