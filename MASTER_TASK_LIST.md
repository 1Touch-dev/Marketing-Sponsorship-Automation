# Master Task List — Market Sponsorship Automation
## Coritiba FC Commercial Platform

*Last updated: 13 July 2026*

---

## 🏗️ PLATFORM INFRASTRUCTURE

### Authentication & Access
- [x] Google OAuth login flow
- [x] Role-based access control (RBAC) — admin / user roles
- [x] Unauthorized access redirect page

### Database & API
- [x] Supabase schema — companies, proposals, campaigns, contracts, emails, followups, inventory
- [x] Audit log system (audit_logs table)
- [x] Workflow events tracking
- [x] Image generation jobs table
- [x] Migration 0036: `inventory_items.period`, `quantity`, `responsible`
- [x] Migration 0037: `companies.sponsorship_fit_score`, `emails.sender_profile_id`, `proposals.ab_test_config`, `newsletter_segments`, `contacts`, `contracts.renewed_from_contract_id`, `contracts.pdf_url`

---

## 📋 INVENTORY MODULE

### Fields & UI
- [x] Inventory types: Physical (jersey, LED board, VIP area, etc.) + Digital (social, YouTube, etc.)
- [x] Add/Edit/Delete items
- [x] Availability status (available / limited / sold)
- [x] Exposure reach + placement zone fields
- [x] Digital-specific: avg_views, content_hours, team_required
- [x] Physical-specific: production_cost, setup_hours, line_items
- [x] **Period, Quantity, Responsible fields** (13-July sprint)
- [x] **Consolidated "All Items" tab** (13-July sprint)
- [x] **Custom Category** — free-text input when "Custom" selected (BUG-02)
- [x] Pencil icon always visible (not just on hover)
- [x] DB migration: `0036_inventory_period_qty_responsible.sql`

### API
- [x] GET /api/inventory — list with filtering
- [x] POST /api/inventory — create item
- [x] PATCH /api/inventory/[id] — update
- [x] DELETE /api/inventory/[id] — delete
- [x] force-dynamic to prevent stale cache

---

## 📝 PROPOSALS MODULE

### Wizard
- [x] 6-step wizard: Type → Company → Components → Strategy → Generate → Review
- [x] Proposal types: Sponsorship, Barter, Lei de Incentivo, Mixed, ESG, Local, National
- [x] Company search with intelligence preview
- [x] **Dropdown contrast fix** (13-July sprint)
- [x] Live DB inventory loading at step 3
- [x] **Force refetch of inventory at step 3** — no stale data (13-July sprint)
- [x] **Select All / Deselect All per category** (13-July sprint)
- [x] **Auto-include package counterparts** (jersey → training kit, press backdrop) (BUG-03)
- [x] Strategy selection with AI recommendations
- [x] **Pencil edit icons on summary step 5** (13-July sprint)
- [x] AI-powered proposal generation (Claude Bedrock)
- [x] **Renewal wizard** — pre-fill from source contract (FR-13)

### Proposal Detail
- [x] **WhatsApp share button** with Day 3 / Day 7 follow-up templates (FR-12)
- [x] **A/B testing panel** — create/edit test variants, view results (FR-14)
- [x] **Version History panel** — save snapshot, compare versions (FR-10)

### Approval Workflow
- [x] **Tinder card view** — drag/swipe, keyboard shortcuts (→ Approve, ← Reject, E Edit) (FR-05)
- [x] Queue tabs: All / Proposals / Campaigns / Emails
- [x] Status transitions: draft → under_review → approved → active_contract → rejected

### Deck / PDF
- [x] 8-page PDF deck — FIXED: full-width standalone layout, no sidebar, dark toolbar
- [x] **Print button works** — `window.print()` via safe `data-print` event listener
- [x] **Dynamic content per inventory asset type** (jersey/LED/VIP/social/default)
- [x] Club profile page with stats
- [x] Investment/commercial terms page
- [x] Visual mockups placeholder page
- [x] Next steps page with contact info

### Bulk Proposals
- [x] **Bulk Proposals wizard** — 3-step: select companies → configure → Tinder review (FR-17)
- [x] Portuguese industry filter chips
- [x] Company search + select

---

## 🏟️ IMAGE GENERATION

### Jersey Mockup
- [x] Base jersey image (coritiba-jersey-2026-clean.jpg)
- [x] Official Coritiba badge (from Wikimedia SVG)
- [x] Sponsor logo compositing with background removal
- [x] gpt-image-1 fallback for text sponsors
- [ ] **PENDING**: Awaiting James confirmation on strategy (real photos vs AI)

### Stadium / Outdoor Mockup
- [x] 5 placements across 4 real Couto Pereira photos
- [x] Replicate Flux-fill-dev inpainting + sharp compositor fallback
- [x] History API: `/api/media/stadium-mockup/history`
- [x] **useEffect to load previously generated mockups on mount** (13-July sprint)
- [x] **History gallery in component** (13-July sprint)
- [ ] **PENDING**: Awaiting James confirmation on strategy

### AI Campaign Creatives
- [x] Brand context (COUTO_SCENE, kit colors, visual identity)
- [x] 3 images per campaign (stadium, LED close-up, jersey)
- [ ] **PENDING**: Awaiting James assets (example campaign images)

### LoRA Training
- [x] Training data organized from Dropbox acervo (Coritiba assets)
- [x] Training script: `training-data/start_training.py`
- [ ] **PENDING**: Retrain after James confirms preferred dataset

---

## 🚀 PIPELINE / CRM

- [x] 7-stage pipeline visualization
- [x] **Coritiba 4-stage template card** (Contact Lead → Diagnosis → Proposal → Negotiation) (13-July sprint)
- [x] Company pipeline stage assignment
- [x] Pipeline value calculation
- [x] **Pipedrive sync status widget** — API token check, sync queue, Sync Now button (BUG-06)
- [x] Pipedrive integration architecture ready

---

## 📊 DASHBOARD

- [x] Active companies, proposals, campaigns KPIs
- [x] Pending approvals + follow-ups
- [x] System health (failed workflows)
- [x] Email open/click rate
- [x] Image generation job stats
- [x] **Revenue Hero section** — Total Active Revenue, Pipeline Value, Avg Deal Size (13-July)
- [x] **CRM sync status badge** — green/amber/red in dashboard header (BUG-06)
- [x] **Revenue vs Target KPI + Win Rate + Proposals This Month** (FR-07)

---

## 📊 REPORTS

- [x] **Revenue vs Annual Target** — progress bar (FR-07)
- [x] **Win Rate %** — won/closed proposals (FR-07)
- [x] **Proposals by Month** — 6-month bar chart (FR-07)
- [x] **Revenue by Deal Type** — horizontal bar breakdown (FR-07)
- [x] Active sponsors list with monthly report generation
- [x] Pipeline — nearing contract section
- [x] CSV exports: Companies, Proposals, Contracts, Revenue, Emails

---

## 📧 EMAIL MODULE

- [x] Gmail OAuth integration
- [x] Email generation (Claude Bedrock)
- [x] Sent/Opened/Clicked tracking
- [x] Follow-up suggestions
- [x] Email templates
- [x] **[Nome]/{{variable}} substitution** — both formats resolved in template engine (FR-02)
- [x] **Pre-send validation** — blocks send if any placeholder still unresolved (FR-02)
- [x] **Team sender profiles** — send-from dropdown in email composer (FR-03)
- [x] **Weekly newsletter** — config UI, template builder, schedule, analytics (FR-15)

---

## 🏢 COMPANIES MODULE

- [x] Company CRUD
- [x] Apollo.io enrichment (APOLLO_API_KEY updated 13-July)
- [x] Company intelligence (AI analysis)
- [x] **Save contacts button per row + Save All banner + Saved ✓ badge** (BUG-05)
- [x] **Add competitors to CRM** — duplicate check + bulk Add All (BUG-08)
- [x] **Sponsorship Fit Score card** — 1-10 AI score + rationale (FR-11)
- [x] **Inline industry edit** — click-to-edit dropdown (BUG-07)
- [x] CRM sync architecture

---

## 📄 CONTRACTS MODULE

- [x] Contract creation from approved proposals
- [x] Contract status tracking
- [x] Revenue tracking (total_value field)
- [x] **Expiry alert banner** — color-coded (red ≤15d / amber ≤30d / yellow ≤60d) (FR-13)
- [x] **"Renovar" button** — links to renewal wizard with source contract pre-filled (FR-13)
- [x] **Expiring ≤60 Days counter** in summary stats (FR-13)

---

## 🎨 MOCKUP EDITOR

- [x] Konva.js canvas with undo/redo, zoom
- [x] **9 templates total**: Jersey, LED Perimeter, Social 1:1, Press Backdrop, Scoreboard, **OOH Billboard 16:9**, **Digital Banner 728×90**, **Social Story 9:16** (FR-09)
- [x] **Category filter tabs**: All / Jersey / Stadium / Social / Digital / Print
- [x] **Attach to Proposal** panel (FR-09)
- [x] Export PNG 2x

---

## 🌐 UI / UX

- [x] **PT/EN language toggle** — "PT | EN" in sidebar, active language highlighted (FR-16)
- [x] Sidebar collapse to icon-only mode
- [x] Breadcrumbs on all pages
- [x] Filters on Companies, Proposals, Inventory (FR-08)
- [x] Responsive layout (mobile nav)
- [x] Dark mode support

---

## 🔧 INFRASTRUCTURE

- [x] PM2 process manager — **FIXED**: `node_modules/.bin/next` eliminates crash-loop
- [x] ngrok tunnel with browser warning bypass policy (`ngrok-policy.yml`)
- [x] Build error handling (typescript/eslint ignore)
- [x] `.env` removed from git tracking
- [x] Large assets in `.gitignore` (assets/, training-data/, acervo_raw/, *.zip)
- [x] `pm2 save` — processes survive reboot

---

## ⚠️ MANUAL ACTIONS — ALL COMPLETE

1. ~~**Run Supabase migration 0036**~~ ✅ Done (user confirmed)
2. ~~**Run Supabase migration 0037**~~ ✅ Done (user confirmed)
3. ~~**Apollo API key**~~ ✅ Updated in `.env`
4. ~~**PM2 crash-loop**~~ ✅ Fixed in `ecosystem.config.cjs`
5. ~~**GitHub secret scanning**~~ ✅ History rewritten, branch clean

---

## 🔜 NEXT SPRINT (Awaiting James)

- [ ] Image generation strategy confirmation from James
- [ ] Jersey: real photo base vs LoRA AI generation
- [ ] Stadium: real photo compositing (current) vs higher quality inpainting
- [ ] AI Campaign Creatives: example campaign images from James
- [ ] LoRA retraining on 2026 kit photos (once James confirms)
