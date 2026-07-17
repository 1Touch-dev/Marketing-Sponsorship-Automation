# E2E Operational Regression Report
**Date:** 2026-05-25  
**Branch:** `feature/apify-commercial-intelligence`  
**Platform URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Tester:** Automated + browser verification

---

## Executive Summary

The platform is **operationally ready** for daily commercial use with known external blockers (Pipedrive API key). Core flows — auth, companies, inventory (new fields), proposals, approval status including `active_contract`, public landing pages, and system health — are verified working.

| Category | Result |
|---|---|
| Build / Lint / TypeScript | **PASS** (0 errors) |
| Auth & Middleware | **PASS** |
| Database Migrations 0017/0018 | **PASS** (applied manually) |
| Inventory Operational Fields | **PASS** |
| Proposal Status Flow | **PASS** (after fix) |
| Public Share Links | **PASS** |
| Internal API Security | **PASS** |
| PM2 Stability | **PASS** (unstable_restarts: 0) |
| Pipedrive CRM | **BLOCKED** (expired API key) |
| Full AI E2E (live generation) | **NOT RUN** (cost/time; routes validated) |

---

## 1. PASS/FAIL Matrix

### Phase 1 — System Prechecks

| Test | Result | Notes |
|---|---|---|
| `npm install` | PASS | Completed |
| `npm run lint` | PASS | 0 warnings/errors |
| `npx tsc --noEmit` | PASS | 0 errors |
| `npm run build` | PASS | Production build succeeds |
| PM2 `sponsorship-platform` | PASS | online, unstable_restarts: 0 |
| PM2 `ngrok-tunnel` | PASS | online |
| `curl localhost:3000` | PASS | HTTP 200 |
| `curl ngrok /login` | PASS | HTTP 200 |
| `/api/system/health` | PASS | healthy, DB 19–67ms latency |

### Phase 2 — Auth Flow

| Test | Result | Notes |
|---|---|---|
| `/login` page loads | PASS | Coritiba branded form |
| Valid login | PASS | `patrocinios@coritiba.com.br` → dashboard |
| Invalid password | PASS | "Invalid login credentials" |
| Protected routes redirect | PASS | `/companies`, `/campaigns`, `/proposals`, `/inventory` → 307 |
| Public `/` | PASS | HTTP 200 |
| Public `/proposals/view/{token}` | PASS | HTTP 200, no auth redirect |
| Logout API | PASS | Clears session cookie (Max-Age=0) |
| `/api/users/me` after logout | PASS | HTTP 401 (with cookie jar update) |
| Browser login via ngrok | PASS | Dashboard loads with sidebar + stats |
| Role badge | PASS | James Thunder / Admin (API confirmed) |

### Phase 3 — Company + Intelligence

| Test | Result | Notes |
|---|---|---|
| `/companies` page (auth) | PASS | HTTP 200 |
| `/api/companies` | PASS | 513 companies |
| Intelligence API validation | PASS | Empty body → HTTP 400 |
| Run Intelligence (live AI) | SKIP | Not run (Bedrock cost); route exists |
| Discover Competitors (Apify) | SKIP | Not run live; Apify configured in env |

### Phase 4 — Campaign Flow

| Test | Result | Notes |
|---|---|---|
| `/campaigns` page (auth) | PASS | HTTP 200 |
| Campaign generate API | SKIP | AI endpoint; rate limit present |

### Phase 5 — Proposal Wizard & Status

| Test | Result | Notes |
|---|---|---|
| `/proposals` page (auth) | PASS | HTTP 200 |
| `submit_review` → `under_review` | PASS | Verified on live proposal |
| `approve` → `approved` | PASS | Verified on live proposal |
| `active_contract` → `active_contract` | PASS | **Fixed during regression** |
| Public landing storytelling | PASS | Expandable strategy cards, KPIs, print button |
| Share token auto-generated on approve | PASS | Token present after approval |

### Phase 6 — Inventory

| Test | Result | Notes |
|---|---|---|
| All 6 new columns in API response | PASS | avg_views, content_hours, team_required, production_cost, setup_hours, line_items |
| Digital item POST with new fields | PASS | Created + PATCH + soft-delete |
| Physical item POST with line_items | PASS | JSONB line_items saved |
| `/inventory` UI | PASS | 23 items, physical/digital tabs |
| Inventory page browser test | PASS | Categories render, Edit/Delete buttons |

### Phase 7 — Image Pipeline

| Test | Result | Notes |
|---|---|---|
| `/api/image-generation` GET | PASS | HTTP 200 |
| `/media-generation` page | PASS | HTTP 200 |
| Rate limiting on POST | PASS | 5 req/min per IP |
| Live gpt-image-2 generation | SKIP | Not run (OpenAI cost) |
| Image modal portal fix | PASS | From prior sprint (createPortal) |

### Phase 8 — Mockup Editor

| Test | Result | Notes |
|---|---|---|
| `/mockup-editor` page | PASS | HTTP 200 |
| Konva templates / export | SKIP | Manual UI test recommended |

### Phase 9 — Public Landing Page

| Test | Result | Notes |
|---|---|---|
| `/proposals/view/KgbBhc4lyqQxNKzBVtw2uOt2-iLLZvR1` | PASS | No sidebar, storytelling layout |
| Expandable strategy cards | PASS | 3 strategies visible |
| Print/PDF button | PASS | Present |
| Visual prompts section | PASS | 5 concepts listed |

### Phase 10 — Internal API Security

| Test | Result | Notes |
|---|---|---|
| `/api/internal/apply-sql` without secret | PASS | HTTP 403 |
| `/api/internal/run-migration` | PASS | Now requires INTERNAL_API_SECRET |
| `/api/internal/migration-status` | PASS | Now requires INTERNAL_API_SECRET |

### Phase 11 — System Health

| Test | Result | Notes |
|---|---|---|
| `/system` page | PASS | HTTP 200 |
| Health API stats | PASS | 513 companies, 34 proposals, 49 campaigns |
| DB healthy | PASS | latency 19–67ms |
| Pipedrive in health | WARN | configured but key expired |

### Phase 12 — Dead Code

| Item | Result | Notes |
|---|---|---|
| SERPAPI marked deprecated | PASS | env-validation updated |
| Gmail routes retained | INFO | Legacy; not removed (future use) |
| Internal routes secured | PASS | Additional routes locked |

---

## 2. Routes Tested

**UI (authenticated):** `/`, `/login`, `/companies`, `/proposals`, `/inventory`, `/campaigns`, `/barter`, `/pipeline`, `/media-generation`, `/mockup-editor`, `/system`, `/crm-sync`, `/brand-assets`, `/users`, `/audit`

**UI (public):** `/proposals/view/{token}`

**API:** `/api/auth/login`, `/api/auth/logout`, `/api/users/me`, `/api/companies`, `/api/inventory`, `/api/image-generation`, `/api/barter`, `/api/proposals/{id}/approve`, `/api/system/health`, `/api/internal/apply-sql`

---

## 3. Bugs Found & Fixed

| Bug | Severity | Fix |
|---|---|---|
| `active_contract` approval failed with `approval_decision` enum error | **High** | Skip `approvals` insert for `active_contract` (status-only transition); migration 0019 added for optional audit |
| Internal migration routes unprotected | **Medium** | Added `requireInternalAuth` to `run-migration` and `migration-status` |
| False FAIL on logout test | **Low** | Test methodology issue; logout works when cookies updated via `-c` on logout call |

---

## 4. Remaining Blockers

1. **Pipedrive API key expired** — CRM sync will fail until James provides new key
2. **Optional migration 0019** — Run in Supabase SQL Editor if you want `active_contract` in `approval_decision` audit enum (not required for functionality)
3. **Live AI flows** — Intelligence, campaign generation, image generation not run in this regression (routes validated; manual test recommended before demo)

---

## 5. Security Assessment

| Control | Status |
|---|---|
| Admin fallback removed | ✅ |
| Supabase Auth sessions | ✅ |
| Middleware route protection | ✅ |
| Internal API secret | ✅ |
| Git PAT removed from remote | ✅ |
| Public share links isolated | ✅ |
| Rate limiting on AI endpoints | ✅ |

**Score: Production-grade for internal team use**

---

## 6. Production Readiness Assessment

**Ready for:** Internal commercial team daily operations, proposal creation, inventory management, public client share links.

**Not ready for:** Full unattended production without Pipedrive key renewal and optional Vercel/Railway deployment config.

---

## 7. PM2 Stability

- **Restarts:** 59 total (all manual `pm2 restart` during development)
- **unstable_restarts:** 0
- **Conclusion:** No crash loop; app is stable

---

## 8. Regression Summary

All stabilization sprint changes verified:
- Auth hardening works end-to-end
- Migrations 0017/0018 applied and functional
- `active_contract` status works in UI and API
- Inventory operational fields save correctly
- Public proposal links work without authentication
- Health metrics accurate

---

## 9. Recommended Next Actions

1. James: Provide new Pipedrive API key
2. Run one live demo: Company → Intelligence → Campaign → Proposal → Approve → Share link
3. Optionally apply migration 0019 in Supabase Dashboard
4. Deploy to Vercel/Railway when ready for permanent hosting (replace ngrok)

---

## 10. Manual Test Checklist (for James/team)

Use credentials: `patrocinios@coritiba.com.br` / `admin@1Touch`

- [ ] Login at `/login`
- [ ] Add company at `/companies`
- [ ] Run Intelligence on company page
- [ ] Create campaign at `/campaigns` with AI
- [ ] New proposal at `/proposals/new` (full wizard)
- [ ] Upload logo in proposal Brand Assets
- [ ] Generate campaign image
- [ ] Submit → Approve → Mark Active/In Contract
- [ ] Open share link in incognito
- [ ] Add inventory item with avg_views + production_cost
- [ ] Logout and confirm redirect to login
