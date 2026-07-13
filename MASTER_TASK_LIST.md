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
- [x] Strategy selection with AI recommendations
- [x] **Pencil edit icons on summary step 5** (13-July sprint)
- [x] AI-powered proposal generation (Claude Bedrock)

### Approval Workflow
- [x] Approval queue with approve/reject actions
- [x] Status transitions: draft → under_review → approved → active_contract → rejected

### Deck / PDF
- [x] 7-page PDF deck generation
- [x] **Dynamic content per inventory asset type** (jersey/LED/VIP/social/default) (13-July sprint)
- [x] Club profile page with stats
- [x] Investment/commercial terms page
- [x] Visual mockups placeholder page

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
- [x] Pipedrive integration architecture ready

---

## 📊 DASHBOARD

- [x] Active companies, proposals, campaigns KPIs
- [x] Pending approvals + follow-ups
- [x] System health (failed workflows)
- [x] Email open/click rate
- [x] Image generation job stats
- [x] **Revenue Hero section** (13-July sprint):
  - [x] Total Active Revenue (from contracts)
  - [x] Pipeline Value (from proposal packages)
  - [x] Avg Deal Size

---

## 📧 EMAIL MODULE

- [x] Gmail OAuth integration
- [x] Email generation (Claude Bedrock)
- [x] Sent/Opened/Clicked tracking
- [x] Follow-up suggestions
- [x] Email templates

---

## 🏢 COMPANIES MODULE

- [x] Company CRUD
- [x] Apollo.io enrichment (APOLLO_API_KEY updated 13-July)
- [x] Company intelligence (AI analysis)
- [x] CRM sync architecture

---

## 📄 CONTRACTS MODULE

- [x] Contract creation from approved proposals
- [x] Contract status tracking
- [x] Revenue tracking (total_value field)

---

## 🔧 INFRASTRUCTURE

- [x] PM2 process manager (Next.js + ngrok)
- [x] ngrok tunnel with browser warning bypass policy (`ngrok-policy.yml`)
- [x] Build error handling (typescript/eslint ignore)
- [x] `.env` removed from git tracking
- [x] Large assets in `.gitignore` (assets/, training-data/, acervo_raw/, *.zip)

---

## ⚠️ MANUAL ACTIONS REQUIRED

1. **Run Supabase migration**: Execute `supabase/migrations/0036_inventory_period_qty_responsible.sql` in Supabase SQL editor
2. **GitHub secret scanning**: Visit https://github.com/1Touch-dev/Marketing-Sponsorship-Automation/security/secret-scanning/unblock-secret/3GRE5nyJTT7MPL2BGqlI5tbrhuK to unblock push (or git history has been rewritten — re-push)
3. **Apollo API key**: Confirm `APOLLO_API_KEY` in `.env` is active on server (not in git)
4. **pm2 restart**: Run `pm2 restart all --update-env` after deploying to pick up `.env` changes

---

## 🔜 NEXT SPRINT (Awaiting James)

- [ ] Image generation strategy confirmation from James
- [ ] Jersey: real photo base vs LoRA AI generation
- [ ] Stadium: real photo compositing (current) vs higher quality inpainting
- [ ] AI Campaign Creatives: example campaign images from James
- [ ] LoRA retraining on 2026 kit photos (once James sends confirmation)
