# Complete Manual Test Plan — Every Feature

**App:** https://eligibly-facing-unloved.ngrok-free.dev  
**Suggested test company:** Banco Itaú (or create fresh with steps below)  
**Time:** ~2–3 hours for full pass  
**Tip:** Keep one browser tab on the app and tick the checklist at the bottom as you go.

---

## Before you start

1. Open https://eligibly-facing-unloved.ngrok-free.dev
2. Log in at `/login` if prompted
3. Confirm the left sidebar shows **Coritiba FC — Commercial Intelligence**
4. Have ready:
   - Any PNG/JPG logo file (for logo upload tests)
   - A text editor to create `templates.json` (Module 8.3)
   - An incognito/private window (for public landing page test)

---

## SECTION 0 — Global UX

### 0.1 Login / Logout
1. Go to `/login` → sign in
2. ✅ You land on Dashboard (`/`)
3. Bottom of sidebar → click **Sign out** (logout icon)
4. ✅ Redirected to `/login`
5. Log back in

### 0.2 Global search
1. Sidebar → click **Search…** (or press **⌘K** / **Ctrl+K**)
2. Type `Banco Itaú`
3. ✅ Matching companies/proposals appear
4. Click a result → navigates to that page

### 0.3 Sidebar navigation
Expand each group and confirm every link loads without 404:

| Group | Links |
|-------|-------|
| **CRM** | Dashboard, Companies, Contacts, Pipeline, Sponsor Reports |
| **Proposal Workflow** | New Proposal, Campaigns, Bulk Campaigns, Bulk Approve, Proposals, Approvals, Emails, Email Templates, Newsletter, Threads, Follow-ups |
| **Intelligence** | Coritiba Intel, Inventory, Barter / Procurement, Lei de Incentivo, Brand Assets |
| **Media & Visuals** | AI Image Gen, Mockup Editor, Asset Library |
| **Integrations** | CRM Sync |
| **System** | Workflows, Audit, Maintenance, Settings, Team & Roles (admin only) |

### 0.4 Quick actions (floating button)
1. On any page → click the **Quick actions** FAB (bottom-right)
2. ✅ Menu shows: New Proposal, Add Company, Generate Campaign, AI Image, Create Mockup, View Inventory
3. Click **New Proposal** → goes to `/proposals/new`

---

## SECTION 1 — CRM

### 1.1 Dashboard (`/`)
1. Open `/`
2. ✅ Stats cards: Companies, Campaigns, Proposals, Pending approvals
3. ✅ **Recent proposals** list loads
4. ✅ **Recent emails** list loads
5. ✅ **Activity feed** shows recent audit events
6. Click any proposal row → opens proposal detail

### 1.2 Add a company (`/companies`)
1. Go to `/companies`
2. Click **Add Company** (top right)
3. Fill in:
   - Name: `Banco Itaú Test`
   - Industry: `Financeiro / Bancos`
   - Website: `https://www.itau.com.br`
   - Country: `BR`
   - Notes: `Manual E2E test company`
4. Click **Save**
5. ✅ Company appears in the list
6. Click the company row → opens `/companies/[id]`

### 1.3 Company detail page
1. On company detail page, verify:
   - Company name, industry, website
   - **Proposals** tab/section lists linked proposals
   - **Campaigns** section
2. If **Run AI Intelligence** / enrich button exists → click it, wait ~30s
3. ✅ AI analysis text appears (or loading completes without error)

### 1.4 Bulk company import (`/companies`)
1. Back on `/companies` → click **Bulk Import** (if visible)
2. Download template → upload a CSV with 1–2 test companies
3. ✅ Success message; companies appear in list

### 1.5 Contacts — manual add (`/contacts`)
1. Go to `/contacts`
2. Click **Add Contact**
3. Fill in:
   - Company: `Banco Itaú Test` (or Banco Itaú)
   - Email: `mkt.parceria@itau.com.br`
   - Full Name: `Carlos Mendes`
   - Title: `Marketing Director`
   - Department: `Marketing`
   - Seniority: `Director`
   - Phone: `+55 11 98888-0001`
4. Click **Save Contact**
5. ✅ Contact appears with company badge + **Director** seniority badge

### 1.6 Contacts — search & filter
1. Type `Carlos` in search box
2. ✅ Table filters to Carlos Mendes
3. Clear search → use **Company** dropdown → select Banco Itaú
4. ✅ Only Itaú contacts shown

### 1.7 Contacts — CSV import
1. Click **CSV template** (small link next to Import CSV) → file downloads
2. Open in Excel/Numbers, add a row:
   ```
   maria.santos@itau.com.br,Maria Santos,Head of Sponsorship,Commercial,director,+55 11 97777-0002,https://linkedin.com/in/mariasantos,Banco Itaú,Sponsorship budget owner
   ```
3. Save as CSV
4. Click **Import CSV** → select your file
5. ✅ Green success: `Imported 1 contact(s)`
6. ✅ Maria Santos appears in table

### 1.8 Contacts — delete
1. Click **trash** icon on a test contact you created
2. Confirm deletion
3. ✅ Contact removed from list

### 1.9 Pipeline (`/pipeline`)
1. Go to `/pipeline`
2. ✅ Kanban board with pipeline stages loads
3. Drag a company card from one column to another
4. ✅ Card moves; stage updates

### 1.10 Sponsor Reports (`/reports`)
1. Go to `/reports`
2. ✅ Report/dashboard loads (sponsor metrics, charts, or table)
3. Change any date/filter controls if present
4. ✅ Data refreshes without error

---

## SECTION 2 — Campaigns

### 2.1 Inline campaign generator (`/campaigns`)
1. Go to `/campaigns`
2. Left panel **Generate ideas**:
   - Company: select `Banco Itaú`
   - Objective (optional): `National brand awareness via Coritiba FC`
3. Click **Generate ideas**
4. Wait 30–90 seconds
5. ✅ 3–5 campaign ideas appear in the right list
6. ✅ Ideas mention Coritiba FC, Couto Pereira, Curitiba, or Verde Coxa
7. ✅ Ideas do **NOT** mention Athletico, Flamengo, Corinthians

### 2.2 Campaign detail
1. Click any generated campaign row → `/campaigns/[id]`
2. ✅ Title, summary, company name visible
3. Click **Generate Proposal** (if shown) → starts proposal flow OR links to wizard

### 2.3 `/campaigns/new` redirect
1. Paste in address bar: `/campaigns/new?company=YOUR_COMPANY_ID`
2. ✅ Redirects to `/campaigns?company=...` (no 404)
3. ✅ Company pre-selected in generator

### 2.4 Bulk campaigns (`/campaigns/bulk`)
1. Go to `/campaigns/bulk`
2. Select industry chip e.g. **Financeiro**
3. Click **Find companies** (or equivalent)
4. ✅ List of matching companies loads
5. Check 2–3 companies → click **Generate campaigns + proposals** (bulk action)
6. Wait (can take several minutes)
7. ✅ Per-company status: success ✓ or error ✗
8. Go to `/proposals` → new proposals exist for selected companies

---

## SECTION 3 — Proposal wizard (all 7 types)

### 3.1 Verify all 7 types visible
1. Go to `/proposals/new`
2. Step 1 — confirm **7 cards**:
   - Sponsorship
   - Barter / Goods
   - Lei de Incentivo
   - Mixed Proposal
   - ESG / Community
   - Local Business
   - **National Brand** (indigo card)
3. Click each card briefly → ✅ wizard advances to Step 2 each time (use Back to return)

### 3.2 Full proposal creation (National Brand)
1. Step 1: **National Brand** → **Next**
2. Step 2: Select `Banco Itaú` → **Next**
3. Step 3 — Components: check 3–5 items (e.g. Jersey Chest, LED Board, Instagram Post) → **Next**
4. Step 4 — Strategy: pick e.g. **Brand Awareness** + **Fan Engagement** → **Next**
5. Step 5 — Generate: click **Generate Proposal**
6. Wait 30–90 seconds
7. Step 6 — Review: click **Create Proposal** / **Finish**
8. ✅ Redirected to `/proposals/[id]`
9. ✅ Sections present: Executive Summary, Campaign Rationale, Sponsorship Value, Activation Plan, **Deliverables (5 items)**, Investment, CTA
10. Copy the proposal URL — you'll use it throughout

### 3.3 Logo warning gate
1. On proposal detail (no logo yet)
2. ✅ Yellow banner: `⚠️ No sponsor logo uploaded — landing page will show initials only, image generation is locked`
3. ✅ **Submit for Review** button is **disabled**
4. Scroll to **Brand Assets**
5. ✅ 4-item checklist: Color logo ○, Monochrome ○, Outline ○, Vector ○

### 3.4 Upload sponsor logo
1. In **Brand Assets** → click **Upload Logo** / drop zone
2. Select any PNG/JPG
3. ✅ Logo appears
4. ✅ Yellow warning banner **disappears**
5. ✅ First checklist item turns **✓**
6. ✅ Blue banner: auto-generating campaign images (wait 30–60s)
7. ✅ Submit/Approve buttons become enabled

### 3.5 Jersey mockup (`Visuais` section)
1. Scroll to **Visuais** / **Graphics**
2. Tab **Jersey Mockup** (or **Mockup Oficial**)
3. Click **Gerar Mockup Oficial**
4. Select placement: `chest_sponsor` (or chest)
5. Wait 30–60s
6. ✅ Jersey image with sponsor logo/text on Coritiba kit
7. Try another zone: sleeve, back, shorts, socks — one each is enough

### 3.6 Campaign creatives
1. Tab **Criativos de Campanha** (Campaign images)
2. Click **Gerar para todas** (or per-strategy **Gerar**)
3. Wait 30–90s per image
4. ✅ Images appear per strategy variant
5. ✅ Prompts reference Couto Pereira / `#005742` Verde Coxa

### 3.7 Generate outreach email (on proposal page)
1. Scroll to **Emails** section on proposal detail
2. Click **Generate email** / **New outreach email**
3. Wait ~20s
4. ✅ Email draft references Banco Itaú, Coritiba FC, deliverables
5. Edit subject if desired → click **Send** / **Enviar**
6. Go to `/emails` → ✅ email appears (status may be `pending_approval` or `draft`)

### 3.8 Enhance proposal (AI)
1. Top bar → click **Enhance** (sparkles button)
2. Wait ~60s
3. ✅ Strategy variants, pricing tiers, or intelligence layer added
4. Refresh page → new sections visible

### 3.9 Duplicate proposal
1. Click **Duplicate** button on proposal detail
2. ✅ New draft proposal created
3. ✅ Opens or appears in `/proposals` list

### 3.10 Share link (public)
1. Click **Share** button
2. ✅ Share URL copied (or modal shows link like `/proposals/view/[token]`)
3. Open link in **incognito** window
4. ✅ Public page loads **without login**
5. ✅ Brand green is `#005742` (dark forest green, not bright lime)
6. ✅ Fixed bottom CTA: **Tenho interesse** / **Ver proposta completa**

---

## SECTION 4 — Proposal edit UI

### 4.1 Edit page layout (`/proposals/[id]/edit`)
1. Click **Edit** on proposal detail
2. ✅ Top **4-card bar**: Company | Campaign | Version | Deliverables
3. ✅ Deliverables card shows green **5 items** (not ⚠ Missing)
4. ✅ **Completeness** progress bar (0–100%) with per-section ✓/⚠

### 4.2 AI A/B/C alternatives
1. Find **Executive Summary** section
2. Click **Generate A / B / C options**
3. Wait ~20s
4. ✅ Three alternatives (A, B, C) with different tones
5. Click one to select it
6. Click **Save** (top)
7. ✅ Toast: saved; version increments (v1 → v2)

### 4.3 Edit deliverables manually
1. Scroll to **Deliverables**
2. Change one bullet to custom text
3. Save
4. ✅ Change persists on reload

### 4.4 Block editor (`/proposals/[id]/blocks`)
1. From edit page or proposal detail → open **Blocks** editor (if linked)
2. ✅ Drag-and-drop block list loads
3. Reorder one block
4. Save
5. ✅ Order persists

---

## SECTION 5 — Landing page templates

### 5.1 Internal view (`/proposals/[id]/view`)
1. On proposal detail → click **Landing Page ↗**
2. Opens `/proposals/[id]/view` (no internal sidebar)
3. ✅ Template picker bar at top with **5 options**:
   - Premium
   - Minimal
   - Packages A/B/C
   - One Offer
   - Menu de Ativos

### 5.2 Test each template
Click each and verify layout changes:

| Template | Expected |
|----------|----------|
| **Premium** | Dark green hero `#005742`, rich sponsor cards |
| **Minimal** | Clean white executive layout |
| **Packages A/B/C** | Tier cards (Gold/Silver/Bronze) — may show empty state if no pricing tiers |
| **One Offer** | Single focused offer + **Quero essa oferta** CTA |
| **Menu de Ativos** | Deliverables grouped: Jersey & Kit, Estádio, Digital, etc. |

4. Click **Editar Proposta** → returns to main app

---

## SECTION 6 — Proposals list & bulk logo

### 6.1 Proposals list (`/proposals`)
1. Go to `/proposals`
2. ✅ Proposals listed with status badges
3. Use filters: search, status, company, industry
4. Click **Apply** → list filters correctly

### 6.2 Bulk logo upload
1. On `/proposals` — if proposals lack logos, amber button appears:
   **Bulk Logo Upload — N proposals without logo**
2. Click it → panel expands
3. Click **Select all** (or check 2–3 proposals)
4. Choose a PNG logo file
5. Click **Upload to X proposals**
6. ✅ Per-proposal progress: Uploading… → ✓ Done
7. Reload → those proposals now have logos; count decreases

---

## SECTION 7 — Approvals (Tinder flow)

### 7.1 Card view
1. Go to `/approvals`
2. Default is **list view** → click **Vista em Cards** (top right)
3. ✅ Single card with **Rejeitar | Editar | Aprovar**
4. Keyboard (card view only):
   - `←` = previous card
   - `→` = next card
   - `A` = approve
   - `R` = reject
5. ✅ Card animates and advances

### 7.2 Approve → email template picker
1. Find a **Banco Itaú** proposal in **under_review** (or submit one for review first)
2. Click **Aprovar**
3. ✅ Inline picker: `Proposta aprovada! 🎉 — Enviar email de outreach agora?`
4. Dropdown → select template (e.g. **Proposta Inicial — Banco** or **Lucca — Warm up**)
5. Click **Enviar email**
6. Go to `/emails` → search `itau`
7. ✅ Email created with status **Pending Approval** (NOT `sent` — that's by design)
8. Or click **Pular** → skips email, next card

### 7.3 List view toggle
1. Click **Vista em Lista** → table of pending items
2. ✅ Proposals, campaigns, and emails in queue

---

## SECTION 8 — Bulk approve images (`/proposals/bulk-approve`)
1. Go to `/proposals/bulk-approve`
2. ✅ Pending image jobs and draft proposals listed
3. For any pending image → click **Approve** / select best variant
4. ✅ Job status updates to approved

---

## SECTION 9 — Email system

### 9.1 Email history (`/emails`)
1. Go to `/emails`
2. ✅ List of outreach emails with status badges
3. Search `itau` → click **Filter**
4. Click an email row → `/emails/[id]`
5. ✅ Full subject, body HTML, recipient, status shown
6. If status is **Pending Approval** → approve/send actions available (if your role allows)

### 9.2 Email templates CRUD (`/settings/email-templates`)
1. Go to `/settings/email-templates`
2. ✅ **Import JSON** and **New Template** buttons both visible (not cut off screen)
3. Click **New Template**
4. Fill in:
   - Name: `Proposta Inicial — Manual Test`
   - Subject: `{{company_name}} × Coritiba FC — Proposta de Parceria`
   - Body: `<p>Prezado {{contact_name}},</p><p>Segue nossa proposta: {{proposal_link}}</p>`
5. Save
6. ✅ Template in list; `{{variables}}` shown as blue badges
7. Click **Preview** → rendered HTML
8. Click **Duplicate** → copy created
9. Delete the duplicate → removed

### 9.3 Import templates via JSON
1. Create `templates.json`:
   ```json
   [
     {
       "name": "Follow-up Week 1",
       "subject": "Re: {{company_name}} × Coritiba FC",
       "body_html": "<p>{{contact_name}}, checking in. {{proposal_link}}</p>"
     },
     {
       "name": "Final Reminder",
       "subject": "Last chance — {{company_name}} × Coritiba FC",
       "body_html": "<p>Hi {{contact_name}}, final follow-up.</p>"
     }
   ]
   ```
2. Click **Import JSON** → select file
3. ✅ `Imported 2 template(s)`
4. ✅ Both appear in list

---

## SECTION 10 — Newsletter (`/newsletter`)

### 10.1 Compose & send
1. Go to `/newsletter`
2. Subject: `Coritiba FC — Oportunidades de Patrocínio 2026`
3. Click **Importar Template** / template dropdown → pick any template
4. ✅ Subject + body auto-fill
5. Toggle **HTML preview** → rendered content
6. Recipients — test all 3 modes:
   - **Todos os Contatos** → shows total count
   - **Empresas Específicas** → check Banco Itaú (+ 1 other)
   - **Emails Manuais** → type `test@example.com`
7. Click **Enviar Newsletter**
8. ✅ Success toast
9. ✅ Entry in **Send history** at bottom (date, recipients, status)

---

## SECTION 11 — Threads & Follow-ups

### 11.1 Gmail threads (`/threads`)
1. Go to `/threads`
2. ✅ Thread list loads (may be empty if Gmail not connected)
3. If threads exist → click one → `/threads/[id]`
4. ✅ Message history visible

### 11.2 Follow-ups (`/followups`)
1. Go to `/followups`
2. ✅ Pending follow-up suggestions listed
3. Click **Generate** / **Send** on one item (if any)
4. ✅ Status updates

---

## SECTION 12 — Intelligence modules

### 12.1 Coritiba Intel (`/coritiba-intelligence`)
1. Go to `/coritiba-intelligence`
2. ✅ Dashboard with club data, discovery tools, or intel panels
3. Run any **Discover** / search action if available
4. ✅ Results load without error

### 12.2 Inventory (`/inventory`)
1. Go to `/inventory` (or Settings → Inventory)
2. ✅ Sponsorship inventory items listed (jersey, LED, VIP, etc.)
3. Add or edit one item
4. Save → ✅ persists

### 12.3 Barter (`/barter`)
1. Go to `/barter`
2. ✅ Barter/procurement proposals or items load
3. Create or view a barter entry

### 12.4 Lei de Incentivo (`/lei-de-incentivo`)
1. Go to `/lei-de-incentivo`
2. ✅ Tax-incentive project list/form loads

### 12.5 Brand Assets (`/brand-assets`)
1. Go to `/brand-assets`
2. ✅ Coritiba official assets (logos, guidelines) listed
3. Upload or browse assets

---

## SECTION 13 — Media & visuals

### 13.1 AI Image Gen (`/media-generation`)
1. Go to `/media-generation`
2. ✅ Image generation interface loads
3. Enter a prompt mentioning Coritiba jersey / Couto Pereira
4. Generate → wait
5. ✅ Image returns (or clear error if Replicate down)

### 13.2 Mockup Editor (`/mockup-editor`)
1. Go to `/mockup-editor`
2. ✅ Canvas/editor loads
3. Place a logo on kit template
4. Export/save if available

### 13.3 Asset Library (`/assets`)
1. Go to `/assets`
2. ✅ Generated/uploaded media assets listed
3. Filter by proposal or type
4. Click asset → preview

---

## SECTION 14 — Integrations

### 14.1 CRM Sync (`/crm-sync`)
1. Go to `/crm-sync`
2. ✅ Pipedrive sync status panel
3. Click **Sync now** / **Pull companies** (if shown)
4. ✅ Sync completes or shows last-sync timestamp

### 14.2 Gmail reconnect (`/settings`)
1. Go to `/settings`
2. ✅ Amber banner: `⚠️ Gmail token expired` + note that Pipedrive logging still works
3. Click **Reconnect Gmail** → OAuth flow starts
4. (Optional) Complete OAuth if you want real Gmail send/reply sync

---

## SECTION 15 — System & admin

### 15.1 Workflows (`/workflow-events`)
1. Go to `/workflow-events`
2. ✅ Table of events: `proposal.generate`, `campaign.generate`, `email.generate`, etc.
3. Filter tabs: All | started | processing | completed | failed | retried
4. ✅ Your test runs from today appear with timestamps

### 15.2 Audit log (`/audit`)
1. Go to `/audit`
2. ✅ Recent actions: company.created, proposal.generated, email.sent, etc.
3. Filter by action type if available

### 15.3 Maintenance (`/system`)
1. Go to `/system`
2. ✅ System health, cache, or maintenance tools load

### 15.4 Settings (`/settings`)
1. Go to `/settings`
2. ✅ Quick links: Team Members, Email Templates, Inventory, Platform
3. ✅ AI model: `claude-sonnet-4-6`, prompt `v5.x`
4. ✅ **Database migration status** — all rows green ✓
5. Scroll to **Maintenance tools**:
   - Click **Check count** → new tab: `{"proposals_missing_deliverables":0,"total_fetched":93}`
   - Click **Run backfill (10 proposals)** → spinner → inline: `✓ Nothing to backfill — all proposals have deliverables` (no browser alert)
6. **Import contacts from CSV** section → **Go to Contacts page** link works

### 15.5 Team members (`/settings/team`)
1. Go to `/settings/team`
2. ✅ Sender profiles / team members listed
3. Add or edit a sender profile

### 15.6 Team & Roles (`/users`) — admin only
1. Go to `/users`
2. ✅ User list with roles (Admin, Sales Rep, Approver, Viewer)
3. Change a user's role → save
4. ✅ Role badge updates in sidebar for that user

---

## SECTION 16 — API smoke tests

Paste each URL in the browser address bar:

| URL | Expected |
|-----|----------|
| `/api/health` | `{"status":"ok","checks":{"database":{"ok":true}}}` |
| `/api/proposals/backfill-deliverables` | `{"proposals_missing_deliverables":0,...}` |
| `/api/proposals?limit=1` | JSON array with at least 1 proposal |
| `/api/contacts/bulk-import` | CSV file downloads |
| `/api/audit` | JSON array of recent audit events |

---

## Master checklist (copy & tick)

```
SETUP
[ ] 0.1  Login / logout
[ ] 0.2  Global search (⌘K)
[ ] 0.3  All sidebar links load
[ ] 0.4  Quick actions FAB

CRM
[ ] 1.1  Dashboard stats + activity
[ ] 1.2  Add company
[ ] 1.3  Company detail + AI enrich
[ ] 1.4  Bulk company import
[ ] 1.5  Add contact manually
[ ] 1.6  Contact search + filter
[ ] 1.7  Contact CSV import
[ ] 1.8  Delete contact
[ ] 1.9  Pipeline drag-drop
[ ] 1.10 Sponsor reports

CAMPAIGNS
[ ] 2.1  Inline AI campaign generator
[ ] 2.2  Campaign detail page
[ ] 2.3  /campaigns/new redirect
[ ] 2.4  Bulk campaigns by industry

PROPOSALS
[ ] 3.1  Wizard — all 7 types visible
[ ] 3.2  Full National Brand proposal created
[ ] 3.3  Logo warning gate
[ ] 3.4  Logo upload + auto images
[ ] 3.5  Jersey mockup (all zones)
[ ] 3.6  Campaign creatives
[ ] 3.7  Generate outreach email on proposal
[ ] 3.8  Enhance proposal (AI)
[ ] 3.9  Duplicate proposal
[ ] 3.10 Public share link (incognito)

EDIT UI
[ ] 4.1  Edit page 4-card bar + completeness
[ ] 4.2  AI A/B/C alternatives + save
[ ] 4.3  Edit deliverables manually
[ ] 4.4  Block editor drag-drop

LANDING PAGES
[ ] 5.1  /proposals/[id]/view opens
[ ] 5.2  All 5 templates switch correctly

BULK OPS
[ ] 6.1  Proposals list filters
[ ] 6.2  Bulk logo upload

APPROVALS
[ ] 7.1  Vista em Cards + keyboard shortcuts
[ ] 7.2  Approve → template picker → email Pending Approval
[ ] 7.3  List view toggle
[ ] 8.0  Bulk approve images

EMAILS
[ ] 9.1  Email history + detail page
[ ] 9.2  Template CRUD + preview
[ ] 9.3  JSON template import

NEWSLETTER
[ ] 10.1 All 3 recipient modes + send + history

THREADS & FOLLOW-UPS
[ ] 11.1 Threads page
[ ] 11.2 Follow-ups page

INTELLIGENCE
[ ] 12.1 Coritiba Intel
[ ] 12.2 Inventory
[ ] 12.3 Barter
[ ] 12.4 Lei de Incentivo
[ ] 12.5 Brand Assets

MEDIA
[ ] 13.1 AI Image Gen
[ ] 13.2 Mockup Editor
[ ] 13.3 Asset Library

INTEGRATIONS
[ ] 14.1 CRM Sync
[ ] 14.2 Gmail banner + reconnect (optional)

SYSTEM
[ ] 15.1 Workflow events
[ ] 15.2 Audit log
[ ] 15.3 Maintenance page
[ ] 15.4 Settings + backfill inline status
[ ] 15.5 Team members
[ ] 15.6 Team & roles (admin)

API
[ ] 16.1 /api/health
[ ] 16.2 /api/proposals/backfill-deliverables
[ ] 16.3 /api/proposals?limit=1
[ ] 16.4 /api/contacts/bulk-import
[ ] 16.5 /api/audit
```

---

## Known limitations (not bugs)

1. **Emails from approval** → status **Pending Approval**, not `sent`. A human approves before delivery.
2. **No real SMTP** — emails log to Pipedrive + DB. Gmail OAuth needed for actual inbox delivery.
3. **Gmail token expired** — only affects reply sync in Threads; outreach logging still works.
4. **Packages template** — empty until pricing tiers exist on the proposal.
5. **Replicate LoRA** — uses 2024 kit model; 2026 retrain pending photos from James.
6. **AI generation** — each step takes 20–90 seconds; wait before clicking again.

---

If you want this saved as a file in the repo (e.g. `MANUAL_TEST_ALL.md`), say the word and I'll add it.