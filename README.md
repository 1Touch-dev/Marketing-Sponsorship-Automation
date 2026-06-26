# Coritiba FC — Sponsorship Automation Platform

AI-powered commercial sponsorship platform for Coritiba FC. Stack: **Next.js 14 (App Router)**, **Supabase (PostgreSQL + Storage)**, **AWS Bedrock (Claude Sonnet 4)**, **Pipedrive CRM**, **Hunter.io**, **Apollo.io**, **Apify**, **Replicate LoRA**, **OpenAI (gpt-image-1)**, **PM2**, **ngrok**.

**Production URL:** https://eligibly-facing-unloved.ngrok-free.dev  
**Branch:** `26th-june-sprint`  
**Last updated:** 26 June 2026  
**Platform health:** ✅ 9/10 — All audit items completed (see `26th_june.md`)

---

## Quick Start

```bash
cd frontend
npm install
cp .env.local.example .env.local    # fill in Supabase, OpenAI, Bedrock, Pipedrive keys
npm run dev                          # http://localhost:3000

# Production (PM2)
npm run build
pm2 start npm --name sponsorship-platform -- start
```

---

## Full Feature Set

### CRM & Companies
| Feature | Route | Description |
|---------|-------|-------------|
| Company list | `/companies` | 536+ companies, search, filter by industry/status/size/pipeline/country, Export CSV |
| Company detail | `/companies/[id]` | Full profile, edit, Outreach Agent, Hunter contacts, AI intelligence, proposals list |
| Add company | `/companies/new` | Full form, auto-enrichment via logo.dev, competitor tracking |
| Pipeline board | `/pipeline` | Kanban view by `pipeline_stage`, reads from `companies` table |
| Contacts | `/contacts` | Contact lookup, Hunter.io/Apollo.io discovery with Save buttons |
| Competitor tracking | Status: `competitor` | Red badge, filters on `/companies`, saved from Apify discovery |
| Inline industry edit | Company detail | Click-to-edit dropdown, no full form reload |
| Auto logo enrichment | On create / Re-fetch | `logo.dev` API auto-fetches logo on company creation |

### Proposals
| Feature | Route | Description |
|---------|-------|-------------|
| Proposals list | `/proposals` | All proposals, filters (date range, has_logo), Export CSV |
| Create proposal | `/proposals/new` | 7-type wizard (Patrocínio Puro, LdI, Bartering, Naming Rights, Social Impact, Digital-First, Other) |
| Proposal detail | `/proposals/[id]` | Full detail, action bar with Save Version / Ver Deck PDF / Convert to Contract / WhatsApp share |
| Edit proposal | `/proposals/[id]/edit` | All fields incl. `expires_at`, `meeting_link` (Calendly/Cal.com) |
| Proposal versioning | Save Version button | Snapshots proposal to `proposal_versions`, bumps version number |
| 8-page PDF deck | `/proposals/[id]/deck` | Printable A4 deck: cover, club profile, inventory, mockups, pricing, case studies |
| Bulk approve | `/proposals/bulk-approve` | Batch approve/reject proposals |
| Public share link | `/proposals/view/[token]` | Full sponsor landing page — no admin sidebar |

### Sponsor Landing Page (Public)
| Feature | Description |
|---------|-------------|
| Hero section | CFC crest + sponsor logo, proposal title, APPROVED badge |
| Club stats bar | Founded 1909, 1.5M followers, Couto Pereira 40,502 capacity |
| Full proposal content | All sections rendered from proposal data |
| AI Creatives gallery | Approved campaign images |
| Past Partners bar | Historical sponsor logos |
| Lead capture form | Name/company/email/phone/message + LGPD consent → `audit_logs` |
| Sticky CTA bar | "Tenho Interesse" / "Falar com equipe" / "Agendar Reunião" / "Salvar como PDF" |
| Expiry badge | Amber "Reserved until [date]" if `expires_at` set |
| A/B testing | `?v=B` param → "Quero Saber Mais" CTA + "Variant B" badge |
| View tracking | Every view logged to `audit_logs`, count shown on admin proposal page |
| Print/PDF | `window.print()` — sidebar hidden, CFC footer, print-color-adjust |

### Email & Outreach
| Feature | Route | Description |
|---------|-------|-------------|
| Emails list | `/emails` | All emails, status badges |
| Email detail | `/emails/[id]` | View, edit, send, test send, pre-send placeholder validation |
| Generate email | Via proposal approve flow | Bedrock-personalized using team sender, auto-injects proposal CTA button |
| Placeholder validation | Pre-send | Blocks send if `[Nome]`, `{{contact_name}}`, etc. still unresolved |
| Send test | Email detail | "Send Test to Myself" button with email input |
| Email templates | `/settings/email-templates` | CRUD, HTML/markdown, `{{variables}}` support |
| Email tracking | Pixel + link wrapping | `/api/emails/[id]/pixel` — logs `opened_at`; `/api/emails/[id]/click` — logs `clicked_at`, redirects |
| Newsletter | `/newsletter` | Compose + schedule + analytics (total sent, unsubscribes, open rate) |
| Unsubscribe | `/api/newsletter/unsubscribe?email=` | Portuguese confirmation page, LGPD compliant |
| Sender profiles | `/settings/sender-profiles` | Team members as email senders (full_name, title, email, signature) |

### Approvals
| Feature | Route | Description |
|---------|-------|-------------|
| Approval queue | `/approvals` | Proposals, campaigns, and emails awaiting review |
| Card (Tinder) UI | Default view | Drag/swipe, keyboard: → or L = Approve, ← or J = Reject, E = Edit |
| Progress bar | Card header | "X of Y reviewed" with gradient progress bar |
| Post-approve email | Modal | Immediately prompt to select email template + send after approving a proposal |
| List UI | Toggle button | Switch to list view if preferred |

### Campaigns
| Feature | Route | Description |
|---------|-------|-------------|
| Campaign list | `/campaigns` | All campaigns with status, company, AI badge |
| Create campaign | `/campaigns/new` | Company selector with live search, strategy picker |
| Bulk campaigns | `/campaigns/bulk` | Generate for all companies in an industry; data completeness warning |
| Campaign detail | `/campaigns/[id]` | Full campaign, inventory picker, AI brief |

### Image Generation & Media
| Feature | Route | Description |
|---------|-------|-------------|
| Official jersey mockups | Proposal > Graphics | `sharp` composite on official CFC kit; 7 placement zones; sponsor logo required; CFC crest locked |
| AI campaign creatives | Proposal > Graphics | OpenAI gpt-image-1, 1536×1024; full-screen prompt review modal; cost estimate shown |
| Mockup editor | `/mockup-editor` | Canvas editor with undo/redo (Ctrl+Z/Y), zoom (0.5x–2.0x), color-coded templates |
| Asset library | `/assets` | Browse + manage uploaded brand assets |
| Bulk logo upload | Proposals list | Upload single logo to multiple proposals at once |

### Contracts
| Feature | Route | Description |
|---------|-------|-------------|
| Contracts list | `/contracts` | All contracts with KPI summary bar, Export CSV |
| Convert to Contract | Proposal detail | Modal: contract number (auto CTR-2026-XXXX), value, dates, deal type |
| API | `/api/contracts` | GET (list) + POST (create) |

### Intelligence
| Feature | Route | Description |
|---------|-------|-------------|
| Coritiba Intel | `/coritiba-intelligence` | AI-powered market intelligence, competitor discovery (Apify) |
| Company intelligence | Company detail | AI analysis of sponsorship fit, marketing goals, strategy recommendations |
| Hunter.io contacts | Company detail > Contacts tab | Domain search, email discovery, Save buttons |
| Apollo.io contacts | Company detail > Contacts tab | Similar to Hunter, save results to DB |
| Competitor tracking | AI + manual | Save from Apify results; competitor status = red badge |
| AI Inventory suggestion | Company detail | AI recommends inventory package + proposal type |

### Outreach Agent
| Feature | Route | Description |
|---------|-------|-------------|
| Run Agent | Company detail > "Run Agent" | Full supervised pipeline: enrich → intelligence → proposal → email → Pipedrive |
| Step 1 | enrich_contacts | Hunter + Apollo contact discovery |
| Step 2 | scrape_company_intelligence | Apify/LinkedIn signals |
| Step 3 | generate_personalized_proposal | Bedrock proposal (⏸ approval gate) |
| Step 4 | generate_personalized_email | Bedrock email using team sender (⏸ approval gate) |
| Step 5 | send_email | Actual send + Pipedrive activity log |
| Cancel | Mid-flight | `runIdRef` cancels immediately via DELETE /api/agent/runs/[id] |
| SSE progress | Real-time | Server-Sent Events stream progress to UI |

### Pipedrive Integration
| Feature | Description |
|---------|-------------|
| Deal sync | Proposal status changes → Pipedrive deal update |
| Activity log | Email sent → Pipedrive activity created |
| Scheduled sync | `/api/system/pipedrive-sync` (Bearer-secured) — sync cold deals, expiring contracts |
| Manual trigger | `/system` page → "Run Pipedrive Sync Now" button |

### Dashboard KPIs
| Tile | Description |
|------|-------------|
| Active Companies | Total companies in DB |
| Proposals | Total + "X need review" |
| Campaigns | Total AI-generated |
| Pending Approvals | Action required count |
| Follow-ups | Overdue tasks |
| System Status | API health |
| Active Contracts | Signed sponsors count + value |
| Emails Sent | Total outreach emails |
| Email Open Rate | % opened / sent |
| Email Click Rate | Click count tracked |
| Pipeline Value | Total approved + under review value (R$) |
| Conversion Rate | Approved + contracts / total proposals |
| Proposals Sent This Month | Monthly activity |
| Image Gen Rate | Jobs completed / total |

### Reports & Exports
| Feature | Route | Description |
|---------|-------|-------------|
| Reports | `/reports` | Sponsor activity, monthly breakdowns, data exports section |
| Export companies | `/api/export/companies` | Full CSV of all companies |
| Export proposals | `/api/export/proposals` | Full CSV of all proposals |
| Export contracts | `/api/export/contracts` | Full CSV of all contracts |
| Export revenue | `/api/export/revenue` | Revenue summary CSV |
| Export emails | `/api/export/emails` | Email campaign CSV |
| Audit log | `/audit` | Full audit trail of all platform events |

### Settings & Admin
| Feature | Route | Description |
|---------|-------|-------------|
| Settings | `/settings` | Gmail OAuth status, API keys, system config |
| Gmail OAuth | `/settings` → Connect Gmail | OAuth2 flow, token stored in DB |
| Sender profiles | `/settings/sender-profiles` | Manage team email senders |
| Email templates | `/settings/email-templates` | CRUD, JSON import |
| Team & Roles | `/settings/team` | Users, roles (admin/sales_rep/approver/viewer) |
| System | `/system` | Service health, Pipedrive sync trigger, cron setup guide |

### UI / UX
| Feature | Description |
|---------|-------------|
| Sidebar collapse | Toggle to 60px icon-only mode |
| PT/EN language toggle | Bottom of sidebar; all nav labels and group headers translate |
| Breadcrumbs | Dynamic breadcrumbs on all major pages via `ContentWrapper` |
| Responsive | `flex-wrap` on action bars; mobile nav bar |
| Dark mode | Tailwind `dark:` classes throughout |

---

## Graphics Architecture

```
Proposal > Visuais / Graphics section
├── 👕 Jersey Mockup — Official (green card)
│   └── sharp composite on official CFC kit base
│       7 placement zones: Peito, Manga E/D, Costas, Shorts, Meiões
│       Sponsor logo required (generate blocked otherwise)
│       CFC crest is LOCKED — never changes
│
├── ✨ AI Campaign Creatives (indigo card)
│   └── OpenAI gpt-image-1, 1536×1024 (16:9)
│       Full-screen prompt review + edit modal before generation
│       Cost estimate shown (~$0.04/image)
│       Strategies: Stadium Scene, LED Board, Match Day, Training, Social
│
└── 🖼️ Saved Images (slate card)
    └── Gallery of all generated/uploaded assets
        Approve before they appear on sponsor landing page
```

---

## Outreach Agent Pipeline

```
[Run Agent] on /companies/[id]
   │
   ▼
1. enrich_contacts
   └── Hunter.io domain search + Apollo.io lookup
   └── Saves contacts with source=hunter/apollo
   │
   ▼
2. scrape_company_intelligence
   └── Apify LinkedIn/web signals
   └── Saves to company.intelligence JSON
   │
   ▼
3. generate_personalized_proposal
   └── Bedrock Claude Sonnet 4
   └── Proposal type auto-selected based on company profile
   └── ⏸ APPROVAL GATE — human reviews proposal in /approvals
   │
   ▼  [after proposal approved]
4. generate_personalized_email
   └── Bedrock personalization using proposal + intelligence
   └── Team sender auto-selected (default sender profile)
   └── Proposal CTA button auto-injected
   └── ⏸ APPROVAL GATE — human reviews email in /approvals
   │
   ▼  [after email approved]
5. send_email
   └── Actual send via Gmail OAuth / configured provider
   └── Pipedrive activity logged
   └── email.opened_at / clicked_at tracked via pixel
```

---

## Database Schema (key tables)

| Table | Description |
|-------|-------------|
| `companies` | 536+ prospect/competitor companies |
| `proposals` | Sponsorship proposals with versioning |
| `proposal_versions` | Snapshot history of proposals |
| `proposal_variants` | A/B test variants |
| `campaigns` | AI-generated marketing campaigns |
| `emails` | Outreach emails with tracking |
| `contracts` | Signed sponsorship contracts |
| `sender_profiles` | Team email senders |
| `audit_logs` | Full activity log |
| `image_generation_jobs` | AI image queue |
| `inventory_items` | Sponsorship inventory catalog |

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=                    # gpt-image-1 image generation
AWS_BEDROCK_REGION=               # Claude Sonnet 4 via Bedrock
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
PIPEDRIVE_API_KEY=
GOOGLE_CLIENT_ID=                  # Gmail OAuth
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
DEFAULT_FROM_EMAIL=
MSA_INTERNAL_WEBHOOK_SECRET=       # Secures /api/system/* endpoints
NEXT_PUBLIC_APP_URL=               # Canonical URL for share links
```

---

## Known Limitations

1. **Pipeline data** — Pipeline board works but companies need `pipeline_stage` set via edit form
2. **Gmail OAuth** — May need periodic reconnect at `/settings`
3. **Replicate LoRA** — 2024 kit model; 2026 retrain needs new stadium/jersey photos
4. **Email tracking KPIs** — Show 0% for emails sent before tracking was deployed (Jun 26)
5. **Pipeline drag-drop** — Not implemented; change stage via company edit form

---

*See `26th_june.md` for complete audit coverage and sprint logs.*
