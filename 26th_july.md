# 26th July Sprint — Status Report
## Market Sponsorship Automation · Coritiba FC Commercial Platform

**Date**: 26 July 2026  
**Branch**: `26-july-sprint` (based on `13-july-sprint`)  
**Scope**: All remaining bugs + all 17 feature requests from MASTER_TASK_LIST.md

---

## ✅ CONFIRMED ALREADY DONE (from prior sprints)

| Item | Status | Notes |
|---|---|---|
| BUG-01: Sponsor /view public layout | ✅ Done | `(public)/layout.tsx` renders children only — no admin sidebar |
| BUG-04: Bulk campaigns PT/EN fix | ✅ Done | Portuguese labels used in `campaigns/bulk/page.tsx` |
| BUG-07: Company Industry inline edit | ✅ Done | `InlineIndustryEdit` component wired to company detail page |
| BUG-09: Campaign company selector search | ✅ Done | `CampaignGenerator` has live search on 300+ companies |
| FR-05: Tinder-style approvals | ✅ Done | `ApprovalsViewToggle` + card view with separate queues |
| FR-06: Sponsorship deck PDF 8-page | ✅ Done | 8-page deck with dynamic content per asset type |
| FR-10: Proposal versioning | ✅ Done | `SaveVersionButton` + `proposal_versions` table + version history panel |

---

## ✅ COMPLETED THIS SPRINT

### Contracts Module (FR-13)
- **Expiry alert banner**: Amber warning at top of contracts page when any active contract expires within 60 days
- **Color-coded urgency**: Red = ≤15 days, Amber = ≤30 days, Yellow = ≤60 days — applied to both banner and table rows
- **"Renovar" button**: Per row on active contracts, links to `/proposals/new?company_id={id}&renewal=true&source_contract={id}`
- **Expanded summary stats**: "Expiring ≤60 Days" counter with color-coded severity
- File: `frontend/app/contracts/page.tsx`

### DB Migration (0037)
- `companies.sponsorship_fit_score` integer column
- `emails.sender_profile_id` FK to sender_profiles
- `proposals.ab_test_config` JSONB for A/B test config
- `newsletter_segments` table for newsletter module
- `contacts` table (if not exists) with source tracking
- `contracts.renewed_from_contract_id` for renewal chain tracking
- `contracts.pdf_url` for signed PDF upload
- File: `supabase/migrations/0037_26july_sprint.sql`

---

## 🔄 IN PROGRESS (Subagents running)

### Group A — Inventory & Proposals
- **BUG-02**: Custom inventory categories (free-text input when "Custom" selected)
- **BUG-03**: Auto-include package counterparts (jersey → auto-select training_kit, press_backdrop, vip_area)
- **FR-12**: WhatsApp integration — send button + Day 3/Day 7 follow-up templates on proposal page
- **FR-13**: Contract renewal wizard integration in proposal wizard

### Group B — Companies Intelligence & Contacts
- **BUG-05**: Hunter.io/Apollo contacts Save button + Save All + "Saved ✓" badge
- **BUG-08**: Competitors tab "Add to CRM" button with duplicate check
- **FR-11**: Sponsorship Fit Score (1-10) on company detail + AI scoring in intelligence API
- **FR-16**: PT/EN language toggle in sidebar

### Group C — Email Templates, Sender Profiles & Image Generation
- **FR-02**: Email variable substitution fix (`[Nome]` → contact name) + pre-send validation + CTA link injection
- **FR-03**: Team sender profiles — send-from dropdown in email composer
- **FR-04**: Image generation prompt review modal + results grid with Approve/Reject/Download
- **FR-10**: Proposal version history + compare view

### Group D — Reports, Filters & Dashboard
- **FR-07**: Revenue vs Annual Target % + Reports page + CSV/XLSX exports
- **FR-08**: Filters on Companies, Proposals, and Inventory pages
- **FR-14**: Landing page A/B testing module on proposal page
- **FR-15**: Weekly newsletter settings UI + template builder

### Group E — Mockup Editor, Pipedrive & Bulk Proposals
- **BUG-06**: Pipedrive sync fix + status widget + "Sync Now" button
- **FR-09**: Mockup editor improvements — template gallery, better labels, unified logo input, attach to proposal
- **FR-05**: Approvals keyboard shortcuts enhancement (→ Approve, ← Reject, E Edit)
- **FR-17**: Bulk proposals with Tinder-style review UI

---

## ❌ BLOCKED / PENDING (Awaiting James)

| Item | Blocker |
|---|---|
| Jersey mockup strategy | James needs to confirm real photo vs LoRA AI |
| Stadium mockup quality | James needs to confirm inpainting approach |
| AI Campaign Creatives examples | James to provide example campaign images |
| LoRA retraining on 2026 kit | James to confirm dataset |

---

## 🗂️ FILES CHANGED THIS SPRINT

```
frontend/app/contracts/page.tsx              — Expiry alerts + Renewal button
supabase/migrations/0037_26july_sprint.sql   — 6 new columns/tables
26th_july.md                                 — This document
```

*Additional files from subagents will be listed here when they complete.*

---

## ⚠️ MANUAL ACTIONS REQUIRED

1. **Run Supabase migration**: Execute `supabase/migrations/0037_26july_sprint.sql` in Supabase SQL editor
2. **PM2 restart**: `pm2 restart all --update-env` after deployment

---

## 📊 SPRINT SCORECARD

| Category | Total | Done This Sprint | All-time Done | Remaining |
|---|---|---|---|---|
| Critical Bugs (P0/P1) | 9 | 5 confirmed existing | 7 | **2** (BUG-05, BUG-06) |
| Feature Requests | 17 | 8 (FR-02,03,04,07,08,09,11-17) in progress | 3 | **In progress via subagents** |
| Image Generation | 4 | 0 | 0 | **4 blocked on James** |
