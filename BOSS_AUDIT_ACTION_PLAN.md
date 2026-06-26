# Boss Audit — Action Plan
**Source:** Coritiba Platform Audit v4.pdf + Sponsorship Platform UX UI Grid.png  
**Audit date:** June 22, 2026  
**Action plan prepared:** June 26, 2026

---

## What the Audit Found

47-page full platform audit by an external analyst. Covers every module.  
**Summary numbers from the PDF:**
- 8 P0 bugs (workflow-stopping — fix before anything)
- 4 P1 bugs (high friction — fix in Sprint 1)
- 1 P2 bug (data quality — fix in Sprint 2)
- 10 Feature Requests
- 5 New Feature Suggestions
- 30+ missing KPIs on the dashboard
- 25/25 landing page checklist items failing
- 6 of 10 end-to-end workflow steps broken

---

## ALREADY FIXED (before this audit arrived)

Some of these bugs were fixed in the June 8–9 sprint. Marking them now.

| Bug ID | Issue | Status |
|--------|-------|--------|
| BUG-08 (partial) | Generate Creatives fires without prompt review | ✅ Fixed Jun 9 — full-screen prompt modal added |
| BUG-08 (partial) | No cancel/retry on stuck jobs | ✅ Fixed Jun 9 — cancel added |
| BUG-12 / FR-09 | Competitors tab — no Add to Database button | ✅ Fixed Jun 9 — "Add to Companies" saves with competitor status |
| BUG-14 (partial) | Campaign company selector unusable at 300+ | ⚠️ Partial — bulk campaigns improved but inline selector not yet searchable |

---

## SPRINT 0 — Emergency Fixes (Do First, This Week)

These are the 5 most critical items from the audit. The platform cannot be used in production until these are done.

### S0-1: Gmail OAuth reconnect
- **Audit says:** Gmail token expired May 22, 2026. Every email sent since then may have failed silently.
- **Fix:** Go to Settings → Sender Configuration → Reconnect Gmail. Or switch to Resend API.
- **Effort:** 1 hour
- **Status:** ⏳ Pending

### S0-2: Fix Edit button on proposals (BUG-01)
- **Audit says:** Edit button on `/proposals/{id}` routes to `/mockup-editor` instead of `/proposals/{id}/edit`. Team cannot edit any proposal.
- **Fix:** Find Edit button in proposal detail/list components, change href from `/mockup-editor` to `/proposals/${id}/edit`.
- **Effort:** 30 minutes
- **Status:** ⏳ Pending

### S0-3: Fix [Nome] placeholder in emails (BUG-09)
- **Audit says:** `[Nome]` renders literally in outgoing emails. Every email looks broken.
- **Fix:** Fix template variable substitution. Add pre-send validation that blocks send if `[*]` or `{{*}}` placeholders remain unresolved.
- **Effort:** 1 day
- **Status:** ⏳ Pending

### S0-4: Add proposal link + CTA button to emails (BUG-10)
- **Audit says:** Emails are plain text — no link to proposal, no CTA button, no images. Every email is a dead end.
- **Fix:** Email template must auto-include `View Proposal` button linking to `/proposals/view/{share_token}`. Add CFC logo header. Build proper HTML email with React Email or MJML.
- **Effort:** 2–3 days
- **Status:** ⏳ Pending

### S0-5: Remove admin sidebar from sponsor landing page (BUG-15)
- **Audit says:** `/proposals/{id}/view` shows full internal admin sidebar to sponsors. Security and credibility crisis.
- **Fix:** Render `/view` routes without the admin layout wrapper. Apply separate public layout with no sidebar, no internal navigation. Add minimum CTA button "Tenho Interesse".
- **Effort:** 1–2 hours emergency fix (full redesign in Sprint 3)
- **Status:** ⏳ Pending

---

## SPRINT 1 — Core Workflow Unblocked (Week 2–3)

### S1-1: Fix stuck image generation jobs (BUG-08 remaining)
- **Audit says:** 28 jobs stuck in "Generating" with no progress, no cancel, no error — appear permanently frozen.
- **Fix:** Mark all jobs stuck >5 minutes as Failed in DB. Add 5-minute job timeout. Add Retry button on failed jobs.
- **Effort:** 1 day
- **Status:** ⏳ Pending

### S1-2: Save Hunter.io/Apollo contacts to database (BUG-11 / FR-08)
- **Audit says:** Contact search finds results (10 confirmed for Ambev Brasil) but there is no Save button. Data lost on page leave.
- **Fix:** Add Save button per contact row + Save All at top. On click, create contact record linked to company. Show green "Saved" badge on already-saved contacts.
- **Effort:** 1–2 days
- **Status:** ⏳ Pending

### S1-3: Fix Approvals page empty (BUG-04)
- **Audit says:** 167 items exist in queue but page shows nothing. Likely PT/EN status value mismatch.
- **Fix:** Debug approvals query — check if status filter uses English vs Portuguese values. Add empty-state message so page never shows blank.
- **Effort:** 4 hours
- **Status:** ⏳ Pending

### S1-4: Fix Pipedrive sync — 0 synced, 35 pending (BUG-06)
- **Audit says:** 0 records synced to Pipedrive. 35 stuck pending. Pipeline board shows zero activity.
- **Fix:** Check Pipedrive API token (likely expired or revoked). Review sync logs for errors. Re-queue pending records. Add "Last synced" indicator on dashboard.
- **Effort:** 1–2 days
- **Status:** ⏳ Pending

### S1-5: Fix bulk campaigns PT/EN mismatch (BUG-03)
- **Audit says:** Bulk campaigns use English labels (Automotive, Food & Beverage) but DB stores Portuguese (Automotivo, Bebidas/FMCG). Every filter returns 0 results.
- **Fix:** Audit all filter values. Map English labels to Portuguese DB values (or standardise to English). Add live company name search. Show "Companies matched: X" counter.
- **Effort:** 1–2 days
- **Status:** ⏳ Pending

### S1-6: Add search to campaign company selector (BUG-14)
- **Audit says:** Company selector is a flat dropdown with 300+ companies and no search. Practically unusable.
- **Fix:** Add text search input filtering in real time. Add filter chips for Industry, City, Status. Show selected count.
- **Effort:** 4–8 hours
- **Status:** ⏳ Pending

### S1-7: Fix bulk approve — Sem img everywhere (BUG-IMAGES)
- **Audit says:** Every image slot in Bulk Approve shows "Sem img". No image management tools. No upload, browse, or assign.
- **Fix:** Debug why image URLs are not appearing after generation. Build image grid: Approve / Reject / Assign to Proposal per card. Add manual upload.
- **Effort:** 3–5 days
- **Status:** ⏳ Pending

---

## SPRINT 2 — UX Overhaul + KPI Dashboard (Weeks 4–6)

### S2-1: Dashboard redesign — add 10 missing KPIs
Top 10 KPIs to add (from audit Section 6):
1. Total Active Sponsorship Revenue (R$) — hero card
2. Total Pipeline Value (R$)
3. Email Deliverability Rate — alert if ~0% (due to OAuth expiry)
4. Proposals Sent This Month
5. Conversion Rate: Proposals → Contracts (%)
6. Follow-up Overdue Count + R$ at Risk — dashboard alert
7. Email Open Rate / Click Rate
8. Companies by Pipeline Stage (funnel)
9. Inventory Utilization Rate (%)
10. Lei de Incentivo Remaining Budget (R$)

### S2-2: Add Gmail OAuth expiry alert on dashboard
- **Audit says:** Gmail expiry not shown anywhere on dashboard. Team may not know emails are failing.
- **Fix:** Add red alert banner on dashboard when Gmail token is expired.

### S2-3: Inline industry field edit (BUG-13)
- **Fix:** Make Industry field click-to-edit inline on company detail page.

### S2-4: Add filters to all major list pages
- Companies: Industry, City, Pipeline stage, Last contact date, Has active proposal
- Proposals: Status, Date range, Deal type, Value range
- Emails: Status, Open/click status, Campaign, Date
- Pipeline: Stage, Assigned to, Value range

### S2-5: Redesign email composer
- Add WYSIWYG block editor
- Add Send Test to Myself button
- Add pre-send validation (empty placeholders blocked)
- Add open/click tracking display

### S2-6: Tinder-style approvals UI (FR-05)
- Card stack, one at a time
- 3 actions: Approve (green) / Reject (red) / Edit (blue)
- Keyboard shortcuts: → Approve, ← Reject, E Edit
- Progress: "12 of 47 reviewed"

---

## SPRINT 3 — Sponsor-Facing Quality (Weeks 7–9)

### S3-1: Sponsor landing page full redesign (FR-04 / BUG-15 full)
The audit says 0 of 25 landing page best practice items are currently met. Required sections:
1. Hero — full-width image, CFC + sponsor logo, proposal title, "I'm Interested" CTA
2. Club Stats Bar — stadium capacity 40,126, avg attendance, TV reach, social followers
3. The Opportunity — 2–3 paragraphs describing the partnership
4. Partnership Package — card grid with photo, description, R$ value per inventory item
5. AI Creatives Gallery — horizontal scroll of approved mockup images
6. Campaign Concept — AI-generated campaign name and activation ideas
7. Past Partners — logo wall of previous CFC sponsors
8. CTA Block — 3 buttons: I'm Interested / Schedule a Meeting / Download PDF
9. Lead Capture Form — Name, Company (pre-filled), Email, Phone, Message, LGPD notice
10. Footer — club name, address, CNPJ, email, phone, social links

Technical: public route (no auth), mobile-responsive, no admin JS loaded, view counter, unique URL per proposal.

### S3-2: Redesign mockup editor
- Template gallery with thumbnails (not just text names)
- Drag-and-drop logo placement, undo/redo, zoom, alignment guides
- Clear placement zone labels with tooltips
- Single unified logo input (file > URL)
- Export to Proposal (auto-attaches PNG)
- Add new templates: OOH Billboard, Press Backdrop, Digital Banner, Social Story, Video Thumbnail

### S3-3: PDF sponsorship deck redesign (8 pages)
Per audit Section 8.2: Cover / Club Profile / Partnership Opportunity / Inventory Assets / Campaign Concept / Visual Mockups / Commercial Terms / Next Steps

### S3-4: Proposal versioning (Section 8.3)
- Save as Version button (auto-versioned v1, v2…)
- Version history sidebar with date, saved by, description
- Compare view: side-by-side diff of any two versions

---

## SPRINT 4 — Intelligence & Automation (Weeks 10–12)

### S4-1: Automated company data enrichment (FR-06)
- Background job on new company save
- Auto-fetch logo (logo.dev), LinkedIn, social handles
- Sponsorship Fit Score (1–10) based on industry + revenue + past sponsorship signals

### S4-2: Weekly newsletter module (FR-07)
- Full architecture in audit Section 14
- Resend API (free 3,000/month), React Email templates
- Subscriber lists from company DB by industry
- Open/click tracking, LGPD compliance, unsubscribe

### S4-3: Pipedrive MCP integration (Section 13)
- Install `ckalima/pipedrive-mcp-server` (MIT, 155 tools)
- Build sync triggers: new company → lead, proposal sent → deal, proposal viewed → activity
- 4 pipelines: Direct Sponsorship / Lei de Incentivo / Barter / Renewal

### S4-4: Bilingual PT/EN admin panel (FR-10)
- PT | EN toggle in header
- All labels, status values switch language
- Permanently fixes BUG-03 root cause

### S4-5: Bulk proposals with Tinder UI (FR-01)
- Search + filter to select target companies
- One personalised proposal + email generated per company
- Tinder card review: Send Now / Edit First / Skip / Reject
- Progress bar during bulk send

### S4-6: Contract module (Section 8.5)
- Convert to Contract from accepted proposal
- Contract fields: number, start/end, total value, payment schedule, signed PDF upload
- Alerts: 60/30/15 days before expiry
- One-click Start Renewal Proposal

### S4-7: WhatsApp integration (Section 8.4)
- Send via WhatsApp button on proposal page
- Pre-written message with proposal link
- wa.me/ fallback if API not configured

---

## FEATURE REQUESTS (from audit, not yet scheduled)

| FR | Feature | Priority | Effort |
|----|---------|----------|--------|
| FR-02 | Team Sender Profile Database | High | 2–3 days |
| FR-03 | Email & Proposal templates with {{variables}} + CTA + images | High | 5–7 days |
| FR-06 | Automated company data enrichment | Medium | 5–7 days |
| FR-08 | Save Hunter.io/Apollo contacts to DB | High | 1–2 days (in S1-2) |
| FR-10 | Bilingual PT/EN admin panel | Medium | 3–5 days |

---

## SUMMARY TABLE — All Items by Priority

| ID | Issue | Priority | Sprint | Effort | Status |
|----|-------|----------|--------|--------|--------|
| S0-1 | Gmail OAuth reconnect | P0 | Sprint 0 | 1 hour | ⏳ |
| S0-2 | Edit button routes to wrong page | P0 | Sprint 0 | 30 min | ⏳ |
| S0-3 | [Nome] renders literally in emails | P0 | Sprint 0 | 1 day | ⏳ |
| S0-4 | Emails have no link/CTA/images | P0 | Sprint 0 | 2–3 days | ⏳ |
| S0-5 | Sponsor /view shows admin sidebar | P0 | Sprint 0 | 1–2 hours | ⏳ |
| S1-1 | 28 stuck image generation jobs | P0 | Sprint 1 | 1 day | ⏳ |
| S1-2 | Hunter/Apollo contacts not saveable | P0 | Sprint 1 | 1–2 days | ⏳ |
| S1-3 | Approvals page completely empty | P1 | Sprint 1 | 4 hours | ⏳ |
| S1-4 | Pipedrive: 0 synced, 35 pending | P1 | Sprint 1 | 1–2 days | ⏳ |
| S1-5 | Bulk campaigns PT/EN mismatch | P0 | Sprint 1 | 1–2 days | ⏳ |
| S1-6 | Campaign selector no search | P1 | Sprint 1 | 4–8 hours | ⏳ |
| S1-7 | Bulk Approve "Sem img" everywhere | P0 | Sprint 1 | 3–5 days | ⏳ |
| S2-1 | Dashboard missing 10+ KPIs | P1 | Sprint 2 | 4 days | ⏳ |
| S2-2 | Gmail expiry alert on dashboard | P1 | Sprint 2 | 2 hours | ⏳ |
| S2-3 | Industry field not inline-editable | P2 | Sprint 2 | 1–2 days | ⏳ |
| S2-4 | Filters missing on all list pages | UX | Sprint 2 | 2 days | ⏳ |
| S2-5 | Email composer UX redesign | UX | Sprint 2 | 3 days | ⏳ |
| S2-6 | Tinder-style approvals UI | FR-05 | Sprint 2 | 3 days | ⏳ |
| S3-1 | Sponsor landing page full redesign | FR-04 | Sprint 3 | 5–7 days | ⏳ |
| S3-2 | Mockup editor redesign | UX | Sprint 3 | 4 days | ⏳ |
| S3-3 | PDF deck redesign (8 pages) | FR | Sprint 3 | 3 days | ⏳ |
| S3-4 | Proposal versioning | FR | Sprint 3 | 3 days | ⏳ |
| S4-1 | Automated company enrichment | FR-06 | Sprint 4 | 5 days | ⏳ |
| S4-2 | Newsletter module | FR-07 | Sprint 4 | 4 days | ⏳ |
| S4-3 | Pipedrive MCP integration | FR | Sprint 4 | 3–5 days | ⏳ |
| S4-4 | Bilingual PT/EN admin panel | FR-10 | Sprint 4 | 3 days | ⏳ |
| S4-5 | Bulk proposals with Tinder UI | FR-01 | Sprint 4 | 8 days | ⏳ |
| S4-6 | Contract module | New | Sprint 4 | 5 days | ⏳ |
| S4-7 | WhatsApp integration | New | Sprint 4 | 3 days | ⏳ |

**Already fixed (June 8–9 sprint):**
| BUG-08 (partial) | Prompt review modal for image generation | ✅ Done |
| BUG-12 / FR-09 | Add competitors to companies DB | ✅ Done |

---

## What to Do RIGHT NOW (Today / Tomorrow)

In order:

1. **S0-2** — Fix Edit button (30 min, trivial, unblocks the whole team)
2. **S0-5** — Remove sidebar from /view (2 hours, every sponsor sees this right now)
3. **S0-1** — Reconnect Gmail OR switch to Resend API
4. **S0-3** — Fix [Nome] placeholder substitution
5. **S0-4** — Add proposal link + CTA to email template
6. **S1-3** — Fix Approvals page empty (4 hours, likely one query fix)
7. **S1-6** — Add search to campaign selector (4–8 hours)
8. **S1-5** — Fix bulk campaigns PT/EN mismatch

Everything else follows in the sprint order above.

---

*Source: Coritiba Platform Audit v4.pdf (47 pages) + Sponsorship Platform UX UI Grid.png*  
*Audit live date: June 22, 2026 · Action plan: June 26, 2026*
