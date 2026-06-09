# Complete Manual Test Plan — Every Feature

**App:** https://eligibly-facing-unloved.ngrok-free.dev  
**Suggested test company:** Banco Itaú (or create fresh with steps below)  
**Time:** ~2–4 hours for full pass (including new sections)  
**Tip:** Keep one browser tab on the app and tick the checklist at the bottom as you go.

---

## RECENT FIXES — Quick regression tests (run these FIRST)

These 6 tests directly verify the bugs that were just fixed. If any fail, stop and report.

### RF-1 Jersey mockup placement is correct (commit b4a59c1)
> **Bug fixed:** Sponsor zone overlapped the CFC crest — logo was placed on top of the badge, making it invisible.

1. Open any existing proposal that has a logo uploaded (or create one — see Section 3)
2. Scroll to **Visuais / Graphics** → the **Jersey Mockup — Official** card (green header)
3. Keep default placement **Peito — Patrocinador principal** (chest sponsor)
4. Click **Generate Mockup** → confirm in the modal
5. Wait 5–10 seconds
6. ✅ **PASS:** The sponsor logo/badge appears on the **LEFT side of the front jersey** — clearly separate from the green CFC crest which is on the right
7. ✅ **PASS:** The CFC crest badge is **unchanged** (same size, same design, untouched)
8. ❌ **FAIL if:** The image shows only the blank jersey, or the logo appears on top of / blending into the crest

### RF-2 Logo is always consistent — never changes (commit 49c3f8c)
> **Bug fixed:** Logo silently fell back to sponsor name text if URL fetch failed, making the mockup look different between generations.

1. On the same proposal with logo uploaded → generate the official jersey mockup **twice** (click Generate → confirm, wait, then click Regenerate → confirm)
2. ✅ **PASS:** Both images show **the same sponsor logo** in the same position
3. ✅ **PASS:** No text-name badge appears instead of the logo
4. Now open a proposal **without a logo** uploaded
5. ✅ **PASS:** The Generate Mockup button is **disabled** (greyed out) — it requires a logo
6. ✅ **PASS:** A lock notice is visible: *"Upload a logo in Brand Assets before generating a jersey mockup"*
7. ❌ **FAIL if:** The button works without a logo and produces a text badge, OR the two generations show different logos

### RF-3 Logo is visible on dark jersey (commit b4a59c1)
> **Bug fixed:** Logo was composited with transparent background directly on dark green fabric — appeared nearly invisible.

1. Upload a **PNG logo with transparency** (e.g. a logo file with white background removed) to Brand Assets
2. Generate official jersey mockup
3. ✅ **PASS:** Logo is clearly visible on the jersey — it appears on a **white rectangular badge background**
4. ✅ **PASS:** Even a logo with transparent areas shows cleanly (the white badge is always there)
5. ❌ **FAIL if:** The logo is dark/invisible on the green fabric, or you can see the jersey texture directly through the logo

### RF-4 Campaign images generate correctly with concept (commit b4a59c1)
> **Bug fixed:** Invalid size `1792x1024` silently fell back to square `1024x1024`. Prompts were too vague.

1. Open a proposal that has **strategy variants** (generated via Enhance or wizard)
2. Scroll to **AI Campaign Creatives** card (indigo header)
3. Click **Generate Creatives**
4. ✅ **PASS:** Prompt approval modal appears full-screen (not a small inline box)
5. In the modal, read the first prompt — it should mention:
   - `Estádio Couto Pereira`
   - `Coritiba FC`
   - The specific **campaign strategy label** (e.g. "Fan Engagement" or strategy name)
   - `LED advertising boards`
   - `40,000 fans`
6. Click **Generate X Images**
7. Wait 30–90s
8. ✅ **PASS:** Images are **widescreen / landscape** (16:9 ratio), not square
9. ✅ **PASS:** Image content shows a stadium scene, not a plain jersey photo
10. ❌ **FAIL if:** Images are square, or show a plain white background, or prompt doesn't mention the strategy

### RF-5 Prompt approval modal is easy to find and use (commit 49c3f8c)
> **Bug fixed:** Old prompt review was a small inline box, hard to notice.

1. On any proposal → **AI Campaign Creatives** card → click **Generate Creatives**
2. ✅ **PASS:** A **full-screen overlay** appears with dark background blur
3. ✅ **PASS:** Modal has:
   - Header: *"Review Prompts Before Generating"* with numbered prompt count
   - Each prompt in a white card with strategy label
   - **Edit** button on each prompt — click it to open an editable textarea
   - **Cost estimate** and image size shown in footer
   - Large **Generate X Images** button (indigo) and Cancel button
4. Edit one prompt, add `stadium fireworks`, click **Generate X Images**
5. ✅ **PASS:** Your edited text is included in the generation
6. ❌ **FAIL if:** Modal is small / inline, or edits are not sent to generation

### RF-6 Graphics panel has 3 separate clear sections (commit 49c3f8c)
> **Bug fixed:** UI was a single cluttered component — hard to navigate.

1. Open any proposal detail page → scroll to the **Visuais / Graphics** panel
2. ✅ **PASS:** Three distinct cards with coloured headers:
   - **👕 Jersey Mockup — Official** — green header, says "Crest is never altered"
   - **✨ AI Campaign Creatives** — indigo header, says "Stadium scenes · Concept-based"
   - **🖼️ Saved Images** — slate header, lists all generated images
3. ✅ **PASS:** If logo is uploaded, the green card shows **"✓ Logo ready"** badge
4. ✅ **PASS:** If no logo, yellow warning banner at top: *"Sponsor logo required — upload in Brand Assets"*
5. ❌ **FAIL if:** UI still shows old single component with mode tabs, or sections are not clearly separated

---

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
> **Actual status:** The pipeline page uses a separate `pipeline_leads` table which requires a database migration to create. Until that migration is applied, the page shows an amber "Database Migration Required" banner. There is **no drag-drop Kanban** yet — this is a future feature. The pipeline currently shows a static list of leads grouped by stage.

1. Go to `/pipeline`
2. **If you see an amber banner** "Database Migration Required":
   - ✅ This is expected if the `pipeline_leads` table hasn't been created yet
   - ✅ Page does not crash — it shows the migration notice cleanly
   - The page still shows stat cards (Active Leads: 0, Won Deals: 0, etc.)
3. **If the migration has been applied:**
   - ✅ Stage columns load (Prospect, Qualified, Contacted, Proposal Sent, Negotiation, Closed Won)
   - ✅ "Add Pipeline Lead" form is visible at the bottom
   - Fill in the lead form → click Save → ✅ lead appears in correct stage column
   - ⚠️ **Note:** Drag-drop between columns is not yet implemented — stage changes require editing the lead
4. ✅ Pipedrive integration notice is visible (architecture ready, not yet connected)

> **Known limitation:** Drag-drop card movement is planned but not implemented. The test doc previously said "Drag a card" — that was incorrect.

### 1.10 Sponsor Reports (`/reports`)
1. Go to `/reports`
2. ✅ Report/dashboard loads (sponsor metrics, charts, or table)
3. Change any date/filter controls if present
4. ✅ Data refreshes without error

### 1.11 Competitor companies (new status)
> **New feature:** Competitors can be stored in the Companies list with status = `competitor` — separate from prospects.

**A) Manual add as competitor (fixed — was broken before):**
> **What was wrong:** The form set `pipeline_stage=competitor` but the validator rejected `status=competitor`, so status was stored as `"prospect"`. The status badge showed grey "prospect" and the status filter returned nothing. Now fixed.

1. Go to `/companies/new`
2. Fill in:
   - Name: `Athletico Paranaense Partner` (or any rival brand)
   - Industry: `Automotivo`
   - Website: `https://example-competitor.com`
   - **Pipeline Stage** → select **Competitor (tracking only)**
3. Click **Save**
4. ✅ Company created; on `/companies` it shows a **red "competitor" badge**
5. Go back to `/companies` → use the **Status** filter dropdown → select **competitor**
6. ✅ Only competitor-status companies appear

**B) Add competitor from Intelligence Discovery:**
1. Go to any company detail page → scroll to **AI Intelligence** / **Competitor Discovery** panel
2. Click **Run Autonomous Discovery**
3. Wait 30–60 seconds for results
4. ✅ Competitors tab appears with discovered companies
5. Each competitor row now has an **"Add to Companies"** button
6. Click **Add to Companies** on one competitor
7. ✅ Button changes to **✓ Saved**
8. Go to `/companies` → filter by **competitor** status
9. ✅ The newly saved competitor appears in the list with `status=competitor`

**C) Edit an existing company to competitor:**
1. Open any company detail → click **Edit**
2. Find the **Status** field → change to **Competitor**
3. Save
4. ✅ Status badge on company list updates to red **competitor**

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
2. Select industry chip e.g. **Financeiro** → click **Buscar empresas**
3. ✅ Company list loads with checkboxes
4. ✅ Companies with **missing data** show amber warning inline:
   - e.g. `Missing: Website, Contact email`
5. Check 2–3 companies including at least one with missing fields
6. ✅ A **data completeness warning panel** appears above the Generate button:
   - Header: *"X of Y selected companies have missing data — AI output may be generic"*
   - Lists each incomplete company with which fields are missing
   - **Generate button is disabled** until you acknowledge
7. Click **Show incomplete only** → list filters to only show incomplete companies
8. Click **Show all** → full list returns
9. Click **Continue anyway** in the warning panel
10. ✅ Warning dismisses, Generate button becomes active
11. Click **Generate X selected Campaigns**
12. Wait (can take several minutes — 3 companies at a time)
13. ✅ Per-company status: success ✓ or error ✗
14. Go to `/proposals` → new proposals exist for selected companies

> **Test tip for completeness check:** Use a company you know has no website (check the company detail page). The warning should list "Website" as missing.

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

### 3.5 Jersey mockup — Official (redesigned UI)
1. Scroll to **Visuais / Graphics** section
2. ✅ **Green card** at top: "👕 Jersey Mockup — Official" with lock icon notice
3. If no logo uploaded → Generate button is **disabled** — upload one first (see 3.4)
4. Select placement: `Peito — Patrocinador principal` (default)
5. Click **Generate Mockup** — a **confirm modal** appears:
   - ✅ Modal states which placement you chose
   - ✅ Text: *"This mockup always uses your uploaded logo — it will never change between generations"*
6. Click **✓ Generate** in modal
7. Wait 5–10 seconds
8. ✅ Jersey image appears — **your logo on a white badge** on the LEFT side of the front jersey
9. ✅ CFC crest on the RIGHT side is **identical to the original** (not touched)
10. Click **Download** → file saves locally
11. Test each placement zone — generate one for each:

| Placement | Expected position on jersey image |
|-----------|----------------------------------|
| **Peito — Patrocinador principal** | Left chest of front jersey, white badge |
| **Manga esquerda** | Right shoulder area (viewer's right = wearer's left) |
| **Manga direita** | Left shoulder area (viewer's left = wearer's right) |
| **Costas** | Centre of the back jersey panel |
| **Shorts** | Upper area of front shorts |
| **Meiões** | Upper calf area of left sock pair |

12. ✅ Each placement puts the badge in the correct garment area

### 3.6 Campaign creatives — AI (redesigned UI)
1. Scroll to **✨ AI Campaign Creatives** card (indigo header)
2. Note description: how many images will be generated (1 per strategy variant, max 3)
3. If logo uploaded → ✅ green text: *"Sponsor logo available — referenced in prompts"*
4. Click **Generate Creatives**
5. ✅ **Full-screen prompt approval modal** appears:
   - Header shows count: "Review Prompts Before Generating — 3 images"
   - Each prompt is in a separate numbered card with strategy label
   - Cost estimate shown (e.g. ~$0.12 · Model: gpt-image-1)
   - Size shown: 1536×1024 (16:9)
6. Click **Edit** on one prompt → textarea opens
7. Add at the end: `heroic lighting, award-winning photo`
8. Click **Done** (same button, now says Done)
9. Click **Generate 3 Images** (large indigo button)
10. Wait 60–120 seconds (one image at a time)
11. ✅ Images appear in the card — widescreen landscape format
12. ✅ Each image has its strategy label, Download, and Open buttons
13. ✅ Yellow note: "Pending approval" — images go to Bulk Approve before landing page
14. Click **Approve all in bulk →** link → opens `/proposals/bulk-approve`

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
[ ] 1.9  Pipeline page loads (migration notice OR leads list — no drag-drop yet)
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

RECENT FIXES (regression)
[ ] RF-1  Jersey mockup — correct placement (left chest, clear of crest)
[ ] RF-2  Jersey logo never changes (disabled without logo, no silent text fallback)
[ ] RF-3  Logo visible on dark jersey (white badge background)
[ ] RF-4  Campaign images widescreen + stadium concept in prompt
[ ] RF-5  Prompt approval modal full-screen with editable prompts
[ ] RF-6  Graphics panel 3 separate cards (jersey / AI creatives / saved)
[ ] RF-7  Competitor status: add via form, edit form, filter on /companies
[ ] RF-8  Add competitor from Apify Discovery panel → /companies list
[ ] RF-9  Bulk campaigns: incomplete data warning panel + Continue anyway
[ ] RF-10 Bulk campaigns: "Show incomplete only" filter works
```

---

## Known limitations (not bugs)

1. **Emails from approval** → status **Pending Approval**, not `sent`. A human approves before delivery.
2. **No real SMTP** — emails log to Pipedrive + DB. Gmail OAuth needed for actual inbox delivery.
3. **Gmail token expired** — only affects reply sync in Threads; outreach logging still works.
4. **Packages template** — empty until pricing tiers exist on the proposal.
5. **Replicate LoRA** — uses 2024 kit model; 2026 retrain pending photos from James.
6. **AI generation** — each step takes 20–90 seconds; wait before clicking again.
7. **Jersey mockup requires logo** — generation is intentionally blocked if no logo is uploaded (this is by design, not a bug).
8. **AI creatives** — use `gpt-image-1` (OpenAI); each image costs ~$0.04. Budget ~$0.12 per proposal for 3 strategy variants.
9. **Competitor status** — new `competitor` pipeline stage was added to the UI and form validation. If existing competitors don't show the status badge, re-edit and save them.
10. **Bulk campaign completeness check** — the warning is advisory. Clicking "Continue anyway" proceeds with generation. Companies with incomplete data will produce more generic AI output.

---

If you want this saved as a file in the repo (e.g. `MANUAL_TEST_ALL.md`), say the word and I'll add it.