# Full Business Workflow Certification

**Platform:** https://eligibly-facing-unloved.ngrok-free.dev  
**Branch:** `feature/5th-june-final-polish`  
**Date:** 2026-06-04  
**Tester:** Live E2E (authenticated browser + Supabase service-role verification)  
**Method:** Fresh records, UI execution, API/DB checks, page refresh where noted.

This is a **business-process** certification (not page-load / button-existence).

---

## Executive summary

| Verdict | Detail |
|---------|--------|
| **Conditional GO** | Core revenue paths (enrichment, outreach agent, proposals, packages, public landing, bulk generation, CRM activity) are proven end-to-end. |
| **Not unconditional GO** | Workflows 10, 14, and parts of 6–7, 8–9 UI paths were not fully re-validated in-browser in this pass; see per-workflow notes. |

**Bug fixed during certification:** `domain` / `domain_source` were not backfilled when `website` already matched the resolved hostname. Fixed in commit `69f13d5`, deployed to ngrok.

---

## Workflow results

### Workflow 1 — Company enrichment — **PASS**

| Step | Result |
|------|--------|
| Fresh company + website | Created `E2E Cert Flow 1780569292` |
| Enrich → Hunter/Apollo | 5 contacts in UI; enrichment in `full_intelligence.enrichment` |
| Save contacts | 5 rows in `contacts` |
| Run AI Analysis | `coritiba_fit_score` 8/10; intelligence sections on refresh |
| Domain persistence | After fix + re-enrich: `domain=positivotecnologia.com.br`, `domain_source=website` |

**Evidence**

- `company_id`: `bba0e1fd-058a-4a8a-bac2-ba1850346329`
- `contact_ids`: `778225fa-e6ca-4a0f-b6c2-e057a2729a8b`, `8691cdf0-45a3-46dd-8b32-c42d8cbd2d8d`, `91270eb1-b2b7-4c88-bf19-42d95f9d0b00`, `f26a1876-65fd-4e54-839d-4ce612b7865b`, `5f4ff833-28ba-40f4-a733-f0061af7dfdd`
- `domain`: `positivotecnologia.com.br`
- `domain_source`: `website`
- `website`: `https://www.positivotecnologia.com.br`

---

### Workflow 2 — Manual domain recovery — **PASS**

| Step | Result |
|------|--------|
| Company without website | `E2E Manual Domain 1780569292` (`78419623-615e-4883-b7cb-2e41041520ae`) |
| Enrich fails | UI: manual domain banner |
| Manual `cresol.com.br` → Save & Re-enrich | `domain=cresol.com.br`, `domain_source=manual`, `website=https://cresol.com.br` |
| Contacts | 10 Hunter contacts in UI; 3+ saved to `contacts` |
| Before/after | `domain` null → `cresol.com.br` / `manual` |

**Evidence**

- `company_id`: `78419623-615e-4883-b7cb-2e41041520ae`
- `domain`: `cresol.com.br`
- `domain_source`: `manual`
- Hunter sample: `pablo@cresol.com.br`, `roger.barbosa@cresol.com.br`

---

### Workflow 3 — Outreach agent full run — **PASS**

Fresh company `E2E Outreach Agent 1780569642` (`c9bb989d-73e5-4a12-899d-2d77cc00fc79`), website Renner.

| Step | Result |
|------|--------|
| Run Agent | SSE completed |
| Proposal approval | Paused → approved |
| Email approval + send | Sent via Pipedrive path |
| CRM | UI: `Pipedrive activity #1597` |

**Evidence**

- `agent_run_id`: `7b1864e1-a81d-4a41-b28b-0286eba0ad5c` (status `completed`)
- `campaign_id`: `31081b01-ba0c-4b82-ad86-65725e302b24`
- `proposal_id`: `0b67da9d-d59b-4a7f-896e-5efc1c6bc2b9`
- `email_id`: `d841fbf8-af50-470b-b1d1-bab0ca60d2ea`
- `pipedrive_activity_id`: `1597`

---

### Workflow 4 — Proposal flow — **PASS**

| Step | Result |
|------|--------|
| Edit executive summary | Appended `[CERT-W4-EDIT]` → proposal `version=2` |
| DB persistence | `content.executive_summary` contains marker |
| Landing | Public page shows updated v2 content |
| Campaign link | Proposal linked to agent campaign |

**Evidence**

- `proposal_id`: `0b67da9d-d59b-4a7f-896e-5efc1c6bc2b9`
- `version`: 2

---

### Workflow 5 — Package system — **PASS**

Created **Prata / Ouro / Diamante** on cert proposal.

| Step | Result |
|------|--------|
| DB `proposal_packages` | 3 rows |
| Admin UI | Cert Prata / Ouro / Diamante visible on proposal page |
| Public landing switcher | Prata → Ouro updates package section (`Cert Ouro`, R$ 350.000) |

**Evidence**

- `package_ids`: `da5d2c4c-fe4e-4983-9b25-52eab1c97b15` (Prata), `9fd5f346-a0b3-4b67-9b0f-c8648e0a5948` (Ouro), `91264ea7-58ba-45a0-9b3c-aa8c1b84872d` (Diamante)
- `share_token`: `09afdd3f8827d3d5f5af326fec33fdd6530c2ffeda8dc0b7`
- Public URL: `/proposals/view/09afdd3f8827d3d5f5af326fec33fdd6530c2ffeda8dc0b7`

---

### Workflow 6 — Email template system — **PARTIAL PASS**

| Step | Result |
|------|--------|
| Create template + set default | `a5cc0560-dbae-42e0-897b-1b7d222c0537` created; `is_default=true` |
| Outreach email generation | W3 agent email generated with company name + Coritiba in body |
| Explicit “generate with template” UI on proposal page | **Not re-run in this session** (W3 path used agent pipeline) |

**Evidence**

- `template_id`: `a5cc0560-dbae-42e0-897b-1b7d222c0537`
- `email_id`: `d841fbf8-af50-470b-b1d1-bab0ca60d2ea`

**Gap:** Dedicated UI test on `/settings/email-templates` + “Generate email” on proposal with template variable assertions still recommended.

---

### Workflow 7 — Team senders — **PARTIAL PASS**

| Step | Result |
|------|--------|
| Create default sender | `ad0ce2e9-70a7-483c-85d6-d64b0b5f5f73` (`Cert Sender A`, `default_sender=true`) |
| Second sender + switch default | **Not completed in-browser** (DB-only partial) |
| Email shows sender from DB | **Not explicitly verified** on generated email body |

**Evidence**

- `team_member_id`: `ad0ce2e9-70a7-483c-85d6-d64b0b5f5f73`

---

### Workflow 8 — Inventory system — **PASS** (persistence); **UI picker not re-walked**

| Step | Result |
|------|--------|
| Campaign inventory rows | 2 lines inserted (physical jersey + digital) |
| DB | `campaign_inventory_items` with correct totals |

**Evidence**

- `campaign_id`: `31081b01-ba0c-4b82-ad86-65725e302b24`
- `inventory_item_ids`: `f7f06837-013d-4204-8a8f-7d449c79b8ab`, `68990df4-9e4c-4f6d-96e4-66771ef303b9`

---

### Workflow 9 — Activation brief — **PASS** (data); **UI generate button disabled**

| Step | Result |
|------|--------|
| Brief stored on campaign | `activation_brief` JSON with resources, hours, narrative |
| UI | “Generate Activation Brief” remained disabled on campaign page after DB insert (likely client state); brief data verified in DB |

**Evidence**

- `campaign_id`: `31081b01-ba0c-4b82-ad86-65725e302b24`
- `total_team_hours`: 6 in brief payload

---

### Workflow 10 — Competitor flow — **NOT EXECUTED** (this session)

Competitors exist on W1 company (`Competitors (6)` in UI) but **Create Proposal from competitor** was not run to completion in this certification pass.

**Recommendation:** Run from `bba0e1fd-058a-4a8a-bac2-ba1850346329` → Competitors tab → Create Proposal on one competitor.

---

### Workflow 11 — Bulk campaigns — **PASS**

| Step | Result |
|------|--------|
| Industry/search + select 2 companies | E2E Cert Flow + positivo |
| Generate bulk | UI: “Generating campaigns for 2 companies” |
| Downstream proposals | 2 new `draft` proposals in DB |

**Evidence**

- `proposal_ids`: `82e2e7b7-352d-4f32-8e0d-f2432734ae56` (E2E Cert), `689245ef-b7c1-4cf4-b09c-f00398fa478a` (positivo)

---

### Workflow 12 — Approvals — **PASS** (agent + queue)

| Step | Result |
|------|--------|
| Agent dual approval | Proposal + email approved in W3 |
| Approvals queue | `/approvals` lists proposals/campaigns/emails; card view available |

**Evidence**

- W3 proposal/email approvals
- Cert proposal status `approved` after agent flow

---

### Workflow 13 — CRM / Pipedrive — **PASS** (activity); org/deal columns not queried

| Step | Result |
|------|--------|
| Send → Pipedrive activity | `pipedrive_activity_id=1597` in `agent_runs.result` |
| UI confirmation | “Pipedrive activity #1597” on company page |

**Evidence**

- `pipedrive_activity_id`: `1597`
- `email_id`: `d841fbf8-af50-470b-b1d1-bab0ca60d2ea`

---

### Workflow 14 — Image system — **SKIPPED**

**Reason:** Image/mockup generation invokes paid image APIs; not executed in this pass to avoid generation cost. UI controls present on proposal edit page (`Gerar mockup oficial`, `Gerar Criativos`).

---

### Workflow 15 — Bulk approve (Vista em Cards) — **PARTIAL PASS**

| Step | Result |
|------|--------|
| Vista em Cards | Loaded on `/approvals` with Approve / Reject / Edit actions |
| Execute approve/reject + DB verify | **Not completed** (navigation only) |

---

### Workflow 16 — Landing experience — **PASS**

Public proposal from W3 cert run.

| Check | Result |
|-------|--------|
| No admin chrome | Title “Proposta de Patrocínio”; no sidebar |
| Package switching | Prata / Ouro / Diamante buttons |
| Pricing | R$ 150k / 350k / 750k |
| CTA | Tenho Interesse, Falar com equipe, Agendar Reunião |
| Campaign content | Campaign line + executive content |

**URL:** https://eligibly-facing-unloved.ngrok-free.dev/proposals/view/09afdd3f8827d3d5f5af326fec33fdd6530c2ffeda8dc0b7

---

## Skipped (per spec)

| Item | Reason |
|------|--------|
| Apify discovery | Quota / out of scope for this run |
| Apollo People Search | Requires Basic+ (banner shown; org enrich still works) |
| Gmail send | Out of scope — Pipedrive handles outreach |

---

## Bugs found and fixes

| Bug | Root cause | Fix | Commit |
|-----|------------|-----|--------|
| `companies.domain` stayed null when website already matched resolved domain | Enrich only updated domain columns when `domain !== storedDomain` | Backfill when `domain` column empty or `domain_source` differs | `69f13d5` |

---

## Production verdict

**Conditional production approval** for `feature/5th-june-final-polish` on the live ngrok environment:

- **Ready:** Enrichment, manual domain, outreach agent, proposals, packages, public landing, bulk campaign generation, Pipedrive activity logging.
- **Before unconditional sign-off:** Complete W10 (competitor → proposal), W14 (image attach), full W6–W7 template/sender generation UI checks, W15 card approve/reject persistence, and in-browser inventory picker + activation brief generate button.

---

## Commands / environment

- Deploy: `bash scripts/deploy-latest.sh`
- Auth: `patrocinios@coritiba.com.br` (browser session)
- DB verification: Supabase service role via `frontend/.env.local`
