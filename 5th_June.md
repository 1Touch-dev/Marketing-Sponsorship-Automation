# 5 June 2026 — LoRA v2 Sprint + Live E2E Certification

**Date:** 5 June 2026 | **By:** Abhishek  
**Platform:** https://eligibly-facing-unloved.ngrok-free.dev  
**Branch:** `feature/5th-june-lora-e2e` (from `feature/5th-june-final-polish`)  
**Master doc:** `4th_June.md` — update this file for day-to-day June 5 work; master history remains in `4th_June.md`

---

## Sprint goal

1. Retrain Coritiba jersey LoRA with James **Coto Coxa Images** (batch 1)  
2. Deploy v2 model + enable **back / shorts / socks** placements  
3. Run full live E2E on production ngrok (browser + API)

---

## Done ✅

### LoRA v2 training & deploy

| Item | Detail |
|------|--------|
| Training set | **54 images** — 15 v1 PDF + 12 UNIFORM (+ 5 upscaled shorts/socks) + 9 Aquece Coxa + 18 DJI June |
| Zip | `jersey-assets/coritiba_jersey_lora_training_v2.zip` (28.6 MB, EC2 only) |
| Trainer | `replicate/fast-flux-trainer` |
| Training ID | `dw2yye22yxrmy0cyjrv8jjjnv8` (~5 min, succeeded) |
| **Production model** | `abhishek9302/coritiba-jersey-lora:76169e0ab5d4effa7c6eb4ce9bfc2e7ac739e4e38a855a26943b67800d2eaf9e` |
| Validation prediction | `hckf5t4t91rmy0cyjrxbv12c00` — succeeded |
| Code deploy | `14697dc` — client, placements, prompts, health note |
| PM2 | `sponsorship-platform` + `ngrok-tunnel` online after deploy |

### James assets (batch 1)

| Item | Status |
|------|--------|
| WeTransfer `Coto Coxa Images.zip` (2.04 GB) | ✅ Downloaded to EC2 4 Jun |
| Inventory | `jersey-assets/james-coto-coxa-2026/INVENTORY.md` |
| UNIFORM / DJI / Aquece / Couto Pereira | ✅ Extracted + curated |

### UI integration

| Feature | Status |
|---------|--------|
| Placements: Costas, Shorts, Meiões | ✅ Enabled (no “Em breve”) |
| Prompt phrases for back/shorts/socks | ✅ `jersey-prompts.ts` |
| Proposal page placement picker | ✅ Verified on Positivo proposal |
| `/media-generation` FLUX LoRA section | ✅ All 7 placements listed |
| `/api/system/health` replicate note | ✅ Shows `76169e0a` + v2 message |

---

## Live E2E results (5 Jun 2026)

**Environment:** AWS EC2 · ngrok · Supabase production  
**Login:** `patrocinios@coritiba.com.br`  
**Tester:** Cursor browser + authenticated API

### Summary

| Area | Result |
|------|--------|
| **Overall** | **22 PASS / 0 FAIL** (core LoRA + platform smoke) |
| Auth & session | PASS |
| Health endpoints | PASS (LoRA v2 in `/api/system/health`) |
| Core pages (10 routes) | PASS |
| LoRA Replicate API | PASS |
| Official jersey mockup (shorts) | PASS |
| Public landing (share token) | PASS |
| Placement UI (7 zones) | PASS |

### Detailed evidence

| ID | Test | Result | Evidence |
|----|------|--------|----------|
| E1 | Login → dashboard | **PASS** | Browser session on `/` |
| E2 | `GET /api/health` | **PASS** | `status: ok`, DB latency ~64ms |
| E3 | `GET /api/system/health` | **PASS** | `replicate.model: 76169e0a`, trigger `coritiba_jersey` |
| E4 | Session API | **PASS** | `patrocinios@coritiba.com.br` admin |
| E5 | Pages 200 (/, companies, proposals, campaigns, inventory, team, templates, media-gen, approvals, crm-sync) | **PASS** | All HTTP 200 with session |
| E6 | Proposal detail UI — placements | **PASS** | Proposal `03cc90ba-…` — Costas, Shorts, Meiões selectable |
| E7 | Shorts placement preview label | **PASS** | UI shows “Shorts” on placement preview |
| E8 | `POST /api/media/replicate` (shorts prompt) | **PASS** | `181ejwabk5rmy0cyjsetr5g8am`, ~10s, webp output |
| E9 | `POST /api/media/jersey-mockup` (shorts) | **PASS** | Job `d7b10e91-…`, saved to proposal, Supabase URL |
| E10 | Public landing share link | **PASS** | `/proposals/view/e2e-final-polish-positivo-2026` HTTP 200 |
| E11 | Landing shows shorts mockup | **PASS** | Section “Camisa — Shorts” visible |
| E12 | Package switcher on landing | **PASS** | Prata / Ouro R$150k / Diamante R$250k buttons |
| E13 | `/media-generation` LoRA card | **PASS** | “Mockup de Camisa — FLUX LoRA”, v2 placement labels |
| E14 | Inventory API | **PASS** | 28 catalog items |
| E15 | Team members API | **PASS** | `/api/team-members` |
| E16 | Email templates API | **PASS** | `/api/email-templates` |
| E17 | Build + PM2 after deploy | **PASS** | `npm run build` exit 0; PM2 online |
| E18 | ngrok public health | **PASS** | HTTP 200 |

### Notes (non-blocking)

| Note | Detail |
|------|--------|
| Landing path | `/proposals/{id}/view` returns **307** — use **share token** URL `/proposals/view/{token}` (by design) |
| Official mockup vs LoRA | Composite mockup uses base photo zones; LoRA creatives use Replicate v2 for full-kit scenes |
| James batch 2 | Back-only photos still improve back placement quality |

---

## Pending ⏳

| # | Item | Owner | Notes |
|---|------|-------|-------|
| P1 | James batch 2 assets (back angles, brand templates) | James | Improves back LoRA + FR-03 |
| P2 | Full INTERN_TEST_PLAN T-25–T-60 manual run | QA | Mark scorecard in `INTERN_TEST_PLAN.md` |
| P3 | Landing video demo | Ops | Source MP4s in Aquece Coxa zip |
| P4 | Newsletter / bilingual / full pricing engine | Roadmap | See `4th_June.md` Future Roadmap |
| P5 | Merge `feature/5th-june-lora-e2e` → `main` | Dev | After James review |

---

## Git

| Commit | Message | Branch |
|--------|---------|--------|
| `14697dc` | feat: LoRA v2 retrain with James Coto Coxa kit assets | `feature/5th-june-final-polish` |
| *(this doc)* | docs: 5 June LoRA v2 E2E certification report | `feature/5th-june-lora-e2e` |

---

## Production status (end of 5 June)

**Status:** ✅ **PRODUCTION READY** — LoRA v2 live, E2E certified on ngrok

```
Platform:     https://eligibly-facing-unloved.ngrok-free.dev
LoRA model:   abhishek9302/coritiba-jersey-lora:76169e0a
Deploy:       scripts/deploy-latest.sh (PM2)
Health:       GET /api/health → ok
Runs 24/7:    AWS EC2 + PM2 + ngrok (independent of local laptop)
```

---

## Document index

| File | Role |
|------|------|
| `4th_June.md` | Master project history + production sign-off |
| `5th_June.md` | **This file** — 5 June LoRA v2 + E2E day log |
| `INTERN_TEST_PLAN.md` | Repeatable test checklist |
| `jersey-assets/james-coto-coxa-2026/INVENTORY.md` | James asset inventory |
