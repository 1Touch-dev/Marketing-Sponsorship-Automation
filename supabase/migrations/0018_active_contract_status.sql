-- 0018: Add active_contract to proposal_status enum
-- Represents a signed, active sponsorship deal

-- Postgres requires a separate transaction/statement for enum additions
-- IF NOT EXISTS was added in Postgres 12 (Supabase uses Postgres 15+)
ALTER TYPE public.proposal_status ADD VALUE IF NOT EXISTS 'active_contract' AFTER 'sent';
