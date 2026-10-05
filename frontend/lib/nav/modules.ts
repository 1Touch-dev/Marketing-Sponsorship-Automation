/**
 * Six work modules plus Settings. The sidebar and the secondary link row
 * both read this list. Child hrefs are the old top-level screens; URLs
 * themselves do not move.
 */
export type NavChild = {
  href: string;
  labelKey: string;
};

export type NavModule = {
  id: string;
  href: string;
  labelKey: string;
  /** Settings is a utility, not a seventh work module. */
  utility?: boolean;
  children: NavChild[];
};

export const NAV_MODULES: NavModule[] = [
  {
    id: "hoje",
    href: "/",
    labelKey: "Hoje",
    children: [],
  },
  {
    id: "relacionamentos",
    href: "/companies",
    labelKey: "Relacionamentos",
    children: [
      { href: "/companies", labelKey: "Companies" },
      { href: "/contacts", labelKey: "Contacts" },
      { href: "/pipeline", labelKey: "Pipeline" },
      { href: "/threads", labelKey: "Threads" },
      { href: "/emails", labelKey: "Emails" },
      { href: "/newsletter", labelKey: "Newsletter" },
      { href: "/followups", labelKey: "Follow-ups" },
    ],
  },
  {
    id: "projetos",
    href: "/matches",
    labelKey: "Projetos",
    children: [
      { href: "/matches", labelKey: "Matches" },
      { href: "/contracts", labelKey: "Contracts" },
    ],
  },
  {
    id: "estudio",
    href: "/proposals",
    labelKey: "Estúdio",
    children: [
      { href: "/proposals", labelKey: "Proposals" },
      { href: "/proposals/new", labelKey: "New Proposal" },
      { href: "/campaigns", labelKey: "Campaigns" },
      { href: "/proposals/bulk", labelKey: "Bulk Proposals" },
      { href: "/campaigns/bulk", labelKey: "Bulk Campaigns" },
      { href: "/approvals", labelKey: "Approvals" },
      { href: "/proposals/bulk-approve", labelKey: "Bulk Approve" },
      { href: "/assets", labelKey: "Asset Library" },
      { href: "/media-generation", labelKey: "AI Image Gen" },
      { href: "/mockup-editor", labelKey: "Mockup Editor" },
      { href: "/brand-assets", labelKey: "Brand Assets" },
    ],
  },
  {
    id: "ativos",
    href: "/inventory",
    labelKey: "Ativos e dados",
    children: [
      { href: "/inventory", labelKey: "Inventory" },
      { href: "/barter", labelKey: "Barter / Procurement" },
      { href: "/coritiba-intelligence", labelKey: "Coritiba Intel" },
      { href: "/lei-de-incentivo", labelKey: "Lei de Incentivo" },
      { href: "/product-discovery", labelKey: "Product Discovery" },
    ],
  },
  {
    id: "agentes",
    href: "/agents",
    labelKey: "Agentes",
    children: [
      { href: "/agents", labelKey: "Agentes" },
      { href: "/workflow-events", labelKey: "Workflows" },
    ],
  },
  {
    id: "settings",
    href: "/settings",
    labelKey: "Settings",
    utility: true,
    children: [
      { href: "/settings", labelKey: "Settings" },
      { href: "/users", labelKey: "Team & Roles" },
      { href: "/crm-sync", labelKey: "CRM Sync" },
      { href: "/audit", labelKey: "Audit" },
      { href: "/system", labelKey: "Maintenance" },
      { href: "/reports", labelKey: "Sponsor Reports" },
      { href: "/settings/team", labelKey: "Team & Roles" },
      { href: "/settings/sender-profiles", labelKey: "Sender Profiles" },
      { href: "/settings/email-templates", labelKey: "Email Templates" },
      { href: "/settings/email-flows", labelKey: "Email Templates" },
      { href: "/settings/proposal-templates", labelKey: "Proposals" },
      { href: "/settings/newsletter", labelKey: "Newsletter" },
      { href: "/settings/warmup-sequences", labelKey: "Warm-up Strategies" },
    ],
  },
];

/** `/` matches only the home page. Every other href matches itself or a deeper path. */
export function hrefMatches(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Longest matching href wins, so `/proposals/new` does not also light up `/proposals`. */
export function longestMatchingHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!hrefMatches(pathname, href)) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}

export function moduleForPath(pathname: string | null): NavModule | null {
  if (!pathname) return null;
  let best: { module: NavModule; href: string } | null = null;
  for (const navModule of NAV_MODULES) {
    const hrefs = [navModule.href, ...navModule.children.map((child) => child.href)];
    const href = longestMatchingHref(pathname, hrefs);
    if (!href) continue;
    if (!best || href.length > best.href.length) best = { module: navModule, href };
  }
  return best?.module ?? null;
}
