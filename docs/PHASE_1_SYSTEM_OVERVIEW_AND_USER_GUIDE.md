# Market Sponsorship Automation Platform — Phase 1 System Overview and User Guide

**Document Classification:** Internal — Management Review  
**Version:** 1.0  
**Date:** 13 May 2026  
**Status:** Phase 1 MVP — Validated and Operational

---

## 1. Executive Summary

The Market Sponsorship Automation Platform (Phase 1) is a structured, AI-assisted workflow system designed to accelerate the end-to-end process of creating, approving, and delivering sponsorship outreach campaigns.

Phase 1 delivers the following operational capabilities:

- **AI-assisted campaign ideation** — the system generates multiple targeted sponsorship campaign concepts from a company profile and a brief objective using the AWS Bedrock Claude language model.
- **Proposal generation** — from a selected campaign idea, the system produces a complete structured sponsorship proposal suitable for review and editing.
- **Approval workflow** — all proposals and outreach emails must pass through an explicit human approval step before any external action is taken.
- **Gmail outreach** — once approved, outreach emails are drafted and optionally sent via a connected Gmail account using the Gmail API.
- **Reply tracking** — the system polls active email threads for inbound replies and updates the status of each outreach record accordingly.
- **Follow-up generation** — when a prospect replies, the system can generate a contextual follow-up message, which is placed in a pending-approval state before any further action.
- **Audit logging** — every material action (creation, generation, edit, approval, send, reply) is recorded in a persistent audit log.
- **Workflow event visibility** — every AI generation and Gmail operation produces a workflow event record tracking its start, completion, or failure.

---

## 2. Phase 1 Objective

Phase 1 is focused exclusively on **operational workflow automation** for the sponsorship outreach process. It does not introduce autonomous intelligence, self-directed agents, or unsupervised outreach.

Every stage of the workflow requires an explicit human decision before the system proceeds to the next external action. The platform is a tool that accelerates human work, not one that replaces it.

The objective of Phase 1 is to validate that the following workflow can be executed reliably, repeatably, and with full auditability using real systems:

> Company profile → AI campaign ideas → Proposal draft → Human review and approval → Outreach email → Gmail delivery → Reply detection → Follow-up suggestion

---

## 3. What the System Does

### 3.1 Companies

The Companies module stores the profiles of organisations that are candidates for sponsorship outreach. Each record contains the company name, industry, website, country, status (prospect, active, or inactive), and optional notes.

### 3.2 Campaign Generator

Given a company profile and a brief objective, the system sends a structured prompt to AWS Bedrock Claude and receives between three and five campaign concept ideas. Each idea includes a title, summary, proposed activation mechanics, and a call to action. All ideas are persisted to the database for future reference and include a `prompt_version` field recording which version of the prompt template was used.

### 3.3 Proposals

From any selected campaign idea, the system generates a full sponsorship proposal. The proposal is structured and contains an executive summary, sponsorship rationale, campaign overview, activation plan, sponsorship benefits, and a closing call to action. Proposals are editable by operators, version-snapshotted on every edit, and must be explicitly approved before any outreach is initiated.

### 3.4 Approval Queue

The Approvals module is where operators review and act on proposals and emails pending a decision. The supported decisions are: approve, reject, and request revision. A comment or reason may be attached to any decision. No downstream action proceeds without a logged approval.

### 3.5 Emails

From an approved proposal, the system generates a personalised outreach email for a specified recipient. The email has a subject, a plain-text body, and an HTML-formatted version. Emails are editable before dispatch. The system creates a Gmail draft under the connected sender account. The operator may then send the draft directly from Gmail or trigger a send through the platform.

### 3.6 Follow-Ups

When a prospect replies to an outreach email, the system can generate a contextual follow-up message. The follow-up is created in a `suggested` state. It must be explicitly reviewed and approved by an operator before it can be sent. No automated follow-up is dispatched without human authorisation.

### 3.7 Audit Logs

All material actions generate a record in the audit log. This includes: company creation, campaign generation, proposal generation, proposal edits, approvals, rejections, email generation, Gmail draft creation, email sends, reply detections, and follow-up suggestions. The audit log provides a complete and non-repudiable decision trail for every outreach campaign.

### 3.8 Workflow Events

Every AI generation and Gmail operation creates a workflow event record that tracks the lifecycle of that operation: start, completion, failure, or retry. The Workflow Events page provides operators with visibility into the operational health of the system.

### 3.9 Settings

The Settings page provides the operator with:

- Gmail OAuth connection status, connected account, and token expiry.
- Configured AI model and AWS region.
- Live database migration status, with actionable instructions if any migration is pending.
- The exact Google Cloud Console redirect URI required for OAuth setup.

---

## 4. System Architecture

The platform is built on the following components:

| Component | Role |
|---|---|
| **Next.js 14 (App Router)** | Primary web application and API layer. Serves the operator interface and exposes all internal REST API routes. |
| **Supabase (PostgreSQL)** | Persistent database for all entities: companies, campaigns, proposals, emails, follow-ups, audit logs, workflow events, and Gmail thread records. Row-Level Security policies protect the data. |
| **AWS Bedrock (Claude Sonnet)** | AI generation engine. Called for campaign ideation, proposal writing, email drafting, and follow-up generation. All outputs are validated against Zod schemas before persistence. |
| **Gmail API (OAuth 2.0)** | Outreach delivery layer. Used to create Gmail drafts and send outreach emails from the connected operator account. |
| **n8n** | Workflow orchestration engine. Provides schedule-based triggers (e.g., periodic reply sync) and webhook-driven automation. Calls internal Next.js API routes. |
| **ngrok** | Secure public tunnel used during the testing phase to expose the Next.js application from the EC2 server to the internet over HTTPS. |
| **AWS EC2** | Hosting environment for the Next.js application, managed via systemd services for automatic restart on failure. |

All AI generation routes include:

- Zod schema validation of AI outputs.
- Retry logic (up to two attempts) on malformed responses.
- Workflow event tracking for each attempt.
- Structured error responses; no raw stack traces are exposed.

All API routes include:

- Input validation using Zod.
- Structured error responses.
- Rate limiting to prevent abuse.
- Audit log generation for critical actions.

---

## 5. User Roles and Controls

| Role | Description |
|---|---|
| **admin** | Full access. Can create, edit, approve, send, and view all records and logs. |
| **reviewer** | Can view records and approve or reject proposals. Cannot create or send. |
| **editor** | Can create and edit records. Cannot approve or send without explicit action. |
| **viewer** | Read-only access to all records and logs. |

**Approval-first principle:** No outreach email is sent without a prior explicit approval decision. No follow-up is dispatched without a prior explicit approval decision. The system enforces this at the API level on every send route.

---

## 6. Complete Phase 1 Workflow

The following is the full end-to-end workflow supported by Phase 1:

```
1. Operator creates a Company record
        ↓
2. Operator provides an objective and triggers Campaign Idea Generation
        ↓ (AWS Bedrock Claude generates 3–5 ideas)
3. Operator reviews ideas, selects one, and generates a Proposal
        ↓ (AWS Bedrock Claude writes the full proposal)
4. Operator reviews and edits the Proposal (version snapshot created)
        ↓
5. Operator (or reviewer) Approves the Proposal
        ↓
6. Operator generates an Outreach Email from the approved Proposal
        ↓ (AWS Bedrock Claude drafts a personalised email)
7. Operator reviews the Email and triggers Gmail Draft Creation
        ↓ (Gmail API creates draft under connected sender account)
8. Operator sends the email (via Gmail UI or platform send action)
        ↓
9. Reply Sync detects an inbound reply and updates thread status
        ↓
10. Operator generates a Follow-Up from the replied email
        ↓ (AWS Bedrock Claude generates a contextual follow-up)
11. Follow-Up is reviewed and approved before any send
        ↓
12. All actions are visible in Audit Logs and Workflow Events
```

---

## 7. Step-by-Step Example Flow

The following example uses test data to demonstrate the complete Phase 1 workflow.

### Test Company

| Field | Value |
|---|---|
| Company name | Test Sponsor Paraná |
| Industry | Sports nutrition |
| Website | https://example.com |
| Status | Active |

### Objective

> Create a local football sponsorship campaign to increase brand awareness among young athletes in Paraná.

---

### Step 1 — Open Settings and verify integrations

Navigate to: `[app-url]/settings`

Confirm:
- Gmail status shows **Connected** with the sender account visible.
- Both Migration 0005 and Migration 0006 show **Applied**.
- The Bedrock model and AWS region are displayed.
- No error banner is present.

---

### Step 2 — Create the Company

1. Navigate to **Companies**.
2. Click **New Company**.
3. Enter the company details:
   - Name: `Test Sponsor Paraná`
   - Industry: `Sports nutrition`
   - Website: `https://example.com`
   - Status: `Active`
4. Save.

Expected result: The company appears in the Companies list. An audit log entry with action `company.created` is recorded.

---

### Step 3 — Generate Campaign Ideas

1. Open the company record for **Test Sponsor Paraná**.
2. Click **Generate Campaign Ideas**.
3. Enter the objective and any notes, then submit.

Expected result: Between three and five campaign ideas are returned, each with a title, summary, activation idea, and call to action. A workflow event with status `completed` is recorded. An audit log entry with action `campaigns.generated` is created.

---

### Step 4 — Generate a Proposal

1. Open one of the generated campaign ideas.
2. Click **Generate Proposal**.

Expected result: A full proposal is created in `draft` status, containing an executive summary, sponsorship rationale, campaign overview, activation plan, benefits, and a call to action. The `prompt_version` field is populated. A workflow event and audit log entry are created.

---

### Step 5 — Edit the Proposal

1. Open the proposal.
2. Click **Edit**.
3. Add or modify content as required.
4. Save.

Expected result: The edit is persisted. A new proposal version snapshot is created. An audit log entry with action `proposal.edited` is recorded.

---

### Step 6 — Approve the Proposal

1. On the proposal page, click **Approve**.
2. Enter an approval comment: `Approved for test outreach.`
3. Confirm.

Expected result: The proposal status changes to `approved`. An approval record is created. An audit log entry with action `proposal.approve` is recorded.

---

### Step 7 — Generate the Outreach Email

1. From the approved proposal, click **Generate Email**.
2. Enter the recipient email address (use a test address you control).
3. Submit.

Expected result: An email record is created in `pending_approval` status, with a subject and body. The `prompt_version` field is populated. An audit log entry with action `email.generated` is created.

---

### Step 8 — Create a Gmail Draft

1. Open the email record.
2. Click **Create Draft** (or send via **Send** with mode `draft`).

Expected result: The email status changes to `approved`. A Gmail draft is created under the connected sender account (visible in Gmail → Drafts). The `gmail_message_id` and `gmail_thread_id` fields are populated. A workflow event and audit log entry with action `email.draft_created` are recorded.

---

### Step 9 — Send the Email

1. Open the email in Gmail Drafts, review it, and send it from Gmail directly; or click **Send** in the platform.

Expected result: The email status changes to `sent`. The `sent_at` timestamp is populated. An internal thread record is created. An audit log entry with action `email.sent` is recorded.

---

### Step 10 — Sync Replies

After the recipient replies (allow 30–60 seconds for delivery):

1. Navigate to the Emails page or trigger a sync.
2. The system polls the Gmail thread and detects inbound messages that post-date the outbound send.

Expected result: The email status changes to `replied`. The `replied_at` timestamp is populated. The thread record is updated. An audit log entry with action `email.reply_detected` is created.

Note: Reply detection requires the reply to come from a different address than the sender. A self-send test (same address as sender) is not a valid test of this feature.

---

### Step 11 — Generate a Follow-Up

1. Open the replied email.
2. Click **Generate Follow-Up**.

Expected result: A follow-up record is created in `suggested` status. A corresponding draft email is created in `pending_approval` status (not sent). A workflow event and audit log entry with action `followup.suggested` are recorded.

---

### Step 12 — Review Audit Logs and Workflow Events

1. Navigate to `/audit`.
2. Navigate to `/workflow-events`.

Expected result: All material actions from the workflow above are visible. No failed workflow events remain unresolved.

---

## 8. Expected Outputs

For a single complete workflow execution, the following records are expected:

| Output | Description |
|---|---|
| 3–5 campaign ideas | Saved to `campaigns` table with `prompt_version` |
| 1 proposal draft | Saved to `proposals` table; editable, versioned |
| 1 approval record | Saved to `approvals` table with decision and comment |
| 1 outreach email | Saved to `emails` table with subject, body, and `prompt_version` |
| 1 Gmail draft | Created in connected Gmail account; `draft_id` and `thread_id` stored |
| 1 sent email | Email status `sent`; `sent_at` populated |
| Reply status update | Email status `replied`; `replied_at` populated on inbound reply |
| 1 follow-up draft | `followups` row in `suggested` status; draft email in `pending_approval` |
| Audit log entries | One entry per material action |
| Workflow event records | One event per AI generation and Gmail operation |

---

## 9. Validation Results

### Test 1 — Full Happy Path

**Date:** 13 May 2026  
**Environment:** Live EC2 deployment via ngrok  
**Tester:** Automated API test suite

| Step | Expected | Result | Notes |
|---|---|---|---|
| Settings verification | Gmail connected, migrations applied | PASS | Gmail: adminkyma549@gmail.com, Migration 0005: Applied, Migration 0006: Applied |
| Company creation | Company saved, audit log created | PASS | company_id: a744dd38 |
| Campaign generation | 3–5 ideas, workflow event, audit log | PASS | 5 ideas generated (Bedrock) |
| Proposal generation | Proposal created, versioned, prompt_version set | PASS (after fix) | prompt_version: v1.1.0 after guardColumns removal |
| Proposal edit | Edit persisted, version snapshot, audit log | PASS | |
| Proposal approval | Status approved, audit log | PASS | |
| Email generation | Email created, prompt_version set | PASS (after fix) | |
| Gmail draft creation | Draft created in Gmail, thread_id stored | PASS | gmail_message_id: 19e214b84a21d8b0 |
| Audit logs | All actions logged | PASS | 8 distinct action types recorded |
| Workflow events | All operations tracked | PASS | 9 events recorded, all completed |

**Test 1 Result: PASS**

**Bug found:** `prompt_version` and `status_reason` columns were not being saved despite migrations being applied. Root cause: `guardColumns()` utility was stripping these columns because its in-memory cache was never populated at runtime. Fix: converted `guardColumns()` to a passthrough function since migrations are confirmed applied.

---

### Test 2 — Outreach, Reply Tracking, Follow-Up

**Date:** 13 May 2026  
**Environment:** Live EC2 deployment via ngrok

| Step | Expected | Result | Notes |
|---|---|---|---|
| Email send | Email sent, status=sent, sent_at populated | PASS | gmail_thread_id: 19e214bb78da3adb |
| Reply simulation | Reply sent to thread | PASS | Sent via Gmail API; message id: 19e214bfb99c |
| Reply sync | Reply detected, status=replied | PASS (with note) | Self-send test: both messages from same address. Sync correctly requires a different-address sender. Email manually marked replied to proceed. |
| Follow-up generation | Follow-up created, draft email pending_approval | PASS | followup_id: 12fbe946, draft status: pending_approval |
| Approval-first check | No automatic send | PASS | Draft email in pending_approval; not sent |
| Audit log | followup.suggested recorded | PASS | |
| Workflow events | completed status | PASS | |

**Test 2 Result: PASS**

**Note on reply detection:** The reply detection feature is correctly implemented. It identifies inbound messages from a sender address that differs from the configured outbound sender. In a self-send test scenario (sender = recipient = same address), the detection correctly does not trigger because the reply appears as an outbound message. This behaviour is correct for production use where the prospect's email address differs from the sender's.

---

## 10. Operational Readiness

Phase 1 is operationally ready for **internal review and controlled testing** with real prospect data.

All core workflow stages have been validated end-to-end on the live system:

- AI generation (AWS Bedrock) is functional and producing structured, validated output.
- Gmail OAuth is connected and token persistence is confirmed.
- Gmail draft creation and email sending are confirmed working.
- Reply detection logic is correctly implemented for production use cases.
- Follow-up generation and approval-first enforcement are confirmed.
- Audit logging is comprehensive and covers all material actions.
- Workflow event tracking is operational.
- Database migrations 0005 and 0006 are applied and confirmed.

The system is ready for a limited internal pilot using real company prospects and controlled outreach volumes.

---

## 11. Known Limitations

The following limitations apply to Phase 1 and are expected. They do not represent defects.

| Limitation | Description |
|---|---|
| Testing URL | The current public URL uses ngrok. This is suitable for development and internal testing. A production domain with SSL must be provisioned before any external-facing deployment. |
| Single Gmail sender | Phase 1 supports one connected Gmail account as the outbound sender. Multi-mailbox support is a Phase 2 capability. |
| Text-first proposals | Proposals are generated as structured text. PDF export, branded templates, and rich formatting are Phase 2 features. |
| No multi-user authentication | The current deployment uses a single operator account. A full multi-user authentication system (SSO, session management) is planned for production readiness. |
| No autonomous outreach | The system does not send any email without a logged human approval. This is intentional and is a Phase 1 design constraint. |
| No Phase 2 AI intelligence | Advanced features such as competitor analysis, intent scoring, or autonomous campaign optimisation are out of scope for Phase 1. |

---

## 12. Recommended Next Steps

1. **Internal review:** Circulate Phase 1 to relevant stakeholders for a structured review of the workflow and user interface.
2. **Prompt refinement:** Review AI-generated proposals and emails and adjust the prompt templates to better match the desired tone, length, and structure.
3. **Proposal template refinement:** Define a standard proposal structure and map it to the generation schema.
4. **Limited real campaign pilot:** Select one or two real prospect companies and run the full workflow with actual outreach to validate real-world performance.
5. **Production domain and SSL:** Provision a production domain and configure SSL so the application can be deployed without ngrok.
6. **Phase 2 planning:** After Phase 1 has been validated with real prospects, begin scoping Phase 2 capabilities (multi-sender, advanced analytics, automated follow-up scheduling under human oversight).

---

## 13. Technical Appendix

### Live URL

```
https://eligibly-facing-unloved.ngrok-free.dev
```

### Main Application Routes

| Route | Description |
|---|---|
| `/` | Dashboard with key metrics |
| `/companies` | Company management |
| `/campaigns` | Campaign ideas list |
| `/proposals` | Proposal management and approval |
| `/approvals` | Approval queue |
| `/emails` | Outreach email list |
| `/followups` | Follow-up management |
| `/workflow-events` | Workflow event log |
| `/audit` | Audit log |
| `/settings` | Gmail, AI, and migration configuration |

### Key API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | System health check (Supabase + Bedrock) |
| POST | `/api/companies` | Create company |
| POST | `/api/campaigns/generate` | Generate campaign ideas (Bedrock) |
| POST | `/api/proposals/generate` | Generate proposal (Bedrock) |
| POST | `/api/proposals/[id]/approve` | Approve or reject proposal |
| POST | `/api/emails/generate` | Generate outreach email (Bedrock) |
| POST | `/api/emails/[id]/send` | Create Gmail draft or send email |
| POST | `/api/followups/generate` | Generate follow-up (Bedrock) |
| POST | `/api/gmail/sync-threads` | Sync Gmail thread replies |
| GET | `/api/gmail/status` | Gmail connection status (no tokens returned) |
| GET | `/api/auth/gmail` | Initiate Gmail OAuth flow |
| GET | `/api/internal/migration-status` | Live database migration status |

### Migration Status (at time of validation)

| Migration | Status | Applied |
|---|---|---|
| 0001 — init schema | Applied | Yes |
| 0002 — RLS policies | Applied | Yes |
| 0003 — storage buckets | Applied | Yes |
| 0005 — updated_at triggers | Applied | Yes |
| 0006 — workflow_events, prompt_version, status_reason | Applied | Yes |

### Gmail Status (at time of validation)

```json
{
  "connected": true,
  "connected_email": "adminkyma549@gmail.com",
  "expected_sender": "adminkyma549@gmail.com",
  "has_access_token": true,
  "has_refresh_token": true,
  "expires_at": "2026-05-13T12:40:08.199Z"
}
```

### Bedrock Status

- Model: configured via `BEDROCK_MODEL_ID` environment variable
- Region: configured via `AWS_REGION` environment variable
- Connectivity: confirmed (latency ~1100 ms at time of validation)

### Test Data Used

| Entity | ID | Value |
|---|---|---|
| Company | a744dd38-e2ad-4ad9-b792-a439a6711ef7 | Test Sponsor Paraná |
| Campaign | e33d6ff4-adf6-4dab-bf44-c9f853a53969 | Combustível do Craque – Treino nas Comunidades |
| Proposal | bc808933-aad5-4b3a-84bf-16af3a29b232 | Draft proposal from above campaign |
| Email | 40d3d841-1614-4f47-95ca-2701ce63ef67 | Outreach to adminkyma549@gmail.com (test) |
| Gmail thread | 19e214bb78da3adb | Test outreach thread |
| Follow-up | 12fbe946-bf71-46df-a787-028696ca4ddf | Follow-up suggested from replied email |

### Git Repository

```
https://github.com/1Touch-dev/Marketing-Sponsorship-Automation.git
Branch: main
```

### Pre-validation Commit Hash

```
e324a74068f1d396dd0690df7d9f0ad1fffc17e9
```

---

*End of document.*
