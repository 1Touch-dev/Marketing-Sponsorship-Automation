# Coritiba FC — Sponsorship Automation Platform

AI-powered commercial sponsorship platform for Coritiba FC. Stack: **Next.js 14 (App Router)**, **Supabase (PostgreSQL + Storage)**, **AWS Bedrock (Claude Sonnet 4)**, **Pipedrive CRM**, **Hunter.io**, **Apollo.io**, **Apify**, **Replicate LoRA**, **OpenAI (gpt-image-2)**, **PM2**, **ngrok**.

**Production URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Active Branch:** `17-july-sprint`  
**Last Updated:** 17 July 2026  
**Platform Health:** ✅ Image generation pipeline (jersey/stadium/campaign) simplified to a single gpt-image-2 pass and shipped. James's 4 new asks (editable presentations + industry templates, product/seller discovery, multi-flow email sequences, flow assignment) built and live. Automatic logo scraping (E), pre-approved-campaign batch outreach (D), and HTML presentation templates with bulk auto-customize (C) all shipped and live. Three bugs James found while self-testing (AI Campaign Creative training scene, Jersey Mockup black output, PDF Deck missing visuals/logo) — all fixed and verified same day.

---

## Quick Start

```bash
cd frontend
npm install
cp .env.local.example .env.local    # fill in Supabase, OpenAI, Bedrock, Pipedrive, Apollo keys
npm run dev                          # http://localhost:3000

# Production (PM2)
npm run build
pm2 start ecosystem.config.cjs       # starts Next.js + ngrok tunnel
pm2 save                             # survive reboots
```

---

## Feature Set

### CRM & Companies
| Feature | Route | Description |
|---------|-------|-------------|
| Company list | `/companies` | 536+ companies, search + 5 filters (industry/status/size/pipeline/country), Export CSV, logo thumbnails, "Fetch logos (N)" bulk action |
| Company detail | `/companies/[id]` | Full profile, AI intelligence, contacts, proposals, Sponsorship Fit Score, Run Outreach Agent, Re-fetch Logo |
| Sponsorship Fit Score | Company detail sidebar | AI-scored 1-10 with rationale, color-coded badge |
| Contacts Save | Company detail → Contacts | Save contacts per row or bulk Save All; Saved ✓ badge |
| Add Competitors to CRM | Company detail → Competitors | Add button with duplicate check; bulk Add All |
| Inline industry edit | Company detail | Click-to-edit dropdown, no page reload |
| Pipedrive sync | `/system` + auto | PipedriveStatusCard shows API token health, queue, Sync Now button |
| Automatic logo scraping | On create / bulk import / Product Discovery save | `logo-enrichment.ts` resolver (logo.dev → Apollo org enrichment → Google favicon, each HEAD-validated) fires automatically — no manual step needed. Uploaded logo always overrides scraped logo. Bulk "Fetch logos" endpoint + button for existing companies. |

### Intelligence & Discovery
| Feature | Route | Description |
|---------|-------|-------------|
| Product / seller discovery | `/product-discovery` | Enter a product/goods type → scrapes + AI-classifies companies that sell or manufacture it across city / state / national tiers, scores sponsorship fit + barter potential, and can auto-save the best as prospect companies (auto-scrapes their logo too). |
| Coritiba intelligence | `/coritiba-intelligence` | Club-side commercial intelligence |

### Proposals
| Feature | Route | Description |
|---------|-------|-------------|
| Proposals list | `/proposals` | All proposals, filter by date/status/logo, Export CSV |
| Create proposal | `/proposals/new` | 7-type wizard — auto-selects package counterparts, Select All/Deselect All per category |
| Proposal detail | `/proposals/[id]` | WhatsApp share (Day 3/Day 7 templates), A/B test panel, Version history |
| 8-page PDF deck | `/proposals/[id]/deck` | Full-screen A4 preview, no sidebar, Print/Save PDF button, dynamic content per asset type |
| Bulk proposals | `/proposals/bulk` | 3-step: select companies → configure → Tinder review queue |
| Public share link | `/proposals/view/[token]` | Full sponsor landing page, lead capture, sticky CTA, view tracking |
| Presentation templates | `/settings/proposal-templates` | Industry-tagged reusable templates. "Salvar como template" on any proposal snapshots its pages + image placeholders for reuse. Filter by industry. **New:** upload an HTML template with `[[TOKEN]]`/`[[IMG:KEY]]` placeholders (`/settings/proposal-templates/[id]`), configure each image placeholder's type/placement/prompt/logo source, render it for one company or bulk-render across a filtered list with live per-company progress. |
| Image placeholders | Proposal landing (admin) | When a proposal has no visuals yet, admin view shows "generate this visual" placeholder cards (jersey / stadium / campaign). Hidden on the public/shared view. |
| 8-page PDF deck — visuals | `/proposals/[id]/deck` | "Visuais da Campanha" page now renders the proposal's actual approved jersey/stadium/campaign mockups (deduplicated to latest per placement, up to 6) instead of static placeholders; Coritiba crest shown on cover + club profile pages alongside the sponsor's own logo. |

### Approvals
| Feature | Route | Description |
|---------|-------|-------------|
| Tinder card view | `/approvals` | Drag/swipe or keyboard: → Approve, ← Reject, E Edit |
| Queue tabs | `/approvals` | All (167) / Proposals / Campaigns / Emails |
| List view | Toggle button | Switch between card and list mode |

### Email & Outreach
| Feature | Route | Description |
|---------|-------|-------------|
| Email generation | Via proposal flow | Bedrock-personalized, team sender auto-selected. **Flow picker**: intro / follow-up / negotiation / barter. |
| Email flows (sequences) | `/settings/email-flows` | Build reusable multi-step flows (intro → follow-up → negotiation/barter) with per-step template + delay. Enroll a company, "Run due steps" scheduler. Keeps draft + Pipedrive-logging model. |
| Negotiation & barter emails | Via flow picker | Dedicated AI prompts + PT-BR templates — flex scope/price, or propose permuta using sponsorship inventory. |
| Placeholder validation | Pre-send | Blocks send if `[Nome]`, `{{variable}}` etc. unresolved |
| Sender profiles | `/settings/sender-profiles` | Team members as email senders |
| Email templates | `/settings/email-templates` | CRUD with `{{variable}}` and `[Bracket]` support, now `flow_type`-tagged |
| Newsletter config | `/settings/newsletter` | Schedule, template builder, industry segments, analytics |

### Campaigns
| Feature | Route | Description |
|---------|-------|-------------|
| Bulk campaigns | `/campaigns/bulk` | Portuguese industry labels, generate for multiple companies |
| Campaign list | `/campaigns` | All campaigns with AI badge, company, status |
| Pre-approved campaigns | `/campaigns/[id]` | "Pre-approve" toggle marks a campaign for auto-run mode — the Outreach Agent skips the manual proposal-approval pause for companies run under it. |
| Outreach batch runner | `/campaigns/[id]/batch` | Guarded to pre-approved campaigns. Search/filter companies, multi-select, launch a bounded-concurrency batch of Outreach Agent runs, live-poll per-company status (queued/running/proposal-drafted/email-drafted/failed) with quick links to each generated proposal/email. |

### Image Generation & Media
| Feature | Route | Description |
|---------|-------|-------------|
| Jersey mockup | Proposal → Graphics | **gpt-image-2** single-pass edit: base jersey photo + sponsor logo → one prompt per placement (8 zones). Per-kit/per-placement real base photos. Optional custom base upload. Stop button. Auto-retries up to 3× on OpenAI's intermittent black-frame output before surfacing an error. |
| Stadium mockup | Proposal → Graphics | **gpt-image-2** single-pass edit on real Couto Pereira photos (LED boards, facade, perimeter). `quality: medium` for speed. Optional custom base upload. Same black-frame retry safeguard. |
| AI campaign creatives | Proposal → Graphics | **gpt-image-2**, one prompt, single result, 3 scene types (Matchday Street / Training Ground / Fan Lifestyle). Approve/reject. Prompt now adds a background sponsor surface (banner/billboard/sign) when the source photo has none, instead of defaulting to a near-invisible logo stamp — fixes a bug where the Training Ground scene looked identical to the uploaded source photo. Never places the logo on a person's clothing/kit/body. |
| Single active logo | Proposal → Brand assets | Uploading a new logo overrides the previous one; delete button per asset; "Active" badge. Applies to jersey/stadium/campaign. |
| Base image downscaling | Backend | Long edge bounded to 1536px before sending to OpenAI to avoid timeouts. |
| Degenerate-output retry | Backend (`openai-image-pipeline.ts`) | OpenAI's `gpt-image-2` occasionally returns a fully black frame with a 200 OK (~1-in-15, provider-side). Pixel-brightness/variance check detects this and silently retries up to 3×; only a persistent failure reaches the user. |
| Mockup editor | `/mockup-editor` | 9 templates: Jersey, LED Board, Social 1:1, Press Backdrop, Scoreboard, OOH Billboard, Digital Banner, Social Story; Attach to Proposal |

### Contracts
| Feature | Route | Description |
|---------|-------|-------------|
| Contracts list | `/contracts` | Expiry alert banner (red/amber/yellow), Renovar button per row |
| Revenue tracking | Dashboard + Reports | Total active revenue, pipeline value, avg deal size |

### Reports & Analytics
| Feature | Route | Description |
|---------|-------|-------------|
| Revenue vs Target | `/reports` | Progress bar vs R$2M annual target |
| Win Rate | `/reports` | Won / closed proposals % |
| Proposals by Month | `/reports` | 6-month bar chart |
| Revenue by Deal Type | `/reports` | Horizontal breakdown |
| Active sponsors | `/reports` | Cards with monthly report generation |
| CSV exports | `/reports` | Companies, Proposals, Contracts, Revenue, Emails |

### Dashboard KPIs
| Tile | Description |
|------|-------------|
| Total Active Revenue | From signed contracts |
| Pipeline Value | Approved + under review packages |
| Avg Deal Size | Per active contract |
| Active Companies | 536+ |
| Proposals | 126, with 16 needing review |
| Campaigns | 163 AI-generated |
| Pending Approvals | 16 action required |
| System Status | All healthy |

### Settings & Admin
| Feature | Route | Description |
|---------|-------|-------------|
| System health | `/system` | Service status, environment variables, PipedriveStatusCard, maintenance actions |
| Newsletter | `/settings/newsletter` | Full newsletter pipeline config |
| Email templates | `/settings/email-templates` | CRUD with `{{variable}}` and `[Bracket]` support |
| Sender profiles | `/settings/sender-profiles` | Team email senders |
| Team & Roles | `/settings/team` | RBAC — admin/sales_rep/approver/viewer |

### UI / UX
| Feature | Description |
|---------|-------------|
| PT/EN toggle | Bottom of sidebar — active language highlighted, all nav labels translate |
| Sidebar collapse | Icon-only mode |
| Breadcrumbs | Dynamic on all pages |
| Responsive | Mobile nav bar, flex-wrap action bars |
| Dark mode | Tailwind dark: classes throughout |

---

## Graphics Architecture

```
Proposal > Visuais / Graphics
├── 👕 Jersey Mockup
│   └── sharp composite on coritiba-jersey-2026-clean.jpg
│   └── 7 placement zones, background removal from sponsor logo
│   └── Official Coritiba badge locked (from Wikimedia SVG)
│
├── 🏟️ Stadium Mockup
│   └── Replicate Flux-fill-dev inpainting on 5 real Couto Pereira photos
│   └── History loaded on mount — previous placements shown as gallery
│
├── ✨ AI Campaign Creatives
│   └── OpenAI gpt-image-2 · 1536×1024 (16:9)
│   └── Prompt review modal before generation
│   └── Approve/Reject/Download results grid
│
└── 🖼️ Mockup Editor (/mockup-editor)
    └── 9 templates across 5 categories: Jersey, Stadium, Social, Digital, Print
    └── Attach to Proposal panel
    └── Export PNG 2x
```

---

## Outreach Agent Pipeline

```
[Run Agent] on /companies/[id]  — OR —  [Launch Batch] on /campaigns/[id]/batch (pre-approved campaigns only)
   │
   ▼
1. enrich_contacts        — Hunter.io + Apollo.io, save with Save/Save All buttons
2. scrape_intelligence    — Apify LinkedIn/web signals
3. generate_proposal      — Bedrock Claude Sonnet 4 ⏸ APPROVAL GATE (skipped when campaign is pre-approved — auto-approves and continues)
4. generate_email         — Bedrock personalization, sender profile auto-selected ⏸ APPROVAL GATE
5. send_email             — Gmail OAuth send + Pipedrive activity log (send itself still not live — see Known Pending Items)
```

Batch mode (`POST /api/agents/outreach/batch`) runs steps 1–4 across a list of companies with bounded concurrency, tracked in `agent_batch_runs`; `GET /api/agents/outreach/batch/[batchId]` polls overall + per-company progress. Only available once a campaign is marked pre-approved (`/campaigns/[id]` → Pre-approve toggle).

---

## Database Schema (key tables)

| Table | Description |
|-------|-------------|
| `companies` | 536+ prospect/competitor companies with `sponsorship_fit_score` |
| `proposals` | Sponsorship proposals with versioning + `ab_test_config` |
| `proposal_versions` | Snapshot history |
| `campaigns` | AI-generated marketing campaigns |
| `emails` | Outreach emails with tracking + `sender_profile_id` |
| `contracts` | Signed contracts with `renewed_from_contract_id`, `pdf_url` |
| `sender_profiles` | Team email senders |
| `contacts` | Saved contacts from Hunter/Apollo |
| `newsletter_segments` | Newsletter target segments |
| `inventory_items` | Sponsorship catalog with `period`, `quantity`, `responsible` |
| `audit_logs` | Full activity log |
| `image_generation_jobs` | AI image queue |
| `company_logos` | Best-effort audit trail of resolved/fetched company logos (source, fetched_at) |
| `agent_batch_runs` | Tracks a batch of Outreach Agent runs launched together (counts, status) |
| `agent_runs` | Individual Outreach Agent runs; `batch_id` links back to a batch when launched from the batch runner |
| `template_renders` | Per-company render status/result for HTML presentation templates |

---

## Supabase Migrations Applied

| File | Date | Description |
|------|------|-------------|
| `0036_inventory_period_qty_responsible.sql` | 13 Jul 2026 | period, quantity, responsible on inventory_items |
| `0037_26july_sprint.sql` | 13 Jul 2026 | sponsorship_fit_score, sender_profile_id, ab_test_config, newsletter_segments, contacts, renewed_from_contract_id, pdf_url |
| `0038_email_flows.sql` | 16 Jul 2026 | ✅ Applied. `flow_type` on email_templates/emails, `default_email_flow` on companies, `email_sequences` + `email_sequence_enrollments` tables, seeded default sequence + negotiation/barter templates |
| `0039_proposal_templates_industry.sql` | 16 Jul 2026 | ✅ Applied. `industry`, `preset_id`, `use_count` on proposal_templates + index. |
| `0040_agent_batch_runs.sql` | 17 Jul 2026 | ✅ Applied. `is_preapproved`/`preapproved_by`/`preapproved_at` on `campaigns`, new `agent_batch_runs` table, `batch_id` on `agent_runs`. |
| `0041_presentation_html_templates.sql` | 17 Jul 2026 | ✅ Applied. `source_type`/`html_storage_path`/`html_url`/`placeholder_config` on `proposal_templates`, new `template_renders` table. |

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=
OPENAI_API_KEY=                    # gpt-image-2 image generation
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
BEDROCK_MODEL_ID=
APOLLO_API_KEY=                    # Updated 13 July 2026
APIFY_API_TOKEN=
SERPAPI_KEY=
LOGO_DEV_TOKEN=                    # Company logo scraping (get a free key at https://logo.dev/signup) — falls back to Apollo + Google favicon if unset/expired
PIPEDRIVE_API_KEY=
NEXTAUTH_SECRET=
INTERNAL_API_SECRET=               # Secures /api/system/* endpoints
NEXT_PUBLIC_APP_URL=               # Canonical URL for share links
ANNUAL_REVENUE_TARGET=2000000      # Optional — defaults to R$2M
```

---

## PM2 Process Management

```bash
# Start everything
pm2 start ecosystem.config.cjs

# Check status
pm2 list

# Restart after code changes
pm2 restart sponsorship-platform

# Logs
pm2 logs sponsorship-platform --lines 50

# Save process list (survives reboots)
pm2 save
```

`ecosystem.config.cjs` runs:
- `sponsorship-platform` — `node_modules/.bin/next start` on port 3000
- `ngrok-tunnel` — exposes port 3000 at the production URL

---

## Known Pending Items

1. **Bug A — logout on button press** — reported by a team member; needs exact page/button + frequency from James to reproduce and fix. Not started.
2. **Item B — real email sending** — flows still use the draft + Pipedrive-logging model (no live SMTP send). Newsletter marks itself "sent" in the DB only. Needs James to authorize Gmail (one-time OAuth) or provide a Resend/SendGrid API key. Scheduler (`/api/email-sequences/advance`) runs on demand / via webhook; no cron wired yet.
3. **Fresh `logo.dev` token** — the previously hardcoded token now returns 401 (expired/revoked); resolver runs on Apollo + Google favicon in the meantime. Get a free key at https://logo.dev/signup and set `LOGO_DEV_TOKEN` to restore the highest-res logo tier.
4. **Presentations phase 2** — PowerPoint/Google Slides upload (HTML-first phase is done); export of a rendered template to a PDF/public share link (currently produces a stored HTML file + URL — reusing the existing proposal view/PDF path is the natural next step). Needs James to send a real sample HTML template to validate placeholder naming against actual usage.
5. **Outreach batch runner — needs real data** — built and E2E-tested by us; James still needs to pre-approve a real campaign and run a batch himself to confirm end-to-end on his own data. Live auto-send after the batch still waits on item B.
6. **James testing** — all of E (auto logo scraping), D (pre-approved batch outreach), and C (HTML templates + bulk auto-customize) are built, live, and self-tested by James on 17 July; three bugs he found in the process (AI Campaign Creative training scene, Jersey Mockup black output, PDF Deck missing visuals/logo) are fixed — awaiting his re-confirmation.
7. **Training-kit rear photos** — jersey back/shorts/socks for Training + GK rear remain disabled until real photos are supplied (custom-base upload works in the meantime).
8. **LoRA retraining** — 2026 kit training data organized; awaiting go-ahead (superseded for now by the gpt-image-2 pipeline).
9. **Pipeline drag-drop** — stage change via company edit form; drag-drop not implemented.

---

*Sprint logs: `17th_July.md` · `16th_July.md` · `14th_July.md` · `13th_July.md` · `26th_july.md` · `MASTER_TASK_LIST.md`*
