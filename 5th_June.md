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

### James / Coritiba assets (batch 1 — images)

| Item | Status |
|------|--------|
| WeTransfer `Coto Coxa Images.zip` (2.04 GB) | ✅ Downloaded to EC2 4 Jun |
| Inventory | `jersey-assets/james-coto-coxa-2026/INVENTORY.md` |
| UNIFORM / DJI / Aquece / Couto Pereira | ✅ Extracted + curated |

### James / Coritiba assets (batch 2a — commercial email copy)

| Field | Detail |
|-------|--------|
| **File** | `Commercial Email Templates.docx` (~1.6 MB, repo root) |
| **From** | Lucca Bradfield `<lucca.bradfield@coritiba.com.br>` |
| **To** | James Deller (forwarded to Abhishek) |
| **Date** | 3 June 2026, 1:06 PM |
| **Subject** | Commercial e-mails |
| **Context** | Coritiba commercial team’s **usual e-mail approaches**; copy is adapted per company. Lucca offered to forward **actual e-mails sent with proposals** if needed. |

**What the document contains (6 outreach patterns, PT-BR prose):**

| # | Template type | Purpose |
|---|---------------|---------|
| 1 | **Warm up** | Short intro — schedule a first partnership conversation |
| 2 | **Pitch padrão** | Standard pitch — league position, ~35k sócios, attendance rank placeholders |
| 3 | **Pitch relacional** | Relationship-led — brand affinity with Coritiba / Brazilian football |
| 4 | **Follow pitch relacional** | Follow-up if prior email was lost — activation windows (jogos em casa, datas) |
| 5 | **Pitch para permutas** | Barter/swap — infrastructure, Couto Pereira, Coxa Day / Run / Aquece Coxa |
| 6 | **Formalização de proposta** | Send formal proposal attachment after alignment |

**Placeholders in the Word doc (manual brackets):** `(Nome)`, `(Empresa)`, `(Posição… Brasileiro)`, `(Colocação… público)`, `(Ideia)`. Sender voice: **Murilo** (patrocínios e parcerias, Coritiba SAF).

**What it is NOT:** HTML layout, logos, embedded images, or visual brand assets — **copy/script only**.

#### Does this close any pending work?

| Pending item | Impact |
|--------------|--------|
| **P1 — back kit photos** | ❌ **No** — unrelated to email copy |
| **P1 — “brand templates” (FR-03)** | ⚠️ **Partial** — satisfies **email wording / outreach scripts**, not visual brand library |
| **Platform email templates** (`/settings/email-templates`, migration 0025) | ⚠️ **Content gap only** — **engine already shipped**; doc is source material to **seed** 6 templates |
| **Team senders (Murilo)** | ✅ **Aligns** — doc assumes Murilo as sender; maps to existing `team_members` / default sender |
| **Pipedrive outreach flow** | ✅ **Aligns** — these are the human-written emails reps send after platform draft + approve |
| **P2–P5** (intern tests, video, roadmap, merge) | ❌ **No change** |

**Conclusion:** This document **does not complete FR-03 by itself** — it provides **approved commercial copy**. It can seed the platform’s `email_templates`, but it does not include visual brand assets (logos/HTML creatives).

**Optional follow-up from James/Lucca:** actual sent e-mails with proposals attached (mentioned in the email) — useful as real-world examples for template B or attachment wording.

#### Update (5 Jun 2026)

✅ Imported the 6 scripts into the platform as editable `email_templates` named `Lucca — ...`. Set **Lucca — Warm up** as the default template and created an approved draft email (E21–E22) to confirm the end-to-end workflow.

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
| Lucca commercial templates seeded + Murilo sender | PASS |

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
| E19 | Seed 6 Lucca templates into DB | **PASS** | 6 new templates (`Lucca — ...`) in `email_templates` |
| E20 | Set Murilo as default sender | **PASS** | `murilo.siqueira@coritiba.com.br` → `default_sender=true` |
| E21 | Generate email from default Lucca template | **PASS** | Email `9f8f59fe-…` (approved), template `Lucca — Warm up` |
| E22 | Approve email → Pipedrive log | **PASS** | Activity **#1598** created |
| E23 | Replicate LoRA v2 socks creative (API) | **PASS** | prediction `7ryvamrj9nrmr0cyjt0r2vknhc` |
| E24 | Official jersey composite socks (API) | **PASS** | placement `socks`, success true |

### Notes (non-blocking)

| Note | Detail |
|------|--------|
| Landing path | `/proposals/{id}/view` returns **307** — use **share token** URL `/proposals/view/{token}` (by design) |
| Official mockup vs LoRA | Composite mockup uses base photo zones; LoRA creatives use Replicate v2 for full-kit scenes |
| James batch 2 | Back-only photos still improve back placement quality |
| Email templates doc | Use **share-token** landing links in `{{proposal_link}}` when importing Lucca copy |
| API schema | `/api/emails/generate` expects `recipient` (not `recipient_email`) |

---

## Pending ⏳

| # | Item | Owner | Notes |
|---|------|-------|-------|
| P1 | James **kit photos** (back angles) | James | LoRA back placement quality |
| P1b | **Commercial Email Templates.docx** → platform seed | ✅ Done | Seeded 6 templates into `email_templates` (5 Jun) |
| P1c | Actual sent e-mails + proposals (optional) | Lucca / James | Offered in same thread — reference examples |
| P2 | Full INTERN_TEST_PLAN T-25–T-60 manual run | QA | Mark scorecard in `INTERN_TEST_PLAN.md` |
| P3 | Landing video demo | Ops | Source MP4s in Aquece Coxa zip |
| P4 | Newsletter / bilingual / full pricing engine | Roadmap | See `4th_June.md` Future Roadmap |
| P5 | Merge `feature/5th-june-lora-e2e` → `main` | Dev | After James review |
| P6 | FR-03 **visual** brand assets (logos, creative HTML) | James | **Not** covered by Word doc — still open |

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
| `jersey-assets/james-coto-coxa-2026/INVENTORY.md` | James image asset inventory |
| `Commercial Email Templates.docx` | Coritiba commercial email scripts (Lucca, 3 Jun 2026) |
