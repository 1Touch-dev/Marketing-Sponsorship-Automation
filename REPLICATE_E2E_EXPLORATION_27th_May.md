# Replicate E2E Exploration + Phase 1 Execution
**Date:** 27 May 2026  
**Owner:** Abhishek  
**Status:** ✅ Training STARTED — monitoring in progress  
**Training ID:** `ddhg24v8fnrmy0cyd0fbr8cz84`  
**Training URL:** https://replicate.com/p/ddhg24v8fnrmy0cyd0fbr8cz84  
**Destination model:** `abhishek9302/coritiba-jersey-lora` (private)

---

## 1) What was explored in the signed-in Replicate account

Using the logged-in dashboard tab, the following areas were verified:

### A. Dashboard (`https://replicate.com/`)
- Account is logged in as `abhishek9302`.
- Main tabs available: `Dashboard`, `Models`, `Predictions`, `Trainings`, `Deployments`, `Webhooks`, `Stars`, `Support`.
- UI confirms account onboarding blocks and links for:
  - API token management
  - Billing setup (`Add payment method`, `Manage billing`)
  - Running models via API
- Current state on dashboard: no predictions/trainings/deployments history shown yet.

### B. Billing (`https://replicate.com/account/billing`)
- Billing settings page is accessible.
- Actions present:
  - `Manage billing`
  - `Add credit`
  - `Manage auto-reload`
- Indicates prepaid-credit workflow is active in account UI.

### C. API Tokens (`https://replicate.com/account/api-tokens`)
- API token settings page is accessible.
- This confirms token lifecycle can be managed directly from account settings.

### D. Trainings Index (`https://replicate.com/trainings`)
- Trainings list page loads correctly.
- Filters available (`created after`, `created before`).
- **Active training now visible: `ddhg24v8fnrmy0cyd0fbr8cz84` — status: processing**

### E. Trainer used: `replicate/fast-flux-trainer` (Official Replicate Fast Trainer)
- **Why chosen over `ostris/flux-dev-lora-trainer`:**
  - Official Replicate-maintained model (updated May 2026)
  - Faster than ostris (under 2 min setup, ~15-20 min total on 8x H100)
  - Specifically designed for subject/style FLUX fine-tuning
  - Autocaptioning built in
  - Same result quality, lower latency
  - Cost: ~$1.85 for 1000 steps on 15 images
- **Model version used:** `e5a5bc821112c107e6ddb8491c5b898f94d06eaca861d1dbf37b29cd69ba8988`
- **Hardware:** 8x Nvidia H100 GPU @ $0.0122/sec

### F. Create Model Page (`https://replicate.com/create`)
- Model creation flow is available and working.
- Options observed:
  - Model name field
  - Visibility: `Public` or `Private`
  - Path options include custom model push or image-model fine-tuning flow
  - Hardware selector available in custom model path

### G. Deployments (`https://replicate.com/deployments`)
- Deployment area is accessible.
- `Create a new deployment` action is visible.
- Supports production controls:
  - version rollouts
  - autoscaling / scale-to-zero
  - always-on instances
  - hardware selection
  - monitoring instance/prediction flow

### H. Webhooks (`https://replicate.com/webhooks`)
- Webhooks page is accessible.
- No webhook activity currently.
- Documentation link for webhook setup is visible.

---

## 2) Current project readiness for Replicate integration

### Already done in our app
- `REPLICATE_API_TOKEN` is present in env validation (`frontend/lib/env.ts`).
- System health endpoint includes replicate readiness:
  - `frontend/app/api/system/health/route.ts`
- Health currently reports Replicate configured and healthy.

### Training dataset — CLEANED and confirmed for Phase 1
- **Original**: 18 images; **3 removed** (grayscale alpha-mask artifacts from PDF extraction)
- **Final clean dataset**: 15 high-quality color JPGs in `jersey-assets/lora-training-set/`
- **New zip rebuilt**: `jersey-assets/coritiba_jersey_lora_training.zip` (2.3 MB, 15 files)
- Image breakdown:

| File | Dimensions | Size | Notes |
|------|-----------|------|-------|
| coritiba_jersey_model_1..9 | 1080x1350 | 150–216K | Product/lifestyle model shots |
| coritiba_jersey_full_body_1..3 | 816x1920+ | 125–167K | Full body poses |
| coritiba_jersey_detail_1,3 | 779x1162 | 83–90K | Close-up detail shots |
| coritiba_jersey_studio_1 | 858x1080 | 90K | Studio clean shot |

- **Removed** (grayscale/alpha masks — 256 unique colors only): `detail_2`, `detail_4`, `studio_2`

---

## 3) Phase 1 — EXECUTED: Train Coritiba Jersey LoRA on Replicate

### What was done

1. **Dataset cleaned:**
   - Removed 3 grayscale alpha-mask images (`detail_2`, `detail_4`, `studio_2`)
   - Final clean set: 15 high-quality color JPGs
   - Rebuilt clean zip: `jersey-assets/coritiba_jersey_lora_training.zip` (2.3 MB)

2. **Model selection research:**
   - Chose `replicate/fast-flux-trainer` (official, updated 2 weeks ago) over `ostris/flux-dev-lora-trainer`
   - Reason: faster, official Replicate support, 8x H100 hardware, ~$1.85/run, autocaptioning built in

3. **Destination model created:**
   - `abhishek9302/coritiba-jersey-lora` (private)
   - Created via `https://replicate.com/create` with "Fine tune an image model with Flux H100 GPU" option

4. **Training dataset uploaded:**
   - Used Replicate Files API (`POST /v1/files`) to upload zip
   - File ID: `ZTU1OWIwMTYtYmZiNS00OWU4LWFkZjYtMDQ5YzFmM2FiODcx.zip`

5. **Training started via API:**
   ```bash
   curl -X POST \
     -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "destination": "abhishek9302/coritiba-jersey-lora",
       "input": {
         "input_images": "https://api.replicate.com/v1/files/ZTU1OWIwMTYtYmZiNS00OWU4LWFkZjYtMDQ5YzFmM2FiODcx.zip",
         "trigger_word": "coritiba_jersey",
         "lora_type": "subject",
         "training_steps": 1000,
         "autocaption": true
       }
     }' \
     https://api.replicate.com/v1/models/replicate/fast-flux-trainer/versions/e5a5bc821112c107e6ddb8491c5b898f94d06eaca861d1dbf37b29cd69ba8988/trainings
   ```

### Training details

| Parameter | Value |
|-----------|-------|
| Training ID | `ddhg24v8fnrmy0cyd0fbr8cz84` |
| Model | `replicate/fast-flux-trainer` |
| Version | `56cb4a6447e586e40c6834a7a48b649336ade35325479817ada41cd3d8dcc175` |
| Destination | `abhishek9302/coritiba-jersey-lora` |
| Trigger word | `coritiba_jersey` |
| Training steps | `1000` |
| LoRA type | `subject` |
| Autocaption | `true` |
| Started at | `2026-05-27T06:28:03.837Z` |
| Status | `processing` (monitoring) |
| Hardware | 8x Nvidia H100 GPU @ $0.0122/sec |
| Expected cost | ~$1.85 |
| Expected time | ~15–20 min |
| Monitor URL | https://replicate.com/p/ddhg24v8fnrmy0cyd0fbr8cz84 |

### ⏳ Awaiting completion...

When training completes:
- Record: output model version hash
- Record: actual duration + cost
- Test with prompts in Phase 2

---

## Phase 1 Deliverable (pending)

- [ ] Training status: `succeeded`
- [ ] Output version hash: TBD
- [ ] Duration: TBD
- [ ] Cost: TBD
- [ ] Testable via: `https://replicate.com/abhishek9302/coritiba-jersey-lora`

---

## Phase 2 — Validate model quality before app wiring

1. Run 10-15 controlled prompts including:
   - logo placement requests
   - stadium/night scenes
   - lifestyle shots
   - detail close-ups
2. Score outputs on:
   - jersey identity consistency
   - sponsor area placement quality
   - artifact rate
   - prompt adherence
3. If weak:
   - run second training with improved dataset or step adjustments.

Deliverable of Phase 2:
- Selected production model version hash + prompt playbook.

---

## Phase 3 — Integrate Replicate into application backend

1. Create new server utility:
   - `frontend/lib/replicate/client.ts`
   - Functions:
     - `startPrediction(input)`
     - `getPrediction(id)`
     - optional `waitForPrediction(id)` with timeout/retries
2. Add feature API endpoint:
   - Example: `frontend/app/api/media/replicate/route.ts`
   - Input:
     - prompt
     - image references (if needed)
     - style mode / sponsor placement mode
   - Output:
     - prediction id
     - final image URL(s)
     - status/error metadata
3. Keep OpenAI/DALL-E fallback path intact until Replicate path is stable.
4. Add structured logging + error taxonomy:
   - auth failures
   - insufficient credit
   - model version missing
   - timeout
   - invalid inputs

Deliverable of Phase 3:
- Working backend Replicate generation endpoint with robust error handling.

---

## Phase 4 — Wire UI flow for operators

1. Update existing media/mockup UI to allow provider selection:
   - `Replicate (Jersey)` vs existing provider fallback.
2. Add progress states:
   - queued
   - running
   - succeeded
   - failed
3. Persist outputs and metadata to existing proposal/media records.
4. Add retry and regeneration controls.

Deliverable of Phase 4:
- End-to-end operator workflow from proposal to generated jersey visuals.

---

## Phase 5 — Production hardening

1. Add cost/usage controls:
   - per-user daily cap
   - per-proposal cap
   - monthly threshold alerts
2. Add webhook handling (optional, recommended for async reliability):
   - configure Replicate webhook endpoint in app
   - verify signatures
3. Add monitoring:
   - success rate
   - latency percentiles
   - failures by type
   - spend over time
4. Add runbook fallback:
   - if Replicate unavailable, route to current image provider with warning.

Deliverable of Phase 5:
- Reliable, cost-controlled production path.

---

## 4) Concrete test plan for implementation day

1. **Smoke test**
   - single prompt call through API route
   - expect URL output + DB persistence
2. **Consistency test**
   - 5 repeated prompts with trigger word
   - verify jersey identity stability
3. **Load test**
   - 10 queued generations
   - verify no deadlocks/timeouts
4. **Fallback test**
   - force Replicate failure and verify alternate provider path
5. **UX test**
   - operator can regenerate, review, and attach to proposal

---

## 5) Risks + mitigations

| Risk | Mitigation |
|------|------------|
| Insufficient credits | Enable auto-reload; add app-level spend guardrails |
| Inconsistent outputs | Prompt templates + second training pass + curated references |
| Latency spikes | Async polling/webhooks + frontend progress states |
| Model version drift | Pin explicit model version hash in backend config |
| Silent failures | Structured logs + health checks + retry queue |

---

## 6) Next action (after training completes)

Phase 1 training is running. Once `succeeded`:

1. Record output version hash from training result
2. Test the trained model with 5 controlled prompts (Phase 2):
   - `a person wearing coritiba_jersey green football kit with sponsor logo, product photo`
   - `coritiba_jersey football shirt floating on white background, studio light`
   - `coritiba_jersey worn by athlete running in stadium, broadcast angle`
3. If outputs are clean → proceed to Phase 3 (app wiring)
4. If outputs are weak → re-train with adjusted steps (1500) or curated captions

Training is live at: https://replicate.com/p/ddhg24v8fnrmy0cyd0fbr8cz84

