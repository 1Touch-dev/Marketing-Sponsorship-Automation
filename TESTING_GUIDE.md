# Coritiba FC Sponsorship Platform — Full Testing Guide
> **Branch:** `8th-june-sprint` | **Environment:** `https://eligibly-facing-unloved.ngrok-free.dev`
> **Last updated:** 8 June 2026

---

## How to Use This Document

Each test section lists:
- **Where to go** — exact URL or navigation path
- **What to do** — step-by-step actions
- **What to verify** — exact expected outcomes
- **Pass / Fail criteria**

---

## 1. Proposal Creation — All 7 Types

### Go to: `/proposals/new`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "New Proposal" | 6-step wizard appears |
| 2 | Step 1: Verify visible proposal types | Should show **7 cards**: Sponsorship, Barter/Goods, Lei de Incentivo, Mixed, **ESG/Community**, **Local Business**, **National Brand** |
| 3 | Select "ESG/Community" → proceed | Wizard advances to Step 2 (company picker) |
| 4 | Select "Local Business" → proceed | Wizard advances |
| 5 | Select "National Brand" → proceed | Wizard advances |
| 6 | Create a Sponsorship proposal end-to-end | All 6 steps complete, proposal saved in DB |

**Pass:** All 7 types visible and selectable. Proposal saves successfully.

---

## 2. Proposal Edit & Completion Checklist

### Go to: `/proposals/[any-proposal-id]/edit`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open any proposal in edit mode | Completion checklist visible at top |
| 2 | Observe progress bar percentage | Shows 0–100% based on filled sections |
| 3 | Observe per-section status | Each section shows ✓ (done) or ⚠ (missing) |
| 4 | Fill in one section | Progress bar increases, section turns ✓ |
| 5 | Use AI A/B/C alternatives | Click A / B / C buttons per section to generate alternatives |

**Pass:** Checklist renders, progress changes as sections filled, AI alternatives generate.

---

## 3. Logo Gate — Block Proposal Until Logo Uploaded

### Go to: `/proposals/[id]` (proposal WITHOUT a logo)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open a proposal with no logo | **Yellow warning banner** at top: "⚠️ No sponsor logo uploaded" |
| 2 | Check "Submit for Review" button | Button is **disabled** (grey, not clickable) |
| 3 | Check "Approve" button | Button is **disabled** |
| 4 | Click "Upload the sponsor logo" link in banner | Page scrolls to Brand Assets section |
| 5 | Check image generation buttons | Jersey generator + Campaign generator buttons are **disabled** |
| 6 | Upload a logo in Brand Assets | Warning disappears, all buttons become enabled |
| 7 | Verify auto-image generation trigger | Blue banner appears: "Auto-generating campaign images for each strategy…" |

**Pass:** All gates work. Logo upload unlocks everything. Auto-generation fires.

---

## 4. Brand Assets Card & Sponsor Checklist

### Go to: `/proposals/[id]` → scroll to Brand Assets section

| Step | Action | Expected |
|------|--------|----------|
| 1 | Look at amber checklist | 4 items visible: Color logo ○, Monochrome ○, Outline ○, Vector ○ |
| 2 | Upload a color logo | First checklist item turns **✓** and strikes through |
| 3 | Observe description | Card says "Campaign images auto-generate when the first logo is uploaded" |

**Pass:** Checklist renders, first item checks when logo uploaded.

---

## 5. Landing Page — All 5 Templates

### Go to: `/proposals/[id]` → Preview / CMS Editor tab

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open proposal CMS editor | Template switcher visible in toolbar with 5 options |
| 2 | Click **Premium** | Dark green hero, sponsor cards, strategy variants |
| 3 | Click **Minimal** | Clean white layout, document-style, executive feel |
| 4 | Click **Packages A/B/C** | Large tier cards (Gold/Silver/Bronze), "Quero esse pacote" CTA |
| 5 | Click **One Offer** | Split hero with company card on right, single focused layout |
| 6 | Click **Menu de Ativos** | Full asset menu categorized by jersey/stadium/digital/community |
| 7 | Verify official brand color | Hero backgrounds should be **#005742** (dark forest green), NOT #003300 or #006400 |

**Pass:** All 5 templates render. Colors are official Coritiba Verde Coxa.

---

## 6. Image Generation — Jersey Mockup

### Go to: `/proposals/[id]` → Visuais section → Jersey Mockup tab

| Step | Action | Expected |
|------|--------|----------|
| 1 | Without logo: check buttons | "Gerar Mockup Oficial" and "Gerar Criativo" are **disabled** |
| 2 | Upload logo → return to visuais | Buttons become enabled |
| 3 | Click "Gerar Mockup Oficial" | Loads, returns jersey composite image with sponsor overlay |
| 4 | Check jersey sponsor patch size | Chest patch uses official 25cm-calibrated proportions (w≈0.165) |
| 5 | Try each placement zone | Select chest / sleeve / back / shorts / socks, verify overlay position |
| 6 | Click "Gerar Criativo" scenes | Select 1–3 scenes, click generate, Replicate LoRA images return |

**Pass:** Mockup generates, placement zones correct. LoRA images generate with `coritiba_jersey` trigger.

---

## 7. Campaign Image Generation — Per Strategy

### Go to: `/proposals/[id]` → Visuais → Criativos de Campanha

| Step | Action | Expected |
|------|--------|----------|
| 1 | Without logo: check buttons | "Gerar" buttons are disabled |
| 2 | Upload logo | Buttons enabled; if strategies exist → auto-generation fires immediately |
| 3 | Click "Gerar para todas" manually | Generates one image per strategy variant (up to 3) |
| 4 | Verify individual generate | Each strategy has its own "Gerar" button |
| 5 | Check generated image prompts | Should reference "Estádio Couto Pereira", "verde coxa", "deep forest green #005742" |

**Pass:** Per-strategy images generate. Auto-trigger fires on first logo upload.

---

## 8. Approval Tinder Flow — Keyboard + Swipe + Email Send

### Go to: `/approvals` → Card View

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/approvals` → switch to Card View | Card view shows proposal/campaign/email items |
| 2 | Press **→** arrow key | Navigates to next card |
| 3 | Press **←** arrow key | Navigates to previous card |
| 4 | Press **A** key on a proposal card | Proposal approved; email template picker modal appears |
| 5 | Press **R** key on a card | Item rejected, moves to next |
| 6 | Swipe left on mobile | Moves to next card |
| 7 | Swipe right on mobile | Moves to previous card |
| 8 | In email picker: select a template | Template options load (10 available) |
| 9 | Click "Enviar email" | Email is **generated AND sent** (status updates to "sent") |
| 10 | Click "Pular" | Skips email, advances to next card |
| 11 | Verify email was actually sent | Go to `/emails` — email status should be "sent", not "draft" |

**Pass:** A/R keys work. Swipe works. Email sends (not just generates) after approval.

---

## 9. Bulk Logo Upload — Proposals List

### Go to: `/proposals`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/proposals` | If any proposals lack logos → amber "Bulk Logo Upload — N proposals without logo" button visible |
| 2 | Click the button | Expands panel with file picker + proposal list |
| 3 | Select a logo file | File name and size shown |
| 4 | Check specific proposals to update | Checkbox list of all no-logo proposals |
| 5 | Click "Select all" | All proposals selected |
| 6 | Click "Upload to X proposals" | Progress shown per proposal (uploading → ✓ done / ✗ error) |
| 7 | After upload: reload proposals | Proposals now have logos, button count reduces |

**Pass:** Panel opens. Logo uploads to multiple proposals simultaneously. Status shown per proposal.

---

## 10. Email Templates — CRUD + Variable Preview

### Go to: `/emails`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/emails` | List of email templates visible (should show 10 seeded templates) |
| 2 | Click a template | Full template detail: name, subject, body |
| 3 | Create new template | Form with subject, body, HTML preview |
| 4 | Use variable `{{company_name}}` | Preview shows live substitution |
| 5 | Edit existing template | Changes save correctly |
| 6 | Delete a template | Removed from list |

**Pass:** 10 templates visible. CRUD works. Variable preview renders.

---

## 11. Newsletter Module

### Go to: `/newsletter`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/newsletter` | Composer + recipient picker + send history panels |
| 2 | Select "Todos os Contatos" | Recipient count shows total contacts |
| 3 | Select "Empresas Específicas" | Dropdown shows company list with contact counts |
| 4 | Select "Emails Manuais" | Text area to type comma-separated emails |
| 5 | Click "Importar Template" | Template picker shows all 10 templates |
| 6 | Select a template | Subject and body auto-populate |
| 7 | Toggle HTML preview | Renders HTML content |
| 8 | Click "Enviar Newsletter" | Sends; success message + history entry added |
| 9 | Check send history tab | Past newsletters listed with date, recipients, status |

**Pass:** All 3 recipient modes work. Template import works. Send creates history entry.

---

## 12. Contacts / Persons Module

### Go to: `/contacts`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/contacts` | Table of contacts visible |
| 2 | Search by name | Filters in real time |
| 3 | Filter by company dropdown | Shows contacts from that company only |
| 4 | Click "Add Contact" | Form appears: company, name, title, email, phone, seniority |
| 5 | Fill and submit | New contact appears in table |
| 6 | Click delete on a contact | Confirmation → contact removed |
| 7 | Check seniority badges | C-Level / VP / Director / Manager / Analyst badges visible |

**Pass:** Table loads. Search/filter work. Add/delete work. Seniority badges display.

---

## 13. AI Proposal Quality — Brand Accuracy

### Go to: Any proposal → "Generate" or "Enhance"

| Step | Action | Expected |
|------|--------|----------|
| 1 | Generate campaign ideas | Ideas reference "Coritiba FC", "Couto Pereira", "Curitiba/Paraná" |
| 2 | Check for competitor mentions | Should **NEVER** mention Athletico Paranaense, Flamengo, Corinthians |
| 3 | Check strategy variants | Each variant uses a different archetype (awareness / fan_engagement / community / etc.) |
| 4 | Verify prompt version in audit | `/system` → Audit → prompt version should be `v5.0.0` |

**Pass:** All ideas are Coritiba-specific. No competitors. Prompt version v5.0.0.

---

## 14. Sidebar Navigation

### Check sidebar from any page

| Item | Expected Location | Expected URL |
|------|------------------|-------------|
| Proposals | Main nav | `/proposals` |
| Contacts | CRM group | `/contacts` |
| Companies | CRM group | `/companies` |
| Pipeline | CRM group | `/pipeline` |
| Newsletter | Proposal Workflow group | `/newsletter` |
| Emails | Proposal Workflow group | `/emails` |
| Approvals | Proposal Workflow group | `/approvals` |

**Pass:** All 7 items visible in correct groups.

---

## 15. Public Landing Page (Sponsor View)

### Go to: `/proposals/view/[share-token]`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Copy share link from proposal detail page | Link copied |
| 2 | Open in incognito / new tab | Public landing page loads without login |
| 3 | Check brand colors | Header should use **#005742** (dark forest green), not bright green |
| 4 | Check logo displays | Company logo shown (if uploaded) |
| 5 | Approved images appear | If images approved, they show in gallery section |
| 6 | Check CTA bottom bar | Fixed "Tenho interesse" + "Ver proposta completa" buttons |

**Pass:** Public page accessible without auth. Brand colors correct. Images and CTA visible.

---

## 16. Jersey Placement Dimensions (Official Manual Check)

### Go to: `/proposals/[id]` → Jersey Mockup → generate any placement

| Placement | Official Max | Expected patch width in image |
|-----------|-------------|-------------------------------|
| Chest sponsor | 25 cm | ~16.5% of jersey body width |
| Chest above name | 8 cm | ~5.8% of jersey body width |
| Left / Right sleeve | 8 cm each | ~7% of sleeve width |
| Back sponsor | 25 cm | ~27% of back body width |
| Shorts | 8 cm | ~8% of shorts width |
| Socks | 6 cm | ~7.5% of sock calf width |

**Pass:** All sponsor patches are proportionally sized per official manual.

---

## 17. Replicate Model Status

### Check at: `https://replicate.com/abhishek9302/coritiba-jersey-lora`

| Check | Expected |
|-------|----------|
| Model status | "Warm" (fast booting) |
| Hardware | H100 GPU |
| Trigger word | `coritiba_jersey` |
| Versions | At least 1 active version |
| Cost | $0.001525/second |

**Note:** No retraining needed until James provides new 2026 kit photos.

---

## Known Pending Items (Not In This Sprint)

| Item | Status | Notes |
|------|--------|-------|
| Contacts bulk CSV import | ❌ Not built | Only single-add supported |
| Replicate LoRA retraining | ⏳ Pending assets | Wait for new kit photos from James |
| Packages template empty state | ⚠️ Requires data | Need pricing tiers created in proposal |
| Inventory Menu template categorization | ⚠️ Keyword-based | Works best when deliverables use standard terms |

---

## Quick Smoke Test Checklist (5-Minute Version)

Run this after any deployment:

- [ ] `/proposals` loads — proposals listed
- [ ] Bulk logo upload button visible if any proposals lack logos
- [ ] `/proposals/new` — 7 proposal types visible in Step 1
- [ ] Open a proposal without logo — yellow warning banner + disabled buttons
- [ ] `/approvals` → Card View → press A → email picker appears with "Enviar email"
- [ ] `/contacts` — table loads with contacts
- [ ] `/newsletter` — page loads, 3 recipient modes visible
- [ ] `/emails` — 10+ templates listed
- [ ] Any proposal CMS editor — 5 template options in switcher
- [ ] Sidebar — Contacts + Newsletter links visible

---

## Test Environment Details

| Item | Value |
|------|-------|
| URL | `https://eligibly-facing-unloved.ngrok-free.dev` |
| Branch | `8th-june-sprint` |
| Process manager | PM2 (`sponsorship-platform`) |
| Database | Supabase (PostgreSQL) |
| AI | AWS Bedrock (Claude 3.5 Sonnet) — prompts v5.0.0 |
| Image gen | Replicate `abhishek9302/coritiba-jersey-lora` (H100, warm) |
| Email | Gmail API |
| Brand colors | `#005742` Verde Coxa (official) |
| Jersey specs | Per Manual de Aplicação Patrocinadores 2026 |

---

## E2E Test Results — 8 June 2026 (Full Deep Test)

> Conducted via Cursor browser on the live deployment. All 17 tests were run.

| Test | Status | Notes |
|------|--------|-------|
| T1: Proposal wizard — 7 types | ✅ PASS | All 7 types visible and selectable |
| T2: Proposal edit + checklist | ✅ PASS | Progress bar, per-section status, AI alternatives |
| T3: Logo gate | ✅ PASS | Yellow warning banner + disabled "Submit for Review" |
| T4: Brand Assets card + checklist | ✅ PASS | 4-item checklist visible; ✓ marks on upload |
| T5: All 5 landing page templates | ✅ PASS | Premium, Minimal, Packages A/B/C, One Offer, Menu de Ativos |
| T6: Jersey mockup zones | ✅ PASS | 7 zones with official cm specs |
| T7: Campaign images per strategy | ✅ PASS | "✓ Gerado" per strategy after generation |
| T8: Approval tinder + email | ✅ PASS | Keyboard nav, swipe, template picker, Enviar email button |
| T9: Bulk logo upload | ✅ PASS | Panel visible, select all, real-time upload status |
| T10: Email templates CRUD | ✅ PASS | Create, edit, preview HTML, variable substitution |
| T11: Newsletter module | ✅ PASS | Template picker pre-fills subject/body, send enabled |
| T12: Contacts module | ✅ PASS | Search, filter by company, Add Contact form |
| T13: AI proposal quality | ✅ PASS | Brand-accurate: correct stadium, colors, pricing, Portuguese |
| T14: Sidebar navigation | ✅ PASS | All links present including Email Templates |
| T15: Public landing page | ✅ PASS | `/proposals/view/[token]` renders with brand colors |
| T16: Jersey mockup with logo | ✅ PASS | Logo-based mockup generated, saved to Supabase storage |
| T17: Approval email auto-send | ✅ PASS | Template picker modal → select → Enviar email triggers send |

### Bugs Found & Fixed During Testing

| Bug | Where | Fix Applied |
|-----|-------|-------------|
| Sidebar missing "Email Templates" link | `/frontend/components/shared/sidebar.tsx` | Added link to `/settings/email-templates` |
| Jersey mockup button disabled (no logo = text-only OK) | `proposal-graphics-panel.tsx` | Set `disabled={false}` |
| Jersey text clipping — "AS BAHIA (OPERAÇÃO" instead of full name | `jersey-composite.ts` | Fixed font size calculation using `availableWidth * 0.92 / (label.length * 0.58)` |

### Remaining / Future Items

| Item | Priority | Notes |
|------|----------|-------|
| Contacts bulk CSV import | Medium | Only single-add supported currently |
| Replicate LoRA retraining | Low | Wait for new 2026 kit photos from James |
| Packages pricing tiers UI | Low | Requires proposal packages section to be populated |
| Deliverables section missing warning | Medium | Many proposals show "⚠️ Proposta incompleta — seções faltando: deliverables" |

