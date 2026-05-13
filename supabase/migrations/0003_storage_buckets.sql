-- =====================================================================
-- Migration 0003: Storage buckets + policies
--
-- Buckets:
--   - proposals       (private)  generated proposal PDFs / exports
--   - campaign-assets (private)  uploaded reference materials
--   - audit-files     (private)  audit attachments
--
-- Access model:
--   - Service role bypasses RLS, so server-side code (n8n, Next.js API
--     routes using the service key) has full access.
--   - Authenticated users with role in (admin, editor, reviewer) can
--     read/write objects in these buckets.
-- =====================================================================

insert into storage.buckets (id, name, public)
values
  ('proposals',       'proposals',       false),
  ('campaign-assets', 'campaign-assets', false),
  ('audit-files',     'audit-files',     false)
on conflict (id) do nothing;

-- Drop existing policies if re-running
drop policy if exists storage_msa_read on storage.objects;
drop policy if exists storage_msa_write on storage.objects;
drop policy if exists storage_msa_update on storage.objects;
drop policy if exists storage_msa_delete on storage.objects;

create policy storage_msa_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('proposals','campaign-assets','audit-files')
    and public.current_app_role() in ('admin','editor','reviewer','viewer')
  );

create policy storage_msa_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('proposals','campaign-assets','audit-files')
    and public.current_app_role() in ('admin','editor','reviewer')
  );

create policy storage_msa_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('proposals','campaign-assets','audit-files')
    and public.current_app_role() in ('admin','editor','reviewer')
  )
  with check (
    bucket_id in ('proposals','campaign-assets','audit-files')
    and public.current_app_role() in ('admin','editor','reviewer')
  );

create policy storage_msa_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('proposals','campaign-assets','audit-files')
    and public.current_app_role() in ('admin')
  );
