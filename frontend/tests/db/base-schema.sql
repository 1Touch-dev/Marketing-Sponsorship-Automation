-- A small stand-in for the parts of the production schema that the migrations under test build on.
-- It is only for tests (PGlite): the real schema is the one in Supabase.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TYPE public.user_role AS ENUM ('admin', 'reviewer', 'viewer');
CREATE FUNCTION public.current_app_role() RETURNS public.user_role AS $$ SELECT 'viewer'::public.user_role $$ LANGUAGE sql;

CREATE TABLE public.tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT 'T');
CREATE TABLE public.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.platform_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), email text NOT NULL, role text NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.companies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), company_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE, full_name text);
CREATE TABLE public.proposals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE, title text);
CREATE TABLE public.contracts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL, title text, status text NOT NULL DEFAULT 'active');
CREATE TABLE public.obligations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE, title text NOT NULL);
CREATE TABLE public.team_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), full_name text NOT NULL, email text);

-- as in production before migration 0069
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  performed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_email text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid REFERENCES public.tenants(id)
);
CREATE FUNCTION public.set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_audit_logs_updated_at BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_insert_any ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY audit_logs_read_review ON public.audit_logs FOR SELECT TO authenticated USING (current_app_role() = ANY (ARRAY['admin'::public.user_role, 'reviewer'::public.user_role]));

INSERT INTO public.tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default');
