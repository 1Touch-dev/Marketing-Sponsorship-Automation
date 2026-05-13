# Database

Canonical schema is defined as SQL migrations in **`../supabase/migrations/`**.

Apply in lexicographic order:

1. `0001_init_schema.sql` — enums, tables, indexes, `updated_at` triggers, `v_pending_approvals` view
2. `0002_rls_policies.sql` — RLS + policies (service role bypasses RLS for server automation)
3. `0003_storage_buckets.sql` — buckets `proposals`, `campaign-assets`, `audit-files`
4. `0004_user_metadata.sql` — `users.metadata` for Gmail tokens, etc.
5. `0005_audit_and_version_timestamps.sql` — `updated_at` on `proposal_versions`, `approvals`, `audit_logs`

After changes, regenerate TypeScript types (optional):

```bash
npx supabase gen types typescript --project-id <REF> --schema public > ../frontend/types/database.generated.ts
```
