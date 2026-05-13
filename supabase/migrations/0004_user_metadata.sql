-- =====================================================================
-- Migration 0004: add metadata column to users (Gmail tokens, etc.)
-- =====================================================================

alter table public.users
  add column if not exists metadata jsonb not null default '{}'::jsonb;
