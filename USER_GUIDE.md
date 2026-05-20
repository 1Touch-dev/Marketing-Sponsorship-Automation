# Market Sponsorship Automation — User Guide

> **Platform:** AI-powered commercial sponsorship operating system for Coritiba FC
> **Stack:** Next.js 14 · Supabase · AWS Bedrock (Claude) · OpenAI DALL-E 3
> **Live URL:** https://eligibly-facing-unloved.ngrok-free.dev

---

## Table of Contents

1. [Overview](#1-overview)
2. [**COMPLETE WALKTHROUGH — Havaianas Brasil Example**](#complete-walkthrough--example-havaianas-brasil-sponsorship) ⭐ *Start here*
3. [Dashboard](#2-dashboard)
4. [Adding a Company](#3-adding-a-company)
5. [Company Intelligence & Competitors](#4-company-intelligence--competitors)
6. [Differentiator Analysis](#5-differentiator-analysis)
7. [Generating a Campaign](#6-generating-a-campaign)
8. [Creating a Proposal (Wizard)](#7-creating-a-proposal-wizard)
9. [Approval Flow](#8-approval-flow)
10. [AI Image Generation](#9-ai-image-generation)
11. [Proposal Landing Page](#10-proposal-landing-page)
12. [Mockup Editor](#11-mockup-editor)
13. [Inventory Management](#12-inventory-management)
14. [Global Search](#13-global-search)
15. [Troubleshooting](#14-troubleshooting)
16. [Navigation Reference](#15-navigation-reference)

---

## 1. Overview

The Market Sponsorship Automation platform automates the full commercial sponsorship lifecycle for Coritiba FC — from discovering potential sponsors to generating AI-powered proposals, managing approvals, and publishing shareable landing pages.

### Core Workflow

```
Add Company --> Auto-discover Competitors --> Analyse Differentiators
     |
     v
Generate Campaign Ideas (AI)
     |
     v
Create Proposal via Wizard --> Select Inventory --> Generate AI Proposal
     |
     v
Approval Flow: Draft --> Under Review --> Approved
     |
     v
Generate AI Images (Jersey mockups, LED boards, etc.)
     |
     v
View / Share Proposal Landing Page (with images embedded)
     |
     v
Export as PDF
```

---


---

## COMPLETE WALKTHROUGH — Example: Havaianas Brasil Sponsorship

> This is a full real-world example showing every step from scratch. Follow along to understand how all parts of the platform connect. Use **Havaianas Brasil** as the example company.

---

### STEP 1 — Open the Dashboard

1. Open your browser and go to: `https://eligibly-facing-unloved.ngrok-free.dev`
2. You land on the **Dashboard** (`/`)
3. You will see stats cards showing current companies, proposals, and campaigns

**What you see:**
```
Total Companies: X    Total Proposals: X    Approved: X
```

Quick Actions row shows 4 buttons: Add Company / Generate Campaign / Create Proposal / Generate Images

---

### STEP 2 — Add the Company

1. Click **"Add Company"** in the Quick Actions row, OR go to `/companies/new`
2. Fill in the form with these exact values:

| Field | Value |
|---|---|
| Company Name | `Havaianas Brasil` |
| Industry | `FMCG / Food & Beverage` |
| Website | `https://www.havaianas.com.br` |
| Company Size | `Large` |
| Business Type | `B2C` |
| Segment | `National` |
| Pipeline Stage | `Prospect` |
| Contact Name | `Carlos Mendes` |
| Contact Email | `carlos.mendes@havaianas.com.br` |
| Contact Phone | `+55 41 99999-1234` |
| Notes | `Major national consumer brand, strong social media presence, historically sponsors Brazilian sports and events. Looking for authentic regional partnerships with emotional connection.` |

3. Click **"Add Company"**

**What happens:**
- You are redirected to the Havaianas Brasil company detail page
- In the background (within 45-60 seconds), the system automatically runs competitor discovery
- You do NOT need to do anything — it runs silently

---

### STEP 3 — Wait for Auto-Competitor Discovery

1. After landing on the company detail page, **wait 45-60 seconds**
2. Press **F5** or click refresh

**What you see after refresh** (right sidebar or AI Analysis panel):

Discovered competitors should include companies like:
- Grendene (Melissa)
- Ipanema Sandals
- Rider Brasil
- Olympikus
- Penalty Brasil

> If nothing appeared yet, wait 30 more seconds and refresh again.
> If still empty, scroll to the AI Analysis card and click **"Run Discovery"** manually.

---

### STEP 4 — Generate Company Intelligence

1. On the Havaianas company page, find the **AI Analysis** card (left main column)
2. Click **"Generate Intelligence"** (or "Run Analysis")
3. Wait ~30 seconds

**What appears:**
- Marketing goals (e.g. "Expand market share in southern Brazil among young consumers")
- Sponsorship fit score (e.g. `8.1 / 10`)
- Recommended strategies: Brand Awareness, Digital First, Fan Engagement
- Audience alignment: "Havaianas' 18-35 demographic strongly overlaps with Coritiba FC's fanbase"
- Brand positioning analysis

---

### STEP 5 — Run Differentiator Analysis

1. Scroll to the **right sidebar** on the company page
2. Find the **"Differentiator Analysis"** panel
3. Click **"Analyse"**
4. Wait ~20-30 seconds

**Three tabs appear:**

**Overview tab:**
```
Sponsorship Fit: 8.4/10

Brand Strengths:
- Only sandal brand with 90%+ household recognition in Brazil
- Strong emotional connection to Brazilian summer and football culture
- No active football sponsorship in Parana — white space opportunity

Competitor Gaps:
- None of Havaianas' direct competitors (Rider, Ipanema, Olympikus)
  have active partnerships with Coritiba FC or any Parana club
- Ideal entry point before a competitor claims this territory
```

**Campaign Themes tab:**
```
1. "Coxa no Pe" — Coritiba FC play on words (Coxa = local nickname, Pe = foot)
2. "O Verao e Verde e Branco" — Summer is Green & White
3. "A Sandalia do Estadio" — The Sandal of the Stadium
```

**Outreach tab:**
```
Subject: Havaianas x Coritiba FC — A Parceria que o Parana Espera

Carlos, a Havaianas nao e so uma sandalia — e o simbolo do verao
brasileiro. E o Coritiba FC e o simbolo do futebol paranaense.
Juntos, criamos algo maior que um patrocinio...
```

---

### STEP 6 — Get AI Inventory Suggestion

1. Still on the right sidebar, find the **"Inventory Suggestion"** panel
2. Click **"Suggest Inventory & Proposal Type"**
3. Wait ~20 seconds

**What appears:**
```
Recommended Type: Sponsorship
Fit Score: 8.4/10
Package Range: R$ 280,000 – R$ 420,000

Top Recommended Items:
✅ Jersey Front — Principal Sponsor (Priority: High)
   Reason: "Maximum brand visibility for a mass-market consumer brand"
   Activation idea: "Jersey reveal video on Havaianas social channels"

✅ LED Perimeter Board — Full Match (Priority: High)
   Reason: "Repetitive exposure to 15,000+ fans per game"

✅ Instagram Feed Post x4/month (Priority: Medium)
   Reason: "Reaches the 18-35 digital audience core to Havaianas"

Outreach angle: "Position Havaianas as the official casual footwear of
Coritiba FC culture — from the stadium to the beach"
```

4. Optionally click **"Create Sponsorship Proposal Now"** to jump to the wizard pre-filled (or do it manually in Step 8)

---

### STEP 7 — Generate a Campaign

1. On the Havaianas company page, click **"Generate Campaign"** in the page header (top-right)
   - This opens `/campaigns?company=[havaianas-id]` with Havaianas pre-selected
2. In the **Objective / context** field, paste:

```
Summer football activation — position Havaianas as the official
informal footwear of Coritiba FC fans. Target young adults 18-35
in Parana. Leverage match days and social media for maximum brand recall.
Focus on the emotional connection between Brazilian football culture
and the casual, joyful Havaianas lifestyle.
```

3. Click **"Generate ideas"**
4. Wait ~15-20 seconds

**What appears — 3 to 5 campaign concepts, for example:**

```
Campaign 1: "Coxa no Pe — A Parceria que Calcou o Parana"
Strategy: Brand Awareness + Fan Engagement
Summary: Launch campaign centred on the wordplay between "Coxa-Branca"
(Coritiba FC's nickname) and "pe" (foot in Portuguese). Havaianas
becomes the official sandal of every Coritiba moment.

Campaign 2: "O Verao Chega no Couto"
Strategy: Digital & Social First
Summary: Summer activation campaign — match-day social content,
branded Instagram Reels, player appearances wearing Havaianas...

Campaign 3: "Havaianas Torcedor Premium"
Strategy: Premium Activation + Hospitality
Summary: VIP match experience program — Havaianas-branded VIP lounge,
limited edition co-branded sandal for season ticket holders...
```

5. Note the campaign title you want to use (e.g. "Coxa no Pe") — you'll select it in the wizard

---

### STEP 8 — Create the Proposal (Full Wizard)

1. Go to `/proposals/new` OR click **"Create Proposal"** from the Dashboard
2. The 6-step wizard opens

---

**Wizard Step 1 — Proposal Type**

Click: **Sponsorship** (blue card — "Traditional sponsor package")

Click **Continue**

---

**Wizard Step 2 — Select Company**

- Type `Havaianas` in the search box
- Click on **Havaianas Brasil** in the list
- You see an intelligence preview:
  ```
  Industry: FMCG / Food & Beverage
  Type: B2C
  Scope: National
  Size: Large
  ```

Click **Continue**

---

**Wizard Step 3 — Select Inventory Items**

You see live inventory items from the database, grouped by category.

Select these items (click each card to highlight it):

**Jersey section:**
- ✅ **Jersey Front — Principal Sponsor** — set quantity: `1`
  - Price shown: `R$ 140,000` (Large company tier)
- ✅ **Jersey Sleeve — Left Sleeve** — quantity: `1`
  - Price shown: `R$ 48,000`

**Stadium / LED section:**
- ✅ **LED Perimeter Board — Full Match** — quantity: `2` (2 boards)
  - Price shown: `R$ 28,000` per board
- ✅ **Giant Scoreboard Video Ad (30s)** — quantity: `3` (3 slots per game)

**Digital / Social section:**
- ✅ **Instagram Feed Post** — quantity: `4` (4 posts/month)
- ✅ **Instagram Reels — Sponsored Content** — quantity: `2`
- ✅ **Match Day Digital Package** — quantity: `2`

Watch the **Package Total** at the top update as you select:
```
Package Total: R$ 320,000 – R$ 380,000
```

Click **Continue**

---

**Wizard Step 4 — Strategy Selection**

Select (highlighted = selected):
- ✅ **Brand Awareness** — maximum visibility
- ✅ **Fan Engagement** — deep fan connection
- ✅ **Digital & Social** — social media first
- ✅ **Community** — local Curitiba presence

Click **Continue**

---

**Wizard Step 5 — Review & Generate**

In the **Additional Brief** box, paste:

```
Havaianas is the iconic Brazilian sandal brand — present in every
Brazilian home for over 60 years. This proposal should emphasise
authentic Brazilian culture, the emotional connection between football
and the casual Havaianas lifestyle, and the brand's positioning as
"the sandal of Brazil's favourite moments".
Reference the Parana and Curitiba market specifically. The package
should feel premium yet accessible — Havaianas is for everyone.
Use the differentiator insight that NO competitor has this territory.
```

Click the amber **"Generate Proposal"** button.

**Wait 30-45 seconds...**

---

**Wizard Step 6 — Done**

You see the generated proposal title appear, for example:
```
Havaianas Brasil x Coritiba FC: O Simbolo do Brasil no Coracao do Parana
```

Click **"View Proposal"**

---

### STEP 9 — Review the Generated Proposal

You are now on the proposal detail page `/proposals/[id]`

**Check the left column — proposal content:**

Scroll through and verify:
- Executive Summary mentioning "Havaianas" and "Coritiba FC" specifically
- References to the inventory items you chose (jersey front, LED boards, Instagram posts)
- Pricing section referencing R$ 320,000–380,000 range
- Personalised language about Parana market
- Campaign phases (Launch, Growth, Consolidation)
- Call to action with Carlos Mendes' name

**Check the right sidebar:**

- **Approval Flow panel** shows a 5-step progress bar, currently at Step 1 (Draft — highlighted)
- A "Submit for Review" button is visible

---

### STEP 10 — Run the Approval Flow

**A — Submit for Review**

1. In the Approval Flow panel, click **"Submit for Review"**
2. Status badge changes: `draft` → `under_review`
3. Progress bar advances to Step 2

**B — Approve the Proposal**

1. Click **"Approve Proposal"**
2. Status changes to `approved` (green badge)
3. A **share token is automatically generated** — no extra steps
4. Progress bar advances to Step 3
5. A **"View Landing Page"** button appears in the header

> **Verify:** Click the Share button (chain link icon) — you should see a long URL like:
> `https://eligibly-facing-unloved.ngrok-free.dev/proposals/view/abc123xyz...`
> This is the public link you can send to Carlos Mendes at Havaianas.

---

### STEP 11 — Generate the AI Jersey Image

1. From the Approval Flow panel, click **"Generate Images"** — goes to `/media-generation`
   OR go directly to `/media-generation`

2. Click **"New Generation Job"**

3. Fill in the form:

| Field | Value |
|---|---|
| Job Type | `Jersey Mockup` |
| Proposal | Select `Havaianas Brasil x Coritiba FC...` from dropdown |
| Size | `1024x1024` |
| Quality | `Standard` |
| Prompt | `Photorealistic Coritiba FC official green and white home jersey with Havaianas Brasil logo prominently placed on the chest area, professional product photography studio setup, clean white background, high resolution fabric texture detail, sponsor logo clearly visible, no text errors` |
| Negative Prompt | `blurry, low quality, text errors, wrong colors, competitor clubs, distorted logo` |

4. Click **"Generate Now"**

**Wait 20-40 seconds...**

**What you see:**
- Status goes: `pending_approval` → `approved` → `generating` → `completed`
- A jersey image thumbnail appears in the job card showing a green/white Coritiba FC jersey with Havaianas logo on the chest

---

### STEP 12 — Generate the LED Board Image

Still on `/media-generation`, click **"New Generation Job"** again.

| Field | Value |
|---|---|
| Job Type | `LED Board` |
| Proposal | Select `Havaianas Brasil x Coritiba FC...` |
| Size | `1536x1024` (landscape — wider format for LED boards) |
| Prompt | `Havaianas Brasil logo displayed on LED perimeter advertising boards at Estadio Couto Pereira during a Coritiba FC football match, wide angle stadium photography, green pitch visible, evening match atmosphere with stadium lights, photorealistic sports photography, professional quality` |
| Negative Prompt | `blurry, low quality, text errors, competitor clubs, wrong stadium` |

Click **"Generate Now"**. Wait 30-40 seconds for the wide-format image.

---

### STEP 13 — View the Final Landing Page

1. Go back to the proposal: `/proposals/[id]`
2. In the Approval Flow panel — Steps 3 and 4 should now both show green
3. Click **"Landing Page ↗"** in the header OR click **"View Landing Page"** in the flow panel

You land on: `/proposals/[id]/view`

**Scroll through and verify every section:**

| Section | What to check |
|---|---|
| Hero banner | Shows "Havaianas Brasil x Coritiba FC" title + APPROVED badge |
| Stats cards | Shows Coritiba FC stats: 1.5M+ followers, 38+ games, +47% growth |
| Executive Summary | Personalised paragraphs mentioning Havaianas specifically |
| Deliverables section | Lists Jersey Front, LED Boards, Instagram posts with descriptions |
| **Generated Images section** | ✅ Jersey mockup image AND LED board image appear here |
| Investment section | Shows R$ 320,000-380,000 pricing breakdown |
| Call to Action | Mentions Carlos Mendes / Havaianas contact |

---

### STEP 14 — Share with the Prospect

**Option A — Admin preview link:**
```
/proposals/[id]/view
```

**Option B — Public shareable link (send this to Carlos Mendes):**

1. On the proposal page, click the **Share** button (link/chain icon)
2. The share URL appears and is copied to clipboard:
   ```
   https://eligibly-facing-unloved.ngrok-free.dev/proposals/view/[share_token]
   ```
3. Send this URL to the prospect — no login required, opens directly

---

### STEP 15 — Export as PDF

1. On the landing page, click **"Imprimir / Salvar como PDF"**
2. Browser print dialog opens
3. Set:
   - **Destination:** Save as PDF
   - **Paper size:** A4
   - **Margins:** Default
   - ✅ **Enable "Background graphics"** (important — preserves dark hero section)
4. Click Save

The PDF saves a 7-page professional document with the full proposal content including the AI-generated images.

---

### END-TO-END SUMMARY

You have now completed the full workflow:

```
✅ Company added (Havaianas Brasil)
✅ Competitors auto-discovered (Grendene, Ipanema, Rider, etc.)
✅ Intelligence generated (fit score 8.1/10, strategies, audience)
✅ Differentiator analysis (competitive gaps, campaign themes, outreach email)
✅ Inventory suggestions (recommended package R$280k-420k)
✅ Campaign generated ("Coxa no Pe" concept)
✅ Proposal created via wizard (6 steps, personalised AI output)
✅ Approval flow completed (Draft → Under Review → Approved)
✅ Share token generated (public URL ready)
✅ Jersey mockup image generated (gpt-image-1)
✅ LED board image generated (wide format)
✅ Landing page complete (all sections + images embedded)
✅ PDF exported (7-page professional document)
✅ Public URL ready to send to Carlos Mendes
```

**Total time for a new company to a shareable, image-rich proposal: ~10-15 minutes**

---

## 2. Dashboard

**URL:** `/`

The dashboard is your command centre.

### Stats Cards

| Card | What it shows |
|---|---|
| Total Companies | All prospect/active companies |
| Total Proposals | All proposals across all statuses |
| Total Campaigns | Campaign ideas generated |
| Approved Proposals | Proposals ready to share |

### Quick Actions Row (4 buttons)

| Button | Goes to |
|---|---|
| **Add Company** | `/companies/new` |
| **Generate Campaign** | `/campaigns` |
| **Create Proposal** | `/proposals/new` |
| **Generate Images** | `/media-generation` |

> **Note:** The floating + Quick Actions button is only visible on the main list pages (Dashboard, Companies, Proposals, Campaigns, Inventory). It is intentionally hidden on wizard/editor pages to avoid blocking buttons.

---

## 3. Adding a Company

**URL:** `/companies/new`

### Form Fields

| Field | Required | Notes |
|---|---|---|
| Company Name | YES | Full brand name |
| Industry | YES | Select from dropdown |
| Website | - | Used for AI intelligence scraping |
| Company Size | YES | Small / Medium / Large / Enterprise — drives pricing tiers |
| Business Type | YES | B2B or B2C — shapes proposal strategy |
| Segment | YES | Local / State / National / Global |
| Pipeline Stage | - | Prospect / Qualified / Proposal / Negotiation / Closed |
| Contact Name | - | Primary decision-maker |
| Contact Email | - | For AI-generated outreach emails |
| Contact Phone | - | Reference only |
| Notes | - | Strategic context — the more detail, the better the AI output |

### After Saving

The system **automatically** (within 45-60 seconds, in background):
- Scrapes the company website for brand signals
- Discovers competitor companies via AI (Claude)
- Saves competitors as individual company records

**Wait 45-60 seconds, then refresh the company page** to see discovered competitors.

---

## 4. Company Intelligence & Competitors

**URL:** `/companies/[id]`

### Left Column — AI Analysis

Click **"Generate Intelligence"** to run AI analysis. Shows:
- Marketing goals
- Sponsorship fit score (0-10)
- Recommended strategies
- Brand positioning summary
- Audience alignment with Coritiba FC

**Discovered Competitors** — listed below the analysis.
Click **"Run Discovery"** to manually re-trigger competitor discovery.

### Right Sidebar Panels

**Inventory Suggestion Panel:**
1. Click **"Suggest Inventory & Proposal Type"**
2. Wait ~20 seconds
3. See: recommended proposal type, fit score, specific inventory items with reasons, package value range, outreach angle
4. Click **"Create [Type] Proposal Now"** to jump directly into the wizard

---

## 5. Differentiator Analysis

**Location:** Company detail page --> right sidebar --> "Differentiator Analysis" panel

Compares the company against discovered competitors to find unique sponsorship angles.

### How to Use

1. Click **"Analyse"** button
2. Wait ~20-30 seconds
3. Three tabs appear:

**Overview Tab:**
- Sponsorship Fit Score
- Brand Strengths
- Competitor Gaps (what competitors are NOT doing)
- Ideal package recommendation

**Campaign Themes Tab:**
- 3-5 campaign concepts tailored to this specific brand
- Each with name, angle, and activation idea

**Outreach Tab:**
- Personalised proposal intro paragraph
- Ready-to-send cold email to the contact person

> **Tip:** Run Differentiator Analysis BEFORE generating a proposal. The insights automatically feed into the AI proposal generator.

---

## 6. Generating a Campaign

**URL:** `/campaigns`

### How to Generate

1. Go to `/campaigns`
2. In the "Generate Ideas" panel:
   - Select a **Company** (auto-selected if you came from a company page via "Generate Campaign" button)
   - Fill in **Objective / context**, e.g.:
     ```
     Summer football activation - position Havaianas as the official
     informal footwear of Coritiba FC fans. Target young adults 18-35
     in Parana. Leverage match days and social media for brand recall.
     ```
3. Click **"Generate ideas"**
4. Wait ~15-20 seconds

### Output

3-5 campaign concepts each with title, summary, and strategy angle.

Click **"Create proposal from this campaign"** to open the wizard with this campaign pre-selected.

---

## 7. Creating a Proposal (Wizard)

**URL:** `/proposals/new`

A 6-step guided wizard.

---

### Step 1 — Proposal Type

| Type | Use Case |
|---|---|
| **Sponsorship** | Cash-based package: jersey, LED, digital, VIP |
| **Barter / Goods** | Exchange products/services instead of cash |
| **Lei de Incentivo** | Tax-incentive social/ESG project |
| **Mixed Proposal** | Hybrid: cash + barter + social impact |

Click **Continue**.

---

### Step 2 — Select Company

Search and click a company. Intelligence preview shows Industry, Type, Scope, Size.

Click **Continue** (disabled until company is selected).

---

### Step 3 — Select Inventory Items

For **Sponsorship / Mixed:** Live items from database, grouped by category.

**Available categories:**
- Jersey (Front, Sleeve L/R, Back, Training Kit)
- Stadium/LED (LED Perimeter Pre-Match/Half-Time/Full, Giant Scoreboard)
- Press/Media (Press Backdrop, Mixed Zone Board)
- Hospitality (VIP Box, Lounge, Player Tunnel)
- Digital/Social (Instagram Feed/Reels, TikTok, YouTube, Match Day Package)

**How to select:**
- Click item card to toggle on/off
- Use +/- buttons to set quantity
- **Package Total** updates automatically based on company size tier

For **Barter / Lei de Incentivo:** Static curated component list appears instead.

Click **Continue**.

---

### Step 4 — Strategy Selection

Select 1-4 strategy types (AI recommends based on company profile):

| Strategy | Focus |
|---|---|
| Brand Awareness | Maximum impressions and visibility |
| Fan Engagement | Deep emotional fan connection |
| Digital & Social First | Social media-led activation |
| Community | Local Curitiba/Parana presence |
| Premium Activation | VIP experiences, executive hospitality |
| Sustainability / ESG | Green credentials, social responsibility |

Click **Continue**.

---

### Step 5 — Review & Generate

Add optional **Additional Brief** for context:
```
Reference key brand values, market positioning, any specific
campaign angles or seasonal themes you want the AI to use.
```

Click **Generate Proposal** (amber button). Wait 30-45 seconds.

---

### Step 6 — Done

Click **"View Proposal"** to open the generated proposal.

---

## 8. Approval Flow

**Location:** Proposal detail page --> right sidebar --> "Approval Flow" panel

5-step lifecycle:
```
1. Draft --> 2. Under Review --> 3. Approved --> 4. Images --> 5. Live
```

### Steps

**Draft to Under Review:**
- Click **"Submit for Review"**
- Status: `draft` --> `under_review`

**Under Review to Approved:**
- Click **"Approve Proposal"**
- Status: `approved`
- Share token **automatically generated** -- no extra step needed
- **"View Landing Page"** button appears in header

**Approved to Images:**
- Click **"Generate Images"** --> goes to `/media-generation`
- After images complete and link to proposal, Step 4 shows complete

**Images to Live:**
- Landing page fully live with embedded images
- Share public URL with prospect

### Other Decisions

- **Request Revision** --> `revision_requested` (goes back to Draft)
- **Reject** --> `rejected` (archived)

---

## 9. AI Image Generation

**URL:** `/media-generation`

### Create a New Job

1. Click **"New Generation Job"**
2. Fill in:

| Field | Notes |
|---|---|
| Job Type | Jersey Mockup, LED Board, Stadium Banner, Social Post, etc. |
| Proposal | Optional -- links image to proposal (auto-shows on landing page) |
| Prompt | Detailed description of the image |
| Negative Prompt | What to avoid (e.g. "blurry, low quality, competitor clubs") |
| Size | 1024x1024 (square), 1536x1024 (landscape), 1024x1536 (portrait) |
| Quality | Standard or HD |

**Good prompt examples:**

Jersey Mockup:
```
Photorealistic Coritiba FC official green and white jersey with
Havaianas Brasil logo on chest, professional product photography,
clean white background, high resolution fabric texture
```

LED Board:
```
Havaianas logo on LED perimeter boards at Estadio Couto Pereira
during Coritiba FC match, wide angle, evening atmosphere, photorealistic
```

### Buttons

| Button | Action |
|---|---|
| **Generate Now** | Create + approve + generate in one click |
| **Save for Later** | Create with `pending_approval` -- approve manually later |

### Job Status Flow

```
pending_approval --> approved --> generating --> completed
                                             --> failed (click Retry)
```

### Linking to Proposals

Select the proposal in the dropdown when creating the job. Completed images automatically appear on that proposal's landing page.

---

## 10. Proposal Landing Page

### Admin View

**URL:** `/proposals/[id]/view`
**Access:** Proposal detail page --> "Landing Page" button in header

### Public Share Page

**URL:** `/proposals/view/[share_token]`
**Access:** Proposal page --> Share button --> copy link

No login required for the public URL. Safe to send directly to prospects.

### Sections on the Landing Page

| Section | Content |
|---|---|
| Hero | Company + Coritiba FC title, approval badge |
| Stats | Club metrics (1.5M+ followers, 38+ games, +47% growth) |
| Executive Summary | Personalised AI-generated opening |
| Detailed Proposal | Full strategy and activation plan |
| Deliverables | Inventory items selected |
| Generated Images | AI visuals (jersey, LED boards, etc.) |
| Investment | Package pricing and ROI |
| CTA | Call to action |

### PDF Export

Click **"Imprimir / Salvar como PDF"**.

In the print dialog:
- Destination: Save as PDF
- Paper size: A4
- Enable **"Background graphics"** to keep the dark hero section

---

## 11. Mockup Editor

**URL:** `/media-generation` --> Mockup Editor tab

Canvas-based editor for placing sponsor logos on jersey/stadium templates.

1. Upload sponsor logo (PNG with transparent background)
2. Select template (jersey front, jersey back, LED board, banner)
3. Drag logo to position
4. Resize with corner handles
5. Export

---

## 12. Inventory Management

**URL:** `/inventory`

### Inventory Item Fields

| Field | Description |
|---|---|
| Name | Asset name |
| Category | Jersey / Stadium / Press / Hospitality / Digital |
| Unit Type | per_season / per_match / per_month / per_post / per_slot |
| Total Quantity | How many units exist |
| Slot Timing | Pre-match / Half-time / Full match (for LED boards) |
| Price Small/Medium/Large/Enterprise | Tiered pricing by company size |
| Exclusive | Yes/No -- only one sponsor can hold this |

---

## 13. Global Search

**Trigger:** `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)

OR click the search icon in the top-left sidebar.

Search across:
- Companies ("Heineken", "Natura")
- Proposals ("Coritiba", "Verde")
- Campaigns ("Summer", "Digital")
- Inventory ("LED", "Jersey")

---

## 14. Troubleshooting

| Problem | Fix |
|---|---|
| "Continue" button not working in wizard | Fixed -- Quick Actions FAB was overlapping it; FAB hidden on wizard pages |
| "Generate Campaign" button gives 404 | Fixed -- now links to `/campaigns?company=ID` |
| Image generation shows "failed" | Check `OPENAI_API_KEY` in `.env`; click Retry on the job |
| "invalid input syntax for type uuid" | Fixed -- empty fields now converted to null before DB insert |
| Mockup editor shows react-konva error | Run `pm2 restart all`; using react-konva v18.2.16 |
| No inventory items in wizard Step 3 | Migration 0014 not applied -- run it in Supabase SQL Editor |
| Competitor discovery didn't run | Company page --> AI Analysis --> click "Run Discovery" manually |
| Share link blank or 404 | Approve the proposal -- share token auto-generates on approval |
| Landing page PDF has blank background | Enable "Background graphics" in browser print dialog |
| Application down after restart | PM2 auto-restarts; run `pm2 start ecosystem.config.js` if needed |

---

## 15. Navigation Reference

| Page | URL |
|---|---|
| Dashboard | `/` |
| Companies List | `/companies` |
| Add Company | `/companies/new` |
| Company Detail | `/companies/[id]` |
| Proposals List | `/proposals` |
| New Proposal | `/proposals/new` |
| Proposal Detail | `/proposals/[id]` |
| Proposal Admin View | `/proposals/[id]/view` |
| Public Landing Page | `/proposals/view/[share_token]` |
| Campaigns | `/campaigns` |
| Inventory | `/inventory` |
| AI Image Generation | `/media-generation` |
| Mockup Editor | `/mockup-editor` |
| System Health | `/system` |

---

## Key AI Features

| Feature | AI Model | How to trigger |
|---|---|---|
| Company Intelligence | Claude (AWS Bedrock) | "Generate Intelligence" button on company page |
| Competitor Discovery | Claude (AWS Bedrock) | Auto on company creation + "Run Discovery" manual |
| Differentiator Analysis | Claude (AWS Bedrock) | "Analyse" button on company page sidebar |
| Inventory Suggestions | Claude (AWS Bedrock) | "Suggest Inventory" button on company page sidebar |
| Campaign Generation | Claude (AWS Bedrock) | "Generate ideas" on campaigns page |
| Proposal Generation | Claude (AWS Bedrock) | "Generate Proposal" in wizard Step 5 |
| AI Image Generation | OpenAI gpt-image-1 | "Generate Now" button in media-generation |

---

*Last updated: May 2026 - Coritiba FC Commercial Sponsorship Platform*
