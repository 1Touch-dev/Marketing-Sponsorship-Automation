# Sprint: 16th July 2026
**Branch:** `26-july-sprint`
**Focus:** (1) Finalize the simplified image-generation pipeline, then (2) build James's four new feature requests from 15 July.

---

## Context — James's messages (15 July 2026)

> **[08:31] James:** Can we make presentations editable. Potentially have templates per industry. Save pages or templates to reuse. And create and place images; and leave placeholders for images that need to be generated for each presentation to be personalized.
>
> **[09:50] James:** Also; when we add a [product] item; we need to add a flow to automatically scrape and add competitors or companies that sell or manufacture that product in the city, state, or nationally. And automatically scrape their info.
>
> **[09:51] James:** In email we need to develop multiple flows — to negotiate, then barter and use sponsorship inventory to discount; or outreach/introduction flow; follow-up flow; etc.
>
> **[09:51] James:** Saw we have that but maybe we organize a bit better.
>
> **[09:51] James:** And make it easy to assign a certain flow to an email in our system.

Plus the earlier **image generation** thread ("flat / no body form") → resolved via the simplified gpt-image-2 pipeline.

---

## ✅ DONE TODAY (16 July 2026)

### PART 0 — Image generation (finalized & shipped)
The over-engineered pipeline (QA loops, retries, correction prompts, hybrid routing, quality scoring, SSIM checks, OpenAI vision review) was fully removed. Final flow is **one request, one result**:

- **Flow:** upload logo → preprocess logo (background removal only if solid bg, upscale small logos) → load original base image (unchanged) → send **both images** to OpenAI Images Edit → **one** concise prompt per placement → return PNG.
- **Model:** `gpt-image-2` for **all** generations (jersey, stadium, campaign), `quality: high` (jersey) / `medium` (stadium+campaign, for speed), PNG output, portrait/landscape sizing.
- **Prompts:** simple, pure — "add exactly one logo, blend into fabric/surface, disturb nothing else (crest, manufacturer, existing sponsors, background, lighting all preserved)". No coordinates/geometry.
- **Jersey:** 8 placement zones; per-kit / per-placement **real** base photos; Flat Kit switched from a drawing to a real full-body photo.
- **Custom base upload:** users can upload their own jersey/stadium base image (SSRF-safe fetch), logo applied to it; all zones selectable on custom base.
- **Base downscaling (`boundBaseImage`)** — long edge bounded to 1536px → fixed the "Costas" timeout.
- **Stadium LED** prompts anchored to the real advertising board; quality dropped to `medium` → ~48s (was ~148s and appeared to "not work").
- **Stop button + AbortController** on jersey mockup to cancel a running generation.
- **Single active logo** — uploading a new logo overrides the previous one; per-asset **delete** button; "Active" badge. Applies to jersey/stadium/campaign.

### PART 1 — Presentations (James ask #1)
- [x] **Industry-tagged templates** — activated the (previously unused) `proposal_templates` table with `industry`, `preset_id`, `use_count` (migration **0039**).
- [x] **"Salvar como template"** button in the proposal CMS editor — snapshots the current proposal's pages + industry into a reusable template (`POST /api/proposal-templates` with `from_proposal_id`).
- [x] **Presentation Templates page** (`/settings/proposal-templates`) — list, **filter by industry**, view page + image-slot counts, delete. Sidebar entry added.
- [x] **Image placeholders** — templates carry an `image_placeholders` array; the proposal landing page now shows **admin-only "generate this visual" placeholder cards** (jersey / stadium / campaign) when a proposal has no images yet. Hidden on the public/shared view.
- [x] API: `GET/POST /api/proposal-templates`, `GET/DELETE /api/proposal-templates/[id]` (apply increments `use_count`). Defensive against missing 0039 columns.

### PART 2 — Product / seller discovery (James ask #2)
- [x] **`POST /api/intelligence/product-discovery`** — enter a product/goods type → Apify Google SERP scraping + Claude classification across **local (Curitiba) / state (Paraná) / national (Brasil)** tiers → identifies sellers/manufacturers/distributors, scores **sponsorship fit** + **barter potential**, and can **auto-save** the best as prospect `companies` (deduped).
- [x] **Product Discovery page** (`/product-discovery`) — product input, tier toggles, auto-save toggle, tiered results with fit/barter badges. Sidebar entry added (Intelligence group).
- [x] Reuses existing intelligence primitives (`batchSearchGoogle`, `invokeClaude`); never surfaces football clubs as prospects.

### PART 3 + 4 — Email flows + assignment (James asks #3 & #4)
Kept the existing **draft + Pipedrive-logging** model; layered flows on top.
- [x] **Flow types**: `intro` / `follow_up` / **`negotiation`** / **`barter`** — each with a dedicated AI prompt builder (`negotiationEmailPrompt`, `barterEmailPrompt`) and a seeded PT-BR template.
- [x] **Flow picker** on the proposal email-generation panel (`/proposals/[id]` → Draft outreach email).
- [x] **Multi-step sequences** — `email_sequences` (ordered steps: flow + optional template + delay days) and `email_sequence_enrollments` (per-company progress + `next_run_at`) tables (migration **0038**). Seeded a default 3-step flow: Introdução → Follow-up → Negociação.
- [x] **Sequences API**: `GET/POST /api/email-sequences`, `PATCH/DELETE /api/email-sequences/[id]`, `POST /api/email-sequences/enroll` (assign to a company, stored on `companies.default_email_flow`), `POST /api/email-sequences/advance` (scheduler stub — generates the current step's draft and schedules the next).
- [x] **Email Flows page** (`/settings/email-flows`) — build/edit/delete sequences (flow + template + delay per step), "Run due steps" button, migration-pending banner. Sidebar entry added.
- [x] **Flow-aware generation** — `/api/emails/generate` accepts `flow_type` + `template_id`; `loadEmailTemplateForFlow()` picks the right template; email row records `flow_type`. Defensive if 0038 not applied.

### Verification
- [x] `tsc --noEmit` clean.
- [x] `npm run build` clean — all new routes compiled (`/product-discovery`, `/settings/email-flows`, `/settings/proposal-templates`).
- [x] `pm2 restart all` — both processes online.
- [x] Migration **0038** applied by James and verified live (sequences seeded, tables present, negotiation/barter templates present).

---

## ⚠️ PENDING / NEXT

1. **Run migration `0039_proposal_templates_industry.sql`** in the Supabase SQL Editor — enables industry filter + use-count on presentation templates. App works without it (shows a banner + drops the columns defensively).
2. **James to test** everything below — none of today's work has been tested by James yet:
   - Image generation (jersey / stadium / campaign) — the core "flat mockup" complaint fix.
   - Presentation templates + save-as-template + image placeholders.
   - Product discovery.
   - Email flows + flow picker + enrollment.
3. **Email sending** — flows still draft + log to Pipedrive; no live SMTP send. Scheduler runs on demand / via webhook; **no cron wired** yet.
4. **Training-kit / GK rear photos** — back/shorts/socks stay disabled for kits lacking real photos until James supplies them (custom-base upload works in the meantime).
5. **Stop button** — implemented on jersey; add to stadium + campaign panels for consistency.
6. **"Apply template" into the new-proposal wizard** — templates can be saved + browsed today; wiring a saved template as a pre-fill into the AI wizard is a follow-up (kept the wizard untouched to avoid risk).

---

## Migrations
| File | Status | Description |
|------|--------|-------------|
| `0038_email_flows.sql` | ✅ Applied (16 Jul) | flow_type on email_templates/emails, default_email_flow on companies, email_sequences + email_sequence_enrollments, seeds |
| `0039_proposal_templates_industry.sql` | ⚠️ Pending — run manually | industry / preset_id / use_count on proposal_templates + index |

---

## Key files touched
- **Image:** `lib/media/image-prompts.ts`, `lib/media/jersey-placement-prompts.ts`, `lib/media/jersey-composite.ts`, `lib/media/stadium-composite.ts`, `lib/media/image-assets.ts`, `lib/media/logo-preprocessing.ts`, `components/proposals/official-jersey-mockup.tsx`, `app/api/proposals/[id]/upload-asset/route.ts`, `components/proposals/asset-uploader.tsx`
- **Presentations:** `app/api/proposal-templates/route.ts`, `app/api/proposal-templates/[id]/route.ts`, `app/settings/proposal-templates/*`, `components/proposals/save-as-template-button.tsx`, `components/proposals/proposal-cms-editor.tsx`, `components/proposals/proposal-landing-page.tsx`
- **Discovery:** `app/api/intelligence/product-discovery/route.ts`, `app/product-discovery/*`
- **Email flows:** `app/api/email-sequences/*`, `app/api/emails/generate/route.ts`, `lib/email/template-engine.ts`, `lib/bedrock/prompts.ts`, `lib/validators.ts`, `app/settings/email-flows/*`, `app/proposals/[id]/generate-email-panel.tsx`
- **Shared:** `components/shared/sidebar.tsx` (Product Discovery, Email Flows, Presentation Templates)
- **Migrations:** `supabase/migrations/0038_email_flows.sql`, `supabase/migrations/0039_proposal_templates_industry.sql`
