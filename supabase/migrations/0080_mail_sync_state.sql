-- Phase B: Microsoft Graph inbox delta cursor + overlap lock for patrocinios@ reply sync.

CREATE TABLE IF NOT EXISTS public.mail_sync_state (
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id),
  mailbox     text NOT NULL,
  delta_link  text,
  lock_until  timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, mailbox)
);

COMMENT ON TABLE public.mail_sync_state IS
  'Microsoft Graph inbox delta cursor per club mailbox. delta_link is saved only after a clean sync page window; lock_until prevents overlapping cron runs.';
