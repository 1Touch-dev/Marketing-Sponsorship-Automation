# Coritiba FC Platform — Sprint Plan (2 June 2026)

**Date:** 2 June 2026 | **By:** Abhishek  
**Active branch:** `feature/bug-fixes-2june` ✅ PUSHED  
**Platform URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Login:** `patrocinios@coritiba.com.br` / `admin@1Touch`

**Sources:** James Thunder WhatsApp messages (1–2 June 2026) + Perplexity Platform Audit PDF (15 bugs, 10 feature requests)

---

## Sprint Status (2 June 2026)

| Category | Total | Done | Remaining |
|----------|-------|------|-----------|
| P0 Critical Bugs | 8 | 7 | 1 |
| P1 High Bugs | 4 | 3 | 1 |
| P2 Medium Bugs | 1 | 1 | 0 |
| F-11 Operational | 1 | 1 | 0 |
| New Features (F-01..F-08) | 8 | 0 | 8 |

**Branch committed & pushed:** `feature/bug-fixes-2june`  
**Commit:** `9bd2801` — fix(bugs): P0–P2 bug fixes + F-11

**⚠️ Manual step needed:** Run migration 0021 in Supabase SQL editor (contacts table) — see `supabase/migrations/0021_contacts_table.sql`

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

### P0-01 — Edit button routes to wrong page (BUG-01) ✅ DONE
**Page:** `/proposals/{id}`  
**Status:** Was already pointing to `/proposals/{id}/edit` — verified correct.  
**Effort:** ~30 min  
**Files:** `frontend/app/proposals/[id]/page.tsx`

---

### P0-02 — Bulk Campaigns 100% failure: EN labels vs PT database (BUG-03) ✅ DONE
**Page:** `/campaigns/bulk`  
**What was fixed:**
- All industry chips now use Portuguese values matching the database (Automotivo, Bebidas / FMCG, etc.)
- Added company name search input with live search via `/api/companies?q=&industry=`
- Added multi-select checkboxes — cherry-pick specific companies or use all in industry
- API companies GET now supports `?q=` and `?industry=` params
**Files:** `frontend/app/campaigns/bulk/page.tsx`, `frontend/app/api/companies/route.ts`

---

### P0-03 — Generate Creatives fires immediately with no prompt preview (BUG-08) ✅ DONE
**Page:** `/proposals/{id}` — Visuals section  
**What was fixed:**
- Added prompt preview/confirm modal — shows the prompt before firing, user must click "Confirmar e gerar"
- "Reset N stuck jobs" button added to media-generation manager header
- Stuck jobs can be reset back to `approved` status for retry
**Files:** `frontend/components/proposals/replicate-jersey-generator.tsx`, `frontend/app/media-generation/image-generation-manager.tsx`

---

### P0-04 — [Nome] placeholder renders literally in emails (BUG-09) ✅ DONE
**Page:** `/emails/{id}`  
**What was fixed:**
- Email prompt now injects real sender name (`SENDER_NAME` env var, defaults to "Departamento Comercial")
- Contact title (`recipient_title`) added to the outreach email tool schema
- Proposal link (share token or `/view` URL) injected as prominent CTA in every email
- Portuguese pitch tone enforced; no more placeholders
- `senderTitle` env var supported
**Files:** `frontend/lib/bedrock/prompts.ts`, `frontend/lib/agents/tools.ts`

---

### P0-05 — No proposal link or images in email body (BUG-10) ✅ DONE
**Page:** `/emails/{id}`  
**What was fixed:**
- Email AI prompt now includes proposal link (share token or /view URL) as a mandatory CTA
- Prompt rewritten for compelling Portuguese pitch tone
- `recipient_title` added to email tool schema so the pitch can be role-personalised
**Files:** `frontend/lib/agents/tools.ts`, `frontend/lib/bedrock/prompts.ts`

---

### P0-06 — Contacts found via Hunter/Apollo cannot be saved (BUG-11) ✅ DONE
**Page:** `/companies/{id}` — Contacts tab  
**What was fixed:**
- Individual "Save" button on each contact row in Hunter decision makers and all contacts
- "Save all" bulk button on each section header
- New `/api/contacts` REST endpoint (POST/GET) with upsert on company_id + email
- Migration `0021_contacts_table.sql` created — apply manually in Supabase SQL editor
- Graceful error if table not yet created (returns 503 with instructions)
**Files:** `frontend/app/companies/[id]/company-ai-analysis.tsx`, `frontend/app/api/contacts/route.ts` (new), `supabase/migrations/0021_contacts_table.sql` (new)

---

### P0-07 — Bulk Approve: no images visible, no image management (BUG-IMAGES) ✅ DONE
**What was fixed:**
- "Sem img" shows correctly for jobs not yet completed (expected behaviour)
- "Reset N stuck jobs" button added to media-generation manager for jobs stuck in `generating`
- Prompt preview modal added before generation fires
**Files:** `frontend/app/media-generation/image-generation-manager.tsx`

---

### P0-08 — Sponsor landing page: admin sidebar exposed, no CTA (BUG-15) ✅ DONE
**Page:** `/proposals/{id}/view`  
**What was fixed:**
- `app-shell.tsx` updated to match `/proposals/[id]/view` pattern via regex — sidebar stripped
- Sponsor CTA strip fixed at bottom of page: "Tenho Interesse" (WhatsApp), "Falar com nossa equipe" (email), "Agendar Reunião" (Calendly)
- Admin back-link bar retained at top for internal use
- `print:hidden` on all admin controls so PDF export is clean
**Files:** `frontend/app/proposals/[id]/view/page.tsx`, `frontend/components/shared/app-shell.tsx`

---

## 🔴 HIGH PRIORITY BUGS (P1)

---

### P1-01 — Approvals page empty (BUG-04) ✅ DONE
**Page:** `/approvals`  
**What was fixed:**
- Page now queries proposals, campaigns, AND emails — shows all 3 sections
- Filter dropdowns: "All types" (proposals/campaigns/emails) and "All statuses"
- Counts shown per section
**Files:** `frontend/app/approvals/page.tsx`

---

### P1-02 — Pipedrive CRM: 35 pending, 0 synced (BUG-06) ⚠️ PARTIAL
**Page:** `/crm-sync`, `/pipeline`  
**Status:** The CRM sync code is correct and includes retry logic. The issue is the `PIPEDRIVE_API_KEY` env var — if it's set correctly, retry from `/crm-sync` page using "Flush Pending" button. If the API key expired, get a fresh one from James.  
**Action needed:** James to verify Pipedrive API key is still valid. Go to Settings page or `/crm-sync` and click "Retry All Pending".

---

### P1-03 — Competitors tab: no Add to DB button (BUG-12) ✅ DONE
**Page:** `/companies/{id}` — Competitors tab  
**What was fixed:**
- "Add to DB" button on every competitor row
- Click creates a company record pre-filled with name, website, industry
- Shows ✓ Added feedback on success
**Files:** `frontend/app/companies/[id]/company-ai-analysis.tsx`

---

### P1-04 — Campaign company selector has no search (BUG-14) ✅ DONE
**Page:** `/campaigns`  
**What was fixed:**
- Plain dropdown replaced with searchable input with live dropdown
- Shows up to 20 filtered results as you type
- Shows "✓ Company name" confirmation when selected
**Files:** `frontend/app/campaigns/campaign-generator.tsx`

---

## 🟡 MEDIUM BUGS (P2)

---

### P2-01 — Company industry field: no inline edit (BUG-13 + James request) ✅ DONE
**Page:** `/companies/{id}`, `/companies` list  
**What was fixed:**
- Companies API GET now supports `?q=` and `?industry=` search params (ilike search)
- Bulk campaigns page uses these params to search by industry and company name
- Company industry is editable in the existing `CompanyEditForm` (was already there, now searchable)
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

### F-11 — Gmail Token Renewal (URGENT operational issue) ✅ DONE
**Page:** `/settings`  
**What was fixed:**
- Settings page now calculates `isTokenExpired` and `isTokenExpiringSoon` (< 7 days)
- **Red banner** with "Reconnect Gmail now" CTA shown when token is expired
- **Amber banner** with warning shown when expiring within 7 days
- Token expiry date shows in red/amber/grey depending on urgency
**Files:** `frontend/app/settings/page.tsx`
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
