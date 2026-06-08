# 8th June — Full Sprint Execution Plan

## Goal
Clear all backlogs from James's conversation. By end of day: fully tested, all requirements met.

---

## Execution Order (optimised: quick wins first, largest last)

### WAVE 1 — Quick Wins (≤1h each, no risk)
| # | Task | Files Touched |
|---|------|--------------|
| W1-A | Seed 7 email templates into DB via API | Script only, no UI change |
| W1-B | Logo upload gate — warning banner + block approval status change | `approval-flow-panel.tsx`, `proposals/[id]/page.tsx` |
| W1-C | Image gen gate — disable buttons if no logo | `proposal-graphics-panel.tsx` |
| W1-D | Proposal completion checklist in edit UI | `proposal-editor.tsx` |

### WAVE 2 — Medium Features (1–3h each)
| # | Task | Files Touched |
|---|------|--------------|
| W2-A | Contacts/Persons UI — full `/contacts` page | NEW: `app/contacts/page.tsx`, `app/contacts/contacts-manager.tsx` |
| W2-B | Approval card view — add touch swipe + email template picker after approve | `approvals-card-view.tsx`, new modal |
| W2-C | Proposal quality — improve AI prompt for all sections | `app/api/proposals/generate/route.ts` |

### WAVE 3 — Large Features (3–5h each)
| # | Task | Files Touched |
|---|------|--------------|
| W3-A | Newsletter module — composer + recipient picker + send | NEW: `app/newsletter/`, `app/api/newsletter/` |
| W3-B | Multiple landing page templates — 3 templates + picker | `proposal-landing-page.tsx` + NEW template variants |

### WAVE 4 — Verify & Deploy
| # | Task |
|---|------|
| W4-A | Full build (`npm run build`) |
| W4-B | PM2 restart |
| W4-C | Browser E2E test every new feature |
| W4-D | Commit + push all changes |
| W4-E | Update `8th_June.md` with completion status |

---

## Detailed Implementation Specs

### W1-A: Seed Email Templates
**Approach:** POST to `/api/email-templates` 7 times with pre-written professional templates.
Templates to seed:
1. `Cold Outreach — Initial Contact` — introduction + proposal link
2. `Follow-up #1 (3 days)` — gentle nudge
3. `Follow-up #2 (1 week)` — last follow-up
4. `Proposal Delivery` — "Please find your proposal attached/linked"
5. `Meeting Confirmation` — confirm date/time + agenda
6. `Partnership Announcement` — newsletter-style announcement
7. `Sponsorship Renewal` — end of contract renewal reminder

**Variables used in all:** `{{company_name}}`, `{{contact_name}}`, `{{proposal_link}}`, `{{sender_name}}`

---

### W1-B: Logo Upload Gate
**Where to add:**
- `app/proposals/[id]/page.tsx` — fetch `company.logo_url` and `proposal.content.uploaded_assets`
- If neither exists: render a yellow warning banner near the top "⚠️ No sponsor logo uploaded. The landing page will show initials only. Upload a logo to finalize."
- `approval-flow-panel.tsx` — if `hasLogo === false`, disable the "Submit for Review" / "Approve" button and show tooltip "Upload sponsor logo first"
- Pass `hasLogo` as a prop from the server component

**DB query addition:** Already fetches `companies(*)` — `logo_url` is there. Just need to pass it down.

---

### W1-C: Image Generation Gate
**Where:** `components/proposals/proposal-graphics-panel.tsx`
**What:** The component receives `sponsorLogoUrl` already. If it's null/empty:
- Disable "Gerar mockup oficial" button
- Disable "Gerar Criativos" button
- Show banner: "📸 Upload the sponsor logo (Brand Assets section above) to unlock image generation."

---

### W1-D: Proposal Completion Checklist
**Where:** `app/proposals/[id]/edit/proposal-editor.tsx` — add a sticky sidebar checklist
**Checklist items:**
- [ ] Sponsor logo uploaded
- [ ] All 6 content sections filled (check word count > 30 each)
- [ ] At least 1 image generated
- [ ] Email drafted
- [ ] Deliverables list has entries

---

### W2-A: Contacts/Persons Module
**Route:** `/contacts`
**Files to create:**
- `app/contacts/page.tsx` — server component, fetches contacts with company join
- `app/contacts/contacts-manager.tsx` — client component with full UI

**UI design:**
- Top: search bar + filter by company + filter by seniority/department
- Table columns: Name, Title, Company, Email, Phone, Source, Actions
- "Add Contact" button → modal form (name, email, title, company dropdown, phone, LinkedIn, seniority)
- Edit inline
- Delete with confirm
- "Import CSV" button (stretch)

**API needed:** `/api/contacts` GET (all, no company_id filter) — already exists, just call without filter

**Sidebar nav:** Add "Contacts" under CRM section in sidebar

---

### W2-B: Approval Card Swipe + Email Template After Approve
**Part 1 — Touch swipe:**
- `app/approvals/approvals-card-view.tsx`
- Add `onTouchStart` / `onTouchEnd` handlers on the card div
- If swipe right (deltaX > 80): trigger approve
- If swipe left (deltaX < -80): trigger reject
- Add visual indicators: green glow on right swipe drag, red glow on left

**Part 2 — Email template picker after approve:**
- After a proposal is approved in card view, show a mini modal: "Send outreach email now?"
- Fetch templates from `/api/email-templates`
- Let user pick one template → click "Send" → POST to `/api/emails/generate` with the chosen template
- Or "Skip for now"

---

### W2-C: Proposal Quality Improvement
**File:** Find the proposal generation API route
**What to do:**
- Audit current prompt structure
- Add stricter instructions: minimum professional tone, concrete facts, no generic filler
- Add Coritiba FC specific context to each section
- Enforce word counts: executive_summary min 120 words, rationale min 100 words, etc.

---

### W3-A: Newsletter Module
**Route:** `/newsletter`
**Files to create:**
- `app/newsletter/page.tsx`
- `app/newsletter/newsletter-manager.tsx` — client component
- `app/api/newsletter/send/route.ts` — sends newsletter via Gmail to list
- `app/api/newsletter/history/route.ts` — fetch sent newsletters from DB

**DB table needed:** `newsletters` — id, subject, body_html, template_id, sent_at, recipient_count, status
**Migration:** Add via Supabase

**UI design:**
Step 1 — Compose:
- Pick email template (or write from scratch)
- Subject line
- HTML body editor (reuse template editor)

Step 2 — Recipients:
- "Select All Companies" toggle
- Filter by industry/status
- Individual checkbox select
- Shows: company name + contact email

Step 3 — Review & Send:
- Preview of email
- Recipient count
- "Send Now" button

**Sidebar nav:** Add "Newsletter" under Emails section

---

### W3-B: Multiple Landing Page Templates
**Approach:** Add `landing_template` field to proposal (default `'standard'`)
**Templates:**
1. `standard` — current full Coritiba-branded page (existing)
2. `single_offer` — stripped down: hero + one value block + pricing + CTA (clean, minimal)
3. `package_abc` — hero + 3-column comparison table (Bronze/Silver/Gold tiers) + CTA
4. `inventory_menu` — hero + scrollable inventory list with pricing rows + subtotal + CTA

**Files:**
- `components/proposals/proposal-landing-page.tsx` — add template switch at top
- `components/proposals/templates/single-offer-template.tsx` — NEW
- `components/proposals/templates/package-abc-template.tsx` — NEW
- `components/proposals/templates/inventory-menu-template.tsx` — NEW
- `app/proposals/[id]/page.tsx` — add template picker UI (4 buttons)
- `app/api/proposals/[id]/template/route.ts` — PATCH to save template choice

---

## Sidebar Navigation Updates Needed
Add to `components/shared/sidebar.tsx` or equivalent:
- "Contacts" link under CRM group
- "Newsletter" link under Emails group

---

## Testing Checklist (W4-C)
After build, verify each feature in browser:

### Wave 1
- [ ] 7 email templates visible at `/settings/email-templates`
- [ ] Yellow logo warning banner shows on a proposal with no logo
- [ ] Approve button is blocked when no logo
- [ ] Image generation buttons disabled when no logo
- [ ] Edit page shows completion checklist

### Wave 2
- [ ] `/contacts` page loads with list of contacts
- [ ] Can add a new contact via modal
- [ ] Swipe right on approval card approves it
- [ ] After approving, email template modal appears
- [ ] Proposals generate with better quality content

### Wave 3
- [ ] `/newsletter` page loads
- [ ] Can compose a newsletter using a template
- [ ] Can select company recipients
- [ ] Sent newsletter appears in history
- [ ] Each of 3 landing page templates renders correctly
- [ ] Template picker visible on proposal detail page

---

## Notes
- Do NOT break existing working features
- Build mobile-first (swipe requires touch events)
- Reuse existing UI components: Button, Card, Badge, Input, Textarea, Select from shadcn/ui
- All new API routes: use `supabaseAdmin()`, add `export const runtime = "nodejs"`
- All new pages: use `"use client"` only where needed (prefer server components for data fetching)
