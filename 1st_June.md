# Coritiba FC Platform — Sprint Report (1 June 2026)

**Date:** 1 June 2026 | **By:** Abhishek  
**Active branch:** `feature/agents-sprint`  
**Platform URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Login:** `patrocinios@coritiba.com.br` / `admin@1Touch`

**Server:** AWS EC2 — app runs 24/7 via PM2 + systemd

---

## Executive Summary

1 June focused on **James's visual and landing feedback**: official jersey mockups (fixed crest, sponsor on opposite chest), proposal graphics workflow (generate → select → link to campaigns/inventory), landing page redesign (no AI prompt cards, grouped campaign/inventory images, sponsor hero), **bulk image approval** UI, and **live browser E2E** verification. Three commits pushed today; migration `0020` applied in Supabase.

---

## ✅ Done Today (1 June)

### 1. Official jersey mockup (James WhatsApp fix)

| Requirement | Implementation |
|-------------|----------------|
| Club crest never changes | Real kit photo base; crest baked in, not composited |
| Sponsor on opposite chest | Composite overlay on wearer's right chest (viewer left) |
| Placement choice | Chest main, above name, sleeves; shorts/socks/back **Em breve** |

**Key files:**
| File | Purpose |
|------|---------|
| `frontend/lib/media/jersey-composite.ts` | Sharp-based overlay on official kit |
| `frontend/lib/media/jersey-placements.ts` | Zone coordinates + PT labels |
| `frontend/app/api/media/jersey-mockup/route.ts` | POST — composite + save to `image_generation_jobs` |
| `frontend/public/mockups/coritiba-jersey-base.jpg` | Official front kit asset |
| `frontend/components/proposals/replicate-jersey-generator.tsx` | "Mockup oficial" vs "Cenas criativas (IA)" + placement radios |

**Commit:** `83db561` — *Fix jersey mockups: official composite with fixed crest and sponsor on opposite chest.*

---

### 2. Proposal visuals, landing story, bulk approval (James landing overhaul)

| Requirement | Implementation |
|-------------|----------------|
| Remove "Conceitos Visuais" / prompt cards | `VisualMockupGrid` removed from landing |
| Campaign + inventory images on landing | `ProposalLandingVisuals` — grouped sections |
| Graphics on detail / edit / CMS view | `ProposalGraphicsPanel`, `ProposalImageManager`, `JerseyPlacementPreview` |
| Link images to strategy + inventory | DB columns + PATCH `update_metadata` |
| Bulk approve images | `/proposals/bulk-approve` + sidebar link + `bulk_approve` API |
| KPI blocks less generic | `frontend/lib/proposals/kpi-templates.ts` |
| TV viewers on match cards | Third row on "Próximas Partidas" (telespectadores TV) |

**Database — migration `0020`:**
```sql
-- image_generation_jobs: strategy_variant_id, strategy_label,
-- placement_zone, inventory_label, display_label
```
Applied manually in Supabase SQL editor (confirmed working). Also registered in `frontend/app/api/internal/apply-sql/route.ts` as `"0020"`.

**Key files:**
| File | Purpose |
|------|---------|
| `supabase/migrations/0020_image_job_proposal_links.sql` | Migration source |
| `frontend/lib/proposals/proposal-images.ts` | Parse, group, inventory options |
| `frontend/lib/proposals/fetch-proposal-images.ts` | Server fetch for landing |
| `frontend/components/proposals/proposal-landing-visuals.tsx` | Public landing image sections |
| `frontend/app/proposals/bulk-approve/` | Bulk approve page + client |
| `frontend/app/api/image-generation/route.ts` | `update_metadata`, `bulk_approve`, list filters |

**Commit:** `7b9fc07` — *Overhaul proposal visuals, landing story, and bulk approval workflow.*

---

### 3. Portuguese image labels + E2E polish

| Fix | Detail |
|-----|--------|
| Landing captions | `resolveProposalImageLabel()` — e.g. "Campanha criativa", "Camisa — Peito — Patrocinador principal" |
| Jersey label priority | Placement zone wins over stray `strategy_label` on jersey jobs |
| New mockups | API saves `labelPt` on insert |

**Commit:** `3932d42` — *fix: Portuguese labels for proposal images on landing and bulk approve.*

---

### 4. Live E2E verification (Cursor browser)

Tested on **Aché** proposal `1d53f8f8-0cc7-4b3b-a6fb-6f37d9550014`:

| Flow | Result |
|------|--------|
| Login + dashboard | ✅ Bulk Approve in sidebar |
| Proposal detail | ✅ Mockup oficial, placement preview, image manager, inline landing |
| **Gerar mockup oficial** | ✅ New job saved; Abrir/Download; crest-intact caption |
| Landing view `/view` | ✅ Campanhas propostas + Inventário; no Conceitos Visuais |
| Bulk Approve page | ✅ Pending jobs list + proposals in review |
| Build + PM2 restart | ✅ Production build passes; app restarted |

**Note:** Strategy combobox shows only "Não vinculado" on Aché — `strategy_variants` is null in DB for that proposal (expected until strategies are generated/saved).

---

## ✅ Done Earlier This Sprint (still on branch)

| Item | Status | See |
|------|--------|-----|
| Outreach agent — dual approval + personalized proposals | ✅ | `29th_May.md` |
| Apollo.io + Hunter enrichment | ✅ | `29th_May.md` |
| PM2 24/7 + ngrok pinned domain | ✅ | `29th_May.md` |
| Jersey placement UI (chest + sleeves live; shorts/socks/back disabled) | ✅ partial | This file + `28th_May.md` |

---

## ⏳ Yet To Do

### High priority (James / demo)

| # | Task | Owner | Blocker / notes |
|---|------|-------|-----------------|
| J1 | **Full graphics workflow** — view image → pick placement on edit + CMS view (James spec) | Dev | Placement preview exists on detail; extend parity to all surfaces |
| J2 | **Landing storytelling reorder** — deck flow less "AI designed"; stronger narrative | Dev | Partial (sections grouped); full reorder pending |
| J3 | **Bulk personalized proposals** — one package per group, per-company text + shared inventory | Dev | Bulk campaigns exist; bulk *text* approval not built |
| J4 | **Populate `strategy_variants`** on proposals (or derive from execution brief) | Dev | Empty strategy dropdown when column null |
| — | Merge `feature/agents-sprint` → `main` | Dev | James sign-off |
| P3 | Intern full E2E — `INTERN_TEST_PLAN.md` | Intern | Not started post–1 June changes |

### Medium priority

| # | Task | Notes |
|---|------|-------|
| P2b | Shorts / socks / back placements | UI shows "Em breve"; needs kit photos + LoRA retrain |
| — | Placid integration | James graphics workflow backlog |
| — | Backfill `display_label` on old `campaign_creative` jobs | Optional SQL or regenerate |
| — | Bulk approve: show thumbnails for jobs with URLs only | Many rows show "Sem img" when generation failed / no `output_urls` |
| — | `INTERN_TEST_PLAN.md` update for new flows (graphics, bulk-approve, official mockup) | After James review |

### Low priority

| # | Task |
|---|------|
| — | News/articles on public landing |
| — | Asana from execution brief |
| — | `E2E_INTERN_TEST_RESULTS.md` refresh |
| — | Apollo Basic (~$49/mo) if James wants people search API |

---

## Blocked — Waiting on James

| Item | What's needed | Impact |
|------|---------------|--------|
| **Kit photos** | Shorts, socks, back template, extra sleeve angles | Unlock disabled placements + LoRA retrain |
| **Agent + visuals sign-off** | Review Aché (or similar) landing + mockup on ngrok | Before merge to `main` |
| **Apollo paid tier** | Confirm ~$49/mo Basic | API people search |
| **Placid** | Confirm if/when to integrate | External creative templates |

---

## Platform Health (1 June 2026)

| Component | Status |
|-----------|--------|
| `sponsorship-platform` (PM2) | ✅ Restarted after build |
| `ngrok-tunnel` (PM2) | ✅ Fixed `--url=` flag; `ecosystem.config.cjs` + `scripts/pm2-production-setup.sh` |
| Boot on EC2 reboot | ✅ `pm2-ubuntu.service` enabled; old `nextjs`/`ngrok` systemd units **disabled** (avoid conflicts) |
| Public URL | ✅ `https://eligibly-facing-unloved.ngrok-free.dev` — survives Cursor/laptop closed |

**Test proposal:** Aché Laboratórios — `1d53f8f8-0cc7-4b3b-a6fb-6f37d9550014`

---

## Git / Branch Status

```
Branch: feature/agents-sprint
Remote: origin/feature/agents-sprint (pushed)

1 June commits:
  3932d42  fix: Portuguese labels for proposal images
  7b9fc07  Overhaul proposal visuals, landing, bulk approval
  83db561  Fix jersey mockups — official composite, crest fixed

Prior (29 May):
  2972097  Document 29 May sprint
  afdaa5d  Personalized proposals + dual approval
  6c935f9  Apollo.io integration
```

---

## How to Test (James / Intern)

1. Open https://eligibly-facing-unloved.ngrok-free.dev (or localhost) and log in
2. **Proposals** → Aché (or any proposal with brand assets)
3. **Visuais da proposta** → choose placement → **Gerar mockup oficial** → confirm preview + image manager
4. **Landing Page ↗** → verify **Campanhas propostas** / **Onde sua marca aparece** (no prompt cards)
5. **Bulk Approve** (sidebar) → review pending images / draft proposals from bulk campaigns
6. Optional: **Próximas Partidas** → third line on match cards (TV telespectadores)

---

## References

| Doc | Purpose |
|-----|---------|
| `29th_May.md` | 29 May — agent, Apollo, ops |
| `28th_May.md` | 28 May — sprint plan + P2 jersey backlog |
| `AGENTS_SPRINT_IMPL.md` | Agent architecture |
| `INTERN_TEST_PLAN.md` | Intern E2E (needs update for 1 June UI) |
| `README.md` | Setup and env vars |

---

## Ops Runbook

```bash
# On AWS server (after code changes)
cd ~/Market_Sponsorship_Automation/frontend && npm run build
cd .. && npm run pm2:setup    # or: pm2 restart all && pm2 save

npm run pm2:status
curl -s https://eligibly-facing-unloved.ngrok-free.dev/api/health
```

Ngrok reserved URL: `--url=https://eligibly-facing-unloved.ngrok-free.dev` (see `ecosystem.config.cjs`)
