-- 0016: Role-based platform users table
-- Originally only in apply-sql route; moved to migrations/ for runner parity

CREATE TABLE IF NOT EXISTS public.platform_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL UNIQUE,
  full_name    TEXT NOT NULL DEFAULT '',
  role         TEXT NOT NULL DEFAULT 'viewer'
                 CHECK (role IN ('admin','sales_rep','approver','viewer')),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  invited_by   TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_users_email  ON public.platform_users(email);
CREATE INDEX IF NOT EXISTS idx_platform_users_role   ON public.platform_users(role);

-- Seed default admin (idempotent)
INSERT INTO public.platform_users (email, full_name, role, is_active, invited_by)
VALUES ('admin@coritiba.com.br', 'Admin', 'admin', TRUE, 'system')
ON CONFLICT (email) DO NOTHING;

-- RLS
ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_platform_users"
  ON public.platform_users FOR ALL
  TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "authenticated_read_platform_users"
  ON public.platform_users FOR SELECT
  TO authenticated USING (TRUE);
