# Coritiba FC Platform — Full Status Tracker
**Updated: May 25, 2026 | By: Abhishek**

---

## 🚨 URGENT — Action Required from James

| # | Item | What's needed | Who |
|---|------|--------------|-----|
| 1 | **Pipedrive API Token** | Log into coritiba.pipedrive.com with `patrocinios@coritiba.com.br` / `1909Coritiba` → Settings → Personal Preferences → API → copy token → send to Abhishek | James |
| 2 | **GPU Decision** | James leaning toward AWS GPU for team + interns. Confirm: start with Replicate now OR go straight to AWS? | James |
| 3 | **Replicate Account** | If going Replicate: create account at replicate.com, add billing, send API key | James |
| 4 | **Jersey video/images for training** | Already shared Dropbox link (mkt1909@). Need static PNG/JPG frames of the jersey for model training | Abhishek will extract |

---

## ✅ COMPLETED (Built, Tested, Deployed)

### Core Platform
- [x] **Supabase DB + all tables** — companies, proposals, campaigns, inventory, emails, approvals, image_generation_jobs, platform_users
- [x] **Full sidebar navigation** — all 20+ pages
- [x] **Dashboard** with stats (proposals, companies, campaigns, pending approvals)
- [x] **Role-based access** — Admin, Sales, Approver, Viewer roles + permission gates

### Companies / CRM
- [x] **Add company** — full form with industry, segment, contact person, pipeline stage
- [x] **Company intelligence** — AI (Claude via AWS Bedrock) analyzes company, fit score, brand positioning
- [x] **Competitor discovery** — Apify Google Search + Claude identifies real competitors
- [x] **Differentiator analysis** — competitive positioning panel
- [x] **Scrape website** — Apify website content crawl
- [x] **Market intel (SERP)** — Apify search for industry context
- [x] **Apify Discovery panel** — bulk company discovery by industry

### Proposals
- [x] **6-step proposal wizard** — type → company → inventory → strategy → generate → review
- [x] **AI proposal generation** — Claude writes full proposal in Portuguese
- [x] **Strategy variants** — 3 marketing activation strategies per proposal
- [x] **Pricing tiers** — 3 investment levels (low/mid/high)
- [x] **Approval flow** — Draft → Under Review → Approved → Images → Live
- [x] **Execution Brief** — internal time/cost/resource estimate per strategy, now uses inventory hours/costs
- [x] **Campaign image generator** — strategy-aware prompts, tied to inventory used
- [x] **Image upload / Brand assets** — drag-and-drop logo upload on proposal page
- [x] **Shareable public link** — `/proposals/view/[token]` no login required
- [x] **Proposal versioning** — edit history
- [x] **CMS editor** — block-by-block editing of proposal content
- [x] **Duplicate proposal** button
- [x] **Enrich with AI** — enhance existing proposal content

### Landing Page (Rebuilt May 25)
- [x] **Storytelling format** with real Coritiba FC facts:
  - Founded 1909, 38,000+ members, 40,502 stadium capacity
  - 1.5M+ social followers, avg 25–36k attendance per match
  - Curitiba HDI 0.823 (highest in South Brazil), metro 3.7M
  - Broadcasts: Globo, SporTV, Paramount+
- [x] **Expandable strategy cards** — summary visible, click to expand full details
- [x] **Real KPI panel** — audience stats, Curitiba positioning strip
- [x] **AI-generated images** shown in landing page

### Inventory
- [x] **Physical inventory** — Jersey (5 items), LED Board, Banner, Scoreboard, Press Backdrop, Stadium Branding, Training Kit, VIP Area
- [x] **Digital inventory** — Social Feed Post, Stories/Reels, YouTube, Reels/TikTok, Player/Influencer, Sponsored Content, Email Newsletter, App Push
- [x] **Add/Edit/Delete** — inline form with hover actions
- [x] **New fields (May 25)**:
  - Digital: `avg_views`, `content_hours`, `team_required`
  - Physical: `production_cost`, `setup_hours`, `line_items`
- [x] **Execution Brief integration** — brief now reads inventory hours/costs to estimate team workload

### Email
- [x] **AI outreach email generation** — Claude writes Portuguese outreach email
- [x] **Pipedrive email integration (built)** — logs email as Activity in Pipedrive (type: email, done: 1)
- [x] **Follow-up generation** — AI generates follow-up email
- [x] **Email threads** — conversation history

### Pipedrive CRM
- [x] **Organisation creation** — creates org in Pipedrive from company
- [x] **Deal creation** — creates deal linked to org in correct pipeline (Patrocínios/Mídias/etc.)
- [x] **Deal stage updates** — moves deal stage based on proposal status
- [x] **Notes** — adds proposal summary as note on deal
- [x] **Email activity logging** — logs outreach as email activity on deal
- [x] **Pipeline mapping** — Couto Pereira, Mídias, Patrocínios, Licenciamento, Lei Incentivo

### AI Image Generation
- [x] **DALL-E 3 pipeline** — create → approve → generate
- [x] **Image stored in Supabase Storage** — permanent URLs (not base64)
- [x] **Image viewer modal** — fixed portal rendering (was clipped by sidebar)
- [x] **Image thumbnails** in job list
- [x] **Link image to proposal** — appears on landing page
- [x] **Mockup editor** — Konva canvas with 5 templates (jersey, LED, social, backdrop, scoreboard)
- [x] **Mockup watermark removed** — clean PNG export, no placeholder text
- [x] **Jersey template** — Coritiba-style vertical stripes rendered

### System / Admin
- [x] **Audit log** — all actions tracked
- [x] **Workflow events** — pipeline state tracking
- [x] **Team & Roles** — user management with role permissions
- [x] **Maintenance mode**
- [x] **Health check API** — `/api/system/health`
- [x] **PM2 + systemd** — app restarts if server reboots
- [x] **ngrok tunnel** — public URL accessible

---

## 🔴 BLOCKED (waiting on James/credentials)

| # | Feature | Blocker | Notes |
|---|---------|---------|-------|
| 1 | **Pipedrive live integration** | Need fresh API token | Token at `b8998d...` is expired. James has creds: patrocinios@coritiba.com.br / 1909Coritiba but needs email verification first |
| 2 | **AI Jersey/Stadium model training (LoRA)** | Need Replicate API key OR AWS GPU setup decision + jersey images | James shared jersey video. Need decision: Replicate vs AWS |
| 3 | **Hunter.io email discovery** | Need Hunter.io API key from Ruhani | For finding contact emails from company domains |
| 4 | **Email verification (ZeroBounce)** | Need ZeroBounce API key from Ruhani | For validating emails before outreach |
| 5 | **Placid mockup API** | Need Placid API key from Ruhani | For automated branded mockup templates |

---

## 🟡 PENDING (ready to build, no blockers)

| # | Feature | Priority | Est. Time |
|---|---------|----------|-----------|
| 1 | **Bulk Industry Campaigns** — generate proposals for an entire industry at once | High | 1 day |
| 2 | **CMS Status "Active / In Contract"** — new status for signed sponsors | Medium | 4h |
| 3 | **Monthly Reports for Active Sponsors** — content report for sponsors in contract | Medium | 1 day |
| 4 | **Asana Integration** — create tasks from execution brief items | Medium | 1 day |
| 5 | **Video support on landing page** — embed video per activation (James shared jersey video) | Medium | 4h |
| 6 | **Recent articles / news section on landing page** — add news/partnership examples | Low | 3h |
| 7 | **Proposal A/B/C campaign variation editor** — AI creates 3 variations, choose per campaign | Medium | 1 day |
| 8 | **Data enrichment improvements** — more aggressive scraping, LinkedIn, news, financials | High | 1-2 days |
| 9 | **Upcoming matches / events section** — pull Coritiba fixture calendar | Medium | 4h |

---

## 🟢 PIPEDRIVE — Step-by-Step to Fix

James needs to do this once:

1. Check email at `patrocinios@coritiba.com.br` for Pipedrive verification link
2. Click the link → logs into `coritiba.pipedrive.com`
3. Go to: **Your name (top right) → Personal Preferences → API**
4. Copy the **Personal API Token** (looks like: `abc123def456...40chars`)
5. Send the token to Abhishek
6. Abhishek updates `.env.local`: `PIPEDRIVE_API_KEY=<new_token>`
7. Restart server — Pipedrive goes green ✅

---

## 🖼️ GPU / AI Image Training — Decision Summary

**James's direction (May 23):** "once we have a dedicated GPU that can run several models, for all team here in Brazil + all interns — then it justifies, don't you think"

**Recommendation:** Start with Replicate ($5–15 one-time training, $0.003/image after), then move to AWS g4dn reserved ($240/month) when volume and team size justifies.

**To proceed with Replicate:**
1. Create account at replicate.com
2. Add billing (credit card)
3. Send API key `REPLICATE_API_TOKEN=r8_...`
4. Abhishek will extract jersey frames from the Dropbox video and run training

**AWS GPU option:** Ready to set up when James confirms. g4dn.xlarge reserved 1-year = ~$240/month, runs LoRA training for Coritiba jersey + stadium + any future models.

---

## 📱 Hosting / ngrok

- App runs 24/7 via PM2 (auto-restarts if crashed)
- systemd ensures PM2 starts on server reboot
- ngrok free tier resets URL occasionally — if URL stops working, run: `pm2 restart ngrok-tunnel`
- **For permanent URL:** Use ngrok paid ($8/month) for a fixed domain, OR deploy to Vercel/Railway

---

## 📊 Platform Health (as of May 25, 2026)

| Service | Status |
|---------|--------|
| App (Next.js) | ✅ Running |
| Database (Supabase) | ✅ Healthy |
| AI — Claude (AWS Bedrock) | ✅ Configured |
| AI — DALL-E 3 (OpenAI) | ✅ Configured |
| Apify (web scraping) | ✅ Configured |
| Pipedrive CRM | 🔴 Token expired |
| Gmail OAuth | 🔴 Replaced by Pipedrive |
| Replicate (AI training) | ⚪ Not configured yet |
| Asana | ⚪ Not configured yet |
