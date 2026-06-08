# Complete End-to-End Testing Guide
**App URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Example Company:** Banco Itaú (Finance / Banking, national brand)  
**Tester:** James / Abhishek  
**Date:** June 8, 2026

---

## Before You Start

- Open the app in your browser: https://eligibly-facing-unloved.ngrok-free.dev
- Log in if prompted (use your normal credentials)
- Keep this guide open side-by-side
- Each test section builds on the previous — follow in order

---

## MODULE 1 — Companies & Contacts

### Test 1.1 — Add a Company

1. Go to → **`/companies`** (click "Companies" in the left sidebar)
2. Click **"Add Company"**
3. Fill in:
   - Company name: `Banco Itaú`
   - Industry: `Finance / Banking`
   - Website: `https://www.itau.com.br`
   - Country: `BR`
   - Notes: `Largest private bank in Brazil. Strong CSR focus. Key decision maker: Marketing Director`
4. Click **Save**
5. ✅ **Expected:** Banco Itaú appears in the company list

---

### Test 1.2 — Add a Contact Manually

1. Go to → **`/contacts`**
2. Click **"Add Contact"**
3. Fill in:
   - Company: select `Banco Itaú`
   - Email: `mkt.parceria@itau.com.br`
   - Full Name: `Carlos Mendes`
   - Title: `Marketing Director`
   - Department: `Marketing`
   - Seniority: `Director`
   - Phone: `+55 11 98888-0001`
4. Click **Save Contact**
5. ✅ **Expected:** Carlos Mendes appears in contacts list with Banco Itaú badge

---

### Test 1.3 — Import Contacts via CSV

1. Still on **`/contacts`**
2. Click the **"CSV template"** link (small link next to Import CSV button) — it downloads a file
3. Open the downloaded `contacts_import_template.csv` in Excel/Numbers
4. Add one new row:
   ```
   maria.santos@itau.com.br,Maria Santos,Head of Sponsorship,Commercial,director,+55 11 97777-0002,https://linkedin.com/in/mariasantos,Banco Itaú,Sponsorship budget owner
   ```
5. Save as CSV
6. Back in the app, click **"Import CSV"**
7. Select your edited CSV file
8. ✅ **Expected:** Green banner shows "Imported 1 contact(s)"
9. ✅ **Expected:** Maria Santos appears in the contacts table

---

## MODULE 2 — Campaigns

### Test 2.1 — Create a Campaign

1. Go to → **`/campaigns`**
2. Click **"New Campaign"**
3. Fill in:
   - Title: `Itaú × Coritiba — Curitiba Cresce`
   - Company: select `Banco Itaú`
   - Summary: `Partnership targeting Curitiba's growing urban middle class through Coritiba FC`
4. Click Save
5. ✅ **Expected:** Campaign created, you land on the campaign detail page

---

### Test 2.2 — Generate Campaign Ideas with AI

1. On the campaign detail page
2. Look for **"Generate ideas"** or a Sparkles (✨) button
3. Click it
4. ✅ **Expected:** 3–5 Coritiba FC-specific campaign ideas appear (should mention Couto Pereira, Verde Coxa, Curitiba)
5. Select one idea you like

---

## MODULE 3 — Proposal Creation (Full Flow)

### Test 3.1 — Create a Proposal via Wizard

1. Go to → **`/proposals/new`**
2. **Step 1 — Proposal Type:** Select **"National Brand"** (indigo card)
3. **Step 2 — Company:** Select `Banco Itaú`
4. **Step 3 — Campaign:** Select `Itaú × Coritiba — Curitiba Cresce`
5. Click **Generate Proposal**
6. Wait ~30–60 seconds for AI generation
7. ✅ **Expected:** Redirected to proposal detail page with full proposal content
8. ✅ **Expected:** Proposal has content in all sections: Executive Summary, Campaign Rationale, Sponsorship Value, Activation Plan, Deliverables (5 items), Investment, CTA
9. ✅ **Expected:** Deliverables section has EXACTLY 5 items referencing Coritiba FC assets

---

### Test 3.2 — Check the Logo Warning

1. On the proposal detail page (should be on it already)
2. Look at the top — there should be a **yellow warning banner**:
   > ⚠️ No sponsor logo uploaded — landing page will show initials only, image generation is locked
3. ✅ **Expected:** Warning is visible because no logo has been uploaded yet
4. ✅ **Expected:** This is the "proposal not finalized without logo" gate

---

### Test 3.3 — Upload a Sponsor Logo

1. Still on the proposal detail page
2. Scroll down to **"Brand Assets"** section
3. Click **"Upload Logo"** or the upload area
4. Upload any PNG/JPG image (use any logo file you have — even a screenshot)
5. ✅ **Expected:** Logo appears in the Brand Assets section
6. ✅ **Expected:** The yellow warning banner disappears
7. ✅ **Expected:** After upload, a loading spinner appears for "auto-generating campaign images" — wait 30–60 seconds
8. ✅ **Expected:** 3 campaign image variants appear (if Replicate is responding)

---

### Test 3.4 — Generate Jersey Mockup

1. Still on the proposal detail page, scroll to the **"Graphics"** section
2. Click **"Gerar mockup oficial"** (Generate official mockup)
3. Select a placement zone (e.g., "chest_sponsor")
4. Click Generate
5. Wait ~30–60 seconds
6. ✅ **Expected:** Jersey mockup appears with either the Itaú logo or "BANCO ITAÚ" text on the Coritiba jersey

---

## MODULE 4 — Proposal Edit UI

### Test 4.1 — Edit Proposal Sections

1. On the proposal detail page, click **"Edit"** (pencil icon)
2. ✅ **Expected:** Edit page loads with a 4-card metadata bar at top showing: Company | Campaign | Version | Deliverables
3. ✅ **Expected:** Deliverables card shows a green "5 items" (not ⚠ Missing)
4. Find the **"Executive Summary"** section
5. Click **"Generate A / B / C options"** button next to it
6. Wait ~20 seconds
7. ✅ **Expected:** 3 AI-written alternatives appear (A, B, C) with different tones
8. Click one to select it
9. Click **Save** at the top of the page
10. ✅ **Expected:** "Saved" confirmation toast appears

---

### Test 4.2 — Edit Deliverables Manually

1. Still on edit page
2. Scroll to the **"Deliverables"** section (bullet list area)
3. Edit one deliverable — change it to something custom
4. Click Save
5. ✅ **Expected:** Deliverable saved, version number incremented (v1 → v2)

---

## MODULE 5 — Landing Pages

### Test 5.1 — Preview the Public Landing Page

1. On the proposal detail page, look for **"Share" / "Landing Page"** button
2. Click to get the public link
3. ✅ **Expected:** A URL like `https://eligibly-facing-unloved.ngrok-free.dev/proposals/view/[token]`
4. Open that URL in an incognito/private tab
5. ✅ **Expected:** A beautiful landing page opens showing the Coritiba FC proposal for Banco Itaú

---

### Test 5.2 — Switch Landing Page Template

1. Back in the main app, on the proposal detail page
2. Find the **"CMS Editor"** or **"Landing Page"** tab
3. Look for a template picker (dropdown or button group)
4. Switch to **"One Offer"** template
5. ✅ **Expected:** Landing page preview updates to a focused single-offer layout
6. Switch to **"Menu de Ativos"** (Inventory Menu) template
7. ✅ **Expected:** Landing page updates to show a categorized menu of deliverables

---

## MODULE 6 — Bulk Logo Upload

### Test 6.1 — Upload a Logo to Multiple Proposals at Once

1. Go to → **`/proposals`** (proposals list)
2. Scroll down — look for a **"Bulk Logo Upload"** section
3. ✅ **Expected:** A list of proposals WITHOUT logos is shown (checkbox for each)
4. Check 2–3 proposals
5. Click **"Upload logo"** and select a PNG file
6. ✅ **Expected:** Progress shows for each proposal ("Uploading…" then "✓ Done")

---

## MODULE 7 — Approvals (Tinder-Style)

### Test 7.1 — Tinder Approval UI

1. Go to → **`/approvals`**
2. ✅ **Expected:** A card-based view with one proposal shown at a time
3. Try keyboard shortcuts:
   - Press **`→` right arrow** = Approve
   - Press **`←` left arrow** = Reject
   - Press **`↑` up arrow** = Skip
4. Try swipe on mobile/touchpad
5. ✅ **Expected:** Card animates and moves to next proposal

---

### Test 7.2 — Send Email from Approval

1. Still in **`/approvals`**, find a proposal for Banco Itaú
2. Click **"Aprovar"** (Approve) button
3. ✅ **Expected:** An email template picker modal appears
4. Select any available email template (e.g., "Initial Outreach")
5. Click **"Enviar email"**
6. ✅ **Expected:** 
   - Toast: "Email sent" / "E-mail enviado"
   - The email is logged in **`/emails`** with status "sent"
   - If Pipedrive is connected: activity is logged there too

---

## MODULE 8 — Email System

### Test 8.1 — View Email History

1. Go to → **`/emails`**
2. ✅ **Expected:** The email you just sent in Test 7.2 appears here with status "sent"
3. Click on it to see the full email content

---

### Test 8.2 — Email Templates CRUD

1. Go to → **`/settings/email-templates`** (or click "Email Templates" in the sidebar)
2. Click **"New Template"**
3. Fill in:
   - Name: `Proposta Inicial — Banco`
   - Subject: `{{company_name}} × Coritiba FC — Proposta de Parceria`
   - Body HTML: `<p>Prezado {{contact_name}},</p><p>Segue nossa proposta de parceria para {{company_name}}: {{proposal_link}}</p>`
4. Click Save
5. ✅ **Expected:** Template appears in list with the `{{variables}}` badges shown in blue

---

### Test 8.3 — Import Templates via JSON

1. Still on **`/settings/email-templates`**
2. Create a file called `templates.json` on your computer with this content:
   ```json
   [
     {
       "name": "Follow-up Week 1",
       "subject": "Re: {{company_name}} × Coritiba FC",
       "body_html": "<p>{{contact_name}}, checking in on our proposal. {{proposal_link}}</p>"
     },
     {
       "name": "Final Reminder",
       "subject": "Last chance — {{company_name}} × Coritiba FC Partnership",
       "body_html": "<p>Hi {{contact_name}}, this is our final follow-up regarding the Coritiba FC sponsorship.</p>"
     }
   ]
   ```
3. Click **"Import JSON"**
4. Select your `templates.json` file
5. ✅ **Expected:** Green banner "Imported 2 template(s)"
6. ✅ **Expected:** Both templates appear in the list

---

## MODULE 9 — Newsletter

### Test 9.1 — Send a Newsletter

1. Go to → **`/newsletter`**
2. ✅ **Expected:** Newsletter composer loads
3. Fill in Subject: `Coritiba FC — Oportunidades de Patrocínio 2026`
4. Click **"Choose template"** or select a template from the dropdown
5. ✅ **Expected:** Template body is loaded into the editor
6. Under **Recipients** — click to select companies/contacts
7. Select `Banco Itaú` and 1–2 others
8. Click **"Send Newsletter"**
9. ✅ **Expected:** Success toast + newsletter appears in send history at the bottom

---

## MODULE 10 — Agents / AI Outreach

### Test 10.1 — Generate Outreach Email for a Proposal

1. Go to **`/proposals`**, open the Banco Itaú proposal
2. Scroll to the **"Emails"** section on the proposal page
3. Click **"Generate email"** or **"New outreach email"**
4. ✅ **Expected:** AI generates a personalized outreach email referencing:
   - Banco Itaú by name
   - Coritiba FC
   - Couto Pereira stadium
   - Specific deliverables from the proposal
5. Review the email, edit subject/body if needed
6. Click **"Send"** (or "Enviar")
7. ✅ **Expected:** Email status updates to "sent" in `/emails`

---

### Test 10.2 — Workflow Events Log

1. Go to → **`/workflow-events`** (or check sidebar)
2. ✅ **Expected:** A log of all AI workflows run — proposal generation, email generation, image generation
3. Each entry should show: workflow name, status (completed/failed), entity linked, timestamp

---

## MODULE 11 — Settings & Admin

### Test 11.1 — Settings Health Check

1. Go to → **`/settings`**
2. ✅ **Expected:** AI model shows `claude-sonnet-4-6` + prompt version `v5.x`
3. ✅ **Expected:** All migration rows show green "Applied" badges
4. ✅ **Expected:** Maintenance tools card is visible at the bottom

---

### Test 11.2 — Backfill Deliverables (Admin Tool)

1. Still on **`/settings`**
2. Scroll to **"Maintenance tools"**
3. Click **"Check count"** link
4. ✅ **Expected:** New tab opens with JSON: `{ "proposals_missing_deliverables": 0, "total_fetched": 91 }` (should be 0 after today's backfill)
5. Click **"Run backfill (10 proposals)"**
6. ✅ **Expected:** Alert popup shows "Processed 0 proposals. Remaining: 0" (nothing left to backfill)

---

## MODULE 12 — System Health API

These can be pasted directly in the browser address bar:

| Test | URL | Expected Result |
|------|-----|-----------------|
| App health | `/api/health` | `{"status":"ok","checks":{"database":{"ok":true}}}` |
| Proposal count | `/api/proposals?limit=1` | JSON array with proposals |
| Backfill count | `/api/proposals/backfill-deliverables` | `{"proposals_missing_deliverables":0}` |
| CSV template | `/api/contacts/bulk-import` | Downloads a CSV file |
| Audit log | `/api/audit` | Recent audit events |

---

## Full Test Checklist

Copy this and tick off as you go:

```
COMPANIES & CONTACTS
[ ] 1.1  Add company (Banco Itaú)
[ ] 1.2  Add contact manually (Carlos Mendes)
[ ] 1.3  Import contacts via CSV (Maria Santos)

CAMPAIGNS
[ ] 2.1  Create campaign
[ ] 2.2  Generate AI campaign ideas (mentions Coritiba/Couto Pereira)

PROPOSALS
[ ] 3.1  Create proposal via wizard (National Brand type)
[ ] 3.2  Logo warning banner visible before upload
[ ] 3.3  Upload logo → warning disappears + images auto-generate
[ ] 3.4  Generate jersey mockup

EDIT UI
[ ] 4.1  Edit page shows 4-card metadata bar
[ ] 4.2  Generate A/B/C options for a section
[ ] 4.3  Edit deliverables manually + save

LANDING PAGES
[ ] 5.1  Public share link opens in incognito → proposal visible
[ ] 5.2  Switch to "One Offer" template
[ ] 5.3  Switch to "Inventory Menu" template

BULK OPERATIONS
[ ] 6.1  Bulk logo upload to multiple proposals

APPROVALS
[ ] 7.1  Tinder swipe + keyboard arrows work
[ ] 7.2  Approve → template picker → email sent

EMAILS
[ ] 8.1  Email history visible in /emails
[ ] 8.2  Create new email template with {{variables}}
[ ] 8.3  Import 2 templates via JSON file

NEWSLETTER
[ ] 9.1  Compose + select recipients + send newsletter

AI AGENTS
[ ] 10.1  Generate outreach email for proposal
[ ] 10.2  Workflow events log shows all runs

SETTINGS & ADMIN
[ ] 11.1  Settings health — all green
[ ] 11.2  Backfill tool shows 0 remaining

SYSTEM HEALTH
[ ] 12.1  /api/health returns ok
[ ] 12.2  /api/proposals/backfill-deliverables returns 0 missing
```

---

## Known Limitations (Do Not Report as Bugs)

1. **Actual email delivery** — The system logs emails to Pipedrive as activities and stores them in the DB. It does NOT send real SMTP emails (no Resend/SendGrid configured). Email "sending" = logged to Pipedrive CRM + stored in app.
2. **Replicate jersey AI** — Uses the 2024 training model. New 2026 kit photos from James needed before retraining.
3. **Newsletter DB** — If the newsletters table hasn't been migrated, it shows a migration message. Run the SQL in `supabase/migrations/0026_newsletters_table.sql` in Supabase dashboard if needed.

---

*Last updated: June 8, 2026 — covers all features shipped in 8th-june-sprint*
