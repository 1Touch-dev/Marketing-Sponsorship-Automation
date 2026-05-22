Here is a complete end-to-end test using one example that flows through every feature. Use exactly these values so the steps match.

---

# End-to-End Test Guide
**Example company: Ambev Brasil (Brahma beer brand)**

---

## PHASE 1 — Add a Company

**URL:** https://eligibly-facing-unloved.ngrok-free.dev/companies/new

1. Click **"Add Company"** on the dashboard or **"Companies"** → **"New Company"** in the sidebar
2. Fill in exactly:
   - Company Name: `Ambev Brasil`
   - Industry: `Bebidas`
   - Country: `Brazil`
   - Website: `https://www.ambev.com.br`
   - Business Type: `B2C`
   - Company Size: `Enterprise`
   - Geographic Reach: `National`
   - Pipeline Stage: `Prospect`
   - Contact Person Name: `Carlos Mendes`
   - Contact Email: `carlos.mendes@ambev.com.br`
   - Contact Phone: `+55 41 99999-1234`
   - Strategic Notes: `Beer brand with strong football association nationally`
3. Click **"Add Company"**
4. You should land on the **Ambev Brasil company detail page**

**What to verify:** Company card shows all fields, industry badge visible, pipeline stage shows Prospect

---

## PHASE 2 — Run AI Intelligence on the Company

Still on the **Ambev Brasil company page:**

1. Find the **"Company Intelligence"** section or **"Run Intelligence"** button
2. Click **"Generate Intelligence"** or **"Analyse"**
3. Wait 20–40 seconds for Claude AI to run
4. You should see a rich intelligence card appear with sections like:
   - Brand overview
   - Why they fit Coritiba FC
   - Estimated sponsorship budget range
   - Fit score (e.g. 8.5/10)

**What to verify:** Intelligence text appears, Fit Score visible, no error message

---

## PHASE 3 — Run Competitor Discovery (Apify)

Still on the **Ambev Brasil company page:**

1. Scroll down to find the **"Competitor Discovery"** panel (or "Industry Discovery")
2. Click **"Discover Competitors"** or **"Find Similar Companies"**
3. Wait 30–60 seconds (this calls Apify to search Google)
4. A list of similar companies should appear (e.g. Heineken, Petrobras, Brahma competitors)
5. You should see a **"✓ Saved to database"** green banner after results load

**What to verify:** Competitor list appears, green "Saved" banner shows, refresh page and companies are still there (persistence test)

---

## PHASE 4 — Generate a Campaign

**URL:** https://eligibly-facing-unloved.ngrok-free.dev/campaigns

1. Click **"Campaigns"** in the sidebar
2. In the company selector, type `Ambev` and select **Ambev Brasil**
3. Click **"Generate Campaign Ideas"**
4. Wait 20–30 seconds
5. Three campaign strategy cards should appear, for example:
   - "Brahma Verde — A Cerveja do Couto Pereira"
   - "Matchday Brahma Experience"
   - "Torcida Brahma Digital"
6. Click **"Save Campaign"** on the one you like

**What to verify:** 3 strategy cards generated, each with a title, description and estimated reach. Campaign saved and appears in the list on the right side.

---

## PHASE 5 — Create a Proposal (6-step wizard)

**URL:** https://eligibly-facing-unloved.ngrok-free.dev/proposals/new

1. Click **"New Proposal"** in the sidebar

**Step 1 — Proposal Type:**
- Select **"Sponsorship"**
- Click **Continue**

**Step 2 — Select Company:**
- Search for and select **Ambev Brasil**
- Click **Continue**

**Step 3 — Select Components:**
- Tick at least 3 inventory items, e.g.:
  - Jersey Front — Principal Sponsor
  - LED Perimeter Board — Full Season
  - Instagram Reels — Sponsored Content
- Click **Continue**

**Step 4 — Strategy:**
- Select the campaign you saved in Phase 4
- Click **Continue**

**Step 5 — Generate:**
- Click **"Generate Proposal"**
- Wait 30–60 seconds (Claude AI writing the full proposal)
- Progress indicators will show

**Step 6 — Review:**
- Full proposal preview appears
- Click **"Save & View Proposal"**

**What to verify:** All 6 steps navigable, Continue button works on each step, proposal text generates without error, proposal is saved

---

## PHASE 6 — View the Proposal Detail Page

You should now be on the proposal detail page for Ambev Brasil.

**Check each panel in the right sidebar:**

**A — Approval Flow bar at the top:**
- Should show: Draft → Review → Approved → Images → Live
- Current step should be highlighted (Draft)

**B — Execution Brief:**
1. Scroll to the **"📋 Execution Brief"** card
2. Click **"Generate Execution Brief"**
3. Wait 20–30 seconds
4. Three strategy rows should appear, each showing:
   - Estimated cost (e.g. R$ 180k–250k)
   - Timeline (e.g. 16–20 weeks)
   - Resources needed (videographer, player involvement, etc.)
   - Action items

**What to verify:** Brief generates for all 3 strategies, costs and timelines visible, marked "Interno" (not shown to client)

**C — Campaign Image Generator:**
1. Scroll to **"🎨 Imagens de Campanha"** card
2. Click **"Gerar Criativos"** or the generate button next to one strategy
3. Wait 30–60 seconds (DALL-E 3 generating)
4. A campaign image should appear

**What to verify:** Image renders, no UUID error, image shows a football/stadium/jersey visual

---

## PHASE 7 — Submit for Approval

On the proposal detail page:

1. Find the **"Approval"** panel (right sidebar)
2. Click **"Submit for Review"**
3. Status badge at top should change from **Draft** to **Under Review**
4. The approval flow bar should advance to step 2

**What to verify:** Status badge changes colour, flow bar advances

---

## PHASE 8 — Approve the Proposal

1. Click **"Approve"** in the Approval panel
2. A confirmation or reason field may appear — click **Confirm**
3. Status should change to **Approved** (green badge)
4. The flow bar should advance to step 3

**What to verify:** Status shows Approved in green, flow bar on step 3

---

## PHASE 9 — View the Landing Page (Prospect View)

On the proposal detail page:

1. Click the **"Landing Page ↗"** button at the top
2. A new tab opens with the public-facing proposal
3. You should see:
   - Dark green Coritiba FC hero banner
   - Ambev Brasil company name
   - Stats bar (reach, matches, digital growth)
   - 3 strategy cards (one per campaign)
   - Generated images (if linked)
   - Investment section

**What to verify:** Landing page loads, Coritiba branding visible, strategy cards show, no broken layout

---

## PHASE 10 — Generate a Shareable Link

Back on the proposal detail page:

1. Find the **"Shareable URL"** button
2. Click it to generate a public share link
3. Copy the link and open it in a **private/incognito** browser tab
4. The landing page should load without login

**What to verify:** Link works without being logged in, shows the proposal correctly

---

## PHASE 11 — Generate Outreach Email

On the proposal detail page (proposal must be Approved):

1. Scroll to the **"Outreach"** or **"Draft Email"** panel
2. Fill in:
   - Recipient email: `carlos.mendes@ambev.com.br`
   - Contact name: `Carlos Mendes`
3. Click **"Generate Email"**
4. Wait 15–20 seconds
5. A Portuguese outreach email draft appears

**What to verify:** Email text generated, contains company name and proposal reference, no error

---

## PHASE 12 — Check Pipedrive Sync

1. Click **"CRM Sync"** in the sidebar
2. Check the green **"✓ Pipedrive Conectado"** banner is visible
3. Look at the sync queue — you should see entries for:
   - Ambev Brasil (organisation created in Pipedrive)
   - The Ambev proposal (deal created in Pipedrive)
4. Both should show status **Synced**

**What to verify:** Green connected banner, Ambev org and deal appear in sync history with ✓ Synced

---

## PHASE 13 — Check AI Image Generation Page

**URL:** https://eligibly-facing-unloved.ngrok-free.dev/media-generation

1. Click **"AI Image Gen"** in the sidebar
2. Find the image job created in Phase 6
3. It should show status **Completed** or **Pending Approval**
4. If Pending Approval, click **"Approve"**
5. Once approved, click **"New Generation Job"** to test creating one manually:
   - Company: Ambev Brasil
   - Job Type: Campaign Creative
   - Prompt: `Ambev Brahma beer brand logo on Coritiba FC LED board at Couto Pereira stadium, match night atmosphere`
   - Click **"Save & Generate"**
   - Wait 30–60 seconds
   - Image should appear

**What to verify:** Existing job visible, new job generates successfully, image appears

---

## PHASE 14 — Check Team & Roles Page

1. Click **"Team & Roles"** in the sidebar (System section)
2. You should see:
   - Roles permission table at the top
   - User table showing `admin@coritiba.com.br` with role Admin
3. Click **"+ Invite user"**
4. Fill in:
   - Name: `James Thunder`
   - Email: `james@coritiba.com.br`
   - Role: `Approver`
5. Click **"Send invite"**
6. James should appear in the user table immediately

**What to verify:** Permission table visible, admin user shown, new user added successfully

---

## PHASE 15 — Check Inventory Page

1. Click **"Inventory"** in the sidebar
2. You should see 15+ items across categories (Jersey, LED Board, Social, etc.)
3. Each item shows name, price range, availability, and reach
4. Click on a campaign detail page to see the **Campaign Inventory Table**:
   - Go to Campaigns → click on the Ambev campaign
   - Scroll to inventory section
   - Click **"+ Add Item"**
   - Select "LED Perimeter Board — Full Season"
   - Adjust quantity and price
   - Click Save

**What to verify:** Items load, prices visible, inventory table on campaign page works

---

## Quick Pass/Fail Checklist

| # | Feature | Expected Result |
|---|---|---|
| 1 | Add company | Company created, lands on detail page |
| 2 | AI Intelligence | Intelligence card and fit score appear |
| 3 | Competitor Discovery | List saved, persists on refresh |
| 4 | Generate Campaign | 3 strategy cards generated |
| 5 | Proposal Wizard | All 6 steps work, proposal saved |
| 6 | Execution Brief | Time/cost/resources for each strategy |
| 7 | AI Image Generation | Image renders without error |
| 8 | Approval Flow | Status moves Draft → Review → Approved |
| 9 | Landing Page | Public page loads with Coritiba branding |
| 10 | Shareable Link | Opens in incognito without login |
| 11 | Outreach Email | Email draft generated in Portuguese |
| 12 | Pipedrive Sync | Green banner, org + deal show as Synced |
| 13 | Media Generation | New image job creates and completes |
| 14 | Team & Roles | User invited, appears in table |
| 15 | Inventory | Items load, campaign inventory saves |

Total time to complete: approximately 25–35 minutes.