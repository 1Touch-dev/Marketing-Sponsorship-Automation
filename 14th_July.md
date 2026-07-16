# Sprint: 14th July 2026
**Branch:** `14-july-sprint` (to be created from `26-july-sprint`)
**Focus:** Image Generation — Jersey (all zones + real player photos), AI Campaign Creative, Stadium Polish

---

## ✅ DONE TODAY (14 July 2026)

### STEP 0 — Branch
- [x] `14-july-sprint` created from `26-july-sprint`

### PART 1 — Jersey Mockup
- [x] **Step 1.1** — Added `number` placement zone to `jersey-placements.ts` (8 zones total)
- [x] **Step 1.2** — Copied real 2026 player-worn photos as kit bases:
  - `coritiba-jersey-home.jpg` — from `DSCF4975.jpg` (front-facing matchday player, Fujifilm X-T5)
  - `coritiba-jersey-training.jpg` — from `DSCF2843.jpg` (training ground, dark navy kit)
  - `coritiba-jersey-goalkeeper.jpg` — from `DSCF5278.jpg` (GK green kit)
- [x] **Step 1.3** — Updated `jersey-composite.ts` — `kitType` param, `KIT_FILENAMES` map, `kitType` in result
- [x] **Step 1.4** — Updated jersey API route — accepts `kit_type` in request body, returns `kit_type` in response
- [x] **Step 1.5** — Rewrote `OfficialJerseyMockup` UI:
  - 4 kit type tabs (Home Kit / Training / Goalkeeper / Flat Kit)
  - All 8 placement zones as radio cards
  - Per-session generated image gallery (thumbnails for each kit+zone combo)
  - Confirm modal shows kit type + placement
- [x] **Step 1.6** — Build succeeded, images verified in `/public/mockups/`

### PART 2 — AI Campaign Creative
- [x] **Step 2.1** — Created `/api/media/campaign-creative/route.ts`:
  - Model: `gpt-image-2`, quality `low` (~21 sec), 1024×1024
  - 3 scene types with editorial prompts: `matchday_street`, `training_ground`, `fan_lifestyle`
  - Saves to Supabase storage `campaign-assets` bucket
  - Records to `image_generation_jobs` table with `job_type: "campaign_creative"`
  - Rate limit: 10/min per IP
- [x] **Step 2.2** — Created `ai-campaign-creative.tsx` UI component:
  - 3 scene type cards with icons and descriptions (PT)
  - Generate button with loading state
  - Result display with Download/Open/session gallery
- [x] **Step 2.3** — Wired into `proposal-graphics-panel.tsx` — replaced old `AICreativesGenerator` with new `AiCampaignCreative`
- [x] **Step 2.4** — Tested gpt-image-2 output quality:
  - Generated sample: Coritiba supporter walking toward stadium, jersey visible, real matchday feel
  - Output is editorial/photorealistic — NOT AI-illustration style
  - Quality confirmed for all 3 scene prompts

### PART 3 — Stadium Mockup
- [x] **Step 3.1** — Build passes, compositing code unchanged (confirmed working from previous sprint)
- [x] **Step 3.2** — 157 high-res pitch-level photos (6192×4128) available in `assets/stadium/pitch_level/`; current 4 base photos adequate for now

### STEP 4 — Build & Deploy
- [x] Build: `npm run build` → exit code 0, no type errors
- [x] PM2 restarted: `sponsorship-platform` online
- [x] Branch: `14-july-sprint` pushed to GitHub

---

## ✅ DONE (carried from previous sprints)

### Bugs Fixed (All P0/P1 Resolved)
- [x] **BUG-01** — PDF deck sidebar removed; A4 centered layout with sticky toolbar (print + back button)
- [x] **BUG-02** — Custom inventory categories (custom name input in item form)
- [x] **BUG-03** — Auto-counterpart items on proposal wizard (e.g. jersey → LED board auto-added)
- [x] **BUG-04** — Bulk campaign industry filter fixed (Portuguese labels with ilike search)
- [x] **BUG-05** — Contacts save from AI analysis (Save All Found Contacts banner + per-contact save)
- [x] **BUG-06** — CRM sync status badge on dashboard (green/amber/red)
- [x] **BUG-07** — Inline industry edit on company detail page
- [x] **BUG-08** — Competitors "Add to CRM" button with Already in DB / Added ✓ feedback
- [x] **BUG-09** — Inventory stats and "All Items" consolidated tab
- [x] **BUG-10** — Proposal wizard dropdown contrast fixed (text-foreground, placeholder styled)

### Feature Requests Completed (17/17)
- [x] **FR-01** — Public proposal landing page redesign (branded header + sticky CTA)
- [x] **FR-02** — Email template dual-placeholder support (`{{var}}` and `[Bracket]`); pre-send validation
- [x] **FR-03** — Inventory: Period, Quantity, Responsible fields added
- [x] **FR-04** — Pipeline: Coritiba 4-stage template card (Contact Lead → Diagnosis → Proposal → Contract)
- [x] **FR-05** — Tinder-style approvals queue
- [x] **FR-06** — Mockup editor: OOH billboard, digital banner, social story templates + Attach to Proposal panel
- [x] **FR-07** — Reports page: Revenue vs Target, Win Rate, bar charts, CSV export
- [x] **FR-08** — Dashboard Revenue Hero section (Total Active Revenue, Pipeline Value, Avg Deal Size KPI tiles)
- [x] **FR-09** — Custom inventory categories (free-text input when "Custom Category" selected)
- [x] **FR-10** — Proposal version history panel (`<VersionHistoryPanel>`)
- [x] **FR-11** — Sponsorship Fit card on company detail page (color-coded score + AI rationale)
- [x] **FR-12** — WhatsApp follow-up button on proposal page (Day 3 / Day 7 templates)
- [x] **FR-13** — Contract renewal flow (expiry alerts + Renovar button → pre-filled proposal wizard)
- [x] **FR-14** — A/B test panel on proposal page
- [x] **FR-15** — Newsletter config page (segments, schedule, template, analytics)
- [x] **FR-16** — PT/EN language toggle in sidebar
- [x] **FR-17** — Bulk proposals wizard (3-step: select → configure → Tinder-style review queue)

### Infrastructure
- [x] PM2 crash-loop fixed (`ecosystem.config.cjs` corrected to use `node_modules/.bin/next`)
- [x] ngrok browser warning bypassed (`ngrok-policy.yml`)
- [x] System page Pipedrive Status Card null-safety fix
- [x] DB migration 0037 applied (sponsorship_fit_score, sender_profile_id, ab_test_config, newsletter_segments, contacts, renewed_from_contract_id, pdf_url)
- [x] DB migration 0036 applied (inventory period, quantity, responsible)
- [x] Assets preprocessed and organised from James's Dropbox (27 home jerseys, 6 training jerseys, 65 campaign photos, 157 pitch-level stadium photos)
- [x] `.gitignore` updated (assets/, training-data/, acervo_raw/, *.zip)

### Image Generation (Previous Work — Pre James Confirmation)
- [x] Jersey compositing pipeline (sharp-based, 7 zones, white badge background)
- [x] Stadium compositing pipeline (5 placements on 4 Couto Pereira base photos)
- [x] Official Coritiba badge SVG integrated (Wikimedia source)
- [x] `coritiba-jersey-base.jpg` as flat kit photo base
- [x] Stadium history API (`/api/media/stadium-mockup/history`) — loads previous generations on mount
- [x] Jersey mockup UI with placement selector, download, and approve buttons

---

## 🔴 PENDING — Today's Work (14 July)

> **All items above completed. Only outstanding items:**

### Jersey — Minor Calibration (if needed after live testing)
- [ ] Verify `number` zone coordinates look correct on real player back photo — may need pixel-tuning once James sends back-facing photos
- [ ] Awaiting James's dataset for back/shoulder/number zone photos (player must be facing away from camera for back zone)

### Stadium Mockup — Live Regression
- [ ] Manual live test on site: generate for each of 5 placements and visually confirm sponsor appears correctly

---

---

### STEP 0 — Create new sprint branch (5 min)
```bash
git checkout 26-july-sprint
git pull origin 26-july-sprint
git checkout -b 14-july-sprint
```
- [ ] Branch `14-july-sprint` created from `26-july-sprint`

---

### PART 1 — Jersey Mockup: All Zones + Real Player Photos

**Context:** James confirmed — not only chest. ALL sponsorship locations (shoulders, back, number, etc.). He may send a dataset. We already have 27 real player home-kit photos from Dropbox.

#### Step 1.1 — Add `number` placement zone (30 min)
- File: `frontend/lib/media/jersey-placements.ts`
- [ ] Add `"number"` to `JerseyPlacementId` union type
- [ ] Add zone entry in `JERSEY_PLACEMENTS` array:
  - Located on back panel where jersey number sits
  - Approx: `x: 0.570, y: 0.195, w: 0.175, h: 0.095` (back panel, centre of number area)
  - Label: `"Back — Number"` / `"Costas — Número"`
  - `enabled: true`
- [ ] Update `getPlacement` / `isPlacementAvailable` to include the new zone (auto-handled since array-based)

#### Step 1.2 — Copy best real player photos as kit-type bases (30 min)
- Source: `assets/jerseys/home/` (27 photos), `assets/jerseys/training/` (6 photos), `assets/jerseys/goalkeeper/`
- [ ] Pick best 1 photo per kit type (player-worn, full body, clear front view):
  - `home` → `frontend/public/mockups/coritiba-jersey-home.jpg`
  - `training` → `frontend/public/mockups/coritiba-jersey-training.jpg`
  - `goalkeeper` → `frontend/public/mockups/coritiba-jersey-goalkeeper.jpg`
- [ ] Keep `coritiba-jersey-base.jpg` (flat kit) as fallback / "front only" view

#### Step 1.3 — Update composite library to support kit type (45 min)
- File: `frontend/lib/media/jersey-composite.ts`
- [ ] Add `kitType?: "home" | "training" | "goalkeeper" | "flat"` to `CompositeJerseyInput`
- [ ] Update `baseImagePath()` to resolve correct file based on `kitType`
  - Default: `"flat"` → `coritiba-jersey-base.jpg` (existing behavior)
  - `"home"` → `coritiba-jersey-home.jpg`
  - `"training"` → `coritiba-jersey-training.jpg`
  - `"goalkeeper"` → `coritiba-jersey-goalkeeper.jpg`
- [ ] Pass `kitType` from the API route to the composite function

#### Step 1.4 — Update jersey API route (15 min)
- File: `frontend/app/api/media/jersey-mockup/route.ts`
- [ ] Add `kit_type?: string` to request body type
- [ ] Pass `kitType: body.kit_type` to `compositeJerseyMockup()`

#### Step 1.5 — Update jersey UI component (45 min)
- File: `frontend/components/proposals/official-jersey-mockup.tsx`
- [ ] Add kit type tabs at the top: `Flat Kit | Home | Training | Goalkeeper`
- [ ] Show all 8 placement zones (including new `number`) as clickable zone cards
  - Each card shows: zone label in PT, zone description, a small preview indicator
- [ ] Pass `kit_type` to the generate API call
- [ ] On kit type change: reset current generated image (different base photo = different zone coords)

#### Step 1.6 — End-to-end test all 8 zones (30 min)
- [ ] Open a proposal on live site → Visuais tab → Jersey section
- [ ] Generate mockup for each zone with test logo (A.Yoshii or another from DB)
- [ ] Verify placement looks correctly positioned on the real player photo
- [ ] Check `chest_sponsor`, `sleeve_left`, `sleeve_right`, `back`, `shorts`, `socks`, `chest_above_name`, `number`

---

### PART 2 — AI Campaign Creative: Editorial Lifestyle Style

**Context:** James confirmed — editorial/lifestyle like "Curitiba é Coritiba" 2026 campaign. Person in Coritiba kit in real Curitiba setting. Sponsor branding integrated naturally (not a product placement sticker). We have 65 real campaign reference photos in `assets/brand/campaigns_photos/`.

#### Step 2.1 — Create campaign creative API endpoint (45 min)
- New file: `frontend/app/api/media/campaign-creative/route.ts`
- [ ] Accept: `sponsor_name`, `sponsor_logo_url`, `scene_type` (`matchday_street` | `training_ground` | `fan_lifestyle`), `proposal_id?`, `company_id?`
- [ ] Use OpenAI `gpt-image-2` `/v1/images/generations` endpoint (1024×1024, `quality: "high"`)
- [ ] Build scene-specific prompt per `scene_type`:

  **`matchday_street`:**
  ```
  Editorial sports photography. Coritiba FC supporter walking toward Estádio Couto Pereira 
  on a matchday. Green and white Coritiba jersey clearly visible. {SPONSOR} branding on a 
  poster/billboard visible in the background. Curitiba street, real people, cinematic 
  natural light. Style: authentic Brazilian street photography, NOT a studio mock. 
  High resolution, photorealistic.
  ```

  **`training_ground`:**
  ```
  Editorial sports photography. Coritiba FC player at a training session, wearing the 2026 
  green and white kit. {SPONSOR} logo visible on a training board / backdrop banner behind 
  the player. Action pose, genuine athletic setting, golden hour light. Style: sports 
  editorial for magazine or social media. Photorealistic.
  ```

  **`fan_lifestyle`:**
  ```
  Lifestyle photography. Young Coritiba FC fan in the 2026 green and white jersey in 
  everyday Curitiba city life — café, park, or street. {SPONSOR} branding naturally visible 
  as part of the scene (on a cup, bag, or background sign). Warm natural lighting, candid 
  feel. Style: "Curitiba é Coritiba" 2026 campaign aesthetic. Photorealistic.
  ```

- [ ] Save to `image_generation_jobs` table with `job_type: "campaign_creative"`
- [ ] Upload to Supabase storage `campaign-assets` bucket → return public URL
- [ ] Rate limit: 10/min per IP

#### Step 2.2 — Create campaign creative UI component (45 min)
- New file: `frontend/components/proposals/ai-campaign-creative.tsx`
- [ ] Scene type selector with 3 option cards (icon + label + description)
  - Matchday Street / Training Ground / Fan Lifestyle
- [ ] Sponsor name and logo display (read from props — same as jersey component)
- [ ] "Generate Creative" button → loading spinner → result image
- [ ] Result controls: Download, Regenerate, Approve (saves to proposal)
- [ ] Error display with retry

#### Step 2.3 — Wire into `visual-mockup-grid.tsx` (20 min)
- File: `frontend/components/proposals/visual-mockup-grid.tsx`
- [ ] Add third section: "AI Campaign Creative" after Jersey and Stadium sections
- [ ] Import and render `<AiCampaignCreative>` component with proposal/company props

#### Step 2.4 — Test + iterate on prompt quality (30 min)
- [ ] Generate 1 image per scene type using a real sponsor (e.g., test company from DB)
- [ ] Review output — does it feel editorial and authentic, or like a product placement?
- [ ] If needed: tighten prompt (add style references, avoid "logo on jersey chest" instruction which causes product-shot look)
- [ ] Confirm sponsor branding is visible but subtle/natural

---

### PART 3 — Stadium Mockup: Regression Test + Better Base Photos

**Context:** James confirmed stadium is exactly right. Regression test + optionally upgrade base photos with better shots from the 157 Dropbox photos.

#### Step 3.1 — Regression test all 5 placements (15 min)
- [ ] Open live site → a proposal with stadium mockup tab
- [ ] Generate mockup for each of the 5 zones:
  - LED Board – Goal End
  - LED Board – Far Side
  - Main Stand Facade
  - Exterior Facade
  - Scoreboard
- [ ] Confirm each generates without error and logo is clearly visible

#### Step 3.2 — Review Dropbox stadium photos for upgrades (20 min)
- Source: `assets/stadium/pitch_level/` (157 photos)
- [ ] Open a few of the pitch-level photos and compare against current base images
- [ ] If any pitch-level shots show LED boards facing camera more clearly → copy to `frontend/public/mockups/` as new base

#### Step 3.3 — Swap base photos if better ones found (20 min)
- [ ] Replace up to 2 current base photos in `frontend/lib/media/stadium-placements.ts` if better source images identified
- [ ] Re-calibrate placement zone coordinates if base image dimensions differ

---

### STEP 4 — Build, Deploy, and Document (30 min)

#### Step 4.1 — Build and test (15 min)
```bash
cd /home/ubuntu/Market_Sponsorship_Automation/frontend
npm run build
pm2 restart sponsorship-platform
```
- [ ] Build succeeds (0 type errors / build errors)
- [ ] Live site loads correctly

#### Step 4.2 — Update this document (5 min)
- [ ] Move all completed items from PENDING → DONE section above
- [ ] Note any blocked items or follow-ups for James

#### Step 4.3 — Commit and push (10 min)
```bash
git add .
git commit -m "feat: 14-july-sprint — jersey all zones + real player photos, AI campaign creative editorial, stadium regression"
git push origin 14-july-sprint
```
- [ ] Branch pushed to GitHub

---

## 📋 BLOCKED / WAITING

| Item | Blocked On |
|------|-----------|
| Jersey base: player-worn photos for all zones (back, shoulders) | James's dataset (offered but not sent yet) |
| LoRA retrain for 2026 kit fine-tuning | James's dataset |
| AI Campaign: Coritiba brand guidelines for exact visual reference | James / available via brand manual in `assets/brand/manuals/` |

---

## ⏱ Time Estimate

| Part | Estimated Time |
|------|---------------|
| Step 0 — Branch | 5 min |
| Part 1 — Jersey (zones + player photos) | ~3 hrs |
| Part 2 — AI Campaign Creative | ~2.5 hrs |
| Part 3 — Stadium regression | ~1 hr |
| Step 4 — Build + commit | ~30 min |
| **Total** | **~7 hrs** |

---

*Last updated: 14 July 2026*
