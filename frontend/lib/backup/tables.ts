/**
 * Every application table that must be captured in a full logical backup
 * (Pattern 7 hardening — master_report.md Section 8). Sourced from
 * `create table` statements across supabase/migrations/*.sql; there is no
 * live way to introspect information_schema from this box (no direct
 * Postgres access — see project memory), so this list is maintained by
 * hand and must be updated whenever a migration adds a new table.
 *
 * NOTE (2026-09-09): removed `proposal_variants` — migration
 * 0035_proposal_ab_variants.sql defines it but a live export confirmed it
 * was never actually applied to the Supabase DB ("Could not find the
 * table 'public.proposal_variants' in the schema cache"), which was also
 * silently breaking app/api/proposals/[id]/variant/route.ts (unused by
 * any UI, so low priority, but flagged for James — apply that migration's
 * SQL in the Supabase SQL Editor if the A/B-variant-tracking feature is
 * still wanted). Added `proposal_views` (migration 0046, confirmed live)
 * which existed in the DB but had been missing from this list.
 */
export const BACKUP_TABLES = [
  "agent_batch_runs",
  "agent_runs",
  "apify_search_cache",
  "approvals",
  "audit_logs",
  "barter_items",
  "brand_asset_packs",
  "brand_assets",
  "campaign_inventory_items",
  "campaigns",
  "companies",
  "company_logos",
  "contacts",
  "contracts",
  "coritiba_metrics",
  "crm_sync_queue",
  "email_sequence_enrollments",
  "email_sequences",
  "email_templates",
  "email_threads",
  "emails",
  "followups",
  "image_generation_jobs",
  "inventory_items",
  "match_media_reach",
  "matches",
  "newsletter_segments",
  "newsletters",
  "pipeline_leads",
  "platform_users",
  "proposal_inventory_items",
  "proposal_packages",
  "proposal_sections",
  "proposal_templates",
  "proposal_versions",
  "proposal_views",
  "proposal_wizard_drafts",
  "proposals",
  "sender_profiles",
  "social_projects",
  "spend_ledger",
  "team_members",
  "template_renders",
  "users",
  "visual_mockups",
  "warmup_enrollments",
  "warmup_sequences",
  "workflow_events",
] as const;
