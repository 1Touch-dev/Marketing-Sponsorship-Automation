"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  "companies": "Companies",
  "proposals": "Proposals",
  "campaigns": "Campaigns",
  "approvals": "Approvals",
  "emails": "Emails",
  "contracts": "Contracts",
  "pipeline": "Pipeline",
  "newsletter": "Newsletter",
  "reports": "Reports",
  "settings": "Settings",
  "mockup-editor": "Mockup Editor",
  "ai-generation": "AI Generation",
  "users": "Users",
  "system": "System",
  "edit": "Edit",
  "new": "New",
  "deck": "PDF Deck",
  "blocks": "Block Editor",
  "view": "View",
  "bulk": "Bulk",
  "bulk-approve": "Bulk Approve",
  "sender-profiles": "Sender Profiles",
  "email-templates": "Email Templates",
  "team": "Team",
  "inventory": "Inventory",
  "barter": "Barter / Procurement",
  "assets": "Asset Library",
  "threads": "Threads",
  "followups": "Follow-ups",
  "audit": "Audit",
  "workflow-events": "Workflows",
  "crm-sync": "CRM Sync",
  "media-generation": "AI Image Gen",
  "brand-assets": "Brand Assets",
  "lei-de-incentivo": "Lei de Incentivo",
  "coritiba-intelligence": "Coritiba Intel",
  "contacts": "Contacts",
};

export function Breadcrumbs() {
  const pathname = usePathname();

  // Don't show on home, login, or public/view-only routes
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/proposals/view/") ||
    /^\/proposals\/[^/]+\/view$/.test(pathname)
  ) return null;

  const segments = pathname.split("/").filter(Boolean);

  // Skip if only one segment (top-level page)
  if (segments.length < 2) return null;

  const crumbs = segments.map((seg, i) => {
    const path = "/" + segments.slice(0, i + 1).join("/");
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg);
    const label = isUuid
      ? null
      : (ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " "));
    return { path, label, isUuid };
  }).filter(c => c.label !== null);

  if (crumbs.length < 2) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-4" aria-label="Breadcrumb">
      <Link href="/" className="hover:text-foreground transition-colors">
        <Home className="h-3 w-3" />
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          {i === crumbs.length - 1 ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link href={crumb.path} className="hover:text-foreground transition-colors">{crumb.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}
