-- =====================================================================
-- Migration 0006: Phase 1 hardening
--   1. workflow_events table
--   2. prompt_version column on campaigns, proposals, emails
--   3. status_reason column on proposals, emails, followups
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. workflow_events
-- -----------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'workflow_event_status') then
    create type workflow_event_status as enum ('started', 'processing', 'completed', 'failed', 'retried');
  end if;
end$$;

create table if not exists public.workflow_events (
  id               uuid primary key default gen_random_uuid(),
  workflow_name    text not null,
  entity_type      text,
  entity_id        uuid,
  status           workflow_event_status not null default 'started',
  error_message    text,
  attempt          integer not null default 1,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists workflow_events_workflow_idx  on public.workflow_events(workflow_name);
create index if not exists workflow_events_status_idx    on public.workflow_events(status);
create index if not exists workflow_events_entity_idx    on public.workflow_events(entity_type, entity_id);
create index if not exists workflow_events_created_idx   on public.workflow_events(created_at desc);

drop trigger if exists trg_workflow_events_updated_at on public.workflow_events;
create trigger trg_workflow_events_updated_at
before update on public.workflow_events
for each row execute function public.set_updated_at();

-- RLS
alter table public.workflow_events enable row level security;

drop policy if exists workflow_events_read on public.workflow_events;
create policy workflow_events_read on public.workflow_events
  for select to authenticated
  using (public.current_app_role() in ('admin', 'reviewer'));

drop policy if exists workflow_events_insert on public.workflow_events;
create policy workflow_events_insert on public.workflow_events
  for insert to authenticated
  with check (true);

drop policy if exists workflow_events_update on public.workflow_events;
create policy workflow_events_update on public.workflow_events
  for update to authenticated
  using (public.current_app_role() in ('admin', 'reviewer'));

-- -----------------------------------------------------------------------
-- 2. prompt_version column
-- -----------------------------------------------------------------------
alter table public.campaigns add column if not exists prompt_version text;
alter table public.proposals  add column if not exists prompt_version text;
alter table public.emails     add column if not exists prompt_version text;

-- -----------------------------------------------------------------------
-- 3. status_reason column
-- -----------------------------------------------------------------------
alter table public.proposals add column if not exists status_reason text;
alter table public.emails     add column if not exists status_reason text;
alter table public.followups  add column if not exists status_reason text;
