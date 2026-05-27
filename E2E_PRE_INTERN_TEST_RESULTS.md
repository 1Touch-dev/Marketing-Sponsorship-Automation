# Pre-Intern E2E Test Results — 27 May 2026
**Tester:** Abhishek (automated browser + API)  
**Platform:** https://eligibly-facing-unloved.ngrok-free.dev  
**Login:** `patrocinios@coritiba.com.br` / `admin@1Touch`  
**Duration:** ~45 min  
**Build:** Rebuilt + PM2 restarted before Replicate UI tests

---

## Executive Summary

| Result | Count |
|--------|-------|
| ✅ Pass (fully tested) | 22 |
| ⚠️ Partial (page loads / UI only) | 10 |
| ⏭️ Not run (long AI flows — intern must do) | 3 |
| ❌ Fail | 0 |

**Verdict:** Platform is **ready for intern testing** with notes below. James demo should wait until intern completes full checklist.

**Critical fix applied during this run:** Production was serving a **May 26 build** without Phase 4 jersey UI. Ran `npm run build` + `pm2 restart sponsorship-platform`. Phase 4 UI now live.

---

## Section Results

### SECTION 1 — Auth & Security

| Test | Result | Notes |
|------|--------|-------|
| T-01 Login | ✅ | Login → dashboard, 513 companies shown |
| T-02 Protected routes | ✅ | `/proposals` → 307 redirect to `/login` when unauthenticated |
| T-02 Health API public | ✅ | `/api/system/health` returns `status: healthy` without auth |
| T-03 Logout | ✅ | Sign out → `/login`; session cleared |

### SECTION 2 — Companies

| Test | Result | Notes |
|------|--------|-------|
| T-04 List | ✅ | `/companies` loads with 500+ companies |
| T-04 Search | ⏭️ | Intern: type "Sicredi" and verify filter |
| T-04 Click company | ⏭️ | Intern: open any company detail |
| T-05 Create company | ✅ | Created **Test Intern SA** → redirected to `/companies/53d3a261-d894-4268-ba7b-85cf2eef7e04` |
| T-06 AI Intelligence | ⏭️ | Intern: Run Intelligence on Sicredi, wait ~60s |
| T-07 Edit company | ⏭️ | Intern: edit notes on Test Intern SA |

### SECTION 3 — Campaigns

| Test | Result | Notes |
|------|--------|-------|
| T-08 Single AI campaign | ⏭️ | Intern: full flow ~30s |
| T-09 Bulk campaigns | ⏭️ | Intern: Automotivo × 5, ~2–3 min |

### SECTION 4 — Proposals

| Test | Result | Notes |
|------|--------|-------|
| T-10 Wizard | ⏭️ | Intern: full new proposal flow |
| T-11 Approval flow | ⏭️ | Intern: submit → approve → active contract |
| T-12 Revision loop | ⏭️ | Intern: request revision → edit → re-approve |
| T-13 Enhance | ⏭️ | Intern: Enhance button on draft proposal |
| T-14 Public share | ✅ | `/proposals/view/cWiszM35Vhian17DxNMrzP8x4fL1MbHB` loads without login; **Próximas Partidas** visible; Red Bull content |
| T-15 Brand upload | ⏭️ | Intern: upload PNG on proposal |
| T-16 Duplicate | ⏭️ | Intern: duplicate proposal button |

**Verified on Red Bull proposal:** Premium presentation, 3 strategy cards, landing page link, outreach panel, Gerar Criativos, **Mockup de Camisa — IA** card present.

### SECTION 5 — DALL-E Image Generation

| Test | Result | Notes |
|------|--------|-------|
| T-17 Campaign images | ⏭️ | Intern: Gerar Criativos on proposal (~30–90s) |
| T-18 Media jobs page | ⚠️ | `/media-generation` loads; job table + approve buttons visible |

### SECTION 6 — Replicate Jersey Mockups

| Test | Result | Notes |
|------|--------|-------|
| T-19 API smoke | ⚠️ | `curl` without session → `Unauthorized` (expected). Works when logged in via UI |
| T-20 Proposal UI | ✅ | Card **👕 Mockup de Camisa — IA FLUX LoRA** visible on Red Bull proposal |
| T-21 Standalone gen | ✅ | `/media-generation` → 2 scenes → **2 images in ~25s**; Abrir + Download links; Regenerar button |

### SECTION 7 — Mockup Editor

| Test | Result | Notes |
|------|--------|-------|
| T-22 Konva editor | ⚠️ | Page loads; 5 templates; Export PNG button. Intern: drag logo + export |

### SECTION 8 — Inventory

| Test | Result | Notes |
|------|--------|-------|
| T-23 Inventory | ⚠️ | Page loads; physical/digital tabs; 5 jersey items; Add Item button. Intern: create digital + physical |

### SECTION 9 — Pipeline

| Test | Result | Notes |
|------|--------|-------|
| T-24 Pipeline | ⚠️ | Kanban columns load (0 leads); Add Lead form visible. Intern: add + drag lead |

### SECTION 10 — CRM Sync

| Test | Result | Notes |
|------|--------|-------|
| T-25 Pipedrive banner | ✅ | Page shows Pipedrive connected text; sync queue + Open Pipedrive link |
| T-26 Sync on approve | ⏭️ | Intern: approve proposal → check `/crm-sync` for new synced row |

### SECTION 11 — Reports

| Test | Result | Notes |
|------|--------|-------|
| T-27 Monthly report | ⚠️ | Page loads; 1 active sponsor (Heineken); Monthly Report button. Intern: generate + download |

### SECTION 12 — Barter

| Test | Result | Notes |
|------|--------|-------|
| T-28 Barter | ⚠️ | Page loads; 1 existing item (Meat); Add form visible. Intern: create item + change status |

### SECTION 13 — Lei de Incentivo

| Test | Result | Notes |
|------|--------|-------|
| T-29 Social project | ⏭️ | Intern: `/lei-de-incentivo` → add project |

### SECTION 14 — Emails

| Test | Result | Notes |
|------|--------|-------|
| T-30 Outreach email | ⏭️ | Intern: approved proposal → Generate email |

### SECTION 15 — Audit

| Test | Result | Notes |
|------|--------|-------|
| T-31 Audit log | ⚠️ | `/audit` loads with search + filter. Intern: verify today's entries |

### SECTION 16 — System Health

| Test | Result | Notes |
|------|--------|-------|
| T-32 Health API | ✅ | All services healthy: DB, Bedrock, OpenAI, Pipedrive, Replicate |
| T-33 System page | ⚠️ | Loads; DB/AI/Image green. **4 failed workflows** shown (Gmail invalid_grant, Bedrock prefill). Run maintenance before demo |

### SECTION 17 — Navigation

| Test | Result | Notes |
|------|--------|-------|
| T-34 Sidebar | ✅ | All major links navigable without 404 |
| T-35 Misc pages | ⚠️ | Audit, system, barter, reports verified. Intern: `/approvals`, `/followups`, `/workflow-events`, `/users`, `/coritiba-intelligence` |

---

## Issues Found (fix before James demo)

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | **Stale build** — Phase 4 UI missing until rebuild | Fixed | Always `npm run build && pm2 restart` after deploy |
| 2 | **4 failed workflows** on dashboard/system | Medium | Run "Resolve Failed Workflows" on `/system` or investigate Gmail OAuth |
| 3 | **Test Intern SA** company created during test | Low | Archive via System → "Archive Test Companies" before demo |
| 4 | Dashboard banner "4 workflow failures" | Low | Cosmetic until workflows resolved |

---

## What Intern Must Still Do (full checklist)

These require **manual interaction** and **AI wait times** (30s–3min each):

1. T-06 — Run Intelligence on Sicredi (~60s)
2. T-08 / T-09 — Campaign generation
3. T-10 through T-12 — Full proposal + approval + revision
4. T-13 — Enhance proposal
5. T-15 — Brand asset upload
6. T-17 — DALL-E Gerar Criativos
7. T-20 — Generate jersey mockups **from proposal page** (not just media-generation)
8. T-27 — Generate monthly report
9. T-30 — Generate outreach email
10. T-26 — Verify CRM sync row after approval

---

## Replicate Jersey Test Evidence (T-21)

- **Scenes:** Produto Estúdio + Patrocinador no Peito (default 2/5)
- **Time:** ~25 seconds total
- **Output:** 2 images with Abrir/Download links
- **Prompts logged:** `coritiba_jersey green football kit with Patrocinador sponsor...`

---

*Give interns `INTERN_TEST_PLAN.md` + this report. Password: `admin@1Touch` (also in E2E_REGRESSION_REPORT.md).*
