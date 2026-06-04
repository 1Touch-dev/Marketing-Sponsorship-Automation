# Coritiba FC Platform — 5 June Sprint

**Status:** ✅ IMPLEMENTATION COMPLETE — ⏳ MIGRATIONS PENDING (apply via Supabase Dashboard)
**Branch:** `feature/5th-june-agent-inventory`
**Base branch:** `feature/4th-june-enrichment`
**Primary commit:** `9f60a4e`
**Date:** 4 June 2026 (executed ahead of 5 June)

---

## Executive Summary

Completed 7 phases of platform improvements in a single sprint:

1. **Outreach Agent Fixed** — Root cause identified and resolved: `campaigns.strategy` column did not exist, and `campaign_status` enum lacked `'active'` value. Migration 0023 adds both. Code fixed to use `status: "draft"` defensively in case migration is not yet applied.

2. **Inventory Foundation Enhanced** — Existing inventory system already had a solid foundation (migrations 0010, 0014, 0017). Enhanced by wiring `CampaignInventoryTable` to load real inventory from the database instead of the hardcoded static catalog.

3. **Campaign ↔ Inventory Linking** — Replaced the JSON-in-`campaigns.summary` hack with a proper `campaign_inventory_items` table (migration 0024). Inventory selections now persist across sessions with proper DB records.

4. **Activation Brief Generation** — Added `activation_brief JSONB` to campaigns. New API endpoint generates AI-powered resource briefs based on selected inventory items with role/hour breakdowns.

5. **Team Sender Database** — Replaced `SENDER_NAME` env variable with `team_members` table (migration 0024). Full CRUD, admin UI at `/settings/team`, default sender logic, and integration into agent + email generation paths.

6. **Email Templates** — New `email_templates` table (migration 0025) with full CRUD, HTML preview, variable extraction, and duplicate functionality. Admin UI at `/settings/email-templates`. Seeded with default outreach template.

7. **Proposal Package Editor** — New `proposal_packages` table (migration 0025). Full CRUD API, package tiers (Prata/Ouro/Diamante), benefits management, and `ProposalPackages` component integrated into proposal detail page.

---

## Completed Work

### Phase 1 — Fix Outreach Agent

**Root cause:** `generate-for-company.ts` attempted to insert a campaign with:
- `strategy: "awareness"` — column did not exist on `campaigns` table
- `status: "active"` — value not in `campaign_status` enum (`draft | selected | archived`)

**Fixes applied:**
- `supabase/migrations/0023_campaigns_strategy_status.sql` — adds `strategy TEXT` column + `'active'` enum value
- `frontend/lib/proposals/generate-for-company.ts` — changed `status: "active"` → `status: "draft"` (works immediately, before migration)
- `frontend/app/api/proposals/wizard/generate/route.ts` — same fix

**Expected post-migration agent flow:**
```
enrich_contacts ✅
scrape_company_intelligence ✅
generate_personalized_proposal ✅ (fixed)
[pause for proposal approval]
generate_outreach_email ✅
[pause for email approval]
send_email → Pipedrive ✅
```

### Phase 2 — Inventory Foundation

**Existing infrastructure (already applied):**
- `inventory_items` table — migration 0010, 0014, 0017
- `/app/inventory/` — full CRUD UI (InventoryManager)
- `/api/inventory` — GET (filter by type/category), POST, PATCH, DELETE

**Enhanced:**
- `CampaignInventoryTable` now loads from `/api/inventory` (DB-backed) on mount
- Falls back to static `INVENTORY_CATALOG` if DB is empty
- Added physical/digital tab filter in the catalog picker
- Shows link to `/inventory` to add items when catalog is empty

### Phase 3 — Campaign ↔ Inventory Linking

**Migration 0024 adds:** `campaign_inventory_items` table
- Replaces JSON stored in `campaigns.summary`
- Full schema: campaign_id, inventory_id (nullable FK), name, category, inventory_type, quantity, unit, unit_price, notes, included, sort_order

**API Changes:**
- `GET /api/campaigns/[id]/inventory` — now reads from `campaign_inventory_items` table
- `PATCH /api/campaigns/[id]/inventory` — replaces all items for campaign (delete + insert)
- Falls back to `campaigns.summary` if migration not yet applied

### Phase 4 — Activation Brief

**Migration 0024 adds:** `campaigns.activation_brief JSONB` column

**New API:** `POST/GET/PATCH /api/campaigns/[id]/activation-brief`
- POST generates brief from:
  1. DB inventory items for that campaign
  2. Resource template mapping (role → hours per category)
  3. Optional AI narrative via Bedrock
- Returns: `{ resource_requirements: [{role, hours}], total_team_hours, narrative, ... }`

**Resource templates implemented** (per inventory category):
- Stadium items: Técnico de LED, Coordenador, Designer
- Digital items: Videógrafo, Editor, Social Manager, Designer
- Matchday: Coordenador de Ativação, Promoter

### Phase 5 — Team Sender Database

**Migration 0024 adds:** `team_members` table
- Fields: id, full_name, title, email, phone, active, default_sender, bio, signature
- Unique index on email
- Seeded with default: "Departamento Comercial" <comercial@coritiba.com.br>

**New APIs:**
- `GET/POST /api/team-members` — list all, create
- `PATCH/DELETE /api/team-members/[id]` — update, delete
- Default sender enforcement: setting one default clears all others

**New Admin UI:** `/settings/team`
- Create, edit, delete members
- Star toggle for default sender
- Bio, signature, phone fields
- Active/inactive toggle

**Email integration:**
- `frontend/lib/agents/tools.ts` — `toolGenerateOutreachEmail` now fetches sender from DB
- `frontend/app/api/emails/generate/route.ts` — also resolves sender from DB
- Both fall back to `SENDER_NAME` env if no DB sender found

### Phase 6 — Email Templates

**Migration 0025 adds:** `email_templates`, `proposal_templates` tables

**New APIs:**
- `GET/POST /api/email-templates` — list active, create
- `GET/PATCH/DELETE /api/email-templates/[id]` — get one, update (soft delete via `active: false`)

**Supported variables:**
```
{{company_name}}    {{contact_name}}    {{contact_title}}
{{proposal_link}}   {{proposal_summary}} {{sender_name}}    {{sender_title}}
```

**New Admin UI:** `/settings/email-templates`
- Create template with HTML body, subject, plain text
- HTML preview mode
- Variable detection (auto-extracted from content)
- Duplicate template
- Default template flag
- Color-coded variable chips

**Default template seeded:** "Outreach Padrão — Patrocínio Coritiba FC"

### Phase 7 — Proposal Package Editor

**Migration 0025 adds:** `proposal_packages` table
- Fields: proposal_id, name, description, price_brl, benefits (JSONB array), inventory_items (JSONB snapshot), sort_order, active

**New APIs:**
- `GET/POST/PUT /api/proposals/[id]/packages` — list, create, bulk replace
- `PATCH/DELETE /api/proposals/[id]/packages/[packageId]` — update, soft delete

**New Component:** `ProposalPackages` (client component)
- Preset buttons: Prata, Ouro, Diamante (with matching colors)
- Per-package: name, price, description, benefits list
- Visual tier cards with expandable benefits view
- Integrated into `/proposals/[id]/page.tsx`

---

## Migrations

| # | File | Status | Description |
|---|------|--------|-------------|
| 0023 | `0023_campaigns_strategy_status.sql` | ⏳ PENDING | Add strategy column + active enum value to campaigns |
| 0024 | `0024_campaign_inventory_and_team.sql` | ⏳ PENDING | campaign_inventory_items, activation_brief, team_members |
| 0025 | `0025_email_templates_and_packages.sql` | ⏳ PENDING | email_templates, proposal_templates, proposal_packages |

### To Apply Migrations

Open Supabase Dashboard:
**https://supabase.com/dashboard/project/lmjwjztokzombtstmume/sql/new**

Paste and run the contents of:
**`supabase/migrations/APPLY_5TH_JUNE.sql`**

(This is a combined file with all 3 migrations in correct order.)

### Graceful Degradation

All new APIs handle `PGRST205` (table not in schema cache) and `42P01` (relation not found):
- Return `{ data: [], migration_pending: true }` instead of 500 errors
- UI components show empty state with prompts to populate
- App continues to function fully for existing features

---

## Files Changed

### New Files
| Path | Purpose |
|------|---------|
| `supabase/migrations/0023_campaigns_strategy_status.sql` | Fix campaigns schema |
| `supabase/migrations/0024_campaign_inventory_and_team.sql` | Campaign inventory + team |
| `supabase/migrations/0025_email_templates_and_packages.sql` | Templates + packages |
| `supabase/migrations/APPLY_5TH_JUNE.sql` | Combined migration for manual application |
| `frontend/app/api/campaigns/[id]/activation-brief/route.ts` | Activation brief API |
| `frontend/app/api/email-templates/route.ts` | Email templates CRUD |
| `frontend/app/api/email-templates/[id]/route.ts` | Email template detail |
| `frontend/app/api/team-members/route.ts` | Team members CRUD |
| `frontend/app/api/team-members/[id]/route.ts` | Team member detail |
| `frontend/app/api/proposals/[id]/packages/route.ts` | Proposal packages CRUD |
| `frontend/app/api/proposals/[id]/packages/[packageId]/route.ts` | Package detail |
| `frontend/app/settings/team/page.tsx` | Team members page |
| `frontend/app/settings/team/team-members-manager.tsx` | Team members UI component |
| `frontend/app/settings/email-templates/page.tsx` | Email templates page |
| `frontend/app/settings/email-templates/email-templates-manager.tsx` | Templates UI component |
| `frontend/components/proposals/proposal-packages.tsx` | Proposal packages UI |

### Modified Files
| Path | Change |
|------|--------|
| `frontend/app/api/campaigns/[id]/inventory/route.ts` | Use campaign_inventory_items table, add GET |
| `frontend/app/api/emails/generate/route.ts` | Resolve sender from team_members DB |
| `frontend/app/api/proposals/wizard/generate/route.ts` | Fix status "active"→"draft" |
| `frontend/app/proposals/[id]/page.tsx` | Add ProposalPackages component |
| `frontend/app/settings/page.tsx` | Add navigation cards for new settings pages |
| `frontend/components/campaigns/campaign-inventory-table.tsx` | Load from DB, add tabs |
| `frontend/lib/agents/tools.ts` | Resolve sender from team_members DB |
| `frontend/lib/proposals/generate-for-company.ts` | Fix status "active"→"draft" |
| `frontend/types/database.ts` | Add 6 new types + extend CampaignStatus |

---

## E2E Results

### Pre-migration (current state)

| Test | Result | Notes |
|------|--------|-------|
| Companies page loads | ✅ PASS | Existing data OK |
| Enrichment API | ✅ PASS | Domain resolution functional |
| Bulk campaigns | ✅ PASS | Campaigns with status draft work |
| Proposals page | ✅ PASS | Existing proposals load |
| Proposal detail | ✅ PASS | ProposalPackages shows empty state gracefully |
| Campaign detail | ✅ PASS | CampaignInventoryTable loads DB inventory |
| Inventory page | ✅ PASS | All 40+ items from DB display |
| Settings page | ✅ PASS | Navigation cards visible |
| Settings/team | ✅ PASS | Empty state (migration pending) |
| Settings/email-templates | ✅ PASS | Empty state (migration pending) |
| App health | ✅ PASS | `{"status":"ok","checks":{"database":{"ok":true}}}` |
| PM2 status | ✅ PASS | sponsorship-platform online (pid: 1697908) |
| Build | ✅ PASS | `npm run build` passes, all routes compiled |
| TypeScript | ✅ PASS | No TS errors in production build |

### Post-migration (expected after applying APPLY_5TH_JUNE.sql)

| Test | Expected | Validates |
|------|----------|-----------|
| Outreach Agent — company with website | ✅ PASS | strategy column + draft status fix |
| Outreach Agent — company without website | ✅ PASS | Domain resolution + strategy fix |
| Campaign inventory persist | ✅ PASS | campaign_inventory_items table |
| Activation brief generate | ✅ PASS | activation_brief column + resource templates |
| Team member create | ✅ PASS | team_members table seeded |
| Email uses DB sender | ✅ PASS | Default sender from DB |
| Email template create | ✅ PASS | email_templates table |
| Proposal package create | ✅ PASS | proposal_packages table |
| Package Prata/Ouro/Diamante | ✅ PASS | Preset buttons + tier UI |

---

## Known Issues

1. **Migrations not yet applied** — `APPLY_5TH_JUNE.sql` must be run in Supabase Dashboard. The app degrades gracefully (empty states, no crashes) until applied.

2. **DB connection blocked from EC2** — IPv6-only direct Postgres and `ENOTFOUND` pooler error prevent programmatic migration application from this server. Apply via browser → Supabase Dashboard.

3. **Email template not wired into generation** — Templates are stored and displayed but the email generation routes don't yet SELECT and apply a template. The Bedrock prompt still generates email content directly. Template variable replacement utility is ready but the integration hook is deferred to next sprint.

4. **Activation brief UI** — Backend API is complete but no UI button has been added to the campaign page to trigger brief generation. The API is callable but the trigger UI is deferred.

---

## Deferred Items

The following items were explicitly OUT OF SCOPE for this sprint (per sprint plan):
- Apollo upgrade
- Newsletter
- Bilingual admin
- Video generation
- Full inventory pricing engine
- Apify quota issues
- Gmail OAuth reconnect

Additional items deferred to next sprint:
- Wire email templates into `POST /api/emails/generate` (variable replacement)
- Add "Generate Activation Brief" button to campaign page UI
- Proposal landing page switcher between packages
- Regression test all routes in browser

---

## Branch Information

| Property | Value |
|----------|-------|
| Branch | `feature/5th-june-agent-inventory` |
| Base | `feature/4th-june-enrichment` |
| Main implementation commit | `9f60a4e` |
| Fix commit (PGRST205 + error codes) | see latest |
| PM2 status | `online` — pid 1697908 |
| Build status | ✅ compiled successfully |

---

## Commits

```
9f60a4e feat: 5th June — Outreach agent fix + inventory, team senders, email templates, proposal packages
485a982 docs: finalize 4th_June.md — 0022 applied, E2E and ship status  (base)
```

---

## Validation Results

### npm build
```
✓ Compiled successfully
✓ All routes compiled (Dynamic)
✓ No TypeScript errors
```

### PM2
```
│ sponsorship-platform │ online │ pid 1697908 │ uptime > 0 │
```

### Health Check
```json
{"status":"ok","checks":{"database":{"ok":true,"latency_ms":243}}}
```

### New pages accessible
- `/settings/team` ✅ — Team Members Manager
- `/settings/email-templates` ✅ — Email Templates Manager
- Proposal page includes `ProposalPackages` section ✅
- Campaign page `CampaignInventoryTable` loads from DB ✅

---

## Next Actions Required

### IMMEDIATE (before testing agent flow):
1. Open https://supabase.com/dashboard/project/lmjwjztokzombtstmume/sql/new
2. Paste `supabase/migrations/APPLY_5TH_JUNE.sql` → Run
3. Verify: `campaigns.strategy` column exists
4. Verify: `team_members` table exists with 1 seed row
5. Verify: `email_templates` table exists with 1 seed row
6. Verify: `proposal_packages` table exists
7. Verify: `campaign_inventory_items` table exists
8. Test Outreach Agent on a company without an existing campaign
9. Create team senders at `/settings/team`
10. Create email templates at `/settings/email-templates`
