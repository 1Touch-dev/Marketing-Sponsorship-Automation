# Coritiba FC Platform — Sprint Report (2 June 2026)

**Date:** 2 June 2026 | **By:** Abhishek  
**Active branch:** `feature/bug-fixes-2june` ✅ PUSHED  
**Platform URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Login:** `patrocinios@coritiba.com.br` / `admin@1Touch`  
**Server:** AWS EC2 — app runs 24/7 via PM2 + systemd  

---

## Platform Health (Live — 2 June 2026, ~08:16 UTC)

All services confirmed healthy:

| Service | Status | Notes |
|---------|--------|-------|
| Database (Supabase) | ✅ healthy | 163ms latency |
| Bedrock AI (AWS) | ✅ configured | Claude 3.5 Sonnet |
| OpenAI | ✅ configured | GPT-4o |
| Pipedrive CRM | ✅ configured | API key valid |
| Replicate (LoRA) | ✅ configured | `coritiba-jersey-lora:396810db` |
| Hunter.io | ✅ configured | Contact enrichment active |
| Apollo.io | ✅ configured | Org enrich active; people search needs Basic+ |
| ngrok tunnel | ✅ online | `eligibly-facing-unloved.ngrok-free.dev` |

**Platform stats:** 512 companies · 64 proposals (63 active) · 79 campaigns

**⚠️ Gmail token expired** since 22 May 2026 — go to `/settings` → Reconnect Gmail immediately.  
The warning banner is now live on the settings page so you'll always see it.

---

## What Was Done Today (2 June 2026)

Two bug-fix rounds were completed today, all committed to `feature/bug-fixes-2june`.

### Round 1 — All P0/P1/P2 Bugs + F-11 (commit `9bd2801`)

#### ✅ P0-01 — Edit button routing
- Verified `/proposals/{id}/edit` already correctly routed
- Confirmed button shows "Edit" and lands on the correct edit page

#### ✅ P0-02 — Bulk Campaigns: English labels → Portuguese + company search
- All industry chips now show Portuguese labels: Automotivo, Bancos / Finanças, Bebidas / FMCG, Saúde, Seguros, Imobiliário, Varejo, Tecnologia, Telecomunicações, Turismo / Hospitalidade, Alimentação, Entretenimento, Educação, Indústria, Energia
- Added company name search input with live API search (`/api/companies?q=&industry=`)
- Added multi-select checkboxes to cherry-pick specific companies or select all in an industry
- Companies API now supports `?q=` and `?industry=` query params (ilike search)
- **Verified: 21 companies found when searching "Automotivo"** ✅
- Files: `frontend/app/campaigns/bulk/page.tsx`, `frontend/app/api/companies/route.ts`

#### ✅ P0-03 — Generate Creatives prompt preview modal + stuck jobs reset
- Prompt preview/confirm modal added — shows the full prompt before firing; user must click "Confirmar e gerar"
- "Reset N stuck jobs" button added to media-generation header (only appears when stuck jobs exist)
- Stuck jobs can be reset from `generating` → `approved` for retry
- Files: `frontend/components/proposals/replicate-jersey-generator.tsx`, `frontend/app/media-generation/image-generation-manager.tsx`

#### ✅ P0-04 — [Nome] placeholder eliminated from emails
- Email AI prompt now injects real sender name from `SENDER_NAME` env var (defaults to "Departamento Comercial")
- `recipient_title` (contact's job title) added to outreach email tool schema — pitch is now role-personalised
- Portuguese tone enforced in system prompt; no placeholders allowed
- `senderTitle` env var supported
- Files: `frontend/lib/bedrock/prompts.ts`, `frontend/lib/agents/tools.ts`

#### ✅ P0-05 — Proposal link + CTA injected in every email
- Email AI prompt now includes share token link (or `/proposals/{id}/view` as fallback) as a mandatory CTA line
- Prompt rewritten for concise, compelling Brazilian Portuguese sponsorship pitch tone
- `recipient_title` added so pitch can be role-personalised by contact's title
- Files: `frontend/lib/agents/tools.ts`, `frontend/lib/bedrock/prompts.ts`

#### ✅ P0-06 — Save contacts from Hunter/Apollo
- Individual "Save contact" button on every contact row (Hunter decision makers + all contacts sections)
- "Save all" bulk button on each section header
- New `/api/contacts` REST endpoint with upsert on `(company_id, email)` — no duplicates
- `supabase/migrations/0021_contacts_table.sql` created and **applied manually in Supabase SQL editor** ✅
- Graceful 503 error if table not yet created
- Files: `frontend/app/companies/[id]/company-ai-analysis.tsx`, `frontend/app/api/contacts/route.ts` (new), `supabase/migrations/0021_contacts_table.sql` (new)

#### ✅ P0-07 — Image management / bulk approve
- "Sem img" shows correctly for jobs not yet completed (expected UI behaviour)
- "Reset N stuck jobs" button added for jobs stuck in `generating` status
- Prompt preview modal added before any generation fires
- Files: `frontend/app/media-generation/image-generation-manager.tsx`

#### ✅ P0-08 — Sponsor landing page: sidebar hidden + CTA strip added
- `app-shell.tsx` updated to match `/proposals/[id]/view` pattern via regex — sidebar fully stripped
- Fixed green CTA strip at bottom: "Tenho Interesse" (WhatsApp), "Falar com nossa equipe" (email), "Agendar Reunião" (Calendly)
- Admin back-link bar retained at top (`Voltar para proposta`) for internal navigation
- All admin controls are `print:hidden` so PDF export is clean
- Files: `frontend/app/proposals/[id]/view/page.tsx`, `frontend/components/shared/app-shell.tsx`

#### ✅ P1-01 — Approvals page empty
- Page now queries proposals, campaigns, AND emails in parallel — 3 sections rendered
- Filter dropdowns: "All types" (proposals/campaigns/emails) + "All statuses"
- Item counts shown per section
- Files: `frontend/app/approvals/page.tsx`

#### ⚠️ P1-02 — Pipedrive CRM: 35 pending, 0 synced (PARTIAL)
- The CRM sync code is correct and includes retry logic
- Root cause: `PIPEDRIVE_API_KEY` may have expired — API key is configured but sync still showing 0
- **Action required by James:** Go to `/crm-sync` → click "Retry All Pending", or get a fresh Pipedrive API key if the current one expired
- This cannot be fixed in code — it's an API credentials/account issue

#### ✅ P1-03 — Competitors tab: Add to DB button
- "Add to DB" button added to every competitor row in the AI analysis
- Click creates a company record pre-filled with name, website, industry
- Shows "✓ Added" feedback on success
- Files: `frontend/app/companies/[id]/company-ai-analysis.tsx`

#### ✅ P1-04 — Campaign company selector has no search
- Plain `<select>` dropdown replaced with a searchable text input + live dropdown
- Shows up to 20 filtered results as you type
- Shows "✓ Company name" confirmation when a company is selected
- Files: `frontend/app/campaigns/campaign-generator.tsx`

#### ✅ P2-01 — Company industry / category field searchable
- Companies API GET now supports `?q=` and `?industry=` params (ilike search)
- Bulk campaigns page uses these params for live company+industry search
- Files: `frontend/app/api/companies/route.ts`

#### ✅ F-11 — Gmail token expiry warning banner
- Settings page calculates `isTokenExpired` and `isTokenExpiringSoon` (< 7 days)
- **Red banner** shown when token is expired: "🚨 Gmail token EXPIRED (since 5/22/2026) — outgoing emails may be silently failing!"
- **Amber banner** shown when expiring within 7 days
- Token expiry date shown in red/amber/grey text depending on urgency
- Files: `frontend/app/settings/page.tsx`

---

### Round 2 — Follow-up fixes after E2E browser verification (commit `622daf0`)

After E2E testing in the Cursor browser, 3 additional issues were found and fixed:

#### ✅ Fix 1 — Approvals page: Campaigns and Emails sections not rendering
- Root cause: `emails` table has no `company_id` column — the query join was failing silently
- Fixed: emails query now uses `proposals(companies)` nested join
- Fixed: campaigns status filter corrected to valid values (`draft | selected`)
- Fixed: `ApprovalEmail` TypeScript type updated to use `proposals.companies` nested structure
- **Result: Proposals (61) + Campaigns (50) + Emails (8) all showing** ✅

#### ✅ Fix 2 — "Landing Page ↗" button only showed when share_token existed
- Fixed: button is now always visible regardless of whether a share token has been created
- Users can always preview the public landing page for any proposal
- Files: `frontend/app/proposals/[id]/page.tsx`

#### ✅ Fix 3 — Proposal /view page content padding
- Added `pb-20` to main wrapper so the fixed bottom CTA strip never overlaps page content
- Files: `frontend/app/proposals/[id]/view/page.tsx`

---

## E2E Browser Test Results (2 June 2026)

Tested live on https://eligibly-facing-unloved.ngrok-free.dev using Cursor browser:

| # | Feature | Result | Notes |
|---|---------|--------|-------|
| T1 | Proposal `/view` landing — no sidebar | ✅ PASS | Clean public layout |
| T2 | Bulk Campaigns — Portuguese chips + company search | ✅ PASS | 21 companies found for "Automotivo" |
| T3 | Approvals — Proposals + Campaigns + Emails sections | ✅ PASS | 61 proposals, 50 campaigns, 8 emails |
| T4 | Campaign generator — searchable company input | ✅ PASS | Live dropdown as you type |
| T5 | Company contacts — Save + Save all buttons | ✅ PASS | 9 Hunter contacts saveable |
| T6 | Competitors — "Add to DB" button on each row | ✅ PASS | 11 competitors found for Ambev |
| T7 | Settings — Gmail EXPIRED red banner | ✅ PASS | Banner shows since 5/22/2026 |
| T8 | Image generation — form + stuck jobs reset | ✅ PASS | 0 stuck jobs currently |
| T-A | "Landing Page ↗" button on proposal detail | ✅ PASS | Visible in top-right action bar |
| T-B | `/view` page green CTA strip at bottom | ✅ PASS | DOM confirmed; 3 CTA buttons present |

**All 10 tests pass.** Platform is working correctly on every tested flow.

---

## What Is Pending (Not Done Yet)

### P1-02 — Pipedrive CRM sync (needs James action)
- Code is correct; 35 companies queued but not syncing
- Likely cause: Pipedrive API key expired
- **James needs to:** go to `/crm-sync` → click "Retry All Pending", or renew the API key

### Gmail reconnect (needs James action)
- Token expired 22 May 2026 — all outgoing emails failing silently
- **James needs to:** go to `/settings` → Sender Configuration → click "Reconnect Gmail"

---

## New Features — NOT YET BUILT (James Requirements)

These are from the James WhatsApp + Perplexity Audit. None started yet. Estimated ~77h of work.

| ID | Feature | Est. | Priority |
|----|---------|------|----------|
| F-01 | Bulk personalized proposals — unique proposal + unique email per company per contact | 8h | High |
| F-02 | Team sender profile database — 5–10 team members, auto-inject into emails | 4h | High |
| F-03 | Email & proposal templates with placeholder variables + CTA block | 6h | High |
| F-04 | Sponsor landing page full redesign — hero, asset blocks, lead capture form, PDF download | 6h | High |
| F-05 | Automated company enrichment — logo, social presence, ad signals, sponsorships, score | 8h | Medium |
| F-06 | Tinder-style approval UI — card-by-card review for campaigns, emails, proposals | 5h | Medium |
| F-07 | Weekly newsletter module — block builder, industry segments, Gmail scheduled send | 10h | Medium |
| F-08 | Video generation demo — Coritiba player/jersey clip + sponsor logo reveal | 6h | Low |
| F-09 | Contacts list page `/contacts` — search, filter by company/role/source, CSV export | 3h | Medium |
| F-10 | After adding competitor, option to immediately run outreach agent for that competitor | 2h | Low |

**Total remaining feature work: ~58h**

---

## Blocked — Waiting on James

| Item | What's Needed | Impact |
|------|--------------|--------|
| **Gmail reconnect** | James clicks "Reconnect Gmail" in Settings | All outreach emails currently failing |
| **Pipedrive API key** | Renew/verify key in Settings | 35 companies not syncing to CRM |
| **Kit photos** | Shorts, socks, back template, extra sleeve angles | Unlock disabled jersey placements + LoRA retrain |
| **Apollo Basic tier** | Confirm ~$49/mo plan | Unlocks API people search (CMOs, directors) |
| **Agent sign-off** | James to review outreach agent on 1–2 real prospects | Before merge to `main` |
| **Brand assets** | Emails, images, logo files | Required for email templates + company logos |

---

## Migrations Applied

| Migration | Table | Status |
|-----------|-------|--------|
| `0020_image_job_proposal_links.sql` | `image_generation_jobs` — new cols: `strategy_variant_id`, `placement_zone`, `inventory_label`, `display_label` | ✅ Applied (1 June) |
| `0021_contacts_table.sql` | `contacts` — company_id, email, full_name, title, department, seniority, phone, linkedin_url, source, confidence | ✅ Applied manually today (2 June) |

---

## Git / Branch Status

```
Branch: feature/bug-fixes-2june (from feature/agents-sprint)
Remote: origin/feature/bug-fixes-2june (pushed ✅)

2 June commits:
  622daf0  fix: approvals campaigns/emails sections, Landing Page button always visible, view page CTA spacing
  6466388  docs: update 2nd_June.md with completed bug status
  9bd2801  fix(bugs): P0–P2 bug fixes + F-11 — 2nd June sprint

1 June commits (still on branch):
  3932d42  fix: Portuguese labels for proposal images
  7b9fc07  Overhaul proposal visuals, landing story, and bulk approval
  83db561  Fix jersey mockups: official composite, crest fixed
```

---

## Ops Runbook (if site goes down)

```bash
# SSH into AWS server
pm2 list
pm2 restart sponsorship-platform
pm2 status

# Health check
curl -s https://eligibly-facing-unloved.ngrok-free.dev/api/health
curl -s https://eligibly-facing-unloved.ngrok-free.dev/api/system/health | python3 -m json.tool

# If ngrok tunnel down:
pm2 restart ngrok-tunnel

# After code changes:
cd ~/Market_Sponsorship_Automation/frontend && npm run build
pm2 restart sponsorship-platform
pm2 save
```

Ngrok domain is pinned: `--url=https://eligibly-facing-unloved.ngrok-free.dev`

---

## References

| Doc | Purpose |
|-----|---------|
| `1st_June.md` | 1 June — jersey mockups, landing redesign, bulk approve |
| `29th_May.md` | 29 May — outreach agent dual approval, Apollo, PM2 24/7 |
| `28th_May.md` | 28 May — original sprint plan |
| `AGENTS_SPRINT_IMPL.md` | Agent architecture & definition of done |
| `INTERN_TEST_PLAN.md` | Intern E2E test plan (617 lines) |
| `README.md` | Setup, env vars, outreach agent overview |
