# Coritiba FC Platform — Action Plan (26 May 2026)
**Updated:** 26 May 2026 | **By:** Abhishek  
**Branch:** `feature/apify-commercial-intelligence`  
**Platform URL:** https://eligibly-facing-unloved.ngrok-free.dev

---

## Context (James WhatsApp — 26 May)

James confirmed:

- Compare **Replicate vs AWS** → implement the **cheaper option now**
- Tell **Ruhani** to buy Replicate subscription (not AWS GPU yet)
- Agrees with **Phase 1 (Replicate/API) → Phase 2 (AWS GPU) → Phase 3 (proprietary workflows)**
- **Pipedrive:** coordinate a live session (James morning = India late night) for API token
- **Start pending sponsor features**
- **Improve flow:** Proposal → Campaign → Edit → Approve → Edit for changes (go back) → Approve
- **Do not forget** upload and other prior requests
- **Interns must test** before any delivery to James

---

## Decisions Locked In

| Topic | Decision |
|-------|----------|
| **Replicate vs AWS** | **Start with Replicate** (~$5–15 one-time training + ~$20–40/month at current volume). AWS GPU = Phase 2 when volume/team justifies. |
| **James long-term vision** | Aligns with phased plan: API-first MVP → AWS orchestration → Coritiba-trained media workflows |
| **Pipedrive** | Code complete; blocked on **fresh API token** (live session with James) |
| **Testing gate** | No demo to James until interns pass full checklist |

---

## Cost Comparison (for reference)

### Option 1 — Replicate (chosen for Phase 1)

| Item | Cost |
|------|------|
| Training Coritiba jersey model (one-time) | ~$5–15 (1–3 hrs on A100 @ ~$5/hr) |
| Per image after training | ~$0.003–$0.04 |
| ~500 images/month | ~$2–20/month |
| **Realistic monthly (normal usage)** | **~$20–40/month** |
| Subscription | Pay-as-you-go credits (no fixed monthly server) |

### Option 2 — AWS GPU (Phase 2 — defer)

| Instance | On-demand 24/7 | Reserved 1yr |
|----------|----------------|--------------|
| g4dn.xlarge (T4) | ~$380/month | ~$240/month |
| g5.xlarge (A10G) | ~$905/month | ~$534/month |

**Conclusion:** Replicate is cheaper until we generate hundreds of images daily or need multi-model hosting in-house.

---

## Sprint Progress (26 May 2026)

### ✅ Completed Today

| # | Task | Notes |
|---|------|-------|
| A1 | **Proposal revision loop** | Draft → Under Review → Revision Requested → Edit → Re-submit → Approve. Status banners, action buttons, all states handled. |
| A2 | **Proposal status path visible** | Stepper shows all stages (Draft → Review → Revision → Approved → Contract). Amber/red banners for revision/rejected. |
| A3 | **Edit after approve / revision** | "Save & Submit for Review" button on edit page; revision banner displayed in editor. |
| B1 | **Bulk Industry Campaigns** | API + UI. 15+ companies per batch. 3 parallel AI threads per batch (was sequential). Max=20 via UI. Tested: 8/8 Automotivo companies OK. |
| B2 | **Proposal A/B/C campaign editor** | AI-generated strategy variants (3 variants) + pricing tiers (3 tiers) included in every proposal. |
| B3 | **Data enrichment improvements** | Apify integration, competitor discovery, LinkedIn/news scraping in intelligence flow. |
| B4 | **Monthly sponsor reports** | `/reports` page — AI-written monthly reports for active sponsors (download as text). |
| B5 | **Upcoming matches on landing page** | "Próximas Partidas" section added to public proposal share page. |
| C1/C2 | **Replicate env plumbing + health check** | `REPLICATE_API_TOKEN` wired in `env.ts`, `/api/system/health` reports status. Awaiting key from Ruhani. |
| — | **Auth system hardened** | Supabase Auth login/logout/session middleware. Protected routes tested E2E. |
| — | **Bulk API parallelised** | 3 companies processed simultaneously (was 1). ~3× faster. 15 companies ≈ 5–8 min (was ~25 min). |
| — | **Build clean** | `tsc --noEmit` → 0 errors. `npm run build` → success. PM2 restarted. |

---

### ⏳ Pending (blocked on external inputs)

| # | Task | Blocked on | Owner |
|---|------|-----------|-------|
| D1 | **Pipedrive live integration** | Fresh API token (James session) | James + Abhishek |
| C3 | **Jersey LoRA training** | Replicate key (Ruhani) + Dropbox frames (James OK?) | Ruhani + James |
| C4 | **Wire Replicate image generation** | Replicate API key from Ruhani | Abhishek (after key) |
| — | **Hunter.io / ZeroBounce / Placid** | API keys from Ruhani (lower priority) | Ruhani |

---

### 📋 Still To Do (no blockers)

| # | Task | Est. | Priority |
|---|------|------|----------|
| B6 | **Asana integration** — tasks from execution brief items | 1 day | Medium |
| B7 | **Recent articles / news** on landing page (API or scrape) | 3–4h | Low |
| — | **Intern test round** | Half day | HIGH — required before James demo |
| — | **Full regression after Pipedrive token** | 2h | After token |

---

## Action Items by Owner

### Ruhani — Do today

- [ ] Create account at [replicate.com](https://replicate.com)
- [ ] Add billing / top-up credits (~$50–100 to start)
- [ ] Send API key: `REPLICATE_API_TOKEN=r8_...` to Abhishek
- [ ] **Do not** purchase AWS GPU yet (Phase 2 only)

**Optional (later, if James requests):**

- [ ] Hunter.io API key (email discovery)
- [ ] ZeroBounce API key (email validation)
- [ ] Placid API key (branded mockup templates)

---

### James — Coordinate

| # | Action | Notes |
|---|--------|-------|
| 1 | **Pipedrive API token session** | 30 min call: login → Settings → API → copy token. His morning = Abhishek late evening (8h timezone gap). |
| 2 | **Confirm jersey assets** | Dropbox video (password `mkt1909@`) — OK to extract frames for LoRA training? |
| 3 | **Approve Replicate spend** | Ruhani sets up billing per cost comparison above |

**Pipedrive steps (for the call):**

1. Check email `patrocinios@coritiba.com.br` for verification link if needed
2. Log into `coritiba.pipedrive.com`
3. Top right → Personal Preferences → API
4. Copy Personal API Token
5. Send to Abhishek → update `PIPEDRIVE_API_KEY` in `.env.local` → `pm2 restart sponsorship-platform --update-env`

---

### Interns — Testing before delivery

James: *"Make sure interns do testing prior to delivery ok"*

Use checklist from `22nd_May.md`. **No demo to James until all pass.**

| # | Test | Pass |
|---|------|------|
| T1 | Login `patrocinios@coritiba.com.br` / `admin@1Touch` | [ ] |
| T2 | Protected routes redirect to `/login` when logged out | [ ] |
| T3 | Company → Run Intelligence → Discover Competitors | [ ] |
| T4 | Campaign → AI generate strategies | [ ] |
| T5 | Proposal wizard full flow | [ ] |
| T6 | Logo / brand asset upload on proposal | [ ] |
| T7 | Image generation + view modal (no clipping) | [ ] |
| T8 | Submit → Approve → Mark Active/In Contract | [ ] |
| T9 | **Revision loop:** Approve → Request Revision → Edit → Re-submit → Approve again | [ ] |
| T10 | Public share link in incognito (no sidebar, no login) | [ ] |
| T11 | Inventory: digital + physical fields | [ ] |
| T12 | Mockup editor: templates + PNG export | [ ] |
| T13 | Barter workflow | [ ] |
| T14 | **Bulk campaigns:** Select Automotivo → 10 companies → Generate → see results | [ ] |
| T15 | **Monthly report:** Active contract → Reports page → Generate → Download | [ ] |
| T16 | **Landing page:** public link shows Próximas Partidas section | [ ] |
| T17 | Log bugs in shared sheet → dev fixes → re-test | [ ] |

---

## Already Completed (do not rebuild)

Tell James these are **live** — focus sprint on flow + pending + Replicate:

- [x] Pipedrive email integration (code; needs token)
- [x] Logo / brand asset upload on proposals
- [x] Landing page rebuild (storytelling, KPIs, expandable cards, video embed)
- [x] Inventory operational fields + execution brief integration
- [x] **Active / In Contract** CMS status
- [x] Real auth (login, middleware, roles)
- [x] Mockup: watermark removed, Coritiba jersey template on Konva
- [x] Public share links (`/proposals/view/[token]`)
- [x] Image modal portal fix
- [x] Security hardening + E2E regression (25 May)
- [x] DB migrations 0017 (inventory cols) + 0018 (`active_contract`)
- [x] **Proposal revision loop** (26 May)
- [x] **Bulk industry campaigns API + UI** — up to 20 companies, parallel processing (26 May)
- [x] **Proposal strategy variants (A/B/C)** + pricing tiers in every bulk proposal (26 May)
- [x] **Monthly sponsor reports** page + download (26 May)
- [x] **Upcoming matches** section on public landing page (26 May)
- [x] **Replicate env wiring** + health check (26 May)

---

## Current Blockers

| # | Blocker | Owner | Unblocks |
|---|---------|-------|----------|
| 1 | **Pipedrive API token expired** | James | Live session + token |
| 2 | **Replicate API token** | Ruhani | Billing + `REPLICATE_API_TOKEN` |
| 3 | **Jersey training frames** | James/Abhishek | Confirm Dropbox video OK; extract PNG/JPG |

---

## Suggested 7-Day Timeline (updated)

| Day | Focus |
|-----|-------|
| **Day 1 (26 May) ✅** | Flow polish (revision loop, bulk campaigns, reports, landing page). Env/auth hardening. |
| **Day 2–3** | Intern testing round 1. Fix reported bugs. Asana integration (no blocker). |
| **Day 4** | Replicate: train jersey model when token arrives (Ruhani). |
| **Day 5** | Pipedrive live session with James → token → verify integration. |
| **Day 6** | News/articles landing page section. Final regression. |
| **Day 7** | Intern re-test. Short Loom/demo for James. |

---

## James Long-Term Architecture (agreed direction)

**Phase 1 (now):** Replicate/API-first, fast rollout, validate workflows, low ops overhead.

**Phase 2:** AWS GPU orchestration, multiple open-source models, async queues, workflow variants, centralized media panel.

**Phase 3:** Proprietary Coritiba media workflows, sponsor placement pipelines, influencer/avatar systems, campaign-scale generation.

Jersey file from Dropbox: useful for sponsor placement masks, LoRA training, mockup templates, AI inpainting.

---

## WhatsApp Reply Template (for James)

```
Hi James — on Replicate vs AWS: Replicate is cheaper for us right now (~$5–15 one-time training, then roughly $20–40/month at our volume). AWS GPU makes sense later when we scale volume and the team — I agree with your Phase 1 → 2 → 3 plan. I've asked Ruhani to set up Replicate billing and send the API key.

For Pipedrive: let's do a 30-min session in your morning (my late evening) so we can grab the new API token together — code is ready.

This week we completed: proposal revision loop (edit-after-approve, re-submit, re-approve), bulk campaigns for up to 20 companies in one click (3× faster with parallel AI), A/B/C strategy variants + pricing tiers in every proposal, monthly reports for active sponsors, and upcoming matches on the public landing page. Auth, inventory, mockups, In Contract, and public share links all live. Interns will run full testing before we show you the next build.
```

---

## References

- Full E2E status: `E2E_REGRESSION_REPORT.md`
- Prior status: `25th_May_Status.md`
- Intern test script: `22nd_May.md`
- User guide: `USER_GUIDE.md`
- Manual DB SQL (if needed): `supabase/migrations/APPLY_MANUALLY.sql`

---

## Quick Links

| Resource | URL |
|----------|-----|
| Platform (ngrok) | https://eligibly-facing-unloved.ngrok-free.dev |
| Login | `/login` — `patrocinios@coritiba.com.br` |
| Supabase project | `lmjwjztokzombtstmume` |
| Pipedrive | `coritiba.pipedrive.com` |
| Replicate | `replicate.com` |
