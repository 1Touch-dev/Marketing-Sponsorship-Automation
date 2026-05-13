# Market Sponsorship Automation Platform

## Project overview

This project is an **AI-powered sponsorship proposal and campaign management platform** focused on Brazilian companies.

The system helps the operations and marketing team to:

- Generate sponsorship and campaign ideas
- Create proposal drafts
- Manage approvals and revisions
- Track outreach through Gmail
- Manage follow-ups
- Maintain audit logs and workflow visibility

The platform will be developed in **multiple phases**.

---

## Current priority

**Only Phase 1 MVP** should be developed right now.

### Do not implement (yet)

- OpenClaw orchestration
- Autonomous agent swarms
- Advanced scraping infrastructure
- Competitor intelligence systems
- Multi-agent runtime architecture
- Advanced creative/video generation

The immediate goal is **operational workflow automation**.

---

## Tech stack

| Layer | Technology |
|--------|------------|
| **Frontend** | Lovable for MVP UI; optional migration to Next.js later |
| **Backend** | n8n for workflow orchestration; Supabase for database/auth/storage |
| **Integrations** | AWS Bedrock for LLM access; Gmail API for email workflows |
| **AI** | AWS Bedrock, Claude Sonnet model |
| **Hosting** | AWS EC2; optional Amplify/Vercel later |

---

## Phase 1 MVP

### Goal

Build the **operational workflow layer** for sponsorship proposal management.

### Phase 1 features

#### 1. Approval & review panel

Core dashboard for reviewing generated proposals and campaigns.

**Required features**

- Approve proposal
- Reject proposal
- Request revision
- Add comments
- Version history
- Workflow status tracking

**Required statuses**

| Status | Description |
|--------|-------------|
| `draft` | Initial / editable |
| `under_review` | In review |
| `revision_requested` | Changes requested |
| `approved` | Approved for next steps |
| `scheduled` | Scheduled to send |
| `sent` | Delivered |

#### 2. Editing & revision flow

Generated content must **always** be editable.

**Editable items**

- Proposal drafts
- Campaign ideas
- Outreach emails
- Follow-up emails

**Every edit must record**

- Timestamp
- Editor identity
- Audit log entry

#### 3. AI campaign idea generation

The system must generate:

- Sponsorship ideas
- Campaign concepts
- Activation ideas
- Partnership opportunities
- Outreach suggestions

**Output requirements**

- Multiple variations
- Structured JSON responses
- Editable text
- Company-specific context

**Suggested output format**

```json
{
  "title": "Campaign Title",
  "summary": "Short concept summary",
  "activation": "Activation idea",
  "cta": "Call to action"
}
```

#### 4. Proposal generation

The platform must generate:

- Sponsorship proposals
- Proposal sections
- Outreach narratives
- Campaign summaries
- Executive summaries

**Initial MVP requirement:** text-first proposal generation (Canva/Gamma integration optional later).

#### 5. Gmail integration

The platform must integrate with Gmail using **OAuth**.

**Required functionality**

- Create Gmail drafts
- Send approved emails
- Read replies
- Track Gmail threads
- Monitor follow-ups
- Update email status

**Important:** all first-send emails require approval; follow-ups may later support batch approval.

#### 6. Email tracking & follow-ups

**Track**

- Draft created
- Sent
- Opened
- Replied
- Follow-up pending
- Closed

**Store**

- Gmail thread IDs
- Timestamps
- Status history

#### 7. Audit logs

Every important action must create an audit log.

**Examples**

- Proposal approved / rejected / edited
- Email sent
- Follow-up generated

**Audit log fields**

| Field | Purpose |
|-------|---------|
| `action` | What happened |
| `actor` | Who did it |
| `timestamp` | When |
| `entity_type` | Object type |
| `entity_id` | Object reference |
| `metadata` | Extra context |

---

## Database tables (MVP)

| Table | Columns |
|-------|---------|
| **users** | `id`, `name`, `email`, `role`, `created_at` |
| **companies** | `id`, `company_name`, `industry`, `website`, `status`, `created_at` |
| **campaigns** | `id`, `company_id`, `title`, `description`, `generated_by`, `status`, `created_at` |
| **proposals** | `id`, `company_id`, `campaign_id`, `content`, `status`, `version`, `created_at`, `updated_at` |
| **approvals** | `id`, `proposal_id`, `reviewer`, `decision`, `comments`, `created_at` |
| **emails** | `id`, `proposal_id`, `gmail_thread_id`, `recipient`, `subject`, `body`, `status`, `sent_at` |
| **audit_logs** | `id`, `entity_type`, `entity_id`, `action`, `performed_by`, `metadata`, `created_at` |

---

## Core workflows

### Workflow 1 — Campaign generation

- **Input:** company, industry, objective, notes
- **Process:** send prompt to Bedrock → generate multiple campaign ideas → save results to database

### Workflow 2 — Proposal generation

- **Input:** selected campaign, company context
- **Process:** generate proposal draft → save proposal → set status = `draft`

### Workflow 3 — Approval flow

- Reviewer opens proposal
- Reviewer approves / rejects / requests revision
- Audit logs created
- Proposal status updated

### Workflow 4 — Gmail draft creation

- Approved proposal selected
- Email generated
- Gmail draft created
- Thread ID stored

### Workflow 5 — Follow-up tracking

- Scheduled workflow checks replies
- Updates email status
- Suggests follow-up drafts

---

## UI requirements

### Dashboard

Show:

- Pending approvals
- Generated campaigns
- Sent emails
- Pending follow-ups

### Campaign generator screen

- Company input
- Generate ideas button
- Multiple AI-generated results

### Proposal review screen

- Editable proposal
- Approve / reject / revise buttons
- Comments
- Version tracking

### Email review screen

- Email preview
- Send approval
- Gmail thread tracking

### Audit log screen

- Searchable activity logs
- Timestamps
- Actor tracking

---

## Phase 2 (not current priority)

Future features:

- OpenClaw orchestration
- MCP expansion
- Brazilian company intelligence
- Competitor intelligence
- Inventory intelligence
- Advanced proposal personalization
- Creative automation

**Do not implement these yet.**

---

## Phase 3 (long term)

Future platform scaling:

- Autonomous agent ecosystem
- Multi-tenant platform
- Advanced analytics
- Enterprise reporting
- Large-scale automation

**Do not implement these yet.**

---

## Development rules

| Rule | Detail |
|------|--------|
| Architecture | Keep modular; avoid overengineering |
| Focus | Prioritize operational workflows |
| Sends | Human approval mandatory before outbound sends |
| Auditing | Every important action must be auditable |
| AI outputs | Keep editable; prefer structured JSON from LLMs |
| Scope | Build Phase 1 only |
| Quality | Reliability over complexity |
| Data | **Supabase** as source of truth |
