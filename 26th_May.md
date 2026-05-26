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
| 4 | **Prioritize pending features** | Confirm order if needed: flow polish vs bulk campaigns vs A/B/C editor |

**Pipedrive steps (for the call):**

1. Check email `patrocinios@coritiba.com.br` for verification link if needed
2. Log into `coritiba.pipedrive.com`
3. Top right → Personal Preferences → API
4. Copy Personal API Token
5. Send to Abhishek → update `PIPEDRIVE_API_KEY` in `.env.local` → `pm2 restart sponsorship-platform --update-env`

---

### Abhishek / Dev Team — Build Sprint

#### Priority A — Flow polish (James #1 UX ask) — ~2–3 days

James: *"Improve the flow of Proposal, Campaign, Edit, Approve, Edit for changes (like we can go back), Approve."*

| # | Task | Details | Status |
|---|------|---------|--------|
| A1 | **Proposal flow clarity** | Create → edit content → submit review; no lost work on navigation/back | [ ] |
| A2 | **Campaign flow** | Campaign ↔ proposal ↔ inventory linked; edit after creation | [ ] |
| A3 | **Edit after approve / revision loop** | `revision_requested` → edit → re-submit → approve again (not dead-end after approve) | [ ] |
| A4 | **Status path visible in UI** | Draft → Under Review → Approved → Active/In Contract; clear buttons + badges | [ ] |
| A5 | **Regression check** | Logo upload, brand assets, share link, landing page, inventory fields still work | [ ] |

**API note:** Approval decisions use `approve`, `reject`, `request_revision`, `submit_review`, `active_contract` (not `approved`).

---

#### Priority B — Pending sponsor features (backlog)

| # | Feature | Priority | Est. | Status |
|---|---------|----------|------|--------|
| B1 | **Bulk industry campaigns** — proposals for entire industry at once | High | 1 day | [ ] |
| B2 | **Proposal A/B/C campaign editor** — AI variations + inventory picker for digital strategies | High | 1 day | [ ] |
| B3 | **Data enrichment improvements** — aggressive scraping, LinkedIn, news, financials | High | 1–2 days | [ ] |
| B4 | **Monthly reports for active sponsors** | Medium | 1 day | [ ] |
| B5 | **Asana integration** — tasks from execution brief items | Medium | 1 day | [ ] |
| B6 | **Upcoming matches / events** on landing page | Medium | 4h | [ ] |
| B7 | **Recent articles / news** on landing page | Low | 3h | [ ] |

---

#### Priority C — Replicate integration (Phase 1 AI images)

| # | Task | Status |
|---|------|--------|
| C1 | Receive `REPLICATE_API_TOKEN` from Ruhani | [ ] |
| C2 | Add env var + health check for Replicate | [ ] |
| C3 | Extract high-res frames from James Dropbox jersey video | [ ] |
| C4 | Train LoRA on Replicate (~1–3 hrs, ~$5–15) | [ ] |
| C5 | Wire platform: Replicate path for jersey/stadium mockups (alongside or vs DALL-E for those assets) | [ ] |
| C6 | Document cost per image + usage limits | [ ] |

**Out of scope for now (Phase 2/3):** AWS g5/g4dn, ComfyUI, multi-model orchestration, UGC video pipelines, multilingual video variants.

---

#### Priority D — Pipedrive (after token)

| # | Task | Status |
|---|------|--------|
| D1 | Update `PIPEDRIVE_API_KEY` in `.env.local` | [ ] |
| D2 | Restart PM2 with `--update-env` | [ ] |
| D3 | Verify `/api/system/health` → Pipedrive healthy | [ ] |
| D4 | E2E: create org → deal → log email activity → stage update | [ ] |

---

### Interns — Testing before delivery

James: *"Make sure interns do testing prior to delivery ok"*

Use checklist from `22nd_May.md` (or shortened list below). **No demo to James until all pass.**

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
| T9 | Public share link in incognito (no sidebar, no login) | [ ] |
| T10 | Inventory: digital fields (avg_views, content_hours, team_required) | [ ] |
| T11 | Inventory: physical fields (production_cost, setup_hours, line_items) | [ ] |
| T12 | Mockup editor: templates + PNG export | [ ] |
| T13 | Barter workflow | [ ] |
| T14 | Log bugs in shared sheet → dev fixes → re-test | [ ] |

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

---

## Current Blockers

| # | Blocker | Owner | Unblocks |
|---|---------|-------|----------|
| 1 | **Pipedrive API token expired** | James | Live session + token |
| 2 | **Replicate API token** | Ruhani | Billing + `REPLICATE_API_TOKEN` |
| 3 | **Jersey training frames** | James/Abhishek | Confirm Dropbox video OK; extract PNG/JPG |

---

## Suggested 7-Day Timeline

| Day | Focus |
|-----|-------|
| **Day 1 (26 May)** | Message Ruhani (Replicate). Schedule Pipedrive call. Start Priority A flow polish. |
| **Day 2–3** | Finish proposal/campaign/approval UX + revision loop. Intern testing round 1. |
| **Day 4** | Replicate: train jersey model when token arrives. |
| **Day 5–6** | Priority B: bulk campaigns OR A/B/C editor (confirm with James if unclear). |
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

This week we're starting: (1) proposal/campaign/approve flow improvements including edit-after-approve and revisions, (2) pending sponsor features, (3) Replicate jersey training once the key is in. Upload, landing page, inventory fields, and In Contract are already live. Interns will run full testing before we show you the next build.
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
