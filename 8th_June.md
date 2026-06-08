# 8th June 2026 — Sprint Log & Status

## Context
Based on the conversation between James and Abhishek (8th June 2026), this document tracks all completed work, current system state (verified), and the full backlog of work James has requested.

---

## ✅ What Is Already Done (Verified in Codebase Today)

### Proposal System
- Proposal creation wizard (6 steps: type, company, components, strategy, generate, review)
- 7 proposal preset types: sponsorship, barter, lei_de_incentivo, mixed, esg_community, local_business, national_brand
- Proposal edit page — 6 content sections with AI A/B/C alternatives per section
- Block/drag-and-drop proposal editor (`/proposals/[id]/blocks`)
- Version history on every save
- Approval flow (draft → review → approved → sent → active_contract)
- Public shareable landing page via token (`/proposals/view/[token]`)
- Internal landing page preview with inline CMS editor

### Email System
- Email template CRUD (`/settings/email-templates`) — full create/edit/delete with HTML preview
- Variable substitution: `{{company_name}}`, `{{contact_name}}`, `{{proposal_link}}`, etc.
- AI-powered email generation from approved proposals
- Gmail send integration
- Follow-up generation
- Email list with status tracking (draft, pending_approval, approved, sent, opened, replied, bounced, failed)

### Image Generation
- Official jersey mockup (composite on flat kit base image — 7 placement zones: chest, sleeves, back, shorts, socks)
- LoRA creative generation via Replicate
- Campaign creatives (1 per strategy variant)
- Image manager (link images to strategy variants, mark as display image)
- Bulk image approval page (checkbox-select, approve all, cleanup)

### Approvals
- Card-by-card approval view (keyboard nav ← →) with Approve/Reject/Edit
- List view toggle
- Approval queue covers: proposals, campaigns, emails

### Other Modules (Verified Working)
- Companies CRM with AI enrichment
- Pipeline (Kanban)
- Inventory management
- Gmail Threads integration
- Follow-ups automation
- Brand asset library
- Barter proposals
- Lei de Incentivo module
- Coritiba Intel dashboard
- Audit log, workflow events
- CRM sync

---

## ❌ What Is Missing / Needs Building (James's Requirements)

### 1. 🔴 Multiple Proposal Landing Page Templates
**James said:** "new landing pages for each proposal — proposal for one offer, proposal for package A/B/C, proposal with menu of inventory"

**Current state:** Only ONE Coritiba-branded template exists. No template switcher.

**What needs to be built:**
- Template A: Single offer (clean, one package, hero + value prop + CTA)
- Template B: A/B/C package tiers (comparison table — Bronze/Silver/Gold or custom names)
- Template C: Inventory menu (scrollable list of sponsorship items with pricing)
- Template picker in the proposal detail page

---

### 2. 🔴 Logo Upload Gate Before Proposal Finalization
**James said:** "proposal should not be finalized until sponsorship logo is uploaded"

**Current state:** No gate. Proposals can be approved and published with no logo. Landing page shows `[XX]` initials fallback.

**What needs to be built:**
- Block proposal from moving to `approved` / `sent` status unless `company.logo_url` or proposal-level uploaded asset exists
- Warning banner on proposal detail page when no logo is present
- Clear upload prompt in the edit flow

---

### 3. 🔴 Image Generation Per Campaign (Logo-Gated)
**James said:** "each campaign has an image generated for each… only once logo is uploaded"

**Current state:** Image generation works but is NOT gated on logo upload. Logo is referenced in the AI prompt text but not composited into the image. Image buttons are always enabled.

**What needs to be built:**
- Gate "Generate Images" / "Gerar Criativos" buttons behind logo upload check
- Show clear message: "Upload sponsor logo to generate campaign images"
- Ideally composite the actual logo onto the jersey/creative (not just text-hint to AI)

---

### 4. 🔴 Newsletter Module
**James said:** "push on that if we can — all it is templates for newsletters, choose who we send it to, from contacts list of companies"

**Current state:** Does NOT exist. No route, no composer, no subscriber list. Only exists as an inventory item label.

**What needs to be built:**
- `/newsletter` route and page
- Newsletter composer (subject, body, HTML template selector — reuse email template system)
- Recipient picker: select companies / contacts from the database
- Send/schedule flow
- Sent newsletter history

---

### 5. 🔴 Persons / Contacts Module
**James said:** "we should add a persons module — for all emails of all companies"

**Current state:** Contacts API (`/api/contacts`) exists and has full schema (name, title, email, phone, department, seniority, LinkedIn, source). BUT there is NO frontend UI — no `/contacts` page, no list, no create/edit form. Only a single-contact field on the company edit form.

**What needs to be built:**
- `/contacts` page — full list view across all companies, filterable by company/department/seniority
- Contact detail view / edit form
- Add contact(s) to a company from the company detail page
- Use contacts as recipients in email and newsletter sends
- Import contacts in bulk (CSV)

---

### 6. 🟡 Bulk Proposals — Tinder Swipe + Email Sending with Template Choice
**James said:** "bulk needs tinder type approval + same with email sending + choose template"

**Current state:**
- Card-by-card approval exists but uses keyboard/button nav only — no touch swipe gesture
- Bulk image approval uses checkbox UI
- Email sending does NOT have a "choose template" step in the bulk flow

**What needs to be built:**
- Add swipe gesture (touch drag) to the approval card view
- In bulk approval flow: after approving a proposal, offer "Send email now?" with template picker
- Bulk email send: select proposals → choose template → send to all contacts

---

### 7. 🟡 Proposal Edit UI Improvements
**James said:** "updated UI for editing proposals, images"

**Current state:** The edit page works but is functional/utilitarian. No visual polish.

**What needs to be built:**
- Cleaner section layout with visual hierarchy
- Inline image preview within the edit page (not a separate tab)
- Show which campaigns have images generated vs missing
- "Complete" checklist: logo ✓, content ✓, images ✓, email drafted ✓

---

### 8. 🟡 More Email Templates (Pre-seeded)
**James said:** "add more templates and upload them"

**Current state:** Template CRUD system exists and works. But there are no pre-seeded templates in the DB (all templates are user-created from scratch).

**What needs to be built/seeded:**
- Initial outreach email (cold)
- Follow-up #1 (3 days after no reply)
- Follow-up #2 (1 week after no reply)
- Meeting confirmation email
- Proposal delivery email ("attached/linked proposal")
- Rejection/no-thank-you response template
- Newsletter announcement template

---

### 9. 🟡 Proposal Quality / Content Standards
**James said:** "they are not [meeting quality], they need to be adjusted to new requirements"

**Current state:** Proposals generate using v3.0.0 prompt, AI content varies in quality.

**What needs to be investigated & improved:**
- Audit the AI prompt quality for each section (executive summary, rationale, sponsorship value, activation plan, investment note, CTA)
- Ensure generated proposals consistently hit a professional commercial standard
- Add proposal quality review checklist
- Consider adding minimum word counts per section

---

### 10. 🟢 Model Retraining on Replicate (Abhishek's own backlog)
**Abhishek said:** "focusing on model retraining for images on replicate"

**Current state:** LoRA v2 is live and generating. Retraining would improve image quality.

**What needs to be done:**
- Gather new training images (James's kit assets)
- Retrain LoRA model on Replicate with improved dataset
- Update the model ID in the API routes once new version is ready

---

## 📋 Priority Order for 8th June Sprint

| # | Feature | Priority | Effort |
|---|---------|----------|--------|
| 1 | Contacts/Persons module UI | 🔴 High | Medium |
| 2 | Logo upload gate on proposals | 🔴 High | Small |
| 3 | Multiple landing page templates | 🔴 High | Large |
| 4 | Newsletter module | 🔴 High | Large |
| 5 | Image gen gated behind logo upload | 🔴 High | Small |
| 6 | Pre-seed email templates | 🟡 Medium | Small |
| 7 | Proposal edit UI improvements | 🟡 Medium | Medium |
| 8 | Bulk approval swipe + email w/ template | 🟡 Medium | Medium |
| 9 | Proposal content quality audit | 🟡 Medium | Small |
| 10 | LoRA model retraining | 🟢 Low/Ongoing | Large |

---

## 🔧 Technical Notes

- **Backend:** Next.js API routes, Supabase (PostgreSQL), AWS Bedrock (Claude)
- **Frontend:** Next.js 14, React, Tailwind CSS, shadcn/ui
- **Image generation:** Replicate (LoRA v2), Sharp (composite mockup)
- **Email:** Gmail API, custom template system
- **Deployment:** AWS EC2 + PM2 + ngrok (live at `https://eligibly-facing-unloved.ngrok-free.dev`)
- **Contacts table:** Already exists in Supabase with full schema — just needs UI

---

## 📝 Notes from Today's Conversation
- James confirmed email templates are done ✓
- James confirmed bulk proposal generation is done ✓
- James is excited about this becoming a SaaS product for multiple sports markets
- Newsletter = templates + choose recipients from company contacts list (simple scope)
- Persons module = all contacts/emails for all companies (not a CRM replacement, just a contacts list)
- The biggest gaps are: landing page templates, newsletter, contacts UI, and logo gate
