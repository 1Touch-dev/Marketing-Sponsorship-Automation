# Here is everything consolidated from all conversations today:

**Fixes (things that are broken)**

1. Competitor discovery not saving between sessions — fix persistence so every discovery run saves permanently to the database and never loses prior research

2. Images not visible inside the proposal detail page at approval step 4 — you need to see and review generated images before approving them, currently they only show in the media section separately

3. Images not rendering on the proposal landing page — fix the linkage so completed images attached to a proposal automatically appear on that proposal's page

**New features to build**

4. Hunter + Anymail Finder integration for email discovery — domain to emails, decision maker lookup, ZeroBounce verification before sending

5. Bulk company add with table view verification — industry competitors discovered in bulk, land in a staging table showing company details, found emails, suggested inventory, estimated package value, checklist to approve or adjust each one before proposals are generated

6. Campaign editing as a table view — checklist style with costs, inventory items, prices, ability to swap or adjust before generating a proposal

7. Proposal and landing page CMS — full inline editing on every text block after generation

8. Landing page UI update — each of the 3 campaign strategies gets its own dedicated section, not grouped into one block

9. Execution brief on each campaign — AI generates estimated time, resources, and cost to execute each campaign idea, tagged to campaigns and inventory, shown in the internal PDF version only, not on the public landing page

10. Placid integration for jersey and LED board mockups — template-based image generation using real Coritiba FC photos with sponsor logo overlay, accurate every time

11. Replicate LoRA model training — train on Coritiba jersey and stadium assets so AI-generated campaign creatives reflect the real visual style

12. Image generation for marketing campaigns inside the proposal — not just placement mockups but campaign creative visuals

**Integrations**

13. Pipedrive activation — wire auto-sync to company creation and proposal approval once API key is added

14. Landing page Coritiba rebrand — use club colours, logo, and visual identity throughout

**Role-based users** — scoping this properly before building, confirm if you want to start on this today or after the above

---

That is 14 items. What do you want to prioritise first?

---

## 📅 Progress Update — 21 May 2026

### ✅ Completed Today

#### Fixes
| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Competitor discovery not saving between sessions | ✅ Done | `router.refresh()` after every run; "✓ Saved to database" banner; data persisted in `full_intelligence` JSONB |
| 2 | Images not visible at approval step 4 | ✅ Done | "🖼️ Generated Images" card added to proposal detail sidebar with inline thumbnails |
| 3 | Images not rendering on landing page | ✅ Done | Completed image jobs linked to proposal appear in "Imagens Geradas" section on `/view` landing page |

#### New Features
| # | Item | Status | Notes |
|---|------|--------|-------|
| 6 | Campaign inventory table view | ✅ Done | "💰 Pacote de Inventário" on every campaign detail page — 17 catalog items, qty/price editable, total auto-calculated, saved to DB |
| 7 | Proposal & landing page CMS inline editing | ✅ Done | "Editar Proposta" mode on `/view` — 7 fields editable in-place, saved instantly via PATCH API, persists on reload |
| 8 | Landing page UI — 3 strategy cards | ✅ Done | Each strategy gets its own stacked card with accent bar, numbered badge, activations checklist, audience, reach, differentiator |
| 9 | Execution brief per campaign | ✅ Done (+ bug fixed) | AI generates time/cost/resources per strategy; "Interno" badge; not on public page. Schema validation bug fixed (array limits raised to 30) |
| 12 | Campaign creative image generation | ✅ Done | "🎨 Imagens de Campanha" card in proposal sidebar; DALL-E generates 1 image per strategy variant; images appear on landing page |
| 14 | Landing page Coritiba rebrand | ✅ Done | Dark green hero, vertical stripe pattern, Coritiba FC logo, consistent green palette throughout |

#### Integrations
| # | Item | Status | Notes |
|---|------|--------|-------|
| 13 | Pipedrive full integration | ✅ Done | Live sync on company create + proposal approve/reject/revise; org + deal upsert; pipeline & stage mapping; Pipedrive IDs stored in JSONB fallback pending DB migration |

#### Infrastructure
| Item | Status | Notes |
|------|--------|-------|
| PM2 persistence (app + ngrok) | ✅ Done | Both processes survive server restarts via PM2 + systemd |
| All changes committed & pushed | ✅ Done | Branch: `feature/apify-commercial-intelligence` |
| End-to-end browser testing of all 6 new features | ✅ Done | Tested live at `https://eligibly-facing-unloved.ngrok-free.dev` |

---

### 🔲 Still To Do

| # | Item | Priority | What's needed to start |
|---|------|----------|------------------------|
| 4 | **Hunter + Anymail Finder email discovery** | 🔴 High | Hunter.io API key + Anymail Finder API key + ZeroBounce API key from James |
| 5 | **Bulk company add with staging table** | 🔴 High | Depends on #4 (emails needed); also needs UX design sign-off |
| 10 | **Placid integration — jersey/LED mockups** | 🟡 Medium | Placid API key; Coritiba FC photo assets uploaded to Placid as templates |
| 11 | **Replicate LoRA model training** | 🟠 Low (big effort) | Coritiba jersey + stadium image dataset; Replicate account + credits; significant dev time |
| **Role-based users** | 🔴 High (per James) | Decision on: who approves proposals, who can send, DB schema for roles; confirm scope before building |
| **Supabase DB migration for Pipedrive columns** | 🔴 Blocking | Manual SQL to run in Supabase Dashboard SQL Editor (provided separately); unblocks proper Pipedrive ID storage |

---

### 📋 What Each Remaining Item Needs

#### #4 — Hunter + Anymail Finder Email Discovery
- **Hunter.io API key** — from hunter.io dashboard → API
- **Anymail Finder API key** — from anymailfinder.com dashboard
- **ZeroBounce API key** — from zerobounce.net dashboard
- Dev work: build `/api/email-discovery` endpoint; add "Find Emails" button on company detail page; show results in a table with verification status; bulk mode for multiple companies

#### #5 — Bulk Company Add with Staging Table
- Needs #4 complete first (so emails can be shown per company)
- Dev work: staging table UI where competitor-discovered companies queue up with: name, industry, website, found emails, suggested inventory, estimated package value, approve/skip checkboxes; bulk proposal generation from approved rows

#### #10 — Placid Integration
- **Placid API key** — from placid.app dashboard
- **Template setup** — upload Coritiba FC jersey photo + LED board photo to Placid, create templates with logo/text layer slots
- Dev work: `/api/placid/mockup` endpoint; "Generate Mockup" button on proposal; pass sponsor logo URL + company name to Placid; display returned image

#### #11 — Replicate LoRA Training
- **Replicate account** with billing enabled
- **Image dataset** — 15–30 high-quality Coritiba FC jersey + stadium photos (no player faces if licensing is a concern)
- Dev work: training pipeline; model version storage; updated image generation prompt to reference trained model
- Estimated effort: 3–5 days dev + training time

#### Role-Based Users
- **Decision needed from James**: which roles (e.g. Admin, Reviewer, Sales Rep), what each can do
- Dev work: Supabase `user_roles` table; RLS policies per role; UI gate on Approve/Reject/Send buttons; invite flow
- Estimated effort: 2–3 days

#### Supabase DB Migration (Pipedrive columns)
- **Action required now**: run the following SQL in Supabase Dashboard → SQL Editor:
```sql
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS pipedrive_org_id bigint,
  ADD COLUMN IF NOT EXISTS pipedrive_synced_at timestamptz;

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS pipedrive_deal_id bigint,
  ADD COLUMN IF NOT EXISTS pipedrive_pipeline_id bigint,
  ADD COLUMN IF NOT EXISTS pipedrive_synced_at timestamptz;
```
- Once run, Pipedrive IDs will be stored in proper columns instead of the JSONB fallback

---

### 🗝️ API Keys Still Required (collect from James / vendors)

| Key | Service | Where to get it | Used for |
|-----|---------|-----------------|---------|
| `HUNTER_API_KEY` | Hunter.io | hunter.io → Settings → API | Email discovery by domain |
| `ANYMAIL_FINDER_API_KEY` | Anymail Finder | anymailfinder.com → API | Decision-maker email lookup |
| `ZEROBOUNCE_API_KEY` | ZeroBounce | zerobounce.net → API | Email verification before sending |
| `PLACID_API_KEY` | Placid | placid.app → Settings → API | Jersey/LED board mockup generation |
| `REPLICATE_API_KEY` | Replicate | replicate.com → Account → API | LoRA model training & inference |