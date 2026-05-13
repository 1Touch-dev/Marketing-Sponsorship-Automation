-- =====================================================================
-- Migration 0005: updated_at on remaining tables (Phase 1 requirement)
-- =====================================================================

-- proposal_versions
alter table public.proposal_versions
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_proposal_versions_updated_at on public.proposal_versions;
create trigger trg_proposal_versions_updated_at
before update on public.proposal_versions
for each row execute function public.set_updated_at();

-- approvals
alter table public.approvals
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_approvals_updated_at on public.approvals;
create trigger trg_approvals_updated_at
before update on public.approvals
for each row execute function public.set_updated_at();

-- audit_logs (append-only in practice; updated_at for schema consistency)
alter table public.audit_logs
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_audit_logs_updated_at on public.audit_logs;
create trigger trg_audit_logs_updated_at
before update on public.audit_logs
for each row execute function public.set_updated_at();
