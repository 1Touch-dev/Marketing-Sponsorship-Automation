# Coritiba FC Platform — Sprint Plan (2 June 2026)

**Date:** 2 June 2026 | **By:** Abhishek  
**Active branch:** `feature/agents-sprint`  
**Platform URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Login:** `patrocinios@coritiba.com.br` / `admin@1Touch`

**Sources:** James Thunder WhatsApp messages (1–2 June 2026) + Perplexity Platform Audit PDF (15 bugs, 10 feature requests)

---

## Executive Summary

Today is a high-volume sprint. Two sources of work converged:
1. **James WhatsApp** — 10+ concrete requirements across bulk proposals, emails, newsletter, mockups, company data, and video.
2. **Platform Audit PDF** — 8 critical (P0) bugs, 4 high (P1) bugs, 1 medium (P2) bug, and 10 feature requests identified by an independent audit.

**6 of 10 steps in the end-to-end sponsorship workflow currently fail.** The platform cannot complete a full send from proposal generation to sponsor receipt.

Priority is: fix the broken end-to-end flow first (P0 bugs), then implement the new features James requested.

---

## 🚨 URGENT — Fix First (P0 Critical Bugs)

These block production use entirely. They must be resolved before any new feature work.

---

### P0-01 — Edit button routes to wrong page (BUG-01)
**Page:** `/proposals/{id}`  
**Problem:** The "Edit" button opens `/mockup-editor` instead of `/proposals/{id}/edit`. The correct edit page exists and works — button just points to the wrong URL.  
**Fix:** Change `href` on the Edit button to `/proposals/{id}/edit`.  
**Effort:** ~30 min  
**Files:** `frontend/app/proposals/[id]/page.tsx`

---

### P0-02 — Bulk Campaigns 100% failure: EN labels vs PT database (BUG-03)
**Page:** `/campaigns/bulk`  
**Problem:** The form uses English industry labels (`Automotive`, `Food & Beverage`, etc.) but the database stores Portuguese values (`Automotivo`, `Bebidas / FMCG`, etc.). All 10 industry options return "No active companies found" — 100% failure rate.  
**Fix:**
- Map EN → PT in the backend query or align form values with DB values
- Add individual company search by name (not just industry)
- Add multi-select: pick entire industry or cherry-pick specific companies from results
**Effort:** 4h  
**Files:** `frontend/app/campaigns/bulk/page.tsx`, `frontend/app/api/campaigns/bulk/route.ts`

---

### P0-03 — Generate Creatives fires immediately with no prompt preview (BUG-08)
**Page:** `/proposals/{id}` — Visuals section  
**Problem:** "Generate Creatives" button triggers AI generation immediately with no prompt shown or editable. 28 jobs are currently stuck in "Generating" state.  
**Fix:**
- Add a prompt preview/edit modal before generation fires — user must confirm or edit
- Add Cancel option before generation starts
- Add filter/sort controls on the AI Image Gen page (by proposal, campaign, company)
- Reset / cancel stuck jobs (28 jobs currently in "Generating")
**Effort:** 5h  
**Files:** `frontend/components/proposals/campaign-image-generator.tsx`, `frontend/app/media-generation/image-generation-manager.tsx`

---

### P0-04 — [Nome] placeholder renders literally in emails (BUG-09)
**Page:** `/emails/{id}`  
**Problem:** Email body shows literal `[Nome]` — sender name is never injected. The team has 5–10 people sending emails, each with a different name, title, and signature.  
**Fix:**
- Build a **Team Sender Profile** database: name, title, email, phone, LinkedIn, HTML signature per team member (5–10 people)
- Replace `[Nome]` with `{{sender.name}}` and inject at send time from sender profile
- Also fix `[Company]` and other literals — full placeholder injection system
- Assign a default sender to each company/outreach
**Effort:** 3h  
**Files:** New: `supabase/migrations/0021_team_sender_profiles.sql`, `frontend/app/api/team/`, `frontend/lib/email/inject-placeholders.ts`

---

### P0-05 — No proposal link or images in email body (BUG-10)
**Page:** `/emails/{id}`  
**Problem:** Email HTML has zero links — no "View Proposal" URL, no CTA button, no images. Sponsors receive a plain-text email with no way to access their proposal.  
**Fix:**
- Add mandatory CTA block to every outreach email: "Ver Proposta →" → `/proposals/{id}/view` (public link)
- Add support for embedded images in email body (jersey mockup, campaign visual, club logo)
- Make emails concise and compelling sales pitches, not plain text — rewrite AI prompt accordingly
**Effort:** 3h  
**Files:** `frontend/lib/agents/tools.ts` (email generation prompt), `frontend/app/api/emails/`, `frontend/components/emails/`

---

### P0-06 — Contacts found via Hunter/Apollo cannot be saved (BUG-11)
**Page:** `/companies/{id}` — Contacts tab  
**Problem:** 10 contacts confirmed found for Ambev — but there is no Add/Save/Import button. Data is lost when the user leaves the page.  
**Fix:**
- Checkbox per found contact + "Add Selected" and "Add All" buttons
- Pre-fill name, title, email from Hunter/Apollo result
- Deduplicate by email address before inserting
- Save to `contacts` table linked to the company
- Show enrichment source (Hunter / Apollo) and date
**Effort:** 3h  
**Files:** `frontend/app/companies/[id]/page.tsx`, `frontend/app/api/contacts/route.ts` (new or extend)

---

### P0-07 — Bulk Approve: no images visible, no image management (BUG-IMAGES)
**Page:** `/proposals/bulk-approve`  
**Problem:** All rows show "Sem img" — images can't be reviewed before approving. No way to create, view, or manage images across the platform. 28 stuck generation jobs.  
**Fix:**
- Prompt-based image creation UI: enter prompt, fire single image, view result inline
- Image library page: filter by company, campaign, proposal; show thumbnail, status, prompt
- Unblock/reset 28 stuck jobs (mark failed, allow regeneration)
- Show actual image thumbnails in bulk approve when `output_urls` is populated
**Effort:** 5h  
**Files:** `frontend/app/proposals/bulk-approve/`, `frontend/app/media-generation/`, `frontend/app/api/image-generation/route.ts`

---

### P0-08 — Sponsor landing page: admin sidebar exposed, no CTA (BUG-15)
**Page:** `/proposals/{id}/view`  
**Problem:** The public page sent to sponsors shows the full internal admin sidebar. There is also no CTA for the sponsor to take any action.  
**Fix:**
- Render `/proposals/{id}/view` as a fully isolated public layout with no admin sidebar, no nav
- Use actual Coritiba FC team logo (not placeholder) in hero
- Add CTA block: "Tenho Interesse", "Agendar Reunião", contact form or WhatsApp link
- Fix: mockup images on landing page look terrible (James screenshot) — improve sizing, presentation, remove black background
**Effort:** 4h  
**Files:** `frontend/app/proposals/[id]/view/page.tsx`, `frontend/components/proposals/proposal-landing-page.tsx`

---

## 🔴 HIGH PRIORITY BUGS (P1)

---

### P1-01 — Approvals page empty (BUG-04)
**Page:** `/approvals`  
**Problem:** Page shows nothing despite proposals, campaigns, and emails existing. Query or RLS issue.  
**Fix:**
- Debug approvals query — check RLS policies, status filters, join logic
- Add filter/sort by type (proposal, campaign, email) and stage (draft, pending, sent)
**Effort:** 5h  
**Files:** `frontend/app/approvals/page.tsx`, `frontend/app/api/approvals/`

---

### P1-02 — Pipedrive CRM: 35 pending, 0 synced (BUG-06)
**Page:** `/crm-sync`, `/pipeline`  
**Problem:** 35 companies queued for Pipedrive sync, none succeeded. Integration broken or misconfigured.  
**Fix:**
- Verify Pipedrive API token (`c07f34a697f7551fe9c54cda9653903dc0155cf2`) is still valid
- Map company fields correctly (PT field names → Pipedrive field IDs)
- Add error logging for failed syncs — show per-company sync status
- Force manual sync option from UI
**Effort:** 4h  
**Files:** `frontend/lib/pipedrive/`, `frontend/app/api/crm-sync/`

---

### P1-03 — Competitors tab: no Add to DB button (BUG-12)
**Page:** `/companies/{id}` — Competitors tab  
**Problem:** Found competitors cannot be turned into prospectable company records.  
**Fix:**
- Add "Add to DB" button per competitor row
- Pre-fill: company name, website, industry
- Option to immediately create a proposal for that competitor
- Add "Competitor of X" badge in company list
**Effort:** 3h  
**Files:** `frontend/app/companies/[id]/page.tsx`

---

### P1-04 — Campaign company selector has no search (BUG-14)
**Page:** `/campaigns`  
**Problem:** Company dropdown has no search — 300+ companies to scroll manually.  
**Fix:** Add autocomplete search input (same pattern as proposal wizard)  
**Effort:** 1h  
**Files:** `frontend/app/campaigns/page.tsx`, `frontend/components/campaigns/`

---

## 🟡 MEDIUM BUGS (P2)

---

### P2-01 — Company industry field: no inline edit (BUG-13 + James request)
**Page:** `/companies/{id}`, `/companies` list  
**Problem:** Changing industry requires opening a full edit form. With 300+ companies needing Portuguese labels, this is a bottleneck. James also said: "We should easily be able to edit or add what category a company is in."  
**Fix:**
- Click-to-edit inline on the industry/category chip on company detail page
- Also editable from company list row
- Auto-label industry during data enrichment (use Apollo industry field + AI classify)
**Effort:** 3h  
**Files:** `frontend/app/companies/[id]/page.tsx`, `frontend/app/companies/page.tsx`

---

## 🟢 NEW FEATURES — James Requirements

These are new builds (not bug fixes). Implement after P0/P1 bugs are resolved.

---

### F-01 — Bulk Proposals: industry/company search + personalized per-company emails (FR-01 + James)
**Current state:** Bulk campaigns fail because of EN/PT mismatch (P0-02); and even when fixed, all companies get the same generic email.  
**What James asked:**
- Search by industry AND get suggestions/results of individual companies
- Cherry-pick individual companies OR select whole industry
- Generate a **unique personalized proposal** per selected company
- Generate **unique personalized emails per contact per company** (3 contacts = 3 different emails), each tailored to the contact's role and LinkedIn profile  
- Approval UI to review each email and proposal before bulk dispatch  
**Implementation plan:**
- Fix EN→PT mismatch (P0-02 above)
- Add company name search alongside industry filter
- Multi-select checkbox UI for company selection
- Per-company proposal generation (already exists for single agent runs — extend to bulk loop)
- Per-contact email generation loop: for each selected contact, generate email customized to name + title + role + basic LinkedIn context
- "Tinder-style" approval queue: one email/proposal at a time, Approve / Reject / Edit (see F-06)
**Effort:** 8h (depends on F-06 for UI)  
**Files:** `frontend/app/campaigns/bulk/`, `frontend/lib/agents/orchestrator.ts`, new `frontend/app/api/bulk-outreach/`

---

### F-02 — Team Sender Profile Database (FR-02 + James)
**What James asked:** "Email placeholders for our names should be in a database, there is a team of like 5-10 people."  
**Implementation plan:**
- New `team_members` table: `id, name, title, email, phone, linkedin_url, avatar_url, html_signature, assigned_companies[]`
- CRUD UI at `/settings/team` (extend existing Team & Roles page)
- Sender auto-injection: at email send/generation time, look up assigned sender → replace `[Nome]`, `[Cargo]`, `[Telefone]`, `[LinkedIn]`
- Dynamic variables: `{{sender.name}}`, `{{sender.title}}`, `{{sender.email}}`, `{{sender.phone}}`, `{{sender.linkedin}}`, `{{sender.signature}}`
**Effort:** 4h  
**Files:** New: `supabase/migrations/0021_team_sender_profiles.sql`, `frontend/app/settings/team/`, `frontend/lib/email/inject-placeholders.ts`

---

### F-03 — Email & Proposal Templates with Placeholder Variables (FR-03 + James)
**What James asked:** "Draft, edit, and save emails as templates with placeholders. Email templates for initial contact, follow up, etc. — more concise and interesting sales pitches. Include images. Include proposal link."  
**Implementation plan:**
- New `email_templates` table: `id, name, type (initial_contact | follow_up | barter | lei_de_incentivo), subject_template, body_html_template, placeholders[], created_by`
- Template editor UI at `/emails/templates`: visual rich-text editor, insert placeholder chips
- Standard placeholders: `{{sponsor.name}}`, `{{sponsor.company}}`, `{{contact.title}}`, `{{proposal.title}}`, `{{proposal.link}}`, `{{sender.name}}`, `{{sender.title}}`, `{{club.name}}`, `{{package.value}}`
- CTA block component: mandatory "Ver Proposta →" link + optional meeting scheduler link
- Image blocks: embed jersey mockup or campaign creative inline
- Preview mode: render with real data before sending
- Rewrite AI email generation prompt to be more concise, pitch-focused, include CTA link
**Effort:** 6h  
**Files:** New: `supabase/migrations/0022_email_templates.sql`, `frontend/app/emails/templates/`, `frontend/lib/email/`

---

### F-04 — Sponsor Landing Page Full Redesign (FR-04 + James)
**What James asked:** Mockups on landing look terrible; use actual team logo.  
**Audit says:** Admin sidebar exposed; no CTA.  
**Implementation plan:**
- Strip admin layout from `/proposals/{id}/view` — standalone public layout, zero nav/sidebar
- Hero section: Coritiba FC official logo + sponsor logo side by side + headline
- Sponsorship asset blocks: photo, description, value for each inventory item
- Campaign section: creative previews (Jersey mockup + campaign images), properly sized
- Jersey mockup on landing: improve sizing, remove black background, show cleanly on white/green
- CTA buttons: "Tenho Interesse" (opens form/WhatsApp), "Agendar Reunião" (Calendly link), "Ver Todos os Pacotes"
- Lead capture form (name + email + phone)
- Downloadable PDF option
- Testimonials / club stats (attendance, broadcast reach, social followers)
**Effort:** 6h  
**Files:** `frontend/app/proposals/[id]/view/page.tsx`, `frontend/components/proposals/proposal-landing-page.tsx`

---

### F-05 — Automated Company Data Enrichment (FR-06 + James)
**What James asked:** "Scrape company logo, social media presence, advertisements/posts on social media, sponsorships."  
**Implementation plan:**
- On company creation or manual trigger "Enrich Now":
  1. **Logo scrape** — Clearbit Logo API or scrape from website `<link rel="icon">` / Apify
  2. **Social presence** — Instagram followers/last post, Facebook page, X/Twitter handle, YouTube channel (Apify scraper)
  3. **Active ads** — Facebook Ads Library API; Google Ad Transparency (Apify or SerpAPI)
  4. **Current sponsorships** — web search for "[company] patrocínio esporte" via SerpAPI + summarize with Bedrock
  5. **Sponsorship potential score** (1–10) — derived from budget signals, marketing team size, ad spend
  6. **Industry auto-label** — use Apollo industry field or Bedrock classify from website content
- Store all fields on `companies` table (new columns via migration 0023)
- Show enrichment status chip: last enriched date + data completeness score
**Effort:** 8h  
**Files:** New columns in `supabase/migrations/0023_company_enrichment_fields.sql`, `frontend/lib/intelligence/`, `frontend/app/companies/[id]/page.tsx`

---

### F-06 — Tinder-Style Approval UI (FR-05 + James "approve emails per company")
**What James asked:** Approve emails for each company individually before send.  
**Implementation plan:**
- Replace bulk-approve flat list with card-by-card review flow
- One item at a time, full card: shows proposal title, company, preview of email/image/proposal
- Actions: ✅ Approve (green) / ❌ Reject (red) / ✏️ Edit (yellow, opens inline editor)
- Progress bar: X / Total reviewed
- Separate queues: campaigns, emails, proposals
- Also used in bulk proposal flow (approve each company's email before sending)
**Effort:** 5h  
**Files:** `frontend/app/proposals/bulk-approve/`, `frontend/components/approvals/`

---

### F-07 — Weekly Newsletter by Industry Segment (FR-07 + James)
**What James asked:** "Create a module to create a weekly newsletter to warm up audiences. Customizable by industry, company size, proposal type. Add events, campaigns, KPIs. Summarize positive sentiment articles about the club. Report on campaigns and reach, stadium attendance. Photos of activations. Mentions/tracking integration."  
**Implementation plan:**
- New `newsletters` table: `id, title, week_of, status (draft|scheduled|sent), segments[], content_blocks[]`
- Newsletter builder UI at `/newsletters`: block-based editor
  - Content blocks: Club news (auto-populated from positive-sentiment Bedrock news summary), Match results, Stadium attendance, Campaign reach stats, Activation photos, Sponsor spotlight, KPIs
  - Segment selector: by industry, company size, proposal type (barter / commercial / lei incentivo)
  - Distribution list per segment (linked to contacts/companies)
- Auto-populate block: "Latest Coritiba News" — web search via SerpAPI → filter positive sentiment → summarize with Bedrock
- Scheduled sending: pick date/time, send via Gmail API
- Basic open/click metrics (via link tracking pixel)
- Mention tracking: basic Google Alerts-style or SerpAPI monitoring for "Coritiba" + sponsor mentions
**Effort:** 10h  
**Files:** New module: `supabase/migrations/0024_newsletters.sql`, `frontend/app/newsletters/`, `frontend/lib/newsletter/`

---

### F-08 — Video Generation Demo on Landing Page (James request)
**What James asked:** "Would be awesome to implement a demo of that in the landing page. Of the players celebrating and logo being visible. And maybe adding logo reveal."  
**Implementation plan:**
- Research API options: Replicate (video models — e.g. Wan, CogVideoX), Runway Gen-3, or Kling AI
- Generate a short demo clip (5–10 seconds): Coritiba jersey / players celebrating, sponsor logo appears as an overlay or reveal
- Embed on the platform landing/homepage and optionally on sponsor proposal `/view` page
- Logo reveal: compositing logo onto generated video frame using Sharp/FFMPEG overlay
- "Upload logo" option: if logo can't be scraped, show upload button before generating mockup or video
**Effort:** 6h (investigation + API integration)  
**Notes:** No LoRA retrain needed per logo; Coritiba visual identity trained once, logo overlaid dynamically at generation time. Each new sponsor = API cost only, no retraining.  
**Files:** New: `frontend/app/api/media/jersey-video/route.ts`, `frontend/lib/media/video-composite.ts`

---

### F-09 — Save Contacts from Hunter/Apollo (FR-08 + James "need to be able to add contacts found")
Already captured as P0-06 (BUG-11). Also needed:
- Button visible from company list row: "Save contact" inline
- Contact list page at `/contacts` with search, filter by company, role, source
- Export to CSV

---

### F-10 — Add Competitors to Company Database (FR-09)
Already captured as P1-03 (BUG-12). Also:
- After adding competitor, option to immediately run the outreach agent for that competitor
- "Competitor of {company}" visible badge in `/companies` list

---

### F-11 — Gmail Token Renewal (URGENT operational issue)
**Audit says:** Gmail OAuth token expired **22 May 2026** — emails may be silently failing.  
**Fix:**
- Go to Settings → Sender Configuration → Reconnect Gmail **immediately**
- Add token expiry check and warning banner in UI (notify admin when token < 7 days from expiry)
- Add token refresh logic (store refresh_token, auto-renew before expiry)
**Effort:** 1h (reconnect) + 2h (expiry warning)  
**Files:** `frontend/app/settings/page.tsx`, `frontend/lib/gmail/client.ts`, `frontend/app/api/auth/gmail/`

---

## 📋 COMPLETE PRIORITY MATRIX

| Priority | ID | Task | Est. Effort | Blocks |
|----------|----|------|-------------|--------|
| 🚨 P0 | P0-01 | Edit button → wrong route fix | 30 min | BUG-01 |
| 🚨 P0 | P0-02 | Bulk campaigns EN/PT fix + company search | 4h | BUG-03, FR-01 |
| 🚨 P0 | P0-03 | Generate Creatives prompt modal + stuck jobs | 5h | BUG-08 |
| 🚨 P0 | P0-04 | [Nome] placeholder + team sender DB | 3h | BUG-09, FR-02 |
| 🚨 P0 | P0-05 | Email CTA + proposal link + images | 3h | BUG-10, FR-03 |
| 🚨 P0 | P0-06 | Save contacts from Hunter/Apollo | 3h | BUG-11, FR-08 |
| 🚨 P0 | P0-07 | Bulk approve image management | 5h | BUG-IMAGES |
| 🚨 P0 | P0-08 | Landing page: no sidebar + CTA + mockup quality | 4h | BUG-15, FR-04 |
| 🔴 P1 | P1-01 | Approvals page fix + filter | 5h | BUG-04 |
| 🔴 P1 | P1-02 | Pipedrive CRM sync fix | 4h | BUG-06 |
| 🔴 P1 | P1-03 | Competitors → Add to DB | 3h | BUG-12 |
| 🔴 P1 | P1-04 | Campaign company selector search | 1h | BUG-14 |
| 🟡 P2 | P2-01 | Industry inline edit + auto-label | 3h | BUG-13 |
| 🟢 F | F-01 | Bulk proposals: personalized per-company + per-contact emails | 8h | James + FR-01 |
| 🟢 F | F-02 | Team sender profile DB + UI | 4h | James + FR-02 |
| 🟢 F | F-03 | Email/proposal templates + placeholders | 6h | James + FR-03 |
| 🟢 F | F-04 | Sponsor landing page full redesign | 6h | James + FR-04 |
| 🟢 F | F-05 | Company enrichment: logo, social, ads, sponsorships | 8h | James + FR-06 |
| 🟢 F | F-06 | Tinder-style approval UI | 5h | James + FR-05 |
| 🟢 F | F-07 | Weekly newsletter module | 10h | James + FR-07 |
| 🟢 F | F-08 | Video generation demo (jersey/player + logo reveal) | 6h | James |
| 🔧 OPS | F-11 | Gmail token renewal + expiry warning | 3h | Operational |

**Total estimated work: ~107 hours across P0→Feature**  
**Realistic 2-June sprint target: all P0 bugs + P1-03/04 (quick wins) = ~30h = 2 solid dev days**

---

## 🗄️ Database Migrations Needed

| Migration | Tables / Columns | Needed for |
|-----------|-----------------|-----------|
| `0021_team_sender_profiles.sql` | `team_members` (name, title, email, phone, linkedin_url, avatar_url, html_signature) | P0-04, F-02 |
| `0022_email_templates.sql` | `email_templates` (name, type, subject_template, body_html_template, placeholders) | F-03 |
| `0023_company_enrichment_fields.sql` | `companies` new cols: `logo_url`, `social_presence`, `ad_signals`, `sponsorships_data`, `sponsorship_score` | F-05 |
| `0024_newsletters.sql` | `newsletters`, `newsletter_segments`, `newsletter_sends` | F-07 |
| `contacts` table | May need columns: `source` (hunter/apollo), `enriched_at`, `linkedin_url` | P0-06 |

---

## 🔗 Key Existing Files (relevant for today's work)

| File | What it does |
|------|-------------|
| `frontend/app/campaigns/bulk/page.tsx` | Bulk campaigns form (has EN/PT bug) |
| `frontend/app/api/campaigns/bulk/route.ts` | Bulk API — query by industry |
| `frontend/app/proposals/[id]/page.tsx` | Proposal detail — has wrong Edit button |
| `frontend/app/proposals/[id]/view/page.tsx` | Sponsor landing — has sidebar |
| `frontend/components/proposals/proposal-landing-page.tsx` | Landing component |
| `frontend/components/proposals/campaign-image-generator.tsx` | Fires creatives without prompt |
| `frontend/app/companies/[id]/page.tsx` | Company detail — contacts/competitors tabs |
| `frontend/app/api/contacts/route.ts` | Contacts API (may be empty) |
| `frontend/lib/agents/tools.ts` | Email generation AI prompt |
| `frontend/lib/gmail/client.ts` | Gmail send — token expired |
| `frontend/app/settings/page.tsx` | Gmail token reconnect UI |
| `frontend/app/proposals/bulk-approve/` | Bulk approve — no thumbnails |
| `frontend/lib/intelligence/apollo.ts` | Apollo enrichment client |
| `frontend/app/media-generation/image-generation-manager.tsx` | Image management page |

---

## ⏳ What James Is Sending Soon

| Item | Impact |
|------|--------|
| Brand assets (emails, images) | Required for company logo DB + email templates |
| Apollo API key (after purchase) | Enables full people search |
| Kit photos (shorts, socks, back) | Unlocks remaining jersey placements + LoRA retrain |

---

## 🚫 Blocked / Needs Clarification

| Item | Status |
|------|--------|
| **Mentions/tracking integration** (James: "is there any integration") | Needs James approval on budget — options: Mention.com ($29/mo), Google Alerts (free), Brand24 ($99/mo) |
| **Video generation API** | Need to evaluate Replicate vs Runway vs Kling — cost per video ~$0.05–$2.50 depending on length/quality |
| **Bilingual admin (FR-10)** | Low priority per audit; skip unless James confirms |
| **Merge to main** | Still pending James sign-off on dev branch |

---

## 📝 Notes for Implementation

1. **Start with P0-01 (Edit button)** — 30 min, fixes embarrassing bug immediately.
2. **P0-02 (Bulk EN/PT)** is the gate for all of F-01 (bulk personalized emails). Fix this first.
3. **P0-08 (Landing sidebar + mockup quality)** is what James sees when sharing with sponsors. High visibility.
4. **F-11 (Gmail token)** — reconnect immediately before writing any new email code, or tests will silently fail.
5. **F-02 (Team sender DB) and P0-04 (placeholder injection)** should be built together — same table, same injection layer.
6. **F-03 (Email templates)** should be built on top of F-02 sender profiles.
7. **Newsletter (F-07)** is a large standalone module — do not start until P0 bugs are resolved.
8. **Video (F-08)** is exploratory — start with a spike/proof of concept, don't block other work on it.

---

## Git / Branch Status

```
Branch: feature/agents-sprint
Remote: origin/feature/agents-sprint (pushed)

Last commits (1 June):
  3932d42  fix: Portuguese labels for proposal images
  7b9fc07  Overhaul proposal visuals, landing, bulk approval
  83db561  Fix jersey mockups — official composite, crest fixed
```

---

## References

| Doc | Purpose |
|-----|---------|
| `1st_June.md` | 1 June sprint — jersey mockup, landing redesign, bulk approve |
| `29th_May.md` | 29 May — outreach agent, Apollo, PM2 24/7 |
| `28th_May.md` | 28 May — original sprint plan |
| `Coritiba_Platform_Issues_Report_EN.pdf` | Independent audit: 15 bugs + 10 feature requests |
| `INTERN_TEST_PLAN.md` | Intern E2E tests (needs full update after today) |
| `ecosystem.config.cjs` | PM2 production config |
