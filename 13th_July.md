# 13th July Sprint — Complete Status Report
## Market Sponsorship Automation · Coritiba FC Commercial Platform

**Date**: 13 July 2026  
**Branch**: `26-july-sprint` (based on `13-july-sprint`)  
**Engineer**: Cursor Agent  
**Scope**: All bugs from audit PDF, all 17 feature requests, platform live verification + fixes

---

## ✅ COMPLETED TODAY (13 July 2026)

### 🔴 Critical Bugs Fixed (P0/P1) — All 9 Done

| Bug | What Was Fixed | File |
|-----|----------------|------|
| **BUG-01** | Sponsor `/view` page — public layout confirmed, no sidebar for sponsors | `(public)/layout.tsx` |
| **BUG-02** | Custom inventory categories — free-text input when "Custom" selected | `inventory-manager.tsx` |
| **BUG-03** | Auto-include package counterparts — jersey → auto-selects training kit, press backdrop | `proposal-wizard.tsx` |
| **BUG-04** | Bulk campaigns Portuguese industry labels — already fixed, confirmed live | `campaigns/bulk/page.tsx` |
| **BUG-05** | Apollo/Hunter contacts — Save button per contact + Save All banner + Saved ✓ badge | `company-ai-analysis.tsx` |
| **BUG-06** | Pipedrive sync — PipedriveStatusCard with API token check, sync queue, Sync Now button | `system/pipedrive-status-card.tsx` |
| **BUG-07** | Company Industry inline edit — already implemented, confirmed live | `inline-industry-edit.tsx` |
| **BUG-08** | Competitors tab — Add to CRM button with duplicate check + bulk Add All | `company-ai-analysis.tsx` |
| **BUG-09** | Bulk campaign company selector search — already implemented, confirmed live | `campaigns/bulk/page.tsx` |

---

### 🟡 Feature Requests Implemented — All 17 Done

| FR | Feature | File |
|----|---------|------|
| **FR-01** | Sponsor landing page — full 10-section redesign, sticky CTA, lead form | `(public)/proposals/view/[token]/page.tsx` |
| **FR-02** | Email variable substitution — `[Nome]`/`{{variable}}` both handled + pre-send validation blocks | `lib/email/template-engine.ts`, `api/emails/[id]/send/route.ts` |
| **FR-03** | Team sender profiles — send-from dropdown in email composer | `settings/sender-profiles/` |
| **FR-04** | Image generation 6-step flow — prompt review modal, results grid, Approve/Reject/Download | Proposal graphics section |
| **FR-05** | Tinder-style approvals — card swipe, keyboard shortcuts (→ Approve, ← Reject, E Edit) | `approvals/page.tsx` |
| **FR-06** | Sponsorship deck PDF — 8-page redesign confirmed live | `proposals/[id]/deck/page.tsx` |
| **FR-07** | Reports FR-07 KPIs — Revenue vs Target progress bar, Win Rate %, Proposals by Month chart, Revenue by Deal Type | `reports/page.tsx` |
| **FR-08** | Filters on Companies, Proposals, Inventory pages | Multiple pages |
| **FR-09** | Mockup editor — 4 new templates: OOH Billboard 16:9, Digital Banner 728×90, Social Story 9:16 + Attach to Proposal | `mockup-editor/mockup-editor-client.tsx` |
| **FR-10** | Proposal versioning — Save Version button + version history panel | `proposals/[id]/page.tsx` |
| **FR-11** | Sponsorship Fit Score — 1-10 score card on company detail + AI rationale | `companies/[id]/page.tsx` |
| **FR-12** | WhatsApp integration — send button + Day 3 / Day 7 follow-up dropdown templates | `proposals/[id]/page.tsx` |
| **FR-13** | Contract module — expiry alerts (red/amber/yellow), Renovar button, renewal wizard | `contracts/page.tsx` |
| **FR-14** | A/B testing module on proposal landing page | `proposals/[id]/ab-test-panel.tsx` |
| **FR-15** | Weekly newsletter settings UI + template builder + analytics | `settings/newsletter/page.tsx` |
| **FR-16** | PT/EN language toggle — "PT \| EN" in sidebar with active language highlighted | `components/shared/sidebar.tsx` |
| **FR-17** | Bulk proposals — 3-step wizard with Tinder review UI | `proposals/bulk/page.tsx` |

---

### 🔧 Infrastructure & Post-Audit Fixes (Today)

| Fix | Details |
|-----|---------|
| **PM2 crash-loop fix** | `ecosystem.config.cjs` changed from `script: "npm"` + `interpreter: "none"` to `node_modules/.bin/next` + `interpreter: "node"` — eliminated 30+ restart loop |
| **Reports page FR-07** | Old "Sponsor Reports" page replaced with full analytics: Revenue vs Target, Win Rate, Proposals bar chart, Revenue by Deal Type |
| **System page PipedriveStatusCard** | Imported and rendered `PipedriveStatusCard` on `/system` — was built but never imported |
| **System page crash fix** | `PipedriveStatusCard` null-safety: validate API response structure before `setStatus()`, safe fallback for `recent_errors ?? []` |
| **Deck page — half-white layout** | Root cause: `width: 210mm` inside `AppShell` left half viewport empty white + admin sidebar injected. Fixed: added `/deck` to `isPublicView` in `app-shell.tsx` + rewrote layout as standalone centered A4 preview with dark toolbar |
| **Deck page — nested HTML** | `<html><body>` inside Next.js layout caused invalid nesting + sidebar breadcrumb inside deck. Fixed: replaced with proper React fragment + `.deck-wrap` / `.deck-page` CSS |

---

### 📊 Database Migrations Applied

| Migration | Tables/Columns Added |
|-----------|---------------------|
| `0036_inventory_period_qty_responsible.sql` | `inventory_items.period`, `inventory_items.quantity`, `inventory_items.responsible` |
| `0037_26july_sprint.sql` | `companies.sponsorship_fit_score`, `emails.sender_profile_id`, `proposals.ab_test_config`, `newsletter_segments` table, `contacts` table, `contracts.renewed_from_contract_id`, `contracts.pdf_url` |

---

## 🔴 STILL PENDING (Awaiting James — Image Generation)

| Item | Blocker | Notes |
|------|---------|-------|
| Jersey mockup strategy | James to confirm: real photo compositing vs LoRA AI | Assets from Dropbox are preprocessed and ready |
| Stadium mockup quality | James to confirm: current real photo approach vs higher quality inpainting | 5 Couto Pereira photos already integrated |
| AI Campaign Creatives | James to provide example campaign images | Brand guidelines exist; 3 stock images ready |
| LoRA retraining on 2026 kit | James to confirm dataset | `training-data/` organized and ready |

---

## ✅ LIVE VERIFICATION — Browser Audit (13 July 2026)

All pages verified live on https://eligibly-facing-unloved.ngrok-free.dev

| Page | Status | Notes |
|------|--------|-------|
| Dashboard `/` | ✅ | Revenue Hero R$1650K pipeline, 536 companies, 16 pending approvals |
| Companies `/companies` | ✅ | Search + 5 filters (industry/status/size/pipeline/country) |
| Approvals `/approvals` | ✅ | Tinder card view, 167 items, queue tabs, keyboard shortcuts |
| Inventory `/inventory` | ✅ | All Items tab, 100+ items, Custom Category, Period/Qty/Responsible |
| Pipeline `/pipeline` | ✅ | 4-stage Coritiba template card visible |
| Contracts `/contracts` | ✅ | Loads, no contracts yet |
| Reports `/reports` | ✅ | FR-07: Revenue vs Target, Win Rate 100%, bar charts working |
| Mockup Editor `/mockup-editor` | ✅ | All 9 templates including OOH, Digital Banner, Social Story |
| Newsletter `/settings/newsletter` | ✅ | Full config, template builder, analytics |
| Bulk Proposals `/proposals/bulk` | ✅ | 3-step wizard with PT industry filters |
| Bulk Campaigns `/campaigns/bulk` | ✅ | Portuguese industry labels, company search |
| System `/system` | ✅ | PipedriveStatusCard renders, no crash |
| Deck PDF `/proposals/[id]/deck` | ✅ FIXED | Full-width, no sidebar, no half-empty white, print button works |

---

## 📁 ALL FILES CHANGED (Full Sprint)

```
# Core Bug Fixes & Features
frontend/app/inventory/inventory-manager.tsx         — BUG-02, custom categories + Period/Qty/Responsible
frontend/app/api/inventory/route.ts                  — force-dynamic + newCols
frontend/app/proposals/new/proposal-wizard.tsx       — BUG-03, FR counterparts + UX improvements
frontend/app/pipeline/page.tsx                       — 4-stage Coritiba template card
frontend/app/page.tsx                                — FR-07 Revenue Hero KPIs
frontend/app/proposals/[id]/deck/page.tsx            — FR-06 dynamic deck + FIXED layout (no sidebar)
frontend/app/proposals/[id]/page.tsx                 — FR-12 WhatsApp, FR-14 A/B panel, FR-10 versioning
frontend/app/proposals/bulk/page.tsx                 — FR-17 Bulk proposals Tinder wizard (NEW)
frontend/app/approvals/page.tsx                      — FR-05 Tinder card view + keyboard shortcuts
frontend/app/campaigns/bulk/page.tsx                 — BUG-04 PT labels confirmed
frontend/app/companies/[id]/page.tsx                 — FR-11 Sponsorship Fit Score card
frontend/app/companies/[id]/company-ai-analysis.tsx  — BUG-05 Save contacts, BUG-08 Add competitors
frontend/app/contracts/page.tsx                      — FR-13 expiry alerts + Renovar button
frontend/app/reports/page.tsx                        — FR-07 KPI tiles + bar charts (REWROTE today)
frontend/app/system/page.tsx                         — PipedriveStatusCard import + crash fix
frontend/app/system/pipedrive-status-card.tsx        — BUG-06 + null-safety fix (today)
frontend/app/settings/newsletter/page.tsx            — FR-15 newsletter config (NEW)
frontend/app/mockup-editor/mockup-editor-client.tsx  — FR-09 new templates
frontend/components/shared/sidebar.tsx               — FR-16 PT/EN toggle
frontend/components/shared/app-shell.tsx             — FIXED deck route isPublicView (today)
frontend/lib/email/template-engine.ts                — FR-02 [Nome] / {{var}} substitution
frontend/app/api/emails/[id]/send/route.ts           — FR-02 pre-send validation
frontend/(public)/proposals/view/[token]/page.tsx    — FR-01 sponsor landing page
frontend/app/proposals/[id]/ab-test-panel.tsx        — FR-14 A/B testing (NEW)
frontend/app/proposals/[id]/version-history-panel.tsx — FR-10 versioning (NEW)

# Database
supabase/migrations/0036_inventory_period_qty_responsible.sql
supabase/migrations/0037_26july_sprint.sql

# Infrastructure
ecosystem.config.cjs                                 — PM2 script fix (node_modules/.bin/next)
ngrok-policy.yml                                     — browser warning bypass
.gitignore                                           — assets/, training-data/, *.zip excluded

# Documentation
MASTER_TASK_LIST.md                                  — updated
13th_July.md                                         — this document
26th_july.md                                         — 26-july sprint log
README.md                                            — updated today
```

---

## 🗂️ BRANCH / DEPLOY STATUS

| Item | Status |
|------|--------|
| Branch | `26-july-sprint` |
| GitHub | ✅ Pushed (`67a9d97`) |
| PM2 | ✅ Online, 0 restarts |
| HTTP | ✅ 200 on localhost:3000 |
| ngrok | ✅ https://eligibly-facing-unloved.ngrok-free.dev |
| Supabase migrations | ✅ Both confirmed applied by user |

---

## 🗣️ JAMES REPLY — Image Generation (13 July 2026, 4:44 PM)

Original message sent to James asking to confirm all 3 generation types. His reply:

> 1. Not only chest. All sponsorship locations. Can be on different placements on jersey. Shoulders, back, number, etc. I can get you a dataset for this if needed
> 2. Yes exactly
> 3. Yes

---

## 📋 IMAGE GENERATION — What James Confirmed + What To Build

### 1. Jersey Mockup ✅ Confirmed + 1 Addition Needed
**Approach**: Real 2026 Coritiba kit photo → composite sponsor logo on the selected placement zone.

**What James confirmed**:
- NOT just the chest — ALL placement locations are needed
- Specific zones: chest, shoulders (both), back, jersey number, shorts, socks
- He may provide a better photo dataset of 2026 kit

**What we already have built** (`jersey-placements.ts`):
| Zone ID | Label | Status |
|---------|-------|--------|
| `chest_sponsor` | Chest — Main sponsor | ✅ Built |
| `chest_above_name` | Chest — Above name (small) | ✅ Built |
| `sleeve_left` | Left sleeve | ✅ Built |
| `sleeve_right` | Right sleeve | ✅ Built |
| `back` | Back (upper) | ✅ Built |
| `shorts` | Shorts | ✅ Built |
| `socks` | Socks | ✅ Built |
| `number` | Jersey number (back) | ❌ Missing — add tomorrow |

**What to do tomorrow**:
- [ ] Add `number` placement zone to `jersey-placements.ts` (back panel, where the player number sits — typically below back-upper, around y=0.20–0.28 on back panel)
- [ ] Confirm base photo: currently using `coritiba-jersey-2026-clean.jpg` (flat kit photo). James may send real player photos — if so, switch base to player-worn photos and re-calibrate zones
- [ ] Test all 7 existing zones end-to-end in the jersey mockup generator
- [ ] If James sends dataset: organise by kit type (home/away/goalkeeper/training), update base image selector in the UI

---

### 2. Stadium / Outdoor Mockup ✅ Fully Confirmed — No Changes Needed
**Approach**: Real Couto Pereira matchday photo → composite sponsor name/logo onto LED perimeter board or banner.

James said: **"Yes exactly"** — what we built is right.

**Current status**: Already implemented. 5 Couto Pereira photos, LED compositing, history gallery. ✅

**Nothing to change.**

---

### 3. AI Campaign Creative ✅ Fully Confirmed — Ready to Implement
**Approach**: Generate editorial/lifestyle style image using gpt-image-1 — person wearing Coritiba jersey in a real-world setting, sponsor branding naturally integrated. Style = "Curitiba é Coritiba" 2026 campaign.

James said: **"Yes"** — confirmed.

**Current status**: Architecture exists (gpt-image-1 endpoint, 3-image generation per campaign). Needs better prompts to match the "Curitiba é Coritiba" editorial style.

**What to do tomorrow**:
- [ ] Craft refined prompts targeting editorial/lifestyle look — not generic product placement
- [ ] Reference the "Curitiba é Coritiba" campaign images from Dropbox acervo for visual tone
- [ ] Ensure sponsor logo is passed as a reference image to gpt-image-1 `/edits` endpoint so it appears authentically in the scene
- [ ] Generate 3 scene types per campaign: matchday street scene, training ground, fan lifestyle
- [ ] Test output quality and iterate on prompts

---

## 🔜 TOMORROW'S WORK — Image Generation Sprint

### Priority Order
1. **Jersey — add `number` zone** (30 min) — quick code change to `jersey-placements.ts`
2. **Jersey — test all 7 zones** (1 hr) — end-to-end test with sample logos on each zone
3. **Jersey — await James's dataset** — if he sends real player photos, update base image
4. **AI Campaign — prompt engineering** (2 hr) — editorial/lifestyle prompts referencing Curitiba é Coritiba style
5. **AI Campaign — test generation** (1 hr) — generate examples with sample sponsor logos
6. **Stadium — already done**, just regression test (30 min)

### No blockers for Jersey and AI Campaign — can start tomorrow morning.
### Stadium is unblocked too — James confirmed approach ✅
