# Complete System Testing Guide — Market Sponsorship Automation

**Live URL:** https://eligibly-facing-unloved.ngrok-free.dev

---

## TEST 1 — Company Creation

**Goal:** Create a sponsor company and verify audit log.

1. Go to https://eligibly-facing-unloved.ngrok-free.dev/companies
2. Click **"New Company"** (top right)
3. Fill in:
   - Company Name: `Natura Cosméticos`
   - Industry: `Beauty / Sustainability`
   - Website: `https://natura.com.br`
   - Country: `BR`
   - Notes: `Premium Brazilian beauty brand. Wants sustainability positioning, female audience 18-45, digital exposure, stadium visibility.`
4. Click **Save**
5. ✅ **Verify:** Company appears in the list
6. Go to https://eligibly-facing-unloved.ngrok-free.dev/audit — find `company.created` entry at the top

---

## TEST 2 — Campaign Generation (Multi-Strategy AI)

**Goal:** Generate diverse AI campaign ideas for your new company.

1. Go to https://eligibly-facing-unloved.ngrok-free.dev/campaigns
2. Click **"Generate Campaign Ideas"**
3. Select your company: `Natura Cosméticos`
4. Objective: `Football sponsorship partnership for Athletico Paranaense: sustainability activation, female audience engagement, stadium branding, digital/social campaigns`
5. Max Ideas: `5`
6. Click **Generate** — wait ~90 seconds
7. ✅ **Verify all 5 of these:**
   - At least 5 campaign ideas appear with distinct titles
   - Each campaign has a different strategy angle (not all the same)
   - Titles are creative and company-specific (not generic)
   - Content is in **Portuguese**
   - References Paraná / Curitiba / Brazilian football

---

## TEST 3 — Proposal Generation with Intelligence Layer

**Goal:** Generate a full intelligence-enriched proposal.

1. Click into one of your campaigns from Test 2 (pick the best title)
2. Click **"Generate Proposal"**
3. Wait ~75–90 seconds for the main proposal
4. ✅ **Verify on the proposal detail page:**
   - Title is creative and specific to Natura + Athletico
   - `executive_summary`, `campaign_rationale`, `activation_plan`, `deliverables`, `investment_note`, `cta` are all filled
   - Content is in Portuguese with football-specific language

---

## TEST 4 — Enhance Proposal with AI (Pricing + Visuals + Intelligence)

**Goal:** Add pricing tiers, visual prompts, and company intelligence.

1. On the proposal detail page, click **"✨ Enriquecer com IA"** button (top right area)
2. A toast notification appears: *"Gerando análise de inteligência…"*
3. Wait **~45 seconds**
4. Page auto-refreshes
5. ✅ **Verify these 4 sections now appear:**
   - **Estratégias** tab shows 3 strategy cards (stadium / fan_engagement / community or similar)
   - **Precificação** section shows 3 pricing tiers (Low/Mid/High in BRL)
   - **Visuais** section shows 5 visual mockup cards (jersey, LED board, social media, banner, fan zone)
   - **Inteligência** panel shows a fit score (should be 7–9/10) and brand analysis

---

## TEST 5 — Proposal Landing Page (Admin Full-Screen View)

**Goal:** Verify the premium presentation layout.

1. On the proposal detail page, click **"Landing Page ↗"** button (opens in new tab)
2. Scroll through the full page and verify **all these sections exist:**

| Section | What to look for |
|---|---|
| **Hero** | Dark blue gradient, large title, company chip, 4 stat tiles (600k+ fans, 38+ games, etc.) |
| **Partnership Strip** | Company name × Futebol Paranaense, fit score card, 4 metric cards (5M+, 18–35, 68%, 92%) |
| **Sumário Executivo** | White card with full executive summary paragraph |
| **Inteligência Comercial** | Dark card with score progress bar, marketing goals, brand positioning, local/global insight |
| **Estratégias de Patrocínio** | 3 clickable tabs — click each one and verify different content loads |
| **Proposta Detalhada** | Two-column card (Racional + Valor), dark activation plan card |
| **Entregas e Benefícios** | Grid of green checkmark cards (5 deliverables) |
| **Opções de Investimento** | 3 pricing cards — Apoiador (grey), Master (blue, "Mais popular"), Diamante (amber, "Premium") |
| **Conceitos Visuais** | 5 gradient cards — click "Ver prompt de geração" on any card |
| **Sobre o Investimento** | Blue info card with investment rationale |
| **CTA Section** | Dark navy block with CTA text, "Baixar Proposta (PDF)" + "Compartilhar" buttons |

3. ✅ **Pricing tier verify:** Click each tier card — check Apoiador/Master/Diamante show different activation lists and prices in BRL

---

## TEST 6 — PDF Export / Print

**Goal:** Test the print/export flow.

1. On the Landing Page (`/proposals/[id]/view`), click **"Imprimir / PDF"** (top right)
2. Browser print dialog opens
3. ✅ **Verify:**
   - Layout shows A4 paper format
   - Navigation bars are hidden
   - All sections are visible (hero, summary, pricing, deliverables)
   - A print footer appears: `[Company] × Futebol Paranaense · Proposta de Patrocínio · v1`
4. **Cancel** (don't actually print)

---

## TEST 7 — Share Link (Public Proposal Page)

**Goal:** Test the shareable public URL with no login required.

1. On the proposal detail page, click **"Compartilhar Proposta"** or **"Gerar link público"** button
2. A share URL is generated and copied to clipboard
3. ✅ **Verify:** Toast says *"Link criado e copiado!"*
4. Open the copied URL in an **incognito/private browser window**
5. ✅ **Verify on the public page:**
   - No sidebar visible
   - Header shows: *"Proposta de Patrocínio — [Company Name]"*
   - Print button visible: *"Imprimir / Salvar como PDF"*
   - Full proposal content visible (hero, sections, pricing, etc.)
   - Page is accessible **without login**

You can also directly test the existing public link: https://eligibly-facing-unloved.ngrok-free.dev/proposals/view/nX2quAKkLfftacGRJLIBlSASsI1-meJJ

---

## TEST 8 — Proposal Approval Workflow

**Goal:** Approve a proposal and verify audit trail.

1. Go to https://eligibly-facing-unloved.ngrok-free.dev/proposals
2. Open any `draft` proposal
3. Scroll down to the **Approval Panel**
4. Click **"Approve"**
5. ✅ **Verify:**
   - Status badge changes to `approved` (green)
   - Go to https://eligibly-facing-unloved.ngrok-free.dev/approvals — proposal appears here
   - Go to https://eligibly-facing-unloved.ngrok-free.dev/audit — find `proposal.approved` entry

---

## TEST 9 — Email Generation + Gmail Draft

**Goal:** Generate an outreach email for an approved proposal.

1. Open an **approved** proposal (status = `approved`)
2. Scroll to the **"Generate Email"** panel
3. Fill in:
   - Recipient email: `test@example.com`
   - Tone: `Professional`
4. Click **"Generate Email"** — wait ~15 seconds
5. ✅ **Verify:**
   - Email subject is proposal-specific (e.g. *"Parceria Estratégica: Natura + Athletico Paranaense"*)
   - Body is in Portuguese
   - Status shows `pending_approval`
6. Go to https://eligibly-facing-unloved.ngrok-free.dev/emails
7. Find the email → click **"Approve"**
8. ✅ **Verify:** Status changes to `approved` → if Gmail is connected, a draft is created

---

## TEST 10 — Audit Log Verification

**Goal:** Confirm all activities are tracked.

1. Go to https://eligibly-facing-unloved.ngrok-free.dev/audit
2. ✅ **Look for these entries** (from your tests above):
   - `company.created`
   - `campaign.generated`
   - `proposal.generated`
   - `proposal.enhanced`
   - `proposal.share_created`
   - `proposal.approved`
   - `email.generated`
3. Each entry should show the entity type, action, timestamp, and metadata

---

## TEST 11 — Workflow Events

**Goal:** Confirm background workflows completed.

1. Go to https://eligibly-facing-unloved.ngrok-free.dev/workflow-events
2. ✅ **Verify:**
   - `proposal.generate` — status: `completed`
   - `proposal.enhance` — status: `completed`
   - No workflows stuck in `running` for more than 5 minutes

---

## TEST 12 — Strategy Tab Interaction

**Goal:** Verify each strategy variant shows different content.

1. Open the Landing Page for your proposal
2. In the **"Estratégias de Patrocínio"** section, you'll see 3 tabs
3. Click **Tab 1** (e.g. "Arena Viva Volt" or similar) — note the content
4. Click **Tab 2** — content should be completely different
5. Click **Tab 3** — again different content
6. ✅ **Verify each tab has:**
   - Different strategy description
   - Different key activations list
   - Different audience fit + reach estimate
   - Different differentiator callout

---

## TEST 13 — Visual Prompt Cards

**Goal:** Verify AI visual mockup prompts are usable.

1. On the Landing Page, scroll to **"Conceitos Visuais"** section
2. You'll see 5 colored cards (jersey, LED board, social, banner, fan zone)
3. Click **"Ver prompt de geração"** on any card
4. ✅ **Verify:** Full image-generation prompt appears (40-100+ words, specific to your company)
5. Click the **copy icon** (top right of prompt box)
6. ✅ **Verify:** Toast shows "copied" feedback
7. Paste into any image generation tool (DALL·E, Midjourney, etc.) — the prompt should generate a relevant sponsorship mockup

---

## TEST 14 — Duplicate Proposal + New Version

**Goal:** Test proposal duplication.

1. Open any proposal
2. Click **"Duplicate"** button
3. ✅ **Verify:**
   - A new draft proposal appears with the same content
   - Version number is `1` on the new copy
   - Original is unchanged

---

## TEST 15 — Mobile Responsiveness (Phone Test)

**Goal:** Check proposal renders on mobile.

1. Open the public share link on your **phone** or use browser DevTools → mobile mode (375px)
2. URL: https://eligibly-facing-unloved.ngrok-free.dev/proposals/view/nX2quAKkLfftacGRJLIBlSASsI1-meJJ
3. ✅ **Check:**
   - Hero title is readable (may wrap to multiple lines — that's fine)
   - Strategy tabs are scrollable/wrappable
   - Pricing tiers stack vertically (one below the other) below 768px
   - No horizontal overflow/scrollbar

---

## QUICK SMOKE TEST CHECKLIST

Run all of these in 5 minutes to confirm everything is up:

```
✅ https://eligibly-facing-unloved.ngrok-free.dev/               → Dashboard loads
✅ https://eligibly-facing-unloved.ngrok-free.dev/companies       → Company list loads
✅ https://eligibly-facing-unloved.ngrok-free.dev/campaigns       → Campaigns load
✅ https://eligibly-facing-unloved.ngrok-free.dev/proposals       → Proposals load
✅ https://eligibly-facing-unloved.ngrok-free.dev/approvals       → Approvals load
✅ https://eligibly-facing-unloved.ngrok-free.dev/emails          → Emails load
✅ https://eligibly-facing-unloved.ngrok-free.dev/audit           → Audit log loads
✅ https://eligibly-facing-unloved.ngrok-free.dev/workflow-events → Events load

✅ Admin landing page:
   https://eligibly-facing-unloved.ngrok-free.dev/proposals/0f97bded-c2d1-40ce-a865-0e792c9eff0e/view

✅ Public share page (no login):
   https://eligibly-facing-unloved.ngrok-free.dev/proposals/view/nX2quAKkLfftacGRJLIBlSASsI1-meJJ
```

---

## KNOWN LIMITATIONS (Not Bugs)

| Item | Note |
|---|---|
| Generation time | Main proposal: 75–90s. Enhance (4 layers): 40–45s. Total: ~2.5 min. Normal for 5 parallel AI calls. |
| Visual images | Cards show AI prompts only — actual rendering requires DALL·E/Stability API (Phase 3) |
| Pricing for 1 layer | If pricing enhancement fails (rare Bedrock throttle), click "Re-enriquecer" again — it will retry |
| Gmail drafts | Only works if Gmail OAuth is configured in Settings |
| All output in Portuguese | Intentional — Brazilian market targeting |