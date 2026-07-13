# 13th July Sprint — Status Report
## Market Sponsorship Automation · Coritiba FC Commercial Platform

**Date**: 13 July 2026  
**Branch**: `13-july-sprint` (based on `origin/29th-june-sprint`)  
**Engineer**: Cursor Agent

---

## ✅ COMPLETED THIS SPRINT

### 1. Inventory Module Upgrades
- Added **Period**, **Quantity**, **Responsible** fields to `ItemForm` in `inventory-manager.tsx`
- Added **"All Items" consolidated tab** showing all physical + digital items together
- Made **Pencil edit icon always visible** (removed opacity-0/group-hover)
- Updated API `route.ts`: added `force-dynamic`, expanded `newCols` to include `period`, `quantity`, `responsible`
- Created migration: `supabase/migrations/0036_inventory_period_qty_responsible.sql`

### 2. Proposals — UX Improvements
- Fixed **dropdown contrast** in company search input (added `text-foreground`, `placeholder:text-slate-400`)
- Fixed **stale inventory data**: removed `dbInventory.length === 0` guard so step 3 always re-fetches fresh data with `cache: "no-store"`
- Added **Select All / Deselect All** buttons per category in step 3
- Added **Pencil edit icons** on step 5 summary for each section (type, company, components, strategies)
- Imported `Pencil` from `lucide-react`

### 3. Pipeline — Template Card
- Updated `STAGES` to include **4-stage Coritiba template** (Contact Lead → Diagnosis & Presentation → Prepare Proposal → Negotiation & Contract) while retaining legacy stages for backward-compat
- Added **green "Coritiba Sponsorship Pipeline Template" card** showing all 4 stages at top of pipeline page

### 4. Dashboard — Revenue KPIs
- Added `contracts` table query to `loadDashboard()` for `total_value`
- Computed `totalRevenueBrl`, `signedContractCount`, `avgDealSizeBrl`
- Added **Revenue Hero section** at top of dashboard with 3 KPI cards:
  - Total Active Revenue (R$)
  - Pipeline Value (R$)
  - Avg Deal Size (R$)

### 5. Sponsorship Deck — Dynamic Content
- Added `ASSET_DECK_CONTENT` constant with 5 variations: `jersey`, `led_board`, `vip_area`, `social_post`, `default`
- Fetched `proposal_packages` to determine `primaryCategory`
- Pages 3 (Opportunity), 4 (Package), 5 (Campaign Concept) now render **asset-specific content**
- Page 4 also shows actual `proposal_packages` data when available

### 6. Stadium Mockup — History Loading
- Added `useEffect` in `stadium-outdoor-mockup.tsx` to fetch `/api/media/stadium-mockup/history` on mount
- Displays **previously generated placements** as clickable thumbnail gallery
- History API already had correct `job_type: "stadium_mockup_official"` ✓

### 7. Infrastructure
- Added to `.gitignore`: `assets/`, `training-data/`, `acervo_raw/`, `preprocessing_report.json`, `PREPROCESSING_REPORT.md`, `IMAGE_GENERATION_REQUIREMENTS.md`, `*.zip`
- Apollo API key `APOLLO_API_KEY` updated in `.env` (already confirmed by user)
- `ngrok-policy.yml` present for browser warning bypass

---

## ❌ BLOCKED / PENDING

### Image Generation (Awaiting James)
- Jersey mockup strategy: real photo compositing vs LoRA AI generation
- Stadium mockup: current real photo approach vs higher quality inpainting
- AI Campaign Creatives: example campaign images from James
- LoRA retraining: awaiting James's confirmation on dataset

### Manual Actions Required
1. **Supabase migration**: Run `supabase/migrations/0036_inventory_period_qty_responsible.sql` in Supabase SQL editor to add `period`, `quantity`, `responsible` columns to `inventory_items`
2. **GitHub push**: History was rewritten to remove a Replicate API token from `training-data/start_training.py`. Push is now clean — run `git push -u origin 13-july-sprint --force` (safe as this branch was never merged)
3. **PM2 restart**: Run `pm2 restart all --update-env` to pick up `.env` changes

---

## 🔬 TESTING CHECKLIST

| Feature | Status |
|---|---|
| Inventory: Period/Quantity/Responsible fields | ✅ Implemented |
| Inventory: All Items tab | ✅ Implemented |
| Inventory: Always-visible Pencil icon | ✅ Implemented |
| Proposals: Company search contrast | ✅ Fixed |
| Proposals: Fresh inventory at step 3 | ✅ Fixed |
| Proposals: Select All/Deselect All | ✅ Implemented |
| Proposals: Pencil edit icons on summary | ✅ Implemented |
| Pipeline: 4-stage template card | ✅ Implemented |
| Dashboard: Revenue Hero KPIs | ✅ Implemented |
| Deck PDF: Dynamic per asset type | ✅ Implemented |
| Stadium: Load previous mockups on open | ✅ Implemented |
| Apollo API enrichment | ✅ API key updated |

---

## 📁 FILES CHANGED

```
frontend/app/inventory/inventory-manager.tsx      — Period/Qty/Responsible + All Items tab
frontend/app/api/inventory/route.ts               — force-dynamic + expanded newCols
frontend/app/proposals/new/proposal-wizard.tsx    — contrast fix + select all + pencil icons
frontend/app/pipeline/page.tsx                    — 4-stage template card
frontend/app/page.tsx                             — Revenue Hero KPIs
frontend/app/proposals/[id]/deck/page.tsx         — ASSET_DECK_CONTENT + dynamic rendering
frontend/components/proposals/stadium-outdoor-mockup.tsx — useEffect history + gallery
frontend/app/api/media/stadium-mockup/history/route.ts   — (already correct)
supabase/migrations/0036_inventory_period_qty_responsible.sql — NEW migration
.gitignore                                        — added large asset dirs
MASTER_TASK_LIST.md                               — updated
ngrok-policy.yml                                  — browser warning bypass
```
