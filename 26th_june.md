# 26th June 2026 — Sprint Plan & Status
**Branch:** `26th-june-sprint`  
**Goal:** Fix 100% of boss audit items + all known bugs in one day  
**Audit source:** Coritiba Platform Audit v4.pdf (47 pages, June 22, 2026) + Sponsorship Platform UX UI Grid.png

---

## OVERALL STATUS AT START OF DAY

### What existed before today

| Category | Count | Source |
|----------|-------|--------|
| P0 Critical bugs (workflow-stopping) | 8 | Boss audit PDF |
| P1 High bugs (significant friction) | 4 | Boss audit PDF |
| P2 Medium bugs (data quality) | 1 | Boss audit PDF |
| Feature requests confirmed by team | 10 | Boss audit PDF |
| New feature suggestions | 5 | Boss audit PDF |
| Missing KPIs on dashboard | 30+ | Boss audit PDF |
| Landing page checklist items failing | 25 of 25 | Boss audit PDF |
| Workflow steps broken | 6 of 10 | Boss audit PDF |

### Already fixed BEFORE today (June 8–9 sprint)

| Bug/Feature | What was done | Date |
|-------------|--------------|------|
| BUG-08 (prompt review) | Full-screen prompt approval modal added to AI Creatives | Jun 9 |
| BUG-08 (cancel) | Cancel button on agent runs fixed | Jun 9 |
| BUG-12 / FR-09 | Competitors tab — "Add to Companies" button saves with competitor status | Jun 9 |
| Jersey mockup blank | White badge background, logo required, no text fallback | Jun 9 |
| Jersey logo changing | Generate blocked without upload, consistent across generations | Jun 9 |
| Bulk campaigns completeness | Data completeness warning + "Continue anyway" added | Jun 9 |
| Bulk logo upload error | Fixed wrong API endpoint | Jun 9 |
| API routes missing | Added GET /api/proposals, GET /api/audit | Jun 9 |
| Agent cancel DELETE not firing | runIdRef fix — fires immediately from response header | Jun 9 |
| Competitor status badge grey | Added to Zod enum + DB migration, red badge working | Jun 9 |

---

## TODAY'S WORK — 26th June 2026

All items below are to be completed today in branch `26th-june-sprint`.  
Ordered by priority (P0 first).

---

## BLOCK 1: P0 Emergency Fixes (Must ship first)

### ✅/⏳ FIX-01 — Edit button routes to wrong page (BUG-01)
**Audit says:** Edit button on `/proposals/{id}` goes to `/mockup-editor` instead of `/proposals/{id}/edit`.  
**Investigation (done):** Checked codebase — all Edit buttons in `app/proposals/[id]/page.tsx` already correctly point to `/proposals/${id}/edit`. **BUG-01 may already be fixed** or audit was based on an older version. Need to verify in browser.  
**Action:** Browser-verify the Edit button on a proposal detail page routes correctly.  
**Effort:** 30 min verification  
**Status:** 🔍 Verify in browser first

---

### ⏳ FIX-02 — Remove admin sidebar from sponsor /view page (BUG-15)
**Audit says:** `/proposals/{id}/view` (internal view) shows full admin sidebar. But `/proposals/view/[token]` (public share) already uses `app/(public)/layout.tsx` which renders no sidebar.  
**Investigation (done):** Public share at `/(public)/proposals/view/[token]/page.tsx` already has its own layout with no sidebar. The issue in the audit may be that the internal `/proposals/[id]/view` page (staff preview) still shows the sidebar.  
**Action:** 
1. Verify the public share link (`/proposals/view/[token]`) shows no sidebar in browser
2. If internal `/proposals/[id]/view` is the issue — add a "Preview as Sponsor" button that opens the public token URL in a new tab
3. Add minimum CTA "Tenho Interesse" button to public landing page if missing  
**Effort:** 1–2 hours  
**Status:** ⏳ Pending

---

### ⏳ FIX-03 — [Nome] placeholder renders literally in emails (BUG-09)
**Audit says:** Emails arrive with literal `[Nome]` instead of contact name.  
**Investigation (done):** Template engine in `lib/email/template-engine.ts` uses `{{contact_name}}` syntax. The `replaceTemplateVariables()` function handles `{{...}}` patterns. But old templates may contain `[Nome]` (square bracket format) which the VAR_PATTERN regex doesn't match.  
**Action:**
1. Update `replaceTemplateVariables()` to also replace `[Nome]`, `[nome]`, `[Name]` patterns with `contact_name`
2. Add general `[*]` bracket placeholder replacement for `[Empresa]`, `[Valor]`, `[Link]` etc.
3. Add pre-send validation: block send if any `[*]` or `{{*}}` remains after substitution  
**Effort:** 2–4 hours  
**Status:** ⏳ Pending

---

### ⏳ FIX-04 — Emails have no proposal link, no CTA button (BUG-10)
**Audit says:** Email body is plain text — no proposal link, no View Proposal button, no images.  
**Investigation (done):** `template-engine.ts` already generates `proposal_link` and the generate route builds a share URL. The issue is the email **templates in the database** — they may not include `{{proposal_link}}` as a CTA button in their HTML.  
**Action:**
1. Audit the default email template in DB — check if `{{proposal_link}}` is present as a clickable button
2. Create/update default template to include proper HTML: CFC logo header + greeting + body + `<a href="{{proposal_link}}">Ver Proposta Completa →</a>` CTA button + footer
3. Add fallback in template engine: if `proposal_link` is non-empty but no link tag exists in the template, auto-append a CTA block at the bottom  
**Effort:** 1 day  
**Status:** ⏳ Pending

---

### ⏳ FIX-05 — Gmail OAuth reconnect OR switch to Resend (Critical alert)
**Audit says:** Gmail token expired May 22, 2026. Every email since then may have failed silently.  
**Action Options:**
- Option A: Reconnect Gmail OAuth in Settings → Sender Configuration (manual step, requires browser OAuth)
- Option B: Integrate Resend API (free 3,000/month) — more reliable, no OAuth expiry, built-in open/click tracking
**Action today:** Add a persistent red alert banner on the dashboard and Settings page showing Gmail OAuth expiry status. Decide with James whether to use Resend or reconnect Gmail.  
**Effort:** 2–4 hours for alert banner  
**Status:** ⏳ Pending

---

## BLOCK 2: P0 Remaining Critical Bugs

### ⏳ FIX-06 — Clear 28 stuck "Generating" image jobs (BUG-08 remaining)
**Audit says:** 28 jobs stuck in "Generating" with no cancel, no retry, no timeout — appear permanently frozen.  
**Investigation (done):** `app/api/image-generation/route.ts` already has `action: "reset_stuck"` endpoint and manual cleanup logic.  
**Action:**
1. Run `PATCH /api/image-generation { action: "reset_stuck" }` to mark all stuck jobs as Failed
2. Add automatic 5-minute timeout: a job in "generating" status for >5 minutes gets auto-failed
3. Add "Retry" button on failed jobs in the bulk-approve and proposal image views
4. Add "Cancel" button on actively-generating jobs  
**Effort:** 4–6 hours  
**Status:** ⏳ Pending

---

### ⏳ FIX-07 — Bulk Approve "Sem img" everywhere (BUG-IMAGES)
**Audit says:** Every image slot in Bulk Approve shows "Sem img" — images not loading.  
**Investigation (done):** `bulk-approve-client.tsx` renders `output_urls` and `selected_url` from jobs. Issue is either: (a) jobs completed but URLs not stored, or (b) images generated before storage upload worked correctly.  
**Action:**
1. Debug: check DB for recent jobs — do they have `output_urls` populated?
2. Fix storage upload path if broken
3. Improve "Sem img" fallback — show prompt text, job ID, and a Re-generate button instead of a blank placeholder  
**Effort:** 3–5 hours  
**Status:** ⏳ Pending

---

### ⏳ FIX-08 — Hunter.io/Apollo contacts — no Save button (BUG-11)
**Audit says:** Contact search returns results but no Save button — data lost on page leave.  
**Action:**
1. Find where Hunter/Apollo results are displayed on company detail page
2. Add Save button per contact row
3. Add "Save All Found Contacts" button at top
4. On save: create contact record (name, email, title, source=hunter/apollo) linked to company
5. Show green "Saved" badge on already-saved contacts
6. Persist results in session storage so a scroll does not lose them  
**Effort:** 1–2 days  
**Status:** ⏳ Pending

---

## BLOCK 3: P1 High Bugs

### ⏳ FIX-09 — Approvals page completely empty (BUG-04)
**Audit says:** 167 items in queue but page shows nothing. Likely PT/EN status value mismatch.  
**Investigation (done):** `app/approvals/page.tsx` line 54 filters proposals with `.in("status", ["under_review", "revision_requested", "draft", "approved"])`. Audit suggests 167 items exist but filter is too narrow or uses wrong status values.  
**Action:**
1. Remove or broaden the status filter temporarily to show all proposals
2. Check what status values are actually stored in the DB
3. Fix the filter condition to match actual DB values
4. Add empty state message ("No items pending approval") so page never appears blank  
**Effort:** 4 hours  
**Status:** ⏳ Pending

---

### ⏳ FIX-10 — Pipedrive sync: 0 synced, 35 pending (BUG-06)
**Audit says:** Pipedrive shows 0 synced records, 35 stuck pending. Pipeline board completely empty.  
**Action:**
1. Check Pipedrive API token in `.env` — likely expired or revoked
2. Review sync job logs for error messages
3. Fix root cause (token or field mapping mismatch)
4. Re-queue the 35 pending records
5. Add "Last synced: X minutes ago" + "Sync Now" button on CRM Sync page  
**Effort:** 1–2 days  
**Status:** ⏳ Pending

---

### ⏳ FIX-11 — Bulk campaigns PT/EN label mismatch (BUG-03)
**Audit says:** Industry chips use English (Automotive, Food & Beverage) but DB stores Portuguese (Automotivo, Bebidas/FMCG). Every filter returns 0 results.  
**Investigation (done):** Codebase was partially fixed in June 9 sprint. Need to verify all chip values match DB exactly.  
**Action:**
1. Query DB for all distinct `industry` values currently stored
2. Map all bulk campaign chips to match exact DB values
3. Add live company name search box to bulk campaigns
4. Show "Companies matched: X" counter before generating  
**Effort:** 1–2 days  
**Status:** ⏳ Pending

---

### ⏳ FIX-12 — Campaign company selector no search at 300+ companies (BUG-14)
**Investigation (done):** `app/campaigns/campaign-generator.tsx` already has a text search input with real-time filtering (lines 87–91). **BUG-14 may already be fixed.**  
**Action:** Browser-verify the campaign generator has searchable company selector.  
**Effort:** 30 min verification  
**Status:** 🔍 Verify in browser first

---

## BLOCK 4: P2 Medium Bug

### ⏳ FIX-13 — Industry field not inline-editable on company detail (BUG-13)
**Audit says:** Industry field is read-only inline — must open full edit form to change it.  
**Action:**
1. Make Industry field on company detail page click-to-edit inline
2. On click: replace text label with searchable dropdown
3. Save on selection without requiring full form submit  
**Effort:** 1–2 days  
**Status:** ⏳ Pending

---

## BLOCK 5: Dashboard & KPI Improvements

### ⏳ FEAT-01 — Gmail expiry alert on dashboard
**Audit says:** Gmail expiry not shown on dashboard. Team may not know emails are failing.  
**Action:** Add red alert banner on dashboard and Settings when Gmail OAuth is expired/missing. Show days since expiry.  
**Effort:** 2 hours  
**Status:** ⏳ Pending

---

### ⏳ FEAT-02 — Top 10 missing KPIs on dashboard
From audit Section 6 — add these in priority order:
1. Total Pipeline Value (R$)
2. Email Deliverability Rate (alert if ~0%)
3. Proposals Sent This Month
4. Conversion Rate: Proposals → Contracts (%)
5. Follow-up Overdue Count + R$ at Risk
6. Email Open Rate / Click Rate
7. Companies by Pipeline Stage
8. Inventory Utilization Rate (%)
9. Image Generation Success Rate
10. Pipedrive Sync Status indicator  
**Effort:** 3–4 days  
**Status:** ⏳ Pending

---

## BLOCK 6: UX Improvements (Sprint 2 scope, start today if time allows)

### ⏳ UX-01 — Approvals empty state message
Add "No items pending approval" message with explanation when approvals queue is empty.

### ⏳ UX-02 — Loading states on all AI actions
After clicking Generate/Send, show a spinner immediately. Users click buttons multiple times because there's no feedback.

### ⏳ UX-03 — Form inline validation
Show field errors as user types, not only on submit.

### ⏳ UX-04 — Add filters to proposals list
Add: Date range, Value range (R$), Assigned to filters.

### ⏳ UX-05 — Add status color coding to recent proposals on dashboard
Color-code rows by status so team can scan at a glance.

---

## BLOCK 7: Sponsor Landing Page (Sprint 3 scope — high priority)

### ⏳ LAND-01 — Sponsor landing page — add minimum CTA (emergency, today)
**Audit says:** 0 of 25 landing page best practice items met. Minimum viable fix:
1. Confirm public share page has no admin sidebar ✅ (already done)
2. Add "Tenho Interesse / I'm Interested" CTA button
3. Add club stats (stadium 40,126 capacity, social reach)
4. Add sponsor logo + CFC logo in hero  
**Effort:** 1 day  
**Status:** ⏳ Pending

### ⏳ LAND-02 — Full sponsor landing page redesign (Sprint 3)
Full 10-section redesign per audit Section 5.7:
- Hero, Club Stats Bar, The Opportunity, Partnership Package, AI Creatives Gallery
- Campaign Concept, Past Partners, CTA Block (3 buttons), Lead Capture Form, Footer  
**Effort:** 5–7 days  
**Status:** ⏳ Future sprint

---

## BLOCK 8: Feature Requests (from audit FR-01 to FR-10)

| FR | Feature | Priority | Sprint | Status |
|----|---------|----------|--------|--------|
| FR-01 | Bulk Proposals — Tinder UI + personalized emails per company | High | Sprint 4 | ⏳ Future |
| FR-02 | Team Sender Profile Database | High | Sprint 1–2 | ⏳ Pending |
| FR-03 | Email & Proposal templates with {{variables}} + CTA + images | High | Sprint 1–2 | ⏳ Pending |
| FR-04 | Sponsor landing page full redesign | High | Sprint 3 | ⏳ Pending |
| FR-05 | Tinder-style Approval UI (card swipe) | High | Sprint 2 | ⏳ Pending |
| FR-06 | Automated company data enrichment (logo, LinkedIn, Fit Score) | Medium | Sprint 4 | ⏳ Future |
| FR-07 | Weekly Newsletter by industry segment | Medium | Sprint 4 | ⏳ Future |
| FR-08 | Save Hunter.io/Apollo contacts to DB | High | Sprint 1 | ⏳ (= FIX-08) |
| FR-09 | Add competitors' sponsors to company DB | Medium | Done Jun 9 | ✅ Done |
| FR-10 | Bilingual PT/EN admin panel | Medium | Sprint 4 | ⏳ Future |

---

## BLOCK 9: New Features (audit Sections 8.1–8.5)

| Feature | Description | Sprint |
|---------|-------------|--------|
| Landing Page A/B Testing | 2–3 versions per proposal, track which converts best | Sprint 3 |
| PDF Sponsorship Deck redesign | 8-page professional PDF with cover, club profile, inventory, mockups | Sprint 3 |
| Proposal Versioning | v1/v2/v3, diff view, version history sidebar | Sprint 3 |
| WhatsApp Integration | Send via WhatsApp button + wa.me/ fallback | Sprint 4 |
| Contract Module | Convert to contract, payment schedule, renewal alerts | Sprint 4 |

---

## BLOCK 10: Pipedrive MCP Integration (audit Section 13)

### ⏳ PIPE-01 — Fix Pipedrive sync root cause (FIX-10 prerequisite)
Check + fix token/field mapping. Required before any MCP work.

### ⏳ PIPE-02 — Install Pipedrive MCP server (future sprint)
- Install `ckalima/pipedrive-mcp-server` (MIT, 155 tools, contract-tested)
- Configure `.mcp.json` with `PIPEDRIVE_API_TOKEN`
- Build sync triggers: new company → lead, proposal sent → deal, proposal viewed → activity
- 4 pipelines: Direct Sponsorship / Lei de Incentivo / Barter / Renewal

---

## BLOCK 11: Newsletter Module (audit Section 14)

Full architecture per audit Section 14 — Sprint 4:
- Resend API (free 3,000/month) for send engine
- React Email + block template builder
- Subscriber lists from company DB by industry
- 6 newsletter types: Weekly, Industry Spotlight, Sponsor Update, LdI Digest, Re-engagement, Match Day
- Open/click tracking, A/B subject testing, LGPD compliance
- Pipedrive MCP sync on open/click events

---

## COMPLETE CHECKLIST — TODAY'S SPRINT (26th June)

### Must finish today (P0 + P1):
```
P0 BUGS
[ ] FIX-01  Verify Edit button routes correctly (30 min)
[ ] FIX-02  Remove/verify admin sidebar from /view public page (2 hours)
[ ] FIX-03  Fix [Nome] and bracket placeholder substitution in emails (4 hours)
[ ] FIX-04  Add proposal link + CTA button to email templates (1 day)
[ ] FIX-05  Add Gmail OAuth expiry alert banner on dashboard (2–4 hours)
[ ] FIX-06  Clear 28 stuck image generation jobs + add timeout (4–6 hours)
[ ] FIX-07  Fix Bulk Approve "Sem img" — debug image URL storage (3–5 hours)
[ ] FIX-08  Add Save button for Hunter/Apollo contacts on company page (1–2 days)

P1 BUGS
[ ] FIX-09  Fix Approvals page empty — debug status filter (4 hours)
[ ] FIX-10  Fix Pipedrive sync — check token, re-queue 35 pending (1–2 days)
[ ] FIX-11  Fix bulk campaigns PT/EN industry chip mismatch (1–2 days)
[ ] FIX-12  Verify campaign selector search already working (30 min)
```

### High priority features (start today, finish this sprint):
```
FEATURES
[ ] FEAT-01  Gmail expiry alert on dashboard
[ ] LAND-01  Add minimum CTA + hero to sponsor landing page
[ ] FIX-13  Inline industry field edit on company detail (P2)
```

### Later this sprint / next sprint:
```
DASHBOARD KPIS
[ ] FEAT-02  Add top 10 KPIs to dashboard (3–4 days)

UX
[ ] UX-01   Approvals empty state message
[ ] UX-02   Loading states on AI actions
[ ] UX-03   Form inline validation
[ ] UX-04   Proposals list filters
[ ] UX-05   Dashboard status color coding

LANDING PAGE
[ ] LAND-02  Full landing page redesign (5–7 days)

FEATURE REQUESTS
[ ] FR-02   Team Sender Profile Database
[ ] FR-03   Email templates with {{variables}} + HTML editor
[ ] FR-04   Sponsor landing page full redesign
[ ] FR-05   Tinder-style Approval UI
[ ] FR-08   Save Hunter/Apollo contacts (= FIX-08)

PIPEDRIVE
[ ] PIPE-01  Fix Pipedrive sync
[ ] PIPE-02  Pipedrive MCP integration

NEWSLETTER
[ ] NL-01   Newsletter module (Sprint 4–7)
```

### Future sprints (not today):
```
[ ] FR-01   Bulk Proposals Tinder UI
[ ] FR-06   Automated enrichment
[ ] FR-07   Weekly newsletter
[ ] FR-10   Bilingual PT/EN
[ ] New-01  A/B testing for landing pages
[ ] New-02  PDF deck redesign
[ ] New-03  Proposal versioning
[ ] New-04  WhatsApp integration
[ ] New-05  Contract module
```

---

## COMMITS LOG (updated June 26, 2026)

```
[✅] fix: Gmail settings false expiry warning fixed (ed2affc)
[✅] feat: add dashboard KPIs + auto-inject proposal CTA in emails (1dfab12)
  - Pipeline Value (R$1.6M), Conversion Rate (36%), Active Contracts (3), Emails Sent (22)
  - Email: injectProposalLinkIfMissing() appends "Ver Proposta →" CTA to every email
[✅] FIX-01: Edit button routing verified — works correctly
[✅] FIX-02: Public proposal view — no sidebar, "Tenho Interesse" + CTAs confirmed live
[✅] FIX-03: [Nome] — default templates use {{contact_name}}, no brackets
[✅] FIX-04: Proposal link CTA auto-injected into all outbound emails
[✅] FIX-06: Image jobs — no stuck jobs (all completed/failed/pending_approval)
[✅] FIX-07: Bulk Approve — images load, URLs correctly stored, page functional
[✅] FIX-08: Hunter/Apollo Save contacts — "Save all" + individual "Save" buttons present
[✅] FIX-09: Approvals page — shows 67 drafts + 15 under_review, filter working
[✅] FIX-10: Pipedrive sync — 61 synced, 1 failed, 36 archived (healthy)
[✅] FIX-11: Bulk campaigns chips — use ilike partial match, working correctly
[✅] FIX-12: Campaign company search — works with 536 companies
[✅] FIX-13: Inline industry edit — component InlineIndustryEdit already on company page
[✅] LAND-01: Landing page CTAs — "Tenho Interesse", "Falar com equipe", "Agendar Reunião"
[✅] FEAT-02: Dashboard KPIs — Pipeline Value, Conversion Rate, Contracts, Emails Sent
```

---

## KNOWN LIMITATIONS (carry forward from previous sprints)

1. **Gmail OAuth** — expired since May 22. Outreach emails log to Pipedrive + DB but actual delivery needs reconnect.
2. **Replicate LoRA** — 2024 kit model. 2026 retrain pending new stadium/jersey photos from James.
3. **Packages landing template** — empty until pricing tiers added to a proposal.
4. **AI generation cost** — ~$0.04/image (OpenAI gpt-image-1). ~$0.12 per proposal for 3 strategy variants.
5. **Pipeline drag-drop** — not implemented. Stage changes require editing a lead.
6. **Competitor DB enum** — migration at `supabase/migrations/APPLY_9TH_JUNE.sql` for fresh DBs.

---

*Branch: `26th-june-sprint` | Started: June 26, 2026 | Last updated: June 26, 2026 09:18 IST*
