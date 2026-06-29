# 29th June Sprint — Market Sponsorship Automation

**Branch:** `29th-june-sprint`
**Date:** 29th June 2026
**Developer:** Abhishek Kulkarni

---

## Context

James asked:
> "Have we tested the outdoor for mockups and AI generated?"

This sprint focuses exclusively on **outdoor/stadium advertising mockups** — compositing sponsor logos onto **real Couto Pereira photos** (LED boards, main stand facade, exterior facade, scoreboard) and improving **AI-generated outdoor scene prompts**.

---

## 26th June Status Recap (already completed)

All items below were already completed and committed on `26th-june-sprint`. Confirmed ✅:

| # | Feature | Status |
|---|---------|--------|
| 1 | All P0/P1 bugs from Coritiba Audit v4 PDF | ✅ Done |
| 2 | Sponsor view page — removed admin sidebar, added CTA | ✅ Done |
| 3 | Email placeholders fixed | ✅ Done |
| 4 | Proposal link and CTA added in email templates | ✅ Done |
| 5 | Gmail OAuth expiry alert added | ✅ Done |
| 6 | Stuck image jobs cleared + timeout/retry added | ✅ Done |
| 7 | Bulk Approve images loading fixed | ✅ Done |
| 8 | Save button added for Hunter/Apollo contacts | ✅ Done |
| 9 | Sponsor landing page redesigned | ✅ Done |
| 10 | Tinder-style approval queue | ✅ Done |
| 11 | Contract module and proposal versioning added | ✅ Done |
| 12 | Email tracking and sender profiles implemented | ✅ Done |
| 13 | Other UI improvements and exports added | ✅ Done |
| 14 | Full E2E QA done (46 tests passed) | ✅ Done |
| 15 | All code committed to `26th-june-sprint` on GitHub | ✅ Done |
| 16 | Pipeline board live (needs company Pipeline Stage setup) | ⚠️ Known limitation |

---

## 29th June Sprint — What Was Done Today

### ✅ 1. Stadium / Outdoor Mockup — Sharp Compositor

Built a **production-ready stadium mockup compositor** using James's real Couto Pereira photos.

**Files created:**
- `frontend/lib/media/stadium-placements.ts` — 5 placement zones with pixel-calibrated coordinates
- `frontend/lib/media/stadium-composite.ts` — Sharp compositor (mirrors jersey-composite pattern)
- `frontend/app/api/media/stadium-mockup/route.ts` — POST API route, saves to Supabase Storage
- `frontend/components/proposals/stadium-outdoor-mockup.tsx` — Full UI component with confirm modal

**4 real stadium photos used (resized to 1920×1080):**

| Filename | Description | Used for |
|----------|-------------|---------|
| `couto-pereira-matchday.jpg` | Interior pitch-side, match day, packed crowd, floodlights | LED boards + main stand |
| `couto-pereira-aerial-day.jpg` | Aerial daytime, perimeter boards visible | Scoreboard/perimeter |
| `couto-pereira-night.jpg` | Night aerial, exterior LED facade visible | Exterior facade |
| `couto-pereira-overhead.jpg` | Overhead drone, CFC tifo | Overhead perimeter |

**5 placement zones:**

| Zone ID | Label | Base Photo | Overlay Style |
|---------|-------|-----------|--------------|
| `led_board_main` | LED Board — Centre Pitch-side | matchday | led_band |
| `led_board_near_goal` | LED Board — Near Goal | matchday | led_band |
| `main_stand_facade` | Main Stand — Facade Banner | matchday | banner_white |
| `exterior_facade` | Exterior Facade — LED Sign | night | led_band |
| `scoreboard` | Scoreboard / Giant Screen | aerial_day | led_band |

**How it works:**
1. User uploads sponsor logo in Brand Assets
2. Opens proposal → Visuais / Graphics section
3. Sees new **"🏟️ Stadium / Outdoor Mockup"** card (Card 2, amber theme)
4. Selects placement zone from radio buttons
5. Clicks "Generate Outdoor Mockup" → confirm modal shows
6. Sharp composites logo onto real stadium photo at calibrated coordinates
7. Image saved to `campaign-assets/stadium-mockups/` in Supabase Storage
8. Shown inline + Download/Open buttons
9. Job recorded in `image_generation_jobs` table for proposal

---

### ✅ 2. AI Campaign Creatives — Outdoor Prompt Added

Updated AI prompt logic in:
- `frontend/components/proposals/ai-creatives-generator.tsx`
- `frontend/components/proposals/campaign-image-generator.tsx`

**Changes:**
- Added `buildOutdoorPrompt()` function for LED board–specific AI generation
- When no strategy variants: generates **2 images** instead of 1 — (1) general campaign creative + (2) outdoor LED board scene
- Updated `buildFallbackPrompt()` to mention "perimeter hoardings" for better outdoor context
- Updated strategy-based prompts to mention "perimeter hoardings around the pitch"

**Outdoor prompt example:**
> "Photorealistic outdoor sports advertising mockup: [Company] branding at Estádio Couto Pereira, Coritiba FC, Curitiba, Paraná, Brazil. Close-up of green LED perimeter advertising board at pitch level with "[Company]" clearly displayed. [Company] logo on pitch-side LED board. Match day atmosphere, broadcast-quality floodlit stadium, fans in green and white, cinematic 16:9 widescreen, sharp focus on advertising board."

---

### ✅ 3. Proposal Graphics Panel — 4 Cards

Updated `frontend/components/proposals/proposal-graphics-panel.tsx`:

| Card # | Title | Description |
|--------|-------|-------------|
| 1 | 👕 Jersey Mockup — Official | Existing jersey compositor |
| 2 | 🏟️ Stadium / Outdoor Mockup | **NEW** — Real stadium photos, LED boards, 5 zones |
| 3 | ✨ AI Campaign Creatives | AI generation via OpenAI gpt-image-1 (now includes outdoor prompt) |
| 4 | 🖼️ Saved Images | All generated images for this proposal |

---

## How to Test

### Test 1: Stadium Outdoor Mockup (Sharp compositor)

1. Go to any proposal: `/proposals/[id]`
2. Scroll to **"Visuais / Graphics"** section
3. Find the **🏟️ Stadium / Outdoor Mockup** card (amber border)
4. Upload a sponsor logo first (Brand Assets section) if not done
5. Select placement: e.g. "📺 Placa LED — Centro à Beira do Campo"
6. Click **"🏟️ Generate Outdoor Mockup"**
7. Confirm in modal
8. Image appears within 2–5 seconds (it's Sharp compositing, not AI)
9. Download the image — should show logo on the Couto Pereira LED board

**Expected placements:**
- `led_board_main` → Logo on centre LED board, matchday pitch-side photo
- `led_board_near_goal` → Logo on near-goal LED board, matchday photo
- `main_stand_facade` → Logo below "CORITIBA FOOT BALL CLUB" text on main stand
- `exterior_facade` → Logo on exterior stadium LED sign, night photo
- `scoreboard` → Logo on scoreboard area, aerial photo

### Test 2: AI Outdoor Creatives

1. Go to any proposal: `/proposals/[id]`
2. Find **✨ AI Campaign Creatives** card
3. Click **"Generate Creatives"**
4. Prompt approval modal opens — should show **2 prompts** (if no strategy variants):
   - Prompt 1: General campaign creative
   - Prompt 2: "Outdoor — LED Board" — outdoor-specific prompt
5. Review and click **"Generate 2 Images"**
6. Wait 30–60 seconds for OpenAI generation
7. Both images appear
8. Go to `/proposals/bulk-approve` to approve them

### Test 3: API Direct

```bash
curl -X POST https://eligibly-facing-unloved.ngrok-free.dev/api/media/stadium-mockup \
  -H "Content-Type: application/json" \
  -d '{
    "sponsor_name": "Test Sponsor",
    "sponsor_logo_url": "https://logo.clearbit.com/google.com",
    "placement": "led_board_main",
    "save_to_proposal": false
  }'
```
Expected: `{ "success": true, "url": "...", "placement": "led_board_main", "base_photo": "matchday" }`

---

## Pending / Known Limitations

| Item | Notes |
|------|-------|
| LED board pixel calibration | Coordinates are calibrated from visual inspection at 1920×1080. May need minor tweaking after visual QA on the live site |
| Replicate FLUX LoRA | The `abhishek9302/coritiba-jersey-lora` model is fine-tuned for jerseys only — outdoor AI prompts use OpenAI gpt-image-1 instead |
| Pipeline board — company Pipeline Stage | Companies need `pipeline_stage` column populated to show in Kanban (known from 26th June) |
| Custom stadium photo upload | Currently uses James's 4 pre-selected photos. A future enhancement could allow uploading custom stadium photos |
| LED board perspective warp | Current compositor does flat rectangular overlay. Advanced version could add perspective transform to match the angle of the real boards |

---

## Files Changed in This Sprint

```
frontend/lib/media/stadium-placements.ts          (NEW)
frontend/lib/media/stadium-composite.ts            (NEW)
frontend/app/api/media/stadium-mockup/route.ts     (NEW)
frontend/components/proposals/stadium-outdoor-mockup.tsx  (NEW)
frontend/components/proposals/proposal-graphics-panel.tsx (UPDATED — added Card 2)
frontend/components/proposals/ai-creatives-generator.tsx  (UPDATED — outdoor prompt)
frontend/components/proposals/campaign-image-generator.tsx (UPDATED — outdoor prompt)
frontend/public/mockups/stadium/couto-pereira-matchday.jpg    (NEW)
frontend/public/mockups/stadium/couto-pereira-aerial-day.jpg  (NEW)
frontend/public/mockups/stadium/couto-pereira-night.jpg       (NEW)
frontend/public/mockups/stadium/couto-pereira-overhead.jpg    (NEW)
```

---

## Git

- **Branch:** `29th-june-sprint`
- **Commits:** Will be pushed after build verification
- **Base branch:** `26th-june-sprint` (all previous work is there)

---

*Abhishek Kulkarni — 29th June 2026*
