-- Stuck "sending" / Send unconfirmed — reconcile after checking SES & message_events.
-- Paste into PR #24 description; run manually in Supabase when needed.

-- List stuck unconfirmed sends
SELECT id, recipient, subject, status, status_reason, updated_at
FROM public.emails
WHERE status = 'sending'
  AND status_reason ILIKE '%Send unconfirmed%';

-- After verifying SES did NOT accept (no provider_accepted / no Message-Id):
-- UPDATE public.emails
-- SET status = 'approved', status_reason = NULL
-- WHERE id = '<email-id>' AND status = 'sending';

-- After verifying SES DID accept (have Message-Id):
-- UPDATE public.emails
-- SET status = 'sent', status_reason = NULL, sent_at = COALESCE(sent_at, now())
-- WHERE id = '<email-id>' AND status = 'sending';
