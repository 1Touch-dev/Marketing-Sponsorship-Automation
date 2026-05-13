-- =====================================================================
-- Market Sponsorship Automation — Phase 1 MVP
-- Migration 0001: Core schema
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('admin', 'reviewer', 'editor', 'viewer');
  end if;

  if not exists (select 1 from pg_type where typname = 'company_status') then
    create type company_status as enum ('prospect', 'active', 'paused', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'campaign_status') then
    create type campaign_status as enum ('draft', 'selected', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'proposal_status') then
    create type proposal_status as enum (
      'draft', 'under_review', 'revision_requested',
      'approved', 'scheduled', 'sent', 'rejected'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'approval_decision') then
    create type approval_decision as enum ('approve', 'reject', 'request_revision');
  end if;

  if not exists (select 1 from pg_type where typname = 'email_status') then
    create type email_status as enum (
      'draft', 'pending_approval', 'approved', 'sent',
      'opened', 'replied', 'bounced', 'failed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'followup_status') then
    create type followup_status as enum ('pending', 'suggested', 'scheduled', 'sent', 'closed');
  end if;
end$$;

-- ---------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- users (app-side profile; mirrors auth.users.id)
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null unique,
  name text,
  role user_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_role_idx on public.users(role);

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  industry text,
  website text,
  country text default 'BR',
  notes text,
  status company_status not null default 'prospect',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companies_status_idx on public.companies(status);
create index if not exists companies_industry_idx on public.companies(industry);

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  summary text,
  activation text,
  cta text,
  description text,
  objective text,
  raw_output jsonb,
  generated_by text default 'bedrock-claude',
  model_id text,
  status campaign_status not null default 'draft',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_company_idx on public.campaigns(company_id);
create index if not exists campaigns_status_idx on public.campaigns(status);

drop trigger if exists trg_campaigns_updated_at on public.campaigns;
create trigger trg_campaigns_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- proposals
-- ---------------------------------------------------------------------
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  title text not null,
  content jsonb not null,
  content_md text,
  status proposal_status not null default 'draft',
  version integer not null default 1,
  generated_by text default 'bedrock-claude',
  model_id text,
  created_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposals_company_idx on public.proposals(company_id);
create index if not exists proposals_campaign_idx on public.proposals(campaign_id);
create index if not exists proposals_status_idx on public.proposals(status);

drop trigger if exists trg_proposals_updated_at on public.proposals;
create trigger trg_proposals_updated_at
before update on public.proposals
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- proposal_versions (snapshot every edit)
-- ---------------------------------------------------------------------
create table if not exists public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version integer not null,
  content jsonb not null,
  content_md text,
  edited_by uuid references public.users(id) on delete set null,
  edit_reason text,
  created_at timestamptz not null default now(),
  unique (proposal_id, version)
);

create index if not exists proposal_versions_proposal_idx on public.proposal_versions(proposal_id);

-- ---------------------------------------------------------------------
-- approvals
-- ---------------------------------------------------------------------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  reviewer_id uuid references public.users(id) on delete set null,
  decision approval_decision not null,
  comments text,
  created_at timestamptz not null default now()
);

create index if not exists approvals_proposal_idx on public.approvals(proposal_id);
create index if not exists approvals_reviewer_idx on public.approvals(reviewer_id);

-- ---------------------------------------------------------------------
-- email_threads (one row per Gmail conversation thread)
-- ---------------------------------------------------------------------
create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.proposals(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  gmail_thread_id text unique,
  subject text,
  participants text[] default '{}',
  last_message_at timestamptz,
  status text default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_threads_proposal_idx on public.email_threads(proposal_id);
create index if not exists email_threads_company_idx on public.email_threads(company_id);

drop trigger if exists trg_email_threads_updated_at on public.email_threads;
create trigger trg_email_threads_updated_at
before update on public.email_threads
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- emails (individual messages, drafts, sent)
-- ---------------------------------------------------------------------
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.proposals(id) on delete set null,
  thread_id uuid references public.email_threads(id) on delete set null,
  gmail_message_id text unique,
  gmail_thread_id text,
  direction text not null default 'outbound', -- outbound | inbound
  sender text,
  recipient text not null,
  cc text[],
  bcc text[],
  subject text not null,
  body_html text,
  body_text text,
  status email_status not null default 'draft',
  generated_by text default 'bedrock-claude',
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  replied_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists emails_proposal_idx on public.emails(proposal_id);
create index if not exists emails_thread_idx on public.emails(thread_id);
create index if not exists emails_status_idx on public.emails(status);
create index if not exists emails_recipient_idx on public.emails(recipient);

drop trigger if exists trg_emails_updated_at on public.emails;
create trigger trg_emails_updated_at
before update on public.emails
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- followups
-- ---------------------------------------------------------------------
create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.proposals(id) on delete set null,
  thread_id uuid references public.email_threads(id) on delete set null,
  parent_email_id uuid references public.emails(id) on delete set null,
  draft_email_id uuid references public.emails(id) on delete set null,
  suggested_body text,
  reason text,
  scheduled_for timestamptz,
  status followup_status not null default 'pending',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists followups_status_idx on public.followups(status);
create index if not exists followups_thread_idx on public.followups(thread_id);

drop trigger if exists trg_followups_updated_at on public.followups;
create trigger trg_followups_updated_at
before update on public.followups
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  performed_by uuid references public.users(id) on delete set null,
  actor_email text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index if not exists audit_logs_action_idx on public.audit_logs(action);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

-- ---------------------------------------------------------------------
-- View: pending approvals
-- ---------------------------------------------------------------------
create or replace view public.v_pending_approvals as
select
  p.id as proposal_id,
  p.title,
  p.status,
  p.version,
  p.updated_at,
  c.id as company_id,
  c.company_name
from public.proposals p
join public.companies c on c.id = p.company_id
where p.status in ('under_review', 'revision_requested');
