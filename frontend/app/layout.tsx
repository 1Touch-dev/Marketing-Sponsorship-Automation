import type { Metadata } from "next";
import "./globals.css";
import { ToasterProvider } from "@/components/ui/toaster";
import { AppShell } from "@/components/shared/app-shell";
import { LangProvider } from "@/lib/i18n/lang-context";
import { getCurrentTenant } from "@/lib/tenants/current";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";
import { hexToHslString } from "@/lib/theme/hex-to-hsl";

export const metadata: Metadata = {
  title: "Market Sponsorship Automation",
  description: "AI-powered sponsorship proposal & campaign workflow.",
};

// All routes need server-side rendering (Supabase queries depend on env at runtime).
export const dynamic = "force-dynamic";

const DEFAULT_CLUB_NAME = "Coritiba FC";
const DEFAULT_TAGLINE = "Commercial Intelligence";
const DEFAULT_CREST = "/brand/coritiba-crest.png";
const DEFAULT_PRIMARY_HSL = "158 71% 30%"; // Coritiba green (#1a8f3c)

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // White-label chrome (Task 13) — the internal CRM sidebar/buttons/focus
  // rings previously always rendered with a hardcoded "Coritiba FC" label
  // and shadcn's generic near-black default --primary, regardless of which
  // tenant was logged in. Resolves the current session's tenant (null on
  // pages with no session, e.g. /login) and injects its brand color + name
  // — the same per-tenant branding the public proposal pages already used.
  const tenant = await getCurrentTenant();
  const isCoritiba = !tenant || tenant.id === CORITIBA_TENANT_ID;
  const clubName = tenant?.club_facts.short_name ?? tenant?.club_facts.club_name ?? DEFAULT_CLUB_NAME;
  // Coritiba's own DB row has a known-stale crest_url (migration 0047
  // seeded a .svg path with no matching file) — same defensive override
  // the public proposal pages already use, so this doesn't regress it.
  const crestUrl = isCoritiba ? DEFAULT_CREST : (tenant?.branding.crest_url ?? null);
  const primaryHsl = (tenant?.branding.primary_color && hexToHslString(tenant.branding.primary_color)) || DEFAULT_PRIMARY_HSL;

  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">
        <style
          // Runtime per-tenant theming — overrides the static defaults in
          // globals.css after they've cascaded, so both light and dark
          // mode pick up the tenant's brand color for --primary/--ring.
          dangerouslySetInnerHTML={{ __html: `:root{--primary:${primaryHsl};--ring:${primaryHsl};}` }}
        />
        <LangProvider>
          <ToasterProvider>
            <AppShell clubName={clubName} tagline={DEFAULT_TAGLINE} crestUrl={crestUrl}>
              {children}
            </AppShell>
          </ToasterProvider>
        </LangProvider>
      </body>
    </html>
  );
}
