-- Per-user default meeting / calendar URL (Calendly, Cal.com, etc.)
-- Paste into Supabase SQL Editor before deploy if the app server cannot run migrations.
ALTER TABLE public.platform_users
  ADD COLUMN IF NOT EXISTS calendar_url text;

COMMENT ON COLUMN public.platform_users.calendar_url IS
  'Staff user default booking URL; prefills proposals.meeting_link on create.';
