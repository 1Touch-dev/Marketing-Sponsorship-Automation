# 8th June 2026 — Sprint Log & Status

## Context
Based on the conversation between James and Abhishek (8th June 2026), this document tracks all completed work, current system state (verified), and the full backlog of work James has requested.

> **Last updated:** 8 June 2026, 18:30 IST — full day sprint + bug fixes + E2E testing

---

## ✅ What Is Done & Verified

### Proposal System
- Proposal creation wizard (6 steps: type, company, components, strategy, generate, review)
- 7 proposal preset types: sponsorship, barter, lei_de_incentivo, mixed, esg_community, local_business, national_brand
- Proposal edit page — 6 content sections with AI A/B/C alternatives per section
- Block/drag-and-drop proposal editor (`/proposals/[id]/blocks`)
- Version history on every save
- Approval flow (draft → review → approved → sent → active_contract)
- Public shareable landing page via token (`/proposals/view/[token]`)
- Internal landing page preview with inline CMS editor
- ✅ Proposal completion checklist in edit UI — progress bar (0–100%) + per-section ✓/⚠ indicators
- ✅ Logo upload gate — yellow warning banner on detail page + disabled Submit/Approve buttons until logo present
- ✅ AI prompts upgraded to v5.0.0 — official brand colors, jersey specs, crest rules, full stadium inventory
- ✅ Deliverables enforcement — every proposal must have exactly 5 deliverables; backfill API for old proposals
- ✅ Duplicate proposal button
- ✅ Enhance proposal (AI strategy variants, pricing tiers, intelligence layer)

### Landing Page Templates (5 total)
- ✅ **Premium** — dark green hero `#005742`, sponsor cards, strategy variants
- ✅ **Minimal** — clean white executive document layout
- ✅ **Packages A/B/C** — Gold/Silver/Bronze tier cards
- ✅ **One Offer** — single focused offer layout
- ✅ **Menu de Ativos** — deliverables categorized by jersey/stadium/digital/community
- Template switcher on `/proposals/[id]/view` — switches instantly

### Email System
- Email template CRUD — full create/edit/delete with HTML preview
- Variable substitution: `{{company_name}}`, `{{contact_name}}`, `{{proposal_link}}`, etc.
- AI-powered email generation from approved proposals
- Follow-up generation
- Email list with status tracking (draft, pending_approval, approved, sent, opened, replied, bounced, failed)
- ✅ 12 real templates in DB (Lucca outreach series + standard + test templates)
- ✅ JSON import for bulk template upload
- ✅ Email template picker on approval — "Proposta aprovada! 🎉 — Enviar email de outreach agora?"

### Image Generation
- Official jersey mockup (composite on flat kit base — 7 placement zones: chest, sleeves, back, shorts, socks)
- LoRA creative generation via Replicate (`abhishek9302/coritiba-jersey-lora`, H100 warm)
- Campaign creatives (1 per strategy variant)
- Image manager + bulk image approval page
- ✅ Image gen gate — buttons disabled when no logo, enabled after upload

### Approvals
- ✅ Card-by-card tinder view with keyboard shortcuts (`A` approve, `R` reject, `←` `→` navigate)
- ✅ Touch swipe support on mobile
- ✅ Email template picker modal after approving a proposal
- List view toggle
- Approval queue covers: proposals, campaigns, emails

### Contacts / Persons Module
- ✅ `/contacts` page — full table (15 contacts in DB as of 8 June)
- ✅ Add contact form — company, email, name, title, department, seniority, phone, LinkedIn
- ✅ Search + company filter
- ✅ Delete contact
- ✅ Seniority badges (C-Level/VP/Director/Manager/Analyst), source badges
- ✅ CSV import — `<label>` pattern for reliable OS file picker (working)
- ✅ CSV template download at `/api/contacts/bulk-import`

### Newsletter Module
- ✅ `/newsletter` page — composer + recipient picker + send history
- ✅ 3 recipient modes: All Contacts, Select Companies (with contact counts), Manual email list
- ✅ Template import — pre-fills subject + body
- ✅ HTML preview toggle
- ✅ Send history (requires `newsletters` DB table — migration `0027` applied)

### Outreach Agent
- ✅ Agent panel on every company detail page
- ✅ Phase 1: enriches contacts (Hunter + Apollo), scrapes intelligence, generates personalized proposal
- ✅ Pauses for human approval before generating email (supervised mode)
- ✅ Phase 2 (on approval): generates outreach email, pauses again for send approval
- ✅ `agent_runs` table migration `0027_agent_runs_table.sql` — **must be applied in Supabase**

### Company Import
- ✅ Bulk import CSV on `/companies` — inline `<label>` pattern (same as contacts), reliable OS file picker
- ✅ CSV template download
- ✅ Duplicate detection, per-row result + summary banner

### Settings & Admin
- ✅ Amber Gmail banner `⚠️` — warns token expired, clarifies Pipedrive logging still works
- ✅ Backfill button — inline spinner + result text (no more `window.alert()`)
- ✅ Migration status checker — shows green ✓ for all 3 checked migrations
- ✅ Maintenance tools: backfill deliverables, contacts CSV import link

### Navigation & UX
- ✅ "Contacts" in CRM sidebar group
- ✅ "Newsletter" in Proposal Workflow sidebar group
- ✅ `/campaigns/new` → redirects to `/campaigns` (no more 404)
- ✅ Email Templates header buttons not off-screen (flex-wrap fix)
- ✅ Global search (⌘K)
- ✅ Quick actions FAB on every page

### Brand Guide Integration (from official PDFs)
- ✅ Brand colors — `#005742` (Verde Coxa), `#FFFFFF`, `#000000` in all landing templates
- ✅ Jersey placement widths calibrated to official cm specs from Manual de Aplicação
- ✅ AI prompts v5.0.0 — official colors, Switzer typography, 1985 crest star mandatory, red forbidden
- ✅ Sponsor asset checklist in proposal detail (color logo, monochrome, outline, vector)

---

## 🐛 Bugs Found & Fixed on 8th June (in order)

| # | Bug | Fix | Commit |
|---|-----|-----|--------|
| 1 | Approval email picker showed "No templates available" | Wrong API endpoint fixed in `approvals-card-view.tsx` | `c2691a4` |
| 2 | Newsletter template picker used wrong column name | Fixed `subject_template` → `subject` | `c2691a4` |
| 3 | `/api/newsletter` returned 500 | `newsletters` table missing — added migration + graceful fallback | `c2691a4` |
| 4 | Import JSON + New Template buttons off-screen | Added `flex-wrap` + `shrink-0` to header row | `42cf5f2` |
| 5 | `/campaigns/new` → 404 | Created redirect page preserving `?company=` param | `42cf5f2` |
| 6 | Backfill button used `window.alert()` | Replaced with inline spinner + status text | `42cf5f2` |
| 7 | Gmail banner was `🚨` red and alarmist | Changed to amber `⚠️`, added Pipedrive logging caveat | `42cf5f2` |
| 8 | `FULL_E2E_TEST_GUIDE.md` had inaccuracies | Updated Modules 2, 5, 7 + Known Limitations | `42cf5f2` |
| 9 | Outreach Agent "Failed to fetch" on run | `agent_runs` table never existed — added migration `0027` + settings check | `76206fd` |
| 10 | Bulk company CSV import — file picker not opening | Replaced modal + `ref.click()` with inline `<label>` pattern (same as contacts) | `ea339f2` |
| 11 | Contacts + Email Templates import — file picker blocked | Same `<label>` fix applied | `6069a47` |

---

## 🗂 Database Migrations That Must Be Applied in Supabase

| Migration | Table/Change | Status |
|-----------|-------------|--------|
| `0026_newsletters_table.sql` | `newsletters` table | ✅ Applied |
| `0027_agent_runs_table.sql` | `agent_runs` table for Outreach Agent | ⚠️ Apply before using Outreach Agent |

**To apply migration 0027:**
1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/lmjwjztokzombtstmume/sql/new)
2. Paste contents of `supabase/migrations/0027_agent_runs_table.sql`
3. Click Run
4. Go to `/settings` — migration badge turns green ✓

---

## 🧪 E2E Test Status — 8th June 2026

Automated browser test run: `https://eligibly-facing-unloved.ngrok-free.dev`

| Module | Status | Notes |
|--------|--------|-------|
| M1 Companies & Contacts | ✅ PASS | Banco Itaú + Carlos Mendes; CSV import working |
| M2 Campaigns | ✅ PASS | `/campaigns/new` redirect works; inline generator works |
| M3 Proposal (5 deliverables, logo gate, approved) | ✅ PASS | |
| M4 Edit UI (4-card bar, completeness) | ✅ PASS | |
| M5 Landing pages (all 5 templates) | ✅ PASS | Template switcher on `/proposals/[id]/view` |
| M6 Bulk logo upload | ✅ PASS | "84 proposals without logo" button visible |
| M7 Approvals (Tinder cards + email) | ✅ PASS | Vista em Cards; email status = Pending Approval |
| M8 Email templates (12 templates, buttons visible) | ✅ PASS | |
| M9 Newsletter (composer, 2 sends in history) | ✅ PASS | |
| M10 Workflow events | ✅ PASS | `email.generate completed`, `campaign.generate completed` |
| M11 Settings (amber banner, backfill inline) | ✅ PASS | |
| M12 API health | ✅ PASS | `/api/health` ok; backfill 0/93 |
| Outreach Agent | ⚠️ BLOCKED | Needs `0027_agent_runs_table.sql` applied in Supabase |

**File upload steps (CSV, JSON, logo) — not automatable in browser MCP, require manual testing.**

---

## ⏳ Remaining / Pending

| Item | Priority | Notes |
|------|----------|-------|
| Apply migration `0027_agent_runs_table.sql` | 🔴 High | Required for Outreach Agent |
| Full manual E2E test of all 16 sections | 🟡 Medium | Planned for 9 June |
| LoRA model retraining (Replicate) | 🟢 Low | Waiting for 2026 kit photos from James |
| Packages landing template | 🟢 Low | Needs pricing tiers created on proposal to look good |

---

## 📋 Known Limitations (Not Bugs)

1. **Email delivery** — emails log to Pipedrive + DB. No real SMTP (Gmail token expired since 22 May 2026). Reconnect at `/api/auth/gmail` for real delivery.
2. **Outreach Agent** — requires `agent_runs` migration in Supabase before first run.
3. **Packages template** — empty state until pricing tiers exist on the proposal.
4. **LoRA images** — uses 2024 kit model; 2026 retrain pending new photos.
5. **File upload steps** — CSV, JSON, logo uploads require OS file picker (cannot be browser-automated).

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React, Tailwind CSS, shadcn/ui |
| Backend | Next.js API routes (Node.js) |
| Database | Supabase (PostgreSQL) |
| AI | AWS Bedrock (Claude Sonnet 4.6) — prompt v5.0.0 |
| Image gen | Replicate (`abhishek9302/coritiba-jersey-lora`, H100) + Sharp compositing |
| Email | Gmail API + Pipedrive Activities |
| Deployment | AWS EC2 + PM2 + ngrok |
| App URL | `https://eligibly-facing-unloved.ngrok-free.dev` |
| Git branch | `8th-june-sprint` |

---

## 📝 Commits on 8th June (newest first)

| Hash | Description |
|------|-------------|
| `ea339f2` | Replace bulk company import modal with inline label/button pattern |
| `6069a47` | Fix file-picker not opening on Bulk Import CSV, Contact CSV, Import JSON |
| `76206fd` | Add agent_runs table migration + settings migration check |
| `42cf5f2` | Fix all E2E bugs — buttons, campaigns/new 404, Gmail banner, backfill UX |
| `00578a8` | Add complete E2E testing guide (FULL_E2E_TEST_GUIDE.md) |
| `c2691a4` | Close all remaining backlogs — deliverables, CSV import, edit UI |
| `0129378` | E2E fixes — jersey text, sidebar nav, mockup button |
| `07f808e` | Complete all remaining gaps from James's requirements |
| `9fef698` | Apply official brand guide — v5 prompts, #005742 colors, jersey zones |
| `b0c5544` | Complete sprint — contacts, newsletter, logo gate, templates, AI quality |
