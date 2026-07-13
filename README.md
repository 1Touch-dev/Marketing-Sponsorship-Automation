# Coritiba FC — Sponsorship Automation Platform

AI-powered commercial sponsorship platform for Coritiba FC. Stack: **Next.js 14 (App Router)**, **Supabase (PostgreSQL + Storage)**, **AWS Bedrock (Claude Sonnet 4)**, **Pipedrive CRM**, **Hunter.io**, **Apollo.io**, **Apify**, **Replicate LoRA**, **OpenAI (gpt-image-1)**, **PM2**, **ngrok**.

**Production URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Active Branch:** `26-july-sprint`  
**Last Updated:** 13 July 2026  
**Platform Health:** ✅ 100% — All bugs + all 17 feature requests complete. Image generation pending James's confirmation.

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
| Company list | `/companies` | 536+ companies, search + 5 filters (industry/status/size/pipeline/country), Export CSV |
| Company detail | `/companies/[id]` | Full profile, AI intelligence, contacts, proposals, Sponsorship Fit Score, Run Outreach Agent |
| Sponsorship Fit Score | Company detail sidebar | AI-scored 1-10 with rationale, color-coded badge |
| Contacts Save | Company detail → Contacts | Save contacts per row or bulk Save All; Saved ✓ badge |
| Add Competitors to CRM | Company detail → Competitors | Add button with duplicate check; bulk Add All |
| Inline industry edit | Company detail | Click-to-edit dropdown, no page reload |
| Pipedrive sync | `/system` + auto | PipedriveStatusCard shows API token health, queue, Sync Now button |

### Proposals
| Feature | Route | Description |
|---------|-------|-------------|
| Proposals list | `/proposals` | All proposals, filter by date/status/logo, Export CSV |
| Create proposal | `/proposals/new` | 7-type wizard — auto-selects package counterparts, Select All/Deselect All per category |
| Proposal detail | `/proposals/[id]` | WhatsApp share (Day 3/Day 7 templates), A/B test panel, Version history |
| 8-page PDF deck | `/proposals/[id]/deck` | Full-screen A4 preview, no sidebar, Print/Save PDF button, dynamic content per asset type |
| Bulk proposals | `/proposals/bulk` | 3-step: select companies → configure → Tinder review queue |
| Public share link | `/proposals/view/[token]` | Full sponsor landing page, lead capture, sticky CTA, view tracking |

### Approvals
| Feature | Route | Description |
|---------|-------|-------------|
| Tinder card view | `/approvals` | Drag/swipe or keyboard: → Approve, ← Reject, E Edit |
| Queue tabs | `/approvals` | All (167) / Proposals / Campaigns / Emails |
| List view | Toggle button | Switch between card and list mode |

### Email & Outreach
| Feature | Route | Description |
|---------|-------|-------------|
| Email generation | Via proposal flow | Bedrock-personalized, team sender auto-selected |
| Placeholder validation | Pre-send | Blocks send if `[Nome]`, `{{variable}}` etc. unresolved |
| Sender profiles | `/settings/sender-profiles` | Team members as email senders |
| Newsletter config | `/settings/newsletter` | Schedule, template builder, industry segments, analytics |

### Campaigns
| Feature | Route | Description |
|---------|-------|-------------|
| Bulk campaigns | `/campaigns/bulk` | Portuguese industry labels, generate for multiple companies |
| Campaign list | `/campaigns` | All campaigns with AI badge, company, status |

### Image Generation & Media
| Feature | Route | Description |
|---------|-------|-------------|
| Jersey mockup | Proposal → Graphics | sharp composite on official CFC kit; 7 placement zones; background removal |
| Stadium mockup | Proposal → Graphics | Replicate Flux-fill inpainting on 5 real Couto Pereira photos; history gallery on load |
| AI campaign creatives | Proposal → Graphics | gpt-image-1, prompt review modal, approve/reject results |
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
│   └── OpenAI gpt-image-1 · 1536×1024 (16:9)
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
[Run Agent] on /companies/[id]
   │
   ▼
1. enrich_contacts        — Hunter.io + Apollo.io, save with Save/Save All buttons
2. scrape_intelligence    — Apify LinkedIn/web signals
3. generate_proposal      — Bedrock Claude Sonnet 4 ⏸ APPROVAL GATE
4. generate_email         — Bedrock personalization, sender profile auto-selected ⏸ APPROVAL GATE
5. send_email             — Gmail OAuth send + Pipedrive activity log
```

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

---

## Supabase Migrations Applied

| File | Date | Description |
|------|------|-------------|
| `0036_inventory_period_qty_responsible.sql` | 13 Jul 2026 | period, quantity, responsible on inventory_items |
| `0037_26july_sprint.sql` | 13 Jul 2026 | sponsorship_fit_score, sender_profile_id, ab_test_config, newsletter_segments, contacts, renewed_from_contract_id, pdf_url |

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=
OPENAI_API_KEY=                    # gpt-image-1 image generation
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
BEDROCK_MODEL_ID=
APOLLO_API_KEY=                    # Updated 13 July 2026
APIFY_API_TOKEN=
SERPAPI_KEY=
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

1. **Image generation strategy** — awaiting James's confirmation on jersey (real photo vs LoRA) and stadium quality approach
2. **LoRA retraining** — 2026 kit training data organized and ready; awaiting James's go-ahead
3. **Pipedrive live key** — `PIPEDRIVE_API_KEY` set in .env; test with real pipeline data when ready
4. **Pipeline drag-drop** — stage change currently via company edit form; drag-drop not implemented

---

*Sprint logs: `13th_July.md` · `26th_july.md` · `26th_june.md` · `MASTER_TASK_LIST.md`*
