-- =====================================================================
-- Migration 0002: Row Level Security & policies
--
-- MVP policy model:
--   - All tables have RLS enabled.
--   - Service role (used by Next.js server routes / n8n) bypasses RLS,
--     so backend code retains full access.
--   - Authenticated users get read access to all operational tables.
--   - Write access requires the user's `users.role` to be admin/editor/reviewer.
--   - `audit_logs` is insert-only from clients; reads gated to admin/reviewer.
-- =====================================================================

-- Helper: lookup current app role from public.users via auth.uid()
create or replace function public.current_app_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where auth_user_id = auth.uid() limit 1;
$$;

-- Enable RLS
alter table public.users               enable row level security;
alter table public.companies           enable row level security;
alter table public.campaigns           enable row level security;
alter table public.proposals           enable row level security;
alter table public.proposal_versions   enable row level security;
alter table public.approvals           enable row level security;
alter table public.email_threads       enable row level security;
alter table public.emails              enable row level security;
alter table public.followups           enable row level security;
alter table public.audit_logs          enable row level security;

-- ---------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users
  for select to authenticated
  using (auth_user_id = auth.uid() or public.current_app_role() = 'admin');

drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users
  for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

-- ---------------------------------------------------------------------
-- Read-everywhere for authenticated users (operational tables)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'companies','campaigns','proposals','proposal_versions',
    'approvals','email_threads','emails','followups'
  ])
  loop
    execute format($f$
      drop policy if exists %1$s_auth_read on public.%1$s;
      create policy %1$s_auth_read on public.%1$s
        for select to authenticated using (true);
    $f$, t);
  end loop;
end$$;

-- ---------------------------------------------------------------------
-- Write policies (admin/editor/reviewer)
-- ---------------------------------------------------------------------
-- companies / campaigns / proposals / proposal_versions / approvals / emails / email_threads / followups
do $$
declare t text;
begin
  for t in select unnest(array[
    'companies','campaigns','proposals','proposal_versions',
    'approvals','email_threads','emails','followups'
  ])
  loop
    execute format($f$
      drop policy if exists %1$s_editor_write on public.%1$s;
      create policy %1$s_editor_write on public.%1$s
        for all to authenticated
        using (public.current_app_role() in ('admin','editor','reviewer'))
        with check (public.current_app_role() in ('admin','editor','reviewer'));
    $f$, t);
  end loop;
end$$;

-- ---------------------------------------------------------------------
-- audit_logs: insert by anyone authenticated; read by reviewer/admin
-- ---------------------------------------------------------------------
drop policy if exists audit_logs_insert_any on public.audit_logs;
create policy audit_logs_insert_any on public.audit_logs
  for insert to authenticated
  with check (true);

drop policy if exists audit_logs_read_review on public.audit_logs;
create policy audit_logs_read_review on public.audit_logs
  for select to authenticated
  using (public.current_app_role() in ('admin','reviewer'));
