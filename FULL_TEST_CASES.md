# Coritiba FC Market Sponsorship Automation — Full QA Test Cases

**Platform:** https://eligibly-facing-unloved.ngrok-free.dev/
**Stack:** Next.js 14, Supabase, AWS Bedrock (Claude Sonnet 4), OpenAI (gpt-image-1), Pipedrive, Hunter.io, Apollo.io, Apify, PM2
**Last Updated:** 26 June 2026
**Total Test Cases:** 250+

---

## HOW TO USE THIS DOCUMENT

- Each test case has a unique ID (e.g. TC-1.1).
- **Steps** are numbered and actionable — real clicks, real URLs, real data.
- **Expected Result** is in bold.
- **Pass Criteria** states the binary condition for PASS.
- **Notes** flag known failure modes and workarounds.
- Run Section 29 (End-to-End) last, after all individual sections pass.
- Base URL: `https://eligibly-facing-unloved.ngrok-free.dev` (referred to as `BASE_URL`).

---

## SECTION 1: DASHBOARD (/)

### TC-1.1 — 8+ KPI Tiles Visible and Non-Zero

**Steps:**
1. Navigate to `BASE_URL/`.
2. Wait for page to fully load (spinner gone).
3. Count the number of KPI stat tiles in the top section.
4. Note the value displayed in each tile.

**Expected Result:** At least 8 KPI tiles are visible. Each tile shows a numeric value (not `—`, `null`, or `0` for all of them).

**Pass Criteria:** 8 or more tiles present; at minimum Pipeline Value and Emails Sent are non-zero.

**Notes:** Tiles are: Pipeline Value, Conversion Rate, Active Contracts, Emails Sent, Sent This Month, Image Gen Rate, Email Open Rate, Email Click Rate. If all show 0, the Supabase RPC or API call is failing — check DevTools Network tab.

---

### TC-1.2 — Pipeline Value Shows R$ Value

**Steps:**
1. Navigate to `BASE_URL/`.
2. Locate the 'Pipeline Value' KPI tile.
3. Read the displayed value.

**Expected Result:** Tile shows a value formatted as `R$ X,XXX,XXX` or similar Brazilian Real currency format.

**Pass Criteria:** Value contains 'R$' prefix and a numeric amount greater than 0.

---

### TC-1.3 — Conversion Rate Shows Percentage

**Steps:**
1. Navigate to `BASE_URL/`.
2. Locate the 'Conversion Rate' KPI tile.
3. Read the displayed value.

**Expected Result:** Tile shows a value formatted as `X%` (e.g. `12%`).

**Pass Criteria:** Value ends with `%` symbol.

---

### TC-1.4 — Active Contracts Count

**Steps:**
1. Navigate to `BASE_URL/`.
2. Locate the 'Active Contracts' KPI tile.
3. Note the count shown.
4. Navigate to `BASE_URL/contracts`.
5. Count active contracts in the list.

**Expected Result:** Count on dashboard matches count of active contracts on /contracts page.

**Pass Criteria:** Numbers match (±1 for in-flight transactions).

---

### TC-1.5 — Emails Sent Count

**Steps:**
1. Navigate to `BASE_URL/`.
2. Locate the 'Emails Sent' KPI tile.
3. Note the value.

**Expected Result:** Displays total count of outbound emails logged in the system.

**Pass Criteria:** Numeric value rendered without error.

---

### TC-1.6 — Email Open Rate Tile

**Steps:**
1. Navigate to `BASE_URL/`.
2. Locate the 'Email Open Rate' KPI tile.
3. Note the percentage value.

**Expected Result:** Tile displays `X%` format. May be `0%` if no emails sent after Jun 26 tracking deployment.

**Pass Criteria:** Tile renders without error; shows percentage format.

**Notes:** Open tracking only applies to emails sent AFTER the Jun 26 tracking pixel deployment. Pre-existing emails will show 0%.

---

### TC-1.7 — Email Click Rate Tile

**Steps:**
1. Navigate to `BASE_URL/`.
2. Locate the 'Email Click Rate' KPI tile.
3. Note the percentage value.

**Expected Result:** Tile displays `X%` format.

**Pass Criteria:** Tile renders without error; shows percentage format.

---

### TC-1.8 — Recent Proposals List

**Steps:**
1. Navigate to `BASE_URL/`.
2. Scroll to the 'Recent Proposals' section.
3. Count the number of proposals shown.
4. Click on one proposal title.

**Expected Result:** Up to 5 most recent proposals listed. Clicking a title navigates to the proposal detail page.

**Pass Criteria:** At least 1 proposal shown; click navigates to `/proposals/[id]`.

---

### TC-1.9 — Recent Emails List

**Steps:**
1. Navigate to `BASE_URL/`.
2. Scroll to the 'Recent Emails' section.
3. Count the number of emails shown.

**Expected Result:** Up to 5 most recent emails listed with subject line and recipient visible.

**Pass Criteria:** Email list renders; at least 1 item shown if emails exist in DB.

---

### TC-1.10 — Recent Activity Feed

**Steps:**
1. Navigate to `BASE_URL/`.
2. Scroll to the 'Recent Activity' or audit log section.
3. Verify activity items are visible.

**Expected Result:** Activity feed shows recent system events (proposal created, email sent, etc.) with timestamps.

**Pass Criteria:** Feed renders at least 1 item; no loading spinner stuck.

---

### TC-1.11 — No JS Console Errors on Dashboard

**Steps:**
1. Navigate to `BASE_URL/`.
2. Open DevTools (F12) → Console tab.
3. Hard-refresh the page (Ctrl+Shift+R).
4. Observe the console output.

**Expected Result:** No red errors in the Console. Warnings are acceptable.

**Pass Criteria:** Zero `console.error` level messages after full page load.

**Notes:** Common culprit is Next.js hydration mismatch or a failed fetch. Check Network tab for 4xx/5xx responses.

---

### TC-1.12 — Gmail Status Not Showing Expired Alert

**Steps:**
1. Navigate to `BASE_URL/`.
2. Look for an amber or red Gmail warning banner at the top of the dashboard.

**Expected Result:** If Gmail is connected, no expired alert shown. If expired, amber banner reads 'Gmail token expired — reconnect in Settings'.

**Pass Criteria:** No unexpected error state; banner only shown when token is genuinely expired.

**Notes:** If banner appears, navigate to `/settings` and reconnect Gmail via OAuth.

---

## SECTION 2: COMPANIES (/companies)

### TC-2.1 — Company List Loads with 500+ Companies

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Wait for the list to fully render.
3. Scroll to the bottom or check the count indicator.

**Expected Result:** At least 500 company cards/rows are loaded or a count of 500+ is shown in the header.

**Pass Criteria:** List renders without 500 error; count shown is 500 or higher.

---

### TC-2.2 — Search Box Filters in Real-Time

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click the search input field.
3. Type `Bradesco` (or another known company name).
4. Observe the list without pressing Enter.

**Expected Result:** Company list filters in real-time as you type, showing only companies matching 'Bradesco'.

**Pass Criteria:** Results update within 500ms of typing; irrelevant companies disappear.

---

### TC-2.3 — Industry Dropdown Filters Correctly

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click the 'Industry' filter dropdown.
3. Select 'Automotivo'.
4. Observe the filtered results.

**Expected Result:** Only companies with industry = 'Automotivo' are shown.

**Pass Criteria:** All shown companies display 'Automotivo' badge; no other industries visible.

---

### TC-2.4 — Status Dropdown Shows Only Competitors

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click the 'Status' filter dropdown.
3. Select 'Competitor'.
4. Observe the results.

**Expected Result:** Only companies with status=competitor are shown, each with a red 'Competitor' badge.

**Pass Criteria:** All shown companies have red competitor badge; non-competitor companies not shown.

---

### TC-2.5 — Size Filter (Small/Medium/Large)

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click the 'Size' filter dropdown.
3. Select 'Large'.
4. Verify results.

**Expected Result:** Only companies marked as 'Large' size are shown.

**Pass Criteria:** Filter renders options Small/Medium/Large; selecting one narrows the list.

---

### TC-2.6 — Pipeline Stage Filter

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click the 'Pipeline Stage' filter dropdown.
3. Select 'Prospect'.
4. Observe results.

**Expected Result:** Only companies with pipeline_stage = 'Prospect' are listed.

**Pass Criteria:** Dropdown includes all stage options; selected stage filters correctly.

---

### TC-2.7 — Country Filter

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Locate the 'Country' filter dropdown.
3. Select 'Brazil' or 'Brasil'.
4. Observe filtered results.

**Expected Result:** Only companies with country = Brazil are shown.

**Pass Criteria:** Filter applies; result count changes.

---

### TC-2.8 — Export CSV Button Downloads Correct File

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click the 'Export CSV' button.
3. Wait for the file download to complete.
4. Open the downloaded CSV file.
5. Check that it contains company_name, industry, status, website columns.

**Expected Result:** A `.csv` file downloads. Opening it shows properly formatted company data with correct headers and at least 500 rows.

**Pass Criteria:** File downloads; headers correct; row count matches dashboard company count (±5%).

---

### TC-2.9 — Bulk Import CSV Modal Opens

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click 'Bulk Import CSV' or the import button.
3. Observe the modal that opens.

**Expected Result:** A modal dialog opens with a file picker/dropzone that accepts CSV files and shows field mapping instructions.

**Pass Criteria:** Modal opens; file input accepts `.csv` extension.

---

### TC-2.10 — Add Company Button Opens Full Form

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click '+ Add Company' or 'New Company' button.
3. Observe the form that opens.

**Expected Result:** A form opens with fields: Company Name, Industry, Website, Country, Size, Pipeline Stage, Status.

**Pass Criteria:** All fields present; form submittable with required fields filled.

---

### TC-2.11 — Competitor Pipeline Stage Sets Red Badge

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click '+ Add Company' or open an existing company.
3. Set Status to 'Competitor (tracking only)'.
4. Save the company.
5. Return to the company list.

**Expected Result:** The saved company shows a red 'Competitor' badge in the company list.

**Pass Criteria:** Red badge visible; company appears when Status filter = Competitor.

---

### TC-2.12 — Company Cards Show Logo When Available

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Look for company cards/rows where a logo is displayed.
3. Verify the logo image renders (not broken image icon).

**Expected Result:** Companies with a logo_url stored in DB display their logo. Companies without a logo show a placeholder or initials avatar.

**Pass Criteria:** No broken image icons; logos render as images.

---

## SECTION 3: COMPANY DETAIL (/companies/[id])

### TC-3.1 — Page Loads with Company Info

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click on any company name.
3. Wait for the detail page to load.
4. Note: company name, industry, and status must be visible.

**Expected Result:** Company detail page loads showing the company name as the page heading, industry tag, status badge, and website link.

**Pass Criteria:** Page loads (no 404/500); company name rendered in H1.

---

### TC-3.2 — Edit Form Has All Required Fields

**Steps:**
1. Navigate to a company detail page.
2. Click 'Edit' or find the edit form section.
3. List all visible input fields.

**Expected Result:** Form contains: Company Name, Industry, Website, Country, Size (dropdown), Pipeline Stage (dropdown), Status (dropdown).

**Pass Criteria:** All 7 fields present and editable.

---

### TC-3.3 — Save Changes Updates Data

**Steps:**
1. Navigate to a company detail page.
2. Change the 'Country' field to 'Argentina'.
3. Click 'Save Changes'.
4. Hard-refresh the page (Ctrl+Shift+R).
5. Verify the Country field still shows 'Argentina'.

**Expected Result:** Data persists after save and page refresh.

**Pass Criteria:** Updated value visible after page refresh. Revert back to original after confirming.

---

### TC-3.4 — Pipeline Stage Dropdown Has All 8 Options

**Steps:**
1. Navigate to a company detail page.
2. Click the 'Pipeline Stage' dropdown in the edit form.
3. List all options shown.

**Expected Result:** Dropdown contains all 8 options: Prospect, Qualifying, Proposal Sent, Negotiation, Contract Sent, Closed Won, Closed Lost, On Hold.

**Pass Criteria:** All 8 stage options present in the dropdown.

---

### TC-3.5 — Action Buttons Visible

**Steps:**
1. Navigate to a company detail page.
2. Look for action buttons in the sidebar or header area.

**Expected Result:** The following buttons are visible: 'Run Agent', 'Find Competitors', 'Enrich Contacts', 'Run AI Analysis', 'Re-fetch Logo'.

**Pass Criteria:** All 5 action buttons present and clickable.

---

### TC-3.6 — Proposals and Campaigns Count Shown

**Steps:**
1. Navigate to a company detail page that has associated proposals.
2. Locate the proposals count indicator.
3. Locate the campaigns count indicator.

**Expected Result:** Both proposal and campaign counts are shown (e.g. '3 proposals', '2 campaigns').

**Pass Criteria:** Count indicators render; clicking them navigates to filtered proposals/campaigns list.

---

### TC-3.7 — Notes Section

**Steps:**
1. Navigate to a company detail page.
2. Scroll to the 'Notes' section.
3. Add a note: 'QA Test note — please ignore'.
4. Save and refresh.

**Expected Result:** Note persists after refresh; displayed in Notes section.

**Pass Criteria:** Note saves and reappears on reload.

---

### TC-3.8 — Contacts Tab with Hunter.io Domain Search UI

**Steps:**
1. Navigate to a company detail page.
2. Click on the 'Contacts' tab.
3. Locate the Hunter.io domain search field.

**Expected Result:** Contacts tab shows a domain search input pre-filled with the company domain (extracted from website field) and a 'Search' button.

**Pass Criteria:** Domain input field and Search button visible in Contacts tab.

---

### TC-3.9 — AI Intelligence Tab Shows Analysis

**Steps:**
1. Navigate to a company detail page.
2. Click on the 'AI Intelligence' tab.
3. If analysis exists, verify it renders.
4. If not, click 'Run AI Analysis' and wait.

**Expected Result:** AI Intelligence tab shows structured analysis text (company overview, sponsorship angles, recommended approach) when analysis has been run.

**Pass Criteria:** Tab renders; analysis text shown when available.

---

### TC-3.10 — Inline Industry Edit

**Steps:**
1. Navigate to a company detail page.
2. Click directly on the industry tag/badge (not the edit form).
3. Observe whether a dropdown appears inline.

**Expected Result:** Clicking the industry tag opens an inline dropdown with all industry options. Selecting one saves immediately.

**Pass Criteria:** Inline dropdown appears on click; selection saves without clicking a separate Save button.

---

### TC-3.11 — Back to Companies Breadcrumb

**Steps:**
1. Navigate to a company detail page.
2. Click the 'Companies' breadcrumb link at the top.

**Expected Result:** Navigates back to `/companies` list page.

**Pass Criteria:** Browser navigates to /companies without error.

---

## SECTION 4: OUTREACH AGENT (Company Detail → Run Agent)

### TC-4.1 — Run Agent Button Exists on Company Detail

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click any company.
3. Scan the page for a 'Run Agent' button.

**Expected Result:** A clearly labelled 'Run Agent' button is visible on the company detail page.

**Pass Criteria:** Button present and enabled.

---

### TC-4.2 — Click Run Agent Starts SSE Progress Stream

**Steps:**
1. Navigate to a company detail page.
2. Open DevTools → Network tab.
3. Click 'Run Agent'.
4. In Network tab, look for a request to `/api/agent/run` with `text/event-stream` content type.
5. Observe the UI for a progress panel appearing.

**Expected Result:** Network shows an active SSE (EventStream) connection. A progress UI panel appears on the page with a spinner or step list.

**Pass Criteria:** SSE connection established; at least one progress step visible in UI within 5 seconds.

---

### TC-4.3 — Step 1 'enrich_contacts' Appears

**Steps:**
1. Click 'Run Agent' on a company detail page.
2. Observe the streaming progress panel.

**Expected Result:** Within the first 30 seconds, a step labelled 'enrich_contacts' (or 'Enriching Contacts') appears in the progress list with a status indicator.

**Pass Criteria:** Step 1 shown with a completed or in-progress indicator.

---

### TC-4.4 — Step 2 'scrape_company_intelligence' Appears

**Steps:**
1. Continue observing the agent progress panel after Step 1 completes.

**Expected Result:** Step 2 'scrape_company_intelligence' (or 'Scraping Company Intelligence') appears and progresses.

**Pass Criteria:** Step 2 shown; it can take up to 60 seconds for web scraping.

---

### TC-4.5 — Step 3 'generate_personalized_proposal' with Preview

**Steps:**
1. Continue observing the progress panel after Step 2.

**Expected Result:** Step 3 'generate_personalized_proposal' appears and, once complete, shows a proposal text preview inline in the progress UI.

**Pass Criteria:** Proposal text preview (at least a title and first paragraph) visible in the UI.

**Notes:** This step calls AWS Bedrock Claude Sonnet 4. May take 30–90 seconds. If it times out, check Bedrock quotas.

---

### TC-4.6 — First Approval Gate Appears

**Steps:**
1. Wait for Step 3 to complete.
2. Observe the approval gate UI that should appear.

**Expected Result:** A pause point appears showing two buttons: 'Approve Proposal' (green) and 'Reject' (red/grey). The agent is paused waiting for human input.

**Pass Criteria:** Both 'Approve Proposal' and 'Reject' buttons visible; agent halted (no further steps progressing).

---

### TC-4.7 — Click Approve Proposal Moves to Step 4

**Steps:**
1. At the first approval gate, click 'Approve Proposal'.
2. Observe the progress panel.

**Expected Result:** Agent resumes. Step 4 'generate_personalized_email' begins processing.

**Pass Criteria:** Step 4 appears within 5 seconds of clicking Approve.

---

### TC-4.8 — Step 4 'generate_personalized_email' with Preview

**Steps:**
1. Wait for Step 4 to complete after approving proposal.

**Expected Result:** Step 4 completes and shows a personalized email preview inline — subject line and body text visible.

**Pass Criteria:** Email preview shows subject + body text; no placeholder tokens like [Nome] visible (template engine resolved them).

---

### TC-4.9 — Second Approval Gate Appears

**Steps:**
1. Wait for the email preview to appear after Step 4.
2. Observe the second approval gate.

**Expected Result:** A second pause point appears with 'Approve Email' (green) and 'Reject' (red) buttons.

**Pass Criteria:** Both buttons visible; agent paused.

---

### TC-4.10 — Click Approve Email Triggers Step 5 Send

**Steps:**
1. At the second approval gate, click 'Approve Email'.
2. Observe progress panel for Step 5.

**Expected Result:** Agent resumes with Step 5 'send_email'. Email is sent (or logged if Gmail token expired).

**Pass Criteria:** Step 5 appears and completes with a success message.

**Notes:** If Gmail OAuth token is expired, the email will be logged but not actually delivered to inbox. Check `/emails` to confirm the record was created.

---

### TC-4.11 — Sent Email Appears in /emails List

**Steps:**
1. After agent completes Step 5, navigate to `BASE_URL/emails`.
2. Look for the newly sent email in the list.

**Expected Result:** The email sent by the agent appears at the top of the emails list with the correct recipient and subject.

**Pass Criteria:** Email record exists in /emails within 30 seconds of agent completion.

---

### TC-4.12 — Cancel Button Stops Agent Mid-Flight

**Steps:**
1. Click 'Run Agent' on a company detail page.
2. While the agent is running (before Step 3 completes), click the 'Cancel' button.
3. Observe the progress panel.

**Expected Result:** Agent stops immediately. Progress panel shows 'Cancelled' status. No further steps execute.

**Pass Criteria:** Cancel fires a DELETE to `/api/agent/run/[runId]`; agent halts within 2 seconds.

**Notes:** The cancel button sends a DELETE with the run UUID from the SSE response header. Fixed in commit `3d77a37`.

---

### TC-4.13 — Duplicate Run Prevention

**Steps:**
1. Click 'Run Agent' on a company detail page.
2. While the agent is actively running, click 'Run Agent' again (or try opening another company and running agent).
3. Observe the response.

**Expected Result:** Second run attempt is blocked with a message like 'An agent run is already in progress' or returns HTTP 409 Conflict.

**Pass Criteria:** Duplicate run blocked; UI shows appropriate warning message.

---

## SECTION 5: HUNTER.IO CONTACTS

### TC-5.1 — Enrich Contacts Tab Visible

**Steps:**
1. Navigate to a company detail page.
2. Click on the 'Contacts' tab.
3. Locate the Hunter.io domain search section.

**Expected Result:** A domain input field (pre-populated with company domain) and a 'Search' button are visible in the Contacts tab.

**Pass Criteria:** Domain field and Search button present.

---

### TC-5.2 — Domain Search Returns Results

**Steps:**
1. Navigate to a company detail page (try one for `bradesco.com.br`).
2. Click Contacts tab.
3. Verify domain field shows `bradesco.com.br` (or enter it manually).
4. Click 'Search' or 'Enrich'.
5. Wait for results (up to 10 seconds).

**Expected Result:** Results appear showing contact rows with: Name, Email address, Job Title, Confidence score (%).

**Pass Criteria:** At least 1 contact result returned with all 4 fields populated.

**Notes:** Hunter.io API key must be configured in `.env`. If key is missing/expired, check `/settings` API keys section.

---

### TC-5.3 — Save Individual Contact

**Steps:**
1. Perform a Hunter.io domain search (TC-5.2).
2. In the results, find a contact row.
3. Click the 'Save' button on that row.
4. Scroll to the Contacts section of the same page.

**Expected Result:** The contact is saved and appears in the company's Contacts section with `source = hunter`.

**Pass Criteria:** Contact appears in Contacts section; source badge shows 'Hunter'.

---

### TC-5.4 — Save All Found Contacts

**Steps:**
1. Perform a Hunter.io domain search.
2. Click 'Save All Found Contacts' button (bulk save).
3. Observe the Contacts section.

**Expected Result:** All contacts from Hunter.io results are saved to the company. Previously saved contacts are not duplicated.

**Pass Criteria:** Contacts section grows by the number of new contacts found; no duplicates created.

---

### TC-5.5 — Already-Saved Contacts Show Green Badge

**Steps:**
1. Save at least one contact (TC-5.3).
2. Run the same domain search again.
3. Observe the result rows for already-saved contacts.

**Expected Result:** Contacts already saved show a green 'Saved' badge instead of the 'Save' button.

**Pass Criteria:** Green badge visible on previously-saved contact rows.

---

### TC-5.6 — Invalid Domain Returns Graceful Error

**Steps:**
1. Navigate to a company detail → Contacts tab.
2. Clear the domain field and type `not-a-real-domain-xyz123.com`.
3. Click 'Search'.
4. Observe the result.

**Expected Result:** An error message is shown (e.g. 'No contacts found for this domain') — the page does NOT crash or throw a JS error.

**Pass Criteria:** Graceful empty state or error message shown; no uncaught exception in console.

---

## SECTION 6: PROPOSALS (/proposals)

### TC-6.1 — Proposal List Loads

**Steps:**
1. Navigate to `BASE_URL/proposals`.
2. Wait for the list to load.

**Expected Result:** Proposals list renders showing proposal title, company name, status badge, and creation date.

**Pass Criteria:** Page loads with at least 1 proposal row; no 500 error.

---

### TC-6.2 — Status Badges Visible

**Steps:**
1. Navigate to `BASE_URL/proposals`.
2. Scan the proposals for colored status badges.

**Expected Result:** Each proposal shows one of these status badges: `draft` (grey), `under_review` (yellow), `approved` (green), `sent` (blue), `rejected` (red).

**Pass Criteria:** At least 3 different status types visible across proposals list.

---

### TC-6.3 — Date Range Filter

**Steps:**
1. Navigate to `BASE_URL/proposals`.
2. Set 'From' date to 2026-01-01.
3. Set 'To' date to today.
4. Apply the filter.

**Expected Result:** Only proposals created within the specified date range are shown.

**Pass Criteria:** Result count changes when date range is applied; proposals outside range not shown.

---

### TC-6.4 — 'Has Logo' Filter

**Steps:**
1. Navigate to `BASE_URL/proposals`.
2. Enable the 'Has Logo' filter toggle.

**Expected Result:** Only proposals associated with companies that have a logo uploaded are shown.

**Pass Criteria:** Filter narrows the list; toggling off restores full list.

---

### TC-6.5 — Search by Company Name

**Steps:**
1. Navigate to `BASE_URL/proposals`.
2. Type a company name in the search field.

**Expected Result:** Proposal list filters to show only proposals for the matching company.

**Pass Criteria:** Unrelated company proposals disappear; searched company's proposals remain.

---

### TC-6.6 — Export CSV

**Steps:**
1. Navigate to `BASE_URL/proposals`.
2. Click 'Export CSV'.
3. Open the downloaded file.

**Expected Result:** CSV downloads with columns: id, title, company_name, status, proposal_type, created_at, value.

**Pass Criteria:** File downloads without error; column headers correct.

---

### TC-6.7 — Click Proposal Navigates to Detail

**Steps:**
1. Navigate to `BASE_URL/proposals`.
2. Click on any proposal title/row.

**Expected Result:** Browser navigates to `/proposals/[id]` — the proposal detail page.

**Pass Criteria:** URL changes to `/proposals/[uuid]`; proposal detail renders.

---

### TC-6.8 — New Proposal Button Navigates to Wizard

**Steps:**
1. Navigate to `BASE_URL/proposals`.
2. Click '+ New Proposal' button.

**Expected Result:** Browser navigates to `/proposals/new` — the proposal creation wizard.

**Pass Criteria:** URL is `/proposals/new`; wizard renders with Step 1.

---

## SECTION 7: PROPOSAL WIZARD (/proposals/new)

### TC-7.1 — All 7 Proposal Types Available

**Steps:**
1. Navigate to `BASE_URL/proposals/new`.
2. Look for the Proposal Type selector.
3. List all available options.

**Expected Result:** Exactly 7 proposal types are offered: Patrocínio Puro, Lei de Incentivo, Bartering, Naming Rights, Social Impact, Digital-First, Other.

**Pass Criteria:** All 7 types present in the type selector.

---

### TC-7.2 — Company Selector Has Live Search

**Steps:**
1. Navigate to `BASE_URL/proposals/new`.
2. Click the Company selector/search field.
3. Type 'Bra' and observe.

**Expected Result:** Dropdown shows live search results matching 'Bra' (e.g. Bradesco, Braskem, Brasil) as you type.

**Pass Criteria:** Results appear within 500ms; at least 3 matching companies shown.

---

### TC-7.3 — Campaign Selector Populates from DB

**Steps:**
1. Navigate to `BASE_URL/proposals/new`.
2. Click the Campaign selector/dropdown.
3. Verify it shows campaigns from the database.

**Expected Result:** Campaign dropdown shows campaigns available in the system (not empty unless no campaigns exist).

**Pass Criteria:** At least 1 campaign option available if campaigns exist in DB.

---

### TC-7.4 — Required Fields Validate Before Submit

**Steps:**
1. Navigate to `BASE_URL/proposals/new`.
2. Leave required fields empty.
3. Click 'Submit' or 'Create Proposal'.

**Expected Result:** Form shows validation errors on required fields (Company, Title, Type at minimum). Does not submit.

**Pass Criteria:** At least 1 validation error shown; form not submitted with empty required fields.

---

### TC-7.5 — Submitting Creates Proposal and Redirects

**Steps:**
1. Navigate to `BASE_URL/proposals/new`.
2. Fill in: Company = any existing company, Title = 'QA Test Proposal', Type = Patrocínio Puro.
3. Fill any other required fields.
4. Click submit.

**Expected Result:** Proposal is created. Browser redirects to the new proposal's detail page at `/proposals/[new-id]`.

**Pass Criteria:** Redirect occurs; new proposal detail page loads with the title 'QA Test Proposal'.

---

### TC-7.6 — Created Proposal Appears in List

**Steps:**
1. After creating a proposal in TC-7.5, navigate to `BASE_URL/proposals`.
2. Search for 'QA Test Proposal'.

**Expected Result:** 'QA Test Proposal' appears in the proposals list with status 'draft'.

**Pass Criteria:** New proposal visible in list with correct title and draft status.

---

## SECTION 8: PROPOSAL DETAIL (/proposals/[id])

### TC-8.1 — Core Info Visible

**Steps:**
1. Navigate to any proposal detail page via `BASE_URL/proposals/[id]`.
2. Verify core metadata is shown.

**Expected Result:** Page shows: proposal Title (H1), Status badge, Company name (linked), Proposal Type, Version number, and Creation date.

**Pass Criteria:** All 6 metadata fields visible without scrolling (above fold).

---

### TC-8.2 — Edit Button Routes Correctly

**Steps:**
1. Navigate to a proposal detail page.
2. Click the 'Edit' button.
3. Verify the URL of the resulting page.

**Expected Result:** URL changes to `/proposals/[id]/edit` — NOT to `/mockup-editor`.

**Pass Criteria:** URL contains `/proposals/[id]/edit` after clicking Edit.

**Notes:** This was BUG-01 — fixed in FIX-01 commit. Verify this regression never returns.

---

### TC-8.3 — Save Version Button Bumps Version

**Steps:**
1. Navigate to a proposal detail page.
2. Note the current version number (e.g. 'v1').
3. Click 'Save Version'.
4. Wait for confirmation.
5. Check the version number on the page.

**Expected Result:** Version number increments by 1 (e.g. v1 → v2). A snapshot is saved.

**Pass Criteria:** Version number increments; version history section shows the new snapshot.

---

### TC-8.4 — Version History Section Shows Snapshots

**Steps:**
1. Navigate to a proposal that has had 'Save Version' clicked at least once.
2. Scroll to the 'Version History' section.

**Expected Result:** Version History section shows at least 1 snapshot entry with a timestamp and version number.

**Pass Criteria:** Version history renders; snapshot count matches number of times 'Save Version' was clicked.

---

### TC-8.5 — Ver Deck PDF Button Opens /deck Page

**Steps:**
1. Navigate to a proposal detail page.
2. Click 'Ver Deck PDF' button.
3. Note whether it opens in a new tab.

**Expected Result:** `/proposals/[id]/deck` opens in a new browser tab showing the printable 8-page sponsorship deck.

**Pass Criteria:** New tab opens at `/proposals/[id]/deck`; deck renders without error.

---

### TC-8.6 — Convert to Contract Button (Approved Status Only)

**Steps:**
1. Navigate to a proposal with status = 'approved'.
2. Look for 'Convert to Contract' button.

**Expected Result:** 'Convert to Contract' button is visible and clickable ONLY on proposals with status = approved.

**Pass Criteria:** Button present on approved proposals; absent (or disabled) on draft/under_review proposals.

---

### TC-8.7 — WhatsApp Share Button

**Steps:**
1. Navigate to a proposal detail page.
2. Click the WhatsApp share button (WhatsApp icon).
3. Inspect the URL it opens.

**Expected Result:** Opens a `wa.me/...` URL with the proposal title pre-filled in the message.

**Pass Criteria:** Opens `https://wa.me/` URL; proposal title included in URL-encoded message.

---

### TC-8.8 — Landing Page Link Opens Public View

**Steps:**
1. Navigate to a proposal detail page.
2. Click 'Landing Page ↗' link.
3. Verify the URL of the page that opens.

**Expected Result:** Opens `/proposals/view/[token]` in a new tab — the sponsor-facing landing page with no admin sidebar.

**Pass Criteria:** URL is `/proposals/view/[token]`; no sidebar visible on the opened page.

---

### TC-8.9 — Sponsor View Count Shown

**Steps:**
1. Navigate to a proposal detail page.
2. Visit the landing page (TC-8.8).
3. Return to the admin proposal detail page and refresh.
4. Look for a view count indicator.

**Expected Result:** View count increments after visiting the landing page. Shown as 'X sponsor views'.

**Pass Criteria:** View counter visible; increments by 1 after each public page visit.

---

### TC-8.10 — Brand Assets Section Visible

**Steps:**
1. Navigate to a proposal detail page.
2. Scroll to find the 'Brand Assets' section.

**Expected Result:** Brand Assets section is present showing either uploaded logo or a dropzone for logo upload.

**Pass Criteria:** Brand Assets section renders; either logo image or upload zone visible.

---

## SECTION 9: PROPOSAL EDIT (/proposals/[id]/edit)

### TC-9.1 — All Form Fields Editable

**Steps:**
1. Navigate to `/proposals/[id]/edit`.
2. Verify each field is editable (not read-only).
3. Try modifying the 'Title' field.

**Expected Result:** All fields accept input. Title, content, proposal type, status all editable.

**Pass Criteria:** Fields respond to keyboard input; no read-only attributes.

---

### TC-9.2 — Expiry Date Field Present

**Steps:**
1. Navigate to `/proposals/[id]/edit`.
2. Locate the 'Expiry Date' date picker field.
3. Set a date 30 days from today.
4. Save.

**Expected Result:** Date picker field present; selecting a date and saving persists the `expires_at` value. Landing page shows an amber expiry badge.

**Pass Criteria:** Expiry date field visible; date saves; badge appears on landing page.

---

### TC-9.3 — Meeting Link Field Present

**Steps:**
1. Navigate to `/proposals/[id]/edit`.
2. Locate 'Meeting Link (Calendly/Cal.com)' URL field.
3. Enter `https://cal.com/coritiba/30min`.
4. Save and check landing page.

**Expected Result:** Meeting link field present; after save, the 'Agendar Reunião' button on the landing page opens the Calendly URL.

**Pass Criteria:** Field accepts URL; landing page CTA links to set URL.

---

### TC-9.4 — Save Reflects on Detail Page

**Steps:**
1. Navigate to `/proposals/[id]/edit`.
2. Change the title to 'Edited QA Title'.
3. Click Save.
4. Verify redirect back to `/proposals/[id]`.
5. Check the title displayed.

**Expected Result:** After save, proposal detail page shows 'Edited QA Title'.

**Pass Criteria:** Updated title visible on detail page immediately after save.

---

### TC-9.5 — Breadcrumbs Correct on Edit Page

**Steps:**
1. Navigate to `/proposals/[id]/edit`.
2. Look at the breadcrumb bar at the top.

**Expected Result:** Breadcrumb shows: `Proposals → [Proposal Title] → Edit`.

**Pass Criteria:** All 3 breadcrumb segments visible; clicking 'Proposals' navigates to `/proposals`.

---

## SECTION 10: BRAND ASSETS & JERSEY MOCKUP

### TC-10.1 — Upload Logo Dropzone Accepts PNG/JPG

**Steps:**
1. Navigate to a proposal detail page.
2. Scroll to the Brand Assets / Jersey Mockup section.
3. Click 'Upload Logo' or the file dropzone.
4. Select a PNG file (e.g. a sponsor logo).
5. Confirm upload.

**Expected Result:** Logo uploads successfully. A thumbnail preview of the uploaded logo appears in the Brand Assets section.

**Pass Criteria:** Upload completes; logo thumbnail visible; no error toast.

---

### TC-10.2 — Yellow Warning Banner Disappears After Upload

**Steps:**
1. Navigate to a proposal detail page with NO logo uploaded.
2. Note the yellow warning banner (e.g. 'Upload a logo to enable mockup generation').
3. Upload a logo (TC-10.1).
4. Observe the banner.

**Expected Result:** Yellow warning banner disappears immediately after logo upload.

**Pass Criteria:** Banner absent after successful upload; no page refresh needed.

---

### TC-10.3 — Generate Mockup Button Enabled After Logo Upload

**Steps:**
1. Navigate to a proposal with NO logo — verify 'Generate Mockup' is disabled (greyed out).
2. Upload a logo.
3. Observe the 'Generate Mockup' button state.

**Expected Result:** 'Generate Mockup' button becomes enabled (not greyed out) after logo is uploaded.

**Pass Criteria:** Button transitions from disabled to enabled state after upload.

**Notes:** This regression was fixed in commit `562f5c7`. Re-test to ensure it does not regress.

---

### TC-10.4 — Confirm Modal Appears on Generate

**Steps:**
1. Upload a logo (TC-10.1).
2. Click 'Generate Mockup'.
3. Observe the modal that appears.

**Expected Result:** A confirmation modal opens explaining: the placement zone, that 'logo will never change between generations', and asking for confirmation.

**Pass Criteria:** Modal with confirmation text and Confirm/Cancel buttons appears.

---

### TC-10.5 — Jersey Mockup Generates with Logo on White Badge

**Steps:**
1. After upload, click 'Generate Mockup' → confirm in modal.
2. Wait for generation (up to 60 seconds).
3. Inspect the generated image.

**Expected Result:** A jersey image appears showing the sponsor logo placed on a white rectangular badge on the jersey. The CFC crest (Coritiba FC logo) remains unchanged.

**Pass Criteria:** Generated image shows white badge with sponsor logo; CFC crest visible and unmodified.

**Notes:** White badge background was added to fix James's complaint #1 (Jun 9 sprint). Uses Replicate LoRA 2024 kit model.

---

### TC-10.6 — All 7 Placement Zones Produce Different Positions

**Steps:**
1. For each placement zone, generate a mockup and save the image:
   - Peito (chest front)
   - Manga esquerda (left sleeve)
   - Manga direita (right sleeve)
   - Costas (back)
   - Shorts (shorts front)
   - Meiões (sock calf)
2. Compare the 6 generated images.

**Expected Result:** Each placement zone produces a visually distinct image with the logo appearing in a different position on the kit.

**Pass Criteria:** All 6 images render without error; visual positions differ between zones.

---

### TC-10.7 — Generate Button Disabled Without Logo

**Steps:**
1. Navigate to a proposal detail page where no logo has been uploaded.
2. Locate the 'Generate Mockup' button.
3. Note its state.
4. Try clicking it.

**Expected Result:** Button is visually disabled (greyed out, not clickable). Clicking does nothing or shows 'Upload a logo first' message.

**Pass Criteria:** Button disabled; no API call made without logo.

---

## SECTION 11: AI CAMPAIGN CREATIVES

### TC-11.1 — Generate AI Creatives Button Visible

**Steps:**
1. Navigate to a proposal detail page.
2. Scroll to the 'AI Campaign Creatives' card.

**Expected Result:** 'Generate AI Creatives' button is visible in the indigo-coloured AI Campaign Creatives card.

**Pass Criteria:** Button present; card shows 'AI Campaign Creatives' heading.

---

### TC-11.2 — Full-Screen Prompt Review Modal

**Steps:**
1. Click 'Generate AI Creatives'.
2. Observe the modal that appears.

**Expected Result:** A full-screen overlay modal appears with a dark blurred background, titled 'Review Prompts Before Generating'.

**Pass Criteria:** Full-screen modal appears; not a small inline box.

**Notes:** This was redesigned per James's complaint #4 in the Jun 9 sprint.

---

### TC-11.3 — Modal Shows One Prompt Per Strategy Variant

**Steps:**
1. Open the Generate AI Creatives modal.
2. Count the numbered prompt cards shown.

**Expected Result:** Modal shows individual prompt cards for each strategy variant (typically 3 prompts for 3 strategy approaches).

**Pass Criteria:** At least 1 prompt card visible; each card numbered.

---

### TC-11.4 — Edit Prompt Text Persists

**Steps:**
1. Open the Generate AI Creatives modal.
2. Click 'Edit' on the first prompt card.
3. Change the prompt text to add 'QA TEST MARKER' to the end.
4. Click away or press Confirm.
5. Observe if the edited text is still shown.

**Expected Result:** Edited prompt text with 'QA TEST MARKER' is visible when generating.

**Pass Criteria:** Custom text persists; not reverted to original after editing.

**Notes:** Stale React closure bug was fixed in commit `fcd2410`. This is a regression test.

---

### TC-11.5 — Cost Estimate Shown

**Steps:**
1. Open the Generate AI Creatives modal.
2. Look for a cost estimate indicator.

**Expected Result:** Modal shows approximate cost per image (~$0.04/image) and total estimated cost for all variants.

**Pass Criteria:** Cost estimate text visible before confirming generation.

---

### TC-11.6 — Cancel Closes Without Generating

**Steps:**
1. Open the Generate AI Creatives modal.
2. Click 'Cancel'.
3. Check the Saved Images section — verify no new images appeared.

**Expected Result:** Modal closes; no images are generated; no API call to image generation endpoint.

**Pass Criteria:** Saved Images section unchanged after cancel.

---

### TC-11.7 — Confirm & Generate Starts Generation

**Steps:**
1. Open the Generate AI Creatives modal.
2. Click 'Confirm & Generate'.
3. Observe the proposal detail page.

**Expected Result:** Modal closes; a progress indicator appears on the proposal detail page showing image generation in progress (spinner, 'Generating...' text).

**Pass Criteria:** Progress indicator appears; images appear in Saved Images after generation completes (up to 120 seconds).

**Notes:** Each image calls OpenAI gpt-image-1 at 1536×1024. Budget ~$0.04/image. Total ~$0.12 for 3 variants.

---

### TC-11.8 — Generated Images Appear in Saved Images

**Steps:**
1. After generation completes (TC-11.7), observe the 'Saved Images' (slate card) section.

**Expected Result:** 1–3 generated images appear as thumbnails in the Saved Images section.

**Pass Criteria:** Images render (no broken img icons); count matches number of variants generated.

---

### TC-11.9 — Approve Image Moves to Landing Page Gallery

**Steps:**
1. In the Saved Images section, click 'Approve' on one generated image.
2. Navigate to the proposal's public landing page.
3. Scroll to the gallery section.

**Expected Result:** Approved image appears in the landing page gallery visible to sponsors.

**Pass Criteria:** Image visible on public landing page after approval.

---

## SECTION 12: SPONSOR LANDING PAGE (/proposals/view/[token])

### TC-12.1 — Page Loads Without Admin Sidebar

**Steps:**
1. From a proposal detail page, click 'Landing Page ↗'.
2. On the opened page, look for the admin sidebar.

**Expected Result:** Public landing page renders WITHOUT the admin sidebar, nav links, or any internal UI elements.

**Pass Criteria:** No sidebar element in DOM; page looks like a clean sponsor-facing page.

**Notes:** Fixed via `(public)` route group + AppShell path detection. This is regression BUG-15.

---

### TC-12.2 — CFC Logo in Header

**Steps:**
1. Navigate to `/proposals/view/[token]`.
2. Look at the page header.

**Expected Result:** Coritiba FC logo (green and white crest) is visible in the page header.

**Pass Criteria:** CFC logo renders as an image (not broken icon).

---

### TC-12.3 — Proposal Header Text

**Steps:**
1. Navigate to `/proposals/view/[token]`.
2. Look for the main header text.

**Expected Result:** Header shows 'Proposta de Patrocínio' and below it 'Preparado para [CompanyName]' where CompanyName is the actual company.

**Pass Criteria:** Both text strings present; company name correctly interpolated.

---

### TC-12.4 — Hero Section with Proposal Title

**Steps:**
1. Navigate to `/proposals/view/[token]`.
2. Observe the hero/banner section at the top.

**Expected Result:** Proposal title appears in a large bold hero section with a background image or green CFC-branded background.

**Pass Criteria:** Title visible in hero section; font size significantly larger than body text.

---

### TC-12.5 — Club Stats Bar

**Steps:**
1. Navigate to `/proposals/view/[token]`.
2. Scroll to find the club statistics bar.

**Expected Result:** A stats bar shows: 'Founded 1909', '1.5M+ followers', 'Couto Pereira 40,502' (stadium capacity).

**Pass Criteria:** All 3 stat items present with correct values.

---

### TC-12.6 — Sticky CTA Bar at Bottom

**Steps:**
1. Navigate to `/proposals/view/[token]`.
2. Scroll down — observe whether a bar is fixed/sticky at the bottom of the viewport.

**Expected Result:** A sticky CTA bar is fixed at the bottom of the page containing at minimum 'Tenho Interesse' button, 'Falar com nossa equipe', and a download/PDF button.

**Pass Criteria:** Bar stays at bottom while scrolling; buttons clickable.

---

### TC-12.7 — Agendar Reunião Button

**Steps:**
1. Navigate to `/proposals/view/[token]`.
2. Find and click the 'Agendar Reunião' button.
3. Check the URL it navigates to.

**Expected Result:** If `meeting_link` is set on the proposal, clicking opens that URL. If not set, falls back to a `mailto:` link.

**Pass Criteria:** Button clickable; navigates to Calendly URL if `meeting_link` set, else opens email client.

---

### TC-12.8 — Save as PDF Button

**Steps:**
1. Navigate to `/proposals/view/[token]`.
2. Click 'Salvar como PDF' or the download button in the sticky bar.
3. Observe browser print dialog.

**Expected Result:** Browser print dialog opens (Ctrl+P equivalent). Admin sidebar and internal nav are NOT shown in print preview.

**Pass Criteria:** Print dialog opens; sidebar absent in print preview.

---

### TC-12.9 — Lead Capture Form

**Steps:**
1. Navigate to `/proposals/view/[token]`.
2. Scroll to find the lead capture/interest form.
3. Fill in: Name='QA Tester', Company='QA Corp', Email='qa@test.com', Phone='+5541999999999', Message='Test'.
4. Check the LGPD consent checkbox.
5. Click Submit / 'Tenho Interesse'.

**Expected Result:** Form submits successfully. Success message appears (e.g. 'Obrigado! Entraremos em contato em breve').

**Pass Criteria:** Success message shown; entry logged in `audit_logs` table (verify via `/api/audit?limit=1`).

---

### TC-12.10 — LGPD Consent Checkbox

**Steps:**
1. Navigate to the lead form on `/proposals/view/[token]`.
2. Try to submit the form WITHOUT checking the LGPD consent checkbox.

**Expected Result:** Form cannot be submitted without LGPD consent checked. Validation error shown near the checkbox.

**Pass Criteria:** Submit blocked if LGPD checkbox unchecked.

---

### TC-12.11 — A/B Variant B Shows Different CTA

**Steps:**
1. Navigate to `/proposals/view/[token]?v=B`.
2. Look at the main CTA button text.
3. Look for a 'Variant B' badge in the header.

**Expected Result:** CTA button shows 'Quero Saber Mais' (not 'Tenho Interesse'). A small 'Variant B' badge is visible.

**Pass Criteria:** Both 'Quero Saber Mais' text AND 'Variant B' badge present on ?v=B URL.

---

### TC-12.12 — Expiry Badge When expires_at Set

**Steps:**
1. Edit a proposal and set an expiry date (TC-9.2).
2. Navigate to `/proposals/view/[token]`.
3. Look for an expiry badge/banner.

**Expected Result:** An amber-coloured badge or banner shows the proposal expiry date (e.g. 'Esta proposta expira em 25/07/2026').

**Pass Criteria:** Expiry badge visible and shows correct date.

---

### TC-12.13 — No JS Console Errors on Landing Page

**Steps:**
1. Open DevTools (F12) → Console.
2. Navigate to `/proposals/view/[token]`.
3. Hard-refresh (Ctrl+Shift+R).
4. Check console for errors.

**Expected Result:** No red console errors.

**Pass Criteria:** Zero error-level messages in Console.

**Notes:** Landing page had a JS chunk error (CRITICAL-1) fixed via full rebuild. This is a regression test.

---

## SECTION 13: APPROVALS (/approvals)

### TC-13.1 — Page Loads with Card View as Default

**Steps:**
1. Navigate to `BASE_URL/approvals`.
2. Observe which view is shown by default.

**Expected Result:** Approvals page loads in Card (Tinder-style) view by default — not List view.

**Pass Criteria:** Card view shown on first load without any user interaction.

**Notes:** Default was changed to 'cards' in CRITICAL-2 fix.

---

### TC-13.2 — Progress Bar Shows X of Y Reviewed

**Steps:**
1. Navigate to `BASE_URL/approvals`.
2. Look for a progress bar near the top.

**Expected Result:** A progress bar shows 'X of Y reviewed' where X is number approved/rejected and Y is total pending.

**Pass Criteria:** Progress bar visible; numbers are correct integers.

---

### TC-13.3 — Card Shows Company and Proposal Info

**Steps:**
1. Navigate to `BASE_URL/approvals`.
2. Observe the top card in the stack.

**Expected Result:** Card prominently shows: Company name, proposal preview text (first 150 chars), Status badge, Type badge (Proposal/Campaign/Email).

**Pass Criteria:** All 4 data elements visible on the card.

---

### TC-13.4 — Keyboard Arrow Right Approves

**Steps:**
1. Navigate to `BASE_URL/approvals`.
2. Press the right arrow key (→) or the L key.
3. Observe the card behavior.

**Expected Result:** Card animates off to the right (green approve animation); next card appears in the stack.

**Pass Criteria:** Card approved; next item shown; progress bar advances.

---

### TC-13.5 — Keyboard Arrow Left Rejects

**Steps:**
1. Navigate to `BASE_URL/approvals`.
2. Press the left arrow key (←) or the J key.
3. Observe the card behavior.

**Expected Result:** Card animates off to the left (red reject animation); next card appears.

**Pass Criteria:** Card rejected; next item shown; progress bar advances.

---

### TC-13.6 — Keyboard E Opens Edit in New Tab

**Steps:**
1. On the approvals page with a card visible, press E.
2. Observe whether a new tab opens.

**Expected Result:** Pressing E opens the edit page for the current card's item in a new browser tab.

**Pass Criteria:** New tab opens at `/proposals/[id]/edit` (or relevant edit URL).

---

### TC-13.7 — Drag Right Shows Green Approve Overlay

**Steps:**
1. On the approvals page, click and hold on the card.
2. Slowly drag the card to the right.
3. Observe the overlay that appears.

**Expected Result:** As the card is dragged right, a green 'APPROVE' overlay/stamp appears on the card.

**Pass Criteria:** Green overlay visible during rightward drag.

---

### TC-13.8 — Drag Left Shows Red Reject Overlay

**Steps:**
1. On the approvals page, click and hold on the card.
2. Slowly drag the card to the left.
3. Observe the overlay.

**Expected Result:** As the card is dragged left, a red 'REJECT' overlay/stamp appears on the card.

**Pass Criteria:** Red overlay visible during leftward drag.

---

### TC-13.9 — Release Drag > 80px Approves/Rejects

**Steps:**
1. Drag the card more than 80px to the right and release.
2. Observe whether the item is approved.

**Expected Result:** Releasing drag beyond 80px threshold triggers approve (if dragged right) or reject (if dragged left). Card flies off screen.

**Pass Criteria:** Release beyond threshold commits the action; card removed from stack.

---

### TC-13.10 — Review Complete Screen

**Steps:**
1. On the approvals page, keep approving/rejecting until no cards remain.
2. Observe the screen state.

**Expected Result:** A 'Review Complete!' screen with a summary (X approved, Y rejected) appears when all items are reviewed.

**Pass Criteria:** Completion screen shown; summary counts correct.

---

### TC-13.11 — Filter by Type Works

**Steps:**
1. Navigate to `BASE_URL/approvals`.
2. Click 'Proposals only' filter.
3. Observe the card stack.

**Expected Result:** Only proposal-type items shown in the queue. Campaign and Email type items filtered out.

**Pass Criteria:** All visible cards show 'Proposal' type badge.

---

### TC-13.12 — Switch to List View Toggle

**Steps:**
1. Navigate to `BASE_URL/approvals`.
2. Click the 'List view' toggle button.
3. Observe the layout change.

**Expected Result:** Layout switches from card (Tinder) view to a flat table/list view showing all pending items.

**Pass Criteria:** List layout renders; items shown in rows instead of stacked cards.

---

## SECTION 14: CAMPAIGNS (/campaigns)

### TC-14.1 — Campaign List Loads

**Steps:**
1. Navigate to `BASE_URL/campaigns`.
2. Wait for list to render.

**Expected Result:** Campaign list loads showing campaign title, company, status, and date.

**Pass Criteria:** Page loads without 500 error; at least 1 campaign row shown.

---

### TC-14.2 — New Campaign Form with Company Live Search

**Steps:**
1. Navigate to `BASE_URL/campaigns`.
2. Click '+ New Campaign'.
3. In the Company field, type 'Pet'.
4. Observe dropdown.

**Expected Result:** New campaign form opens. Company selector shows live search results for 'Pet'.

**Pass Criteria:** Live search returns matching companies within 500ms.

---

### TC-14.3 — Bulk Campaigns Page Loads

**Steps:**
1. Navigate to `BASE_URL/campaigns/bulk`.
2. Wait for the page to load.

**Expected Result:** Bulk campaigns generation page loads with company selector, industry filter, and generation controls.

**Pass Criteria:** Page loads without error; no 404.

---

### TC-14.4 — Industry Filter Shows Portuguese Values

**Steps:**
1. Navigate to `BASE_URL/campaigns/bulk`.
2. Click the Industry filter dropdown.
3. List the available options.

**Expected Result:** Industry options shown in Portuguese: Automotivo, Bebidas, Financeiro, Tecnologia, Varejo, etc.

**Pass Criteria:** All industry options are in Portuguese (not English e.g. not 'Automotive', 'Finance').

**Notes:** Was BUG-03 — English/Portuguese mismatch caused filter to return empty results.

---

### TC-14.5 — Data Completeness Warning

**Steps:**
1. Navigate to `BASE_URL/campaigns/bulk`.
2. Select companies that have missing fields (no website, no industry, etc.).
3. Click 'Generate'.
4. Observe the warning.

**Expected Result:** A warning panel appears listing which companies have incomplete data. The 'Generate' button is blocked until 'Continue anyway' is clicked.

**Pass Criteria:** Warning panel visible; main generate action blocked without explicit confirmation.

---

## SECTION 15: EMAILS (/emails)

### TC-15.1 — Email List Loads

**Steps:**
1. Navigate to `BASE_URL/emails`.
2. Wait for list to render.

**Expected Result:** Email list shows outbound emails with: subject, recipient email, sent date, and status.

**Pass Criteria:** List renders without error; at least 1 email shown if any have been sent.

---

### TC-15.2 — Email Detail Page

**Steps:**
1. Navigate to `BASE_URL/emails`.
2. Click on any email.

**Expected Result:** Email detail page loads showing: Subject line, Recipient name and email, Full email body (rendered HTML), Sent timestamp.

**Pass Criteria:** All 4 fields visible on detail page.

---

### TC-15.3 — Send Test to Myself Button

**Steps:**
1. Navigate to an email detail page.
2. Look for 'Send Test to Myself' button.
3. Click it.

**Expected Result:** Button is present. Clicking opens a dialog to confirm test send. Email is dispatched to the logged-in user's email.

**Pass Criteria:** 'Send Test to Myself' button present on email detail page.

---

### TC-15.4 — Pre-Send Validation for Unresolved Placeholders

**Steps:**
1. Navigate to `BASE_URL/emails/new`.
2. Create a new email with body text containing `[Nome]` literal text.
3. Try to send the email.

**Expected Result:** Sending is blocked with a warning message: 'Email body contains unresolved placeholders: [Nome]'.

**Pass Criteria:** Warning shown; send action blocked when placeholders detected.

**Notes:** Fixed in S2-5. Was BUG-09 — emails going out with literal [Nome] to sponsors.

---

### TC-15.5 — Rich Text Editor on New Email

**Steps:**
1. Navigate to `BASE_URL/emails/new`.
2. Observe the email body input area.

**Expected Result:** A rich text editor (not a plain `<textarea>`) is shown for the email body, with formatting controls (Bold, Italic, Link, etc.).

**Pass Criteria:** Rich text toolbar visible; bold/italic formatting can be applied.

---

### TC-15.6 — Ver Proposta CTA Auto-Injected

**Steps:**
1. Navigate to an email that is linked to a proposal.
2. Observe the email body.

**Expected Result:** A 'Ver Proposta →' button/link is auto-injected at the end of the email body, linking to the proposal's landing page.

**Pass Criteria:** CTA button visible in email body; clicking the link opens the proposal landing page.

**Notes:** Was BUG-10. Fixed via `injectProposalLinkIfMissing()` function.

---

### TC-15.7 — Opened and Clicked Badges

**Steps:**
1. Send a test email (TC-15.3 or TC-4 agent flow).
2. Simulate an open by visiting the tracking pixel URL: `GET BASE_URL/api/emails/[id]/pixel`.
3. Return to `BASE_URL/emails` and find the email.

**Expected Result:** Email shows an 'Opened' green badge after the pixel URL is visited.

**Pass Criteria:** Opened badge appears within 5 seconds of pixel visit (requires page refresh).

**Notes:** Tracking only works on emails sent after Jun 26, 2026 deployment.

---

## SECTION 16: EMAIL TRACKING

### TC-16.1 — Tracking Pixel Returns 1x1 PNG and Logs opened_at

**Steps:**
1. Find the ID of a sent email from `BASE_URL/emails`.
2. In a browser address bar, navigate to: `BASE_URL/api/emails/[id]/pixel`.
3. Observe the response (should be a 1x1 transparent PNG).
4. Go to `BASE_URL/emails/[id]` and refresh.
5. Check if `opened_at` timestamp is now set.

**Expected Result:** GET request to pixel endpoint returns HTTP 200 with `Content-Type: image/png`. Email record now has `opened_at` timestamp set.

**Pass Criteria:** 200 response with image/png; `opened_at` column populated in email record.

---

### TC-16.2 — Click Tracking Redirects and Logs clicked_at

**Steps:**
1. Find the ID of a sent email.
2. Navigate to: `BASE_URL/api/emails/[id]/click?url=https%3A%2F%2Fwww.coritiba.com.br`.
3. Observe the redirect behavior.
4. Return to email detail and refresh.

**Expected Result:** Request redirects (HTTP 302) to `https://www.coritiba.com.br`. Email record's `clicked_at` timestamp is set.

**Pass Criteria:** 302 redirect to destination URL; `clicked_at` field populated.

---

### TC-16.3 — Dashboard KPIs Update After Tracking Events

**Steps:**
1. Visit a tracking pixel URL (TC-16.1).
2. Visit a click tracking URL (TC-16.2).
3. Navigate to `BASE_URL/` (dashboard).
4. Check Email Open Rate and Email Click Rate KPI tiles.

**Expected Result:** Open Rate and Click Rate KPI tiles reflect updated percentages based on tracking events.

**Pass Criteria:** Both KPI tiles non-zero after tracking events logged.

---

## SECTION 17: CONTRACTS (/contracts)

### TC-17.1 — Contracts Page Loads with KPI Bar

**Steps:**
1. Navigate to `BASE_URL/contracts`.
2. Observe the page header area.

**Expected Result:** Page loads with a KPI summary bar showing: total contracts, active contracts, total contract value, and revenue metrics.

**Pass Criteria:** KPI bar visible; numbers render without error.

---

### TC-17.2 — Contract List Shows Contracts

**Steps:**
1. Navigate to `BASE_URL/contracts`.
2. Observe the contract list.

**Expected Result:** Each contract row shows: Contract Number (CTR-YYYY-XXXX), Company name, Value (R$), Start/End dates, Status.

**Pass Criteria:** List renders; at least 1 contract row if any contracts exist.

---

### TC-17.3 — Export Contracts CSV

**Steps:**
1. Navigate to `BASE_URL/contracts`.
2. Click 'Export CSV'.
3. Open the downloaded file.

**Expected Result:** CSV file downloads with columns: contract_number, company_name, total_value, start_date, end_date, deal_type, status.

**Pass Criteria:** File downloads; column headers correct.

---

### TC-17.4 — Convert to Contract Modal

**Steps:**
1. Navigate to a proposal with status = 'approved'.
2. Click 'Convert to Contract'.
3. Inspect the modal fields.

**Expected Result:** A modal opens with these fields: Contract Number (auto-generated as CTR-2026-XXXX), Total Value (R$), Start Date (date picker), End Date (date picker), Deal Type (dropdown).

**Pass Criteria:** All 5 fields present; Contract Number pre-filled with CTR format.

---

### TC-17.5 — Contract Created and Appears in List

**Steps:**
1. Open the Convert to Contract modal (TC-17.4).
2. Fill in: Total Value = 50000, Start Date = 2026-07-01, End Date = 2026-12-31, Deal Type = Patrocínio Puro.
3. Click Submit / Create Contract.
4. Navigate to `BASE_URL/contracts`.

**Expected Result:** New contract appears in the contracts list with the correct number, value, and dates.

**Pass Criteria:** Contract visible in list within 5 seconds of creation.

---

## SECTION 18: PIPELINE (/pipeline)

### TC-18.1 — Pipeline Page Loads

**Steps:**
1. Navigate to `BASE_URL/pipeline`.
2. Wait for the page to fully load.

**Expected Result:** Pipeline Kanban board loads without JavaScript error.

**Pass Criteria:** Page renders without 500 error or blank screen.

---

### TC-18.2 — 7 Stage Columns Visible

**Steps:**
1. Navigate to `BASE_URL/pipeline`.
2. Count the stage columns on the board.

**Expected Result:** 7 columns visible: Prospect, Qualifying, Proposal Sent, Negotiation, Contract Sent, Closed Won, Closed Lost.

**Pass Criteria:** All 7 column headers present.

---

### TC-18.3 — Companies Appear in Correct Stage Column

**Steps:**
1. Navigate to a company's detail page.
2. Set Pipeline Stage to 'Negotiation'.
3. Save.
4. Navigate to `BASE_URL/pipeline`.
5. Find the company in the 'Negotiation' column.

**Expected Result:** Company appears in the 'Negotiation' column.

**Pass Criteria:** Company card visible in correct stage column.

**Notes:** Pipeline data is read from `companies.pipeline_stage` column. Was CRITICAL-3 bug — fixed to query companies table directly.

---

### TC-18.4 — Stats Bar Shows Pipeline Metrics

**Steps:**
1. Navigate to `BASE_URL/pipeline`.
2. Look for a stats bar showing pipeline summary.

**Expected Result:** Stats bar shows: Active Leads (count), Won Deals (count), Pipeline Value (R$), Revenue Won (R$).

**Pass Criteria:** All 4 stats present and rendering numeric values.

---

### TC-18.5 — Company Row Links to Detail Page

**Steps:**
1. Navigate to `BASE_URL/pipeline`.
2. Click on any company card in any column.

**Expected Result:** Browser navigates to `/companies/[id]` for the clicked company.

**Pass Criteria:** URL changes to `/companies/[uuid]`; company detail loads.

---

## SECTION 19: NEWSLETTER (/newsletter)

### TC-19.1 — Newsletter Page Loads with Analytics

**Steps:**
1. Navigate to `BASE_URL/newsletter`.
2. Check the analytics section at the top.

**Expected Result:** Page loads showing: Total Sent count, Unsubscribe count, Open Rate percentage.

**Pass Criteria:** All 3 analytics metrics render without error.

---

### TC-19.2 — Compose Area Fields Present

**Steps:**
1. Navigate to `BASE_URL/newsletter`.
2. Scroll to the compose/draft section.

**Expected Result:** Compose area shows: Subject field, Body editor (rich text), Recipient mode selector, and Schedule Send button with datetime picker.

**Pass Criteria:** Subject field, body editor, and schedule picker all present.

---

### TC-19.3 — Unsubscribe Page — No UTF-8 Corruption

**Steps:**
1. Navigate to: `BASE_URL/api/newsletter/unsubscribe?email=test@example.com`.
2. Read the page content carefully.

**Expected Result:** A Portuguese unsubscribe confirmation page loads. Text shows 'Você foi descadastrado' — NOT garbled text like 'VocÃª foi descadastrado'.

**Pass Criteria:** Portuguese characters render correctly (ê, ã, ç, etc.). No UTF-8 encoding artifacts.

**Notes:** UTF-8 corruption was fixed by adding `charset=utf-8` header and meta tag. This is a regression test.

---

### TC-19.4 — LGPD Compliance Footer in Compose

**Steps:**
1. Navigate to `BASE_URL/newsletter`.
2. Look for an LGPD compliance notice or unsubscribe link in the compose section.

**Expected Result:** LGPD compliance footer text and/or auto-injected unsubscribe link is indicated in the newsletter compose UI.

**Pass Criteria:** LGPD notice visible in compose area.

---

## SECTION 20: SETTINGS (/settings)

### TC-20.1 — Settings Page Loads with All Sections

**Steps:**
1. Navigate to `BASE_URL/settings`.
2. Count the distinct sections/cards on the page.

**Expected Result:** Page loads with sections: Gmail Connection, API Keys (Hunter.io, Apollo.io, Pipedrive, etc.), App Configuration, Migration Status.

**Pass Criteria:** At least 3 distinct settings sections visible.

---

### TC-20.2 — Gmail Status Indicator

**Steps:**
1. Navigate to `BASE_URL/settings`.
2. Find the Gmail Connection section.
3. Read the status indicator.

**Expected Result:** Gmail section shows either: green 'Connected' indicator (if token valid) OR red/amber 'Expired — Reconnect' indicator.

**Pass Criteria:** Status indicator present; color-coded (green = connected, red/amber = expired).

---

### TC-20.3 — Reconnect Gmail OAuth Flow

**Steps:**
1. Navigate to `BASE_URL/settings`.
2. Click 'Reconnect Gmail' (if token expired) or the Gmail OAuth button.
3. Observe the redirect.

**Expected Result:** Browser redirects to Google OAuth consent page for Gmail authorization.

**Pass Criteria:** Google OAuth page opens (accounts.google.com); not an error page.

---

## SECTION 21: SENDER PROFILES (/settings/sender-profiles)

### TC-21.1 — Page Loads

**Steps:**
1. Navigate to `BASE_URL/settings/sender-profiles`.

**Expected Result:** Sender Profiles page loads. Shows either existing profiles or an empty state message.

**Pass Criteria:** Page loads without error; no 404.

---

### TC-21.2 — Add Sender Profile Form

**Steps:**
1. Navigate to `BASE_URL/settings/sender-profiles`.
2. Click '+ Add Sender Profile'.
3. List all form fields visible.

**Expected Result:** Form opens with fields: Full Name (required), Job Title, Email (required), Phone, LinkedIn URL, HTML Signature, Set as Default checkbox.

**Pass Criteria:** All 7 fields present; Full Name and Email marked required.

---

### TC-21.3 — Save Profile Appears in List Immediately

**Steps:**
1. Open the Add Sender Profile form.
2. Fill in: Full Name = 'QA Sender', Job Title = 'QA Engineer', Email = 'qa@coritiba.com.br'.
3. Click 'Save Profile'.
4. Observe the profiles list.

**Expected Result:** Profile 'QA Sender' appears in the profiles list immediately (no page refresh needed).

**Pass Criteria:** Profile visible in list within 2 seconds of save; toast notification shown.

**Notes:** Optimistic state update fix was CRITICAL-4. Regression test.

---

### TC-21.4 — Default Sender Star Icon

**Steps:**
1. Create a sender profile and check 'Set as Default'.
2. Save and observe the profiles list.

**Expected Result:** The default sender profile has a star icon (★) or 'Default' badge next to it.

**Pass Criteria:** Star icon or Default badge visible on the default sender profile.

---

### TC-21.5 — Delete Profile

**Steps:**
1. On the sender profiles page, click Delete on the 'QA Sender' profile (created in TC-21.3).
2. Confirm deletion.
3. Observe the list.

**Expected Result:** Profile removed from list. Toast confirmation shown.

**Pass Criteria:** Profile no longer visible after deletion; no error.

---

## SECTION 22: MOCKUP EDITOR (/mockup-editor)

### TC-22.1 — Editor Loads with Canvas

**Steps:**
1. Navigate to `BASE_URL/mockup-editor`.
2. Wait for page to fully load.

**Expected Result:** Mockup editor loads showing a canvas area and a sidebar with controls.

**Pass Criteria:** Canvas element visible; no 404/500 error.

---

### TC-22.2 — Template Picker Shows Color-Coded Thumbnails

**Steps:**
1. Navigate to `BASE_URL/mockup-editor`.
2. Locate the template picker.
3. Inspect the thumbnails shown.

**Expected Result:** Template picker shows color-coded thumbnail images with: template name, dimensions (e.g. 1080x1080), and zone count (e.g. '3 zones').

**Pass Criteria:** At least 3 template thumbnails visible with dimensions and zone count labels.

---

### TC-22.3 — Upload Logo Works

**Steps:**
1. On the mockup editor, locate the 'Upload Logo' area in the sidebar.
2. Click it and select a PNG file.
3. Observe the canvas.

**Expected Result:** Logo uploads and appears on the canvas in the selected placement zone.

**Pass Criteria:** Logo renders on canvas after upload.

---

### TC-22.4 — Undo (Ctrl+Z) Works

**Steps:**
1. On the mockup editor, make a change (move an element or upload a logo).
2. Press Ctrl+Z.
3. Observe the canvas.

**Expected Result:** The last action is undone. Canvas reverts to the state before the change.

**Pass Criteria:** Canvas visually reverts after Ctrl+Z.

---

### TC-22.5 — Redo (Ctrl+Y / Ctrl+Shift+Z) Works

**Steps:**
1. Make a change on the canvas.
2. Press Ctrl+Z to undo.
3. Press Ctrl+Y or Ctrl+Shift+Z to redo.
4. Observe the canvas.

**Expected Result:** The undone action is re-applied. Canvas shows the re-done state.

**Pass Criteria:** Canvas state restored after redo shortcut.

---

### TC-22.6 — Zoom In/Out Controls

**Steps:**
1. On the mockup editor, note the current zoom level (should be 1.0x / 100%).
2. Click the 'Zoom In' (+) button 3 times.
3. Note new zoom level.
4. Click 'Zoom Out' (−) button 6 times.
5. Note minimum zoom level.

**Expected Result:** Zoom In increases scale (max 2.0x). Zoom Out decreases scale (min 0.5x). Canvas size updates accordingly.

**Pass Criteria:** Zoom ranges between 0.5x and 2.0x; canvas visually scales.

---

### TC-22.7 — Template Selection Changes Canvas

**Steps:**
1. On the mockup editor, note the current template.
2. Click a different template in the template picker.
3. Observe the canvas.

**Expected Result:** Canvas updates to show the newly selected template's background image and zone layout.

**Pass Criteria:** Canvas template changes when a different thumbnail is clicked.

---

## SECTION 23: SIDEBAR & NAVIGATION

### TC-23.1 — All 6 Section Groups Visible

**Steps:**
1. Navigate to any admin page (e.g. `BASE_URL/`).
2. Observe the left sidebar.
3. List the group headers visible.

**Expected Result:** Sidebar shows exactly 6 group headers: CRM, Proposal Workflow, Intelligence, Media & Visuals, Integrations, System.

**Pass Criteria:** All 6 group headers present.

---

### TC-23.2 — Groups Collapse/Expand on Click

**Steps:**
1. Click on the 'CRM' group header in the sidebar.
2. Observe whether the group's nav links collapse.
3. Click again to expand.

**Expected Result:** Clicking a group header collapses its nav links (with smooth animation). Clicking again expands.

**Pass Criteria:** Links toggle visibility on group header click.

---

### TC-23.3 — Sidebar Collapses to 60px Icon-Only Mode

**Steps:**
1. Click the collapse/chevron button on the sidebar.
2. Measure or estimate the sidebar width.
3. Observe the nav items.

**Expected Result:** Sidebar collapses to ~60px wide showing only icons (no text labels).

**Pass Criteria:** Sidebar visually narrows; text labels hidden; icons remain visible.

---

### TC-23.4 — Tooltips in Collapsed Mode

**Steps:**
1. Collapse the sidebar (TC-23.3).
2. Hover over one of the icon-only nav items.
3. Observe if a tooltip appears.

**Expected Result:** Hovering over an icon in collapsed mode shows a tooltip with the nav item's name.

**Pass Criteria:** Tooltip visible on hover in collapsed mode.

---

### TC-23.5 — PT/EN Language Toggle

**Steps:**
1. Locate the PT/EN toggle button in the sidebar's bottom bar.
2. Note current language (should be PT by default).
3. Click EN.
4. Observe all sidebar nav labels.
5. Click PT.
6. Observe labels again.

**Expected Result:** Clicking EN translates all nav labels and group headers to English. Clicking PT restores Portuguese labels.

**Pass Criteria:** At least 5 nav labels change language when toggle is clicked. Group headers also translate.

**Notes:** Was CRITICAL-5. `t(item.label, lang)` translation function now applied to all nav items and group headers.

---

### TC-23.6 — Breadcrumbs on Deep Pages

**Steps:**
1. Navigate to `BASE_URL/proposals/[id]/edit`.
2. Look at the breadcrumb bar.

**Expected Result:** Breadcrumbs show: `Proposals → [Proposal Title] → Edit`.

**Pass Criteria:** 3-level breadcrumb visible; each segment clickable.

---

## SECTION 24: REPORTS (/reports)

### TC-24.1 — Reports Page Loads with Sponsor Activity

**Steps:**
1. Navigate to `BASE_URL/reports`.
2. Observe the page content.

**Expected Result:** Reports page loads showing sponsor activity data, monthly breakdown charts or tables.

**Pass Criteria:** Page loads without error; at least 1 data section visible.

---

### TC-24.2 — All CSV Export Buttons Download Files

**Steps:**
1. Navigate to `BASE_URL/reports`.
2. Click each of the following export buttons and verify each file downloads:
   - Companies CSV
   - Proposals CSV
   - Contracts CSV
   - Revenue CSV
   - Emails CSV
3. Open each downloaded CSV and verify it has content.

**Expected Result:** All 5 CSV files download successfully with appropriate data.

**Pass Criteria:** All 5 files download without error; each contains at least 1 header row + 1 data row.

---

## SECTION 25: API HEALTH CHECKS

### TC-25.1 — GET /api/proposals Returns 200

**Steps:**
1. Open a browser or use curl: `curl -I BASE_URL/api/proposals?limit=1`.
2. Check HTTP status code.
3. Verify JSON body.

**Expected Result:** HTTP 200. Response body is valid JSON with a `data` array.

**Pass Criteria:** Status 200; Content-Type: application/json.

---

### TC-25.2 — GET /api/audit Returns 200

**Steps:**
1. Navigate to `BASE_URL/api/audit?limit=1` in browser.
2. Check HTTP status and JSON response.

**Expected Result:** HTTP 200 with JSON array of audit log entries.

**Pass Criteria:** Status 200; JSON response with at least 1 audit entry.

---

### TC-25.3 — GET /api/export/companies Returns CSV

**Steps:**
1. Navigate to `BASE_URL/api/export/companies` in browser.
2. Check response content type and content.

**Expected Result:** HTTP 200. Content-Type: text/csv. Response body is valid CSV with company data.

**Pass Criteria:** Status 200; file downloads or displays as CSV.

---

### TC-25.4 — All Export Endpoints Return 200

**Steps:**
1. Test each endpoint by navigating to it in browser:
   - `BASE_URL/api/export/proposals`
   - `BASE_URL/api/export/contracts`
   - `BASE_URL/api/export/revenue`
   - `BASE_URL/api/export/emails`
2. For each, note HTTP status and file download behavior.

**Expected Result:** All 4 endpoints return HTTP 200 with Content-Type: text/csv.

**Pass Criteria:** All return 200; all trigger file download.

---

### TC-25.5 — GET /api/gmail/status Returns Connection Status

**Steps:**
1. Navigate to `BASE_URL/api/gmail/status`.
2. Read the JSON response.

**Expected Result:** HTTP 200. JSON body contains `{ connected: true/false, ... }` or similar structure indicating Gmail connection state.

**Pass Criteria:** Status 200; `connected` field present in response.

---

### TC-25.6 — POST /api/image-generation Reset Stuck

**Steps:**
1. Use browser DevTools fetch or curl:
   `curl -X POST BASE_URL/api/image-generation -H 'Content-Type: application/json' -d '{"action":"reset_stuck"}'`
2. Check the response status and body.

**Expected Result:** HTTP 200. Response indicates number of stuck jobs reset (may be 0 if none stuck).

**Pass Criteria:** Status 200; no 500 error.

---

## SECTION 26: PDF SPONSORSHIP DECK (/proposals/[id]/deck)

### TC-26.1 — Deck Page Loads Without Error

**Steps:**
1. Navigate to an approved proposal's detail page.
2. Click 'Ver Deck PDF'.
3. In the new tab, wait for the deck to load.

**Expected Result:** `/proposals/[id]/deck` page loads a multi-section printable document without JavaScript error.

**Pass Criteria:** Page renders; no console errors; sidebar not visible.

---

### TC-26.2 — 8 Sections Present

**Steps:**
1. Navigate to `/proposals/[id]/deck`.
2. Scroll through the entire page.
3. Identify all sections.

**Expected Result:** Deck contains exactly these 8 sections in order: Cover, Club Profile, The Opportunity, Partnership Package, Inventory, Mockups, Pricing, Next Steps.

**Pass Criteria:** All 8 section headings present and in correct sequence.

---

### TC-26.3 — CFC Branding Visible

**Steps:**
1. Navigate to `/proposals/[id]/deck`.
2. Observe the color scheme and logo placement.

**Expected Result:** Deck uses Coritiba FC green/white color scheme. CFC logo appears on the cover page. Club branding consistent throughout.

**Pass Criteria:** CFC logo visible on cover; green/white dominant colors.

---

### TC-26.4 — Print Hides Sidebar

**Steps:**
1. Navigate to `/proposals/[id]/deck`.
2. Open Print dialog (Ctrl+P).
3. In the print preview, verify sidebar is hidden.

**Expected Result:** Print preview shows only the deck content — no admin sidebar, no internal navigation buttons.

**Pass Criteria:** Sidebar absent in print preview.

---

## SECTION 27: A/B TESTING

### TC-27.1 — Variant B Shows Different CTA

**Steps:**
1. Find a proposal's public token.
2. Navigate to `BASE_URL/proposals/view/[token]?v=B`.
3. Locate the main CTA button.

**Expected Result:** CTA button text is 'Quero Saber Mais' (not 'Tenho Interesse').

**Pass Criteria:** 'Quero Saber Mais' text present; 'Tenho Interesse' absent.

---

### TC-27.2 — Variant B Badge Visible

**Steps:**
1. Navigate to `BASE_URL/proposals/view/[token]?v=B`.
2. Look for a 'Variant B' badge in the header or near the CTA.

**Expected Result:** A small 'Variant B' badge is visible on the page.

**Pass Criteria:** Badge with text 'Variant B' present.

---

### TC-27.3 — Default View Shows Standard CTA

**Steps:**
1. Navigate to `BASE_URL/proposals/view/[token]` (without ?v=B).
2. Observe the CTA button text.

**Expected Result:** Default CTA button shows 'Tenho Interesse'. No 'Variant B' badge visible.

**Pass Criteria:** 'Tenho Interesse' text present; no variant badge.

---

## SECTION 28: PIPEDRIVE INTEGRATION (/system)

### TC-28.1 — System Page Loads with Service Health

**Steps:**
1. Navigate to `BASE_URL/system`.
2. Observe the service health cards.

**Expected Result:** System page loads showing service health indicators for: Supabase, Bedrock, OpenAI, Pipedrive, Hunter.io.

**Pass Criteria:** Page loads; at least 3 service health cards visible.

---

### TC-28.2 — Pipedrive Sync Button Present and Functional

**Steps:**
1. Navigate to `BASE_URL/system`.
2. Find the 'Pipedrive Sync' card.
3. Click 'Run Pipedrive Sync Now'.
4. Wait for the sync to complete.

**Expected Result:** After clicking, sync runs and shows results: 'X deals synced, Y errors'.

**Pass Criteria:** Button present; sync completes with a result message (not an error).

---

### TC-28.3 — Pipedrive Sync API Endpoint

**Steps:**
1. Use curl or DevTools:
   `curl -X POST BASE_URL/api/system/pipedrive-sync -H 'Authorization: Bearer [CRON_SECRET]'`
2. Verify response status and body.

**Expected Result:** HTTP 200. JSON body shows sync results with `synced` and `errors` counts.

**Pass Criteria:** Status 200; `synced` count >= 0 (0 is OK if no pending proposals).

**Notes:** Get CRON_SECRET from `.env` file. Endpoint requires Bearer token auth.

---

### TC-28.4 — Proposal Status Change Creates Pipedrive Deal

**Steps:**
1. Create a test proposal (TC-7.5).
2. Change its status to 'sent' via edit form.
3. Save the proposal.
4. Check Pipedrive CRM (if accessible) or run Pipedrive Sync and check sync log.

**Expected Result:** A Pipedrive deal is created or updated for this proposal when status changes to 'sent'.

**Pass Criteria:** No sync error for this proposal; deal appears in Pipedrive or sync log shows 'created/updated'.

---

## SECTION 29: FULL END-TO-END WORKFLOW

This is the master workflow test — run it in a single session after all individual section tests pass. It validates the complete commercial journey from lead creation to contract.

### TC-29.1 — Step 1: Add New Company

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click '+ Add Company'.
3. Fill in: Company Name = 'Empresa Teste SA', Industry = 'Automotivo', Pipeline Stage = 'Prospect', Website = 'https://empresateste.com.br'.
4. Click Save.
5. Note the company's ID from the URL after redirect.

**Expected Result:** Company 'Empresa Teste SA' created and visible on `/companies` page with 'Automotivo' industry badge and 'Prospect' stage.

**Pass Criteria:** Company record created; visible in list; detail page accessible.

---

### TC-29.2 — Step 2: Verify on Pipeline Board

**Steps:**
1. Navigate to `BASE_URL/pipeline`.
2. Look for 'Empresa Teste SA' in the 'Prospect' column.

**Expected Result:** 'Empresa Teste SA' card appears in the 'Prospect' stage column on the pipeline board.

**Pass Criteria:** Company card visible in correct stage column.

---

### TC-29.3 — Step 3: Run Outreach Agent and Approve Proposal

**Steps:**
1. Navigate to `BASE_URL/companies/[id]` for 'Empresa Teste SA'.
2. Click 'Run Agent'.
3. Wait for Steps 1–3 to complete (enrich_contacts → scrape → generate_proposal).
4. At the first approval gate, review the generated proposal preview.
5. Click 'Approve Proposal'.

**Expected Result:** Agent progresses through Steps 1–3. First approval gate appears with proposal preview. Approving moves to Step 4.

**Pass Criteria:** All 3 steps complete; approval gate shown; Step 4 begins after approval.

**Notes:** Steps 1–3 may take 2–5 minutes total. Bedrock quota and Apify scraping required.

---

### TC-29.4 — Step 4: Approve Email and Verify Send

**Steps:**
1. Wait for Step 4 (generate_personalized_email) to complete.
2. Review the email preview shown in the progress UI.
3. Verify the email body does NOT contain unresolved placeholders.
4. Click 'Approve Email'.
5. Wait for Step 5 (send_email) to complete.

**Expected Result:** Email preview shown without literal [Nome]/[Empresa] placeholders. Approving triggers send. Step 5 completes with 'Email Sent' confirmation.

**Pass Criteria:** Step 5 shows success status; no placeholder tokens in email.

---

### TC-29.5 — Step 5: Check Email in /emails

**Steps:**
1. Navigate to `BASE_URL/emails`.
2. Find the email sent to 'Empresa Teste SA' contact.
3. Click on the email to open detail.
4. Verify the email body contains a 'Ver Proposta →' CTA button.

**Expected Result:** Email appears in list. Detail view shows the auto-injected 'Ver Proposta →' CTA linking to the proposal landing page.

**Pass Criteria:** Email record visible; CTA button present in body.

---

### TC-29.6 — Step 6: Open Landing Page and Verify Sections

**Steps:**
1. Navigate to the proposal created for 'Empresa Teste SA' (find it via `/proposals`).
2. Click 'Landing Page ↗' on the proposal detail.
3. Verify each section on the public landing page.

**Expected Result:** Landing page renders all sections: CFC header, hero with proposal title, club stats bar, full proposal content, sticky CTA bar, lead capture form, LGPD checkbox.

**Pass Criteria:** All 7 landing page sections visible; no sidebar; no console errors.

---

### TC-29.7 — Step 7: Submit Lead Interest Form

**Steps:**
1. On the landing page, fill in the lead capture form:
   - Name: 'João E2E Tester'
   - Company: 'Empresa Teste SA'
   - Email: 'joao@empresateste.com.br'
   - Phone: '+5541988887777'
   - Message: 'Tenho interesse nesta proposta de patrocínio.'
2. Check the LGPD consent checkbox.
3. Click 'Enviar' / 'Tenho Interesse'.

**Expected Result:** Form submits successfully. Success message shown: 'Obrigado! Entraremos em contato em breve'.

**Pass Criteria:** Success message displayed; lead logged in `audit_logs` (verify via `GET /api/audit?limit=1`).

---

### TC-29.8 — Step 8: Approve via Approvals Page

**Steps:**
1. Navigate to `BASE_URL/approvals`.
2. Find the proposal card for 'Empresa Teste SA'.
3. Press → (right arrow) or drag right to approve.

**Expected Result:** Proposal card is approved. Status changes to 'approved' in the database. Card flies off screen. Progress bar advances.

**Pass Criteria:** Proposal status = 'approved' after this step (verify on proposal detail page).

---

### TC-29.9 — Step 9: Convert to Contract

**Steps:**
1. Navigate to the proposal detail for 'Empresa Teste SA'.
2. Verify status badge shows 'approved'.
3. Click 'Convert to Contract'.
4. Fill in modal: Total Value = 75000, Start = 2026-07-01, End = 2026-12-31, Deal Type = Patrocínio Puro.
5. Click Submit.

**Expected Result:** Contract created with number CTR-2026-XXXX. Success message shown.

**Pass Criteria:** Modal submits without error; redirect or success message confirms creation.

---

### TC-29.10 — Step 10: Verify Contract on /contracts

**Steps:**
1. Navigate to `BASE_URL/contracts`.
2. Find the new contract for 'Empresa Teste SA'.
3. Verify: contract number, value R$75,000, dates, deal type.

**Expected Result:** Contract visible with all correct field values.

**Pass Criteria:** Contract row shows: CTR-2026-XXXX, Empresa Teste SA, R$75.000, 01/07/2026–31/12/2026, Patrocínio Puro.

---

### TC-29.11 — Step 11: Generate Jersey Mockup

**Steps:**
1. Navigate to the proposal detail for 'Empresa Teste SA'.
2. In Brand Assets, upload a sponsor logo (PNG file).
3. Click 'Generate Mockup' → confirm in modal.
4. Wait up to 60 seconds for generation.
5. Verify the generated jersey image.

**Expected Result:** Jersey mockup generated showing sponsor logo on white badge. CFC crest unchanged. Image saved in Saved Images section.

**Pass Criteria:** Jersey image renders; sponsor logo visible; CFC crest intact.

---

### TC-29.12 — Step 12: Generate and Edit AI Creative

**Steps:**
1. On the proposal detail, click 'Generate AI Creatives'.
2. In the modal, click 'Edit' on the first prompt.
3. Add the text 'QA MARKER' to the end of the prompt.
4. Click 'Confirm & Generate'.
5. Wait for generation.

**Expected Result:** Modal shows edited prompt. Generation proceeds. Images appear in Saved Images section.

**Pass Criteria:** Edited prompt used (not reverted); images generated and visible.

---

### TC-29.13 — Step 13: Approve Image for Landing Page

**Steps:**
1. In Saved Images section, click 'Approve' on one generated image.
2. Navigate to the proposal's public landing page.
3. Scroll to the gallery section.

**Expected Result:** Approved image appears in the landing page gallery.

**Pass Criteria:** Image visible in gallery on public landing page.

---

### TC-29.14 — Step 14: Verify Dashboard KPIs Updated

**Steps:**
1. Navigate to `BASE_URL/`.
2. Check the following KPIs have changed from their initial values:
   - Pipeline Value (should include the new proposal)
   - Active Contracts (should be +1)
   - Emails Sent (should be +1)

**Expected Result:** Dashboard KPIs reflect the new company, proposal, email, and contract created during this E2E test.

**Pass Criteria:** At least Active Contracts and Emails Sent are non-zero and updated.

---

### TC-29.15 — Step 15: Export Companies CSV Contains Test Company

**Steps:**
1. Navigate to `BASE_URL/companies`.
2. Click 'Export CSV'.
3. Open the downloaded CSV.
4. Search for 'Empresa Teste SA' in the file.

**Expected Result:** 'Empresa Teste SA' row is present in the CSV with correct industry and status values.

**Pass Criteria:** Company appears in CSV; data matches what was entered in TC-29.1.

---

---

## APPENDIX A: KNOWN LIMITATIONS (Not Test Failures)

These are known platform limitations as of Jun 26, 2026. A tester should note these but NOT mark them as failures:

| # | Limitation | Workaround |
|---|-----------|------------|
| L-1 | **Gmail OAuth** — token may be expired (expired 22 May 2026). Emails log to DB but may not deliver to real inbox. | Reconnect at `/settings` → Gmail → Reconnect. Outreach agent emails still create records. |
| L-2 | **Email open/click badges** — show 0% for emails sent before Jun 26, 2026 (tracking not deployed yet). | Only new emails sent after Jun 26 will have tracking data. |
| L-3 | **Pipeline drag-drop** — not implemented. Stage changes require editing company directly. | Use company edit form → Pipeline Stage dropdown. |
| L-4 | **Replicate LoRA** — uses 2024 Coritiba kit model. 2026 retrain pending new photos. | Jersey mockup uses existing 2024 model. Results valid but kit is previous season. |
| L-5 | **Most companies have no pipeline_stage set** — pipeline board may appear sparse. | Set pipeline_stage on individual companies via edit form to populate board. |
| L-6 | **A/B variant logging** — `ab_variant` column in `proposal_variants` table requires `proposal_variants` table to exist. | Run migration `run_all_26june.sql` if table missing. |

---

## APPENDIX B: COMMON FAILURE MODES & DIAGNOSTICS

| Symptom | Likely Cause | Diagnostic |
|---------|-------------|------------|
| Dashboard KPIs all 0 | Supabase RPC function error or missing table | Check DevTools Network for 500 from `/api/dashboard` or Supabase |
| Agent runs but no progress | Bedrock API quota exceeded or region issue | Check AWS Bedrock console; verify `AWS_REGION` in `.env` |
| Hunter.io returns no contacts | Invalid API key or rate limit | Check `/settings` API Keys section; verify `HUNTER_API_KEY` |
| Image generation stuck at 'Generating' | Stale stuck job from previous run | POST `BASE_URL/api/image-generation` with `{action: 'reset_stuck'}` |
| Emails not sending | Gmail OAuth expired | Reconnect Gmail at `/settings`; tokens expire periodically |
| Pipeline shows 0 leads | Companies have no `pipeline_stage` set | Edit companies and assign pipeline stages |
| Landing page JS chunk error | Stale Next.js `.next` cache | Run `pm2 stop all && npm run build && pm2 start` on server |
| Approvals page shows list not cards | Component default regressed | Check `ApprovalsViewToggle` default state = 'cards' |
| Language toggle has no effect | `NavLinks` not calling `t()` | Verify `t(item.label, lang)` in `NavLinks` component |
| Sender profile save fails silently | `useEffect` sync issue | Check optimistic state update in sender profiles component |
| /ai-generation 404 | Route not redirecting | Verify redirect from `/ai-generation` → `/proposals` exists |
| Newsletter UTF-8 garbled | Missing charset header | Verify `Content-Type: text/html; charset=utf-8` on unsubscribe endpoint |

---

## APPENDIX C: TEST DATA REFERENCE

Use these real data values during testing:

| Data Type | Test Value |
|-----------|-----------|
| Test Company Name | Empresa Teste SA |
| Test Industry | Automotivo |
| Test Domain (Hunter.io) | bradesco.com.br |
| Test Email | qa-test@empresateste.com.br |
| Test Proposal Title | QA Test Proposal — Patrocínio Coritiba FC 2026 |
| Test Contract Value | R$ 75.000 |
| Test Contract Number Format | CTR-2026-XXXX |
| Test Meeting Link | https://cal.com/coritiba/30min |
| Base URL | https://eligibly-facing-unloved.ngrok-free.dev |
| Valid Placement Zones | Peito, Manga esquerda, Manga direita, Costas, Shorts, Meiões |
| A/B URL Parameter | ?v=B |

---

## APPENDIX D: TEST EXECUTION CHECKLIST

Run tests in this order for maximum efficiency:

```
[ ] Section 25 — API Health Checks (run first to verify backend is up)
[ ] Section 1  — Dashboard
[ ] Section 20 — Settings (verify Gmail + API key status)
[ ] Section 2  — Companies list + filters
[ ] Section 3  — Company detail
[ ] Section 6  — Proposals list
[ ] Section 7  — Proposal wizard
[ ] Section 8  — Proposal detail
[ ] Section 9  — Proposal edit
[ ] Section 10 — Brand assets + jersey mockup
[ ] Section 11 — AI campaign creatives
[ ] Section 12 — Sponsor landing page
[ ] Section 26 — PDF sponsorship deck
[ ] Section 27 — A/B testing
[ ] Section 4  — Outreach agent (full supervised flow)
[ ] Section 5  — Hunter.io contacts
[ ] Section 15 — Emails
[ ] Section 16 — Email tracking
[ ] Section 13 — Approvals (Tinder card view)
[ ] Section 14 — Campaigns
[ ] Section 17 — Contracts
[ ] Section 18 — Pipeline
[ ] Section 19 — Newsletter
[ ] Section 21 — Sender profiles
[ ] Section 22 — Mockup editor
[ ] Section 23 — Sidebar & navigation
[ ] Section 24 — Reports
[ ] Section 28 — Pipedrive integration
[ ] Section 29 — FULL END-TO-END WORKFLOW (run last)
```

---

## APPENDIX E: SEVERITY CLASSIFICATION

When logging a failed test, classify severity as:

| Level | Description | Examples |
|-------|-------------|---------|
| P0 — Critical | Workflow-stopping; core feature broken | Agent not running, proposals not saving, landing page 500 error |
| P1 — High | Significant friction; major feature degraded | Approvals not showing, filters broken, tracking not logging |
| P2 — Medium | Feature partially working; workaround available | Export missing a column, badge wrong color, zoom limit off |
| P3 — Low | Minor cosmetic or UX issue | Tooltip text wrong, breadcrumb typo, spacing issue |

---

*Document generated: 26 June 2026 | Platform version: 26th-june-sprint | Health: 9/10*
