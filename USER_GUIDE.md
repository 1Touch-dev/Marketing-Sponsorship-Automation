# Market Sponsorship Automation — User Guide

> **Platform:** AI-powered commercial sponsorship operating system for Coritiba FC
> **Stack:** Next.js 14 · Supabase · AWS Bedrock (Claude) · OpenAI DALL-E 3
> **Live URL:** https://eligibly-facing-unloved.ngrok-free.dev

---

## Table of Contents

1. [Overview](#1-overview)
2. [Dashboard](#2-dashboard)
3. [Adding a Company](#3-adding-a-company)
4. [Company Intelligence & Competitors](#4-company-intelligence--competitors)
5. [Differentiator Analysis](#5-differentiator-analysis)
6. [Generating a Campaign](#6-generating-a-campaign)
7. [Creating a Proposal (Wizard)](#7-creating-a-proposal-wizard)
8. [Approval Flow](#8-approval-flow)
9. [AI Image Generation](#9-ai-image-generation)
10. [Proposal Landing Page](#10-proposal-landing-page)
11. [Mockup Editor](#11-mockup-editor)
12. [Inventory Management](#12-inventory-management)
13. [Global Search](#13-global-search)
14. [Troubleshooting](#14-troubleshooting)
15. [Navigation Reference](#15-navigation-reference)

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
