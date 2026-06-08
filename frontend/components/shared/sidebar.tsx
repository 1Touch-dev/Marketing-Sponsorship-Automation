"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Lightbulb,
  FileText,
  CheckSquare,
  Mail,
  MessageSquare,
  Clock,
  ScrollText,
  Settings,
  Activity,
  Menu,
  X,
  Shield,
  Trophy,
  Package,
  Repeat2,
  Heart,
  TrendingUp,
  Image,
  ChevronDown,
  Wrench,
  Sparkles,
  Layers,
  Wand2,
  GitMerge,
  Zap,
  Users,
  LogOut,
  Newspaper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/lib/auth/use-user-role";

function GlobalSearchCompact() {
  const [open, setOpen] = React.useState(false);
  return (
    <button
      onClick={() => {
        // Dispatch global search open event
        window.dispatchEvent(new CustomEvent("open-global-search"));
      }}
      className="flex items-center gap-2 w-full rounded-lg border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <span className="flex-1 text-left">Search…</span>
      <kbd className="text-[9px] border rounded px-1 bg-background">⌘K</kbd>
    </button>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  group?: string;
  adminOnly?: boolean;
};

const NAV: NavItem[] = [
  // Core CRM
  { href: "/", label: "Dashboard", icon: LayoutDashboard, group: "core" },
  { href: "/companies", label: "Companies", icon: Building2, group: "core" },
  { href: "/contacts", label: "Contacts", icon: Users, group: "core" },
  { href: "/pipeline", label: "Pipeline", icon: TrendingUp, group: "core" },
  { href: "/reports", label: "Sponsor Reports", icon: Trophy, group: "core" },
  // Proposal workflow
  { href: "/proposals/new", label: "New Proposal", icon: Wand2, group: "proposals" },
  { href: "/campaigns", label: "Campaigns", icon: Lightbulb, group: "proposals" },
  { href: "/campaigns/bulk", label: "Bulk Campaigns", icon: Zap, group: "proposals" },
  { href: "/proposals/bulk-approve", label: "Bulk Approve", icon: CheckSquare, group: "proposals" },
  { href: "/proposals", label: "Proposals", icon: FileText, group: "proposals" },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, group: "proposals" },
  { href: "/emails", label: "Emails", icon: Mail, group: "proposals" },
  { href: "/settings/email-templates", label: "Email Templates", icon: ScrollText, group: "proposals" },
  { href: "/newsletter", label: "Newsletter", icon: Newspaper, group: "proposals" },
  { href: "/threads", label: "Threads", icon: MessageSquare, group: "proposals" },
  { href: "/followups", label: "Follow-ups", icon: Clock, group: "proposals" },
  // Intelligence
  { href: "/coritiba-intelligence", label: "Coritiba Intel", icon: Trophy, group: "intelligence" },
  { href: "/inventory", label: "Inventory", icon: Package, group: "intelligence" },
  { href: "/barter", label: "Barter / Procurement", icon: Repeat2, group: "intelligence" },
  { href: "/lei-de-incentivo", label: "Lei de Incentivo", icon: Heart, group: "intelligence" },
  { href: "/brand-assets", label: "Brand Assets", icon: Shield, group: "intelligence" },
  // Media & Assets
  { href: "/media-generation", label: "AI Image Gen", icon: Sparkles, group: "media" },
  { href: "/mockup-editor", label: "Mockup Editor", icon: Layers, group: "media" },
  { href: "/assets", label: "Asset Library", icon: Image, group: "media" },
  // CRM & Integrations
  { href: "/crm-sync", label: "CRM Sync", icon: GitMerge, group: "integrations" },
  // System
  { href: "/workflow-events", label: "Workflows", icon: Activity, group: "system" },
  { href: "/audit", label: "Audit", icon: ScrollText, group: "system" },
  { href: "/system", label: "Maintenance", icon: Wrench, group: "system" },
  { href: "/settings", label: "Settings", icon: Settings, group: "system" },
  { href: "/users", label: "Team & Roles", icon: Users, group: "system", adminOnly: true },
];

const GROUPS: Record<string, string> = {
  core: "CRM",
  proposals: "Proposal Workflow",
  intelligence: "Intelligence",
  media: "Media & Visuals",
  integrations: "Integrations",
  system: "System",
};

function NavLinks({ onClick }: { onClick?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const { role } = useUserRole();

  const groupedItems = NAV.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (item.adminOnly && role !== "admin") return acc;
    const g = item.group || "core";
    acc[g] = acc[g] || [];
    acc[g].push(item);
    return acc;
  }, {});

  return (
    <>
      {Object.entries(GROUPS).map(([group, groupLabel]) => {
        const items = groupedItems[group] || [];
        const isCollapsed = collapsed[group];
        const hasActive = items.some((item) =>
          pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href))
        );

        return (
          <div key={group} className="mb-1">
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [group]: !c[group] }))}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>{groupLabel}</span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", isCollapsed && "-rotate-90")} />
            </button>
            {!isCollapsed && (
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== "/" && pathname?.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClick}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Desktop sidebar — hidden on mobile */
const PUBLIC_PATHS = ["/proposals/view/"];

function CurrentUserBadge() {
  const { user, role, loading, logout } = useUserRole();
  if (loading || !user) return null;
  const roleColors: Record<string, string> = {
    admin: "bg-red-500",
    sales_rep: "bg-blue-500",
    approver: "bg-green-500",
    viewer: "bg-gray-400",
  };
  const roleLabels: Record<string, string> = {
    admin: "Admin",
    sales_rep: "Sales Rep",
    approver: "Approver",
    viewer: "Viewer",
  };
  return (
    <div className="px-3 py-2 border-t">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${roleColors[role ?? "viewer"] ?? "bg-gray-400"}`} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-foreground truncate">{user.full_name}</div>
          <div className="text-[10px] text-muted-foreground">{roleLabels[role ?? "viewer"]}</div>
        </div>
        <button
          onClick={() => logout()}
          title="Sign out"
          className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return null;
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r bg-card">
      <div className="px-5 py-4 border-b">
        <div className="text-sm font-bold tracking-tight text-foreground">Coritiba FC</div>
        <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Commercial Intelligence</div>
      </div>
      <div className="px-3 py-2 border-b">
        <GlobalSearchCompact />
      </div>
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        <NavLinks />
      </nav>
      <CurrentUserBadge />
      <div className="px-3 py-2 border-t">
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
          Platform v2.0 · Live
        </div>
      </div>
    </aside>
  );
}

/** Mobile top bar with slide-out drawer — visible only on sm */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return null;

  return (
    <>
      {/* Top bar */}
      <header className="md:hidden flex items-center justify-between border-b bg-card px-4 py-3 sticky top-0 z-30 pointer-events-none">
        <span className="text-sm font-semibold tracking-tight pointer-events-none">Market Sponsorship</span>
        <button
          aria-label="Toggle menu"
          className="rounded-md p-1.5 hover:bg-accent transition-colors pointer-events-auto"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Slide-out drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <nav className="relative bg-card w-64 h-full flex flex-col shadow-xl z-50">
            <div className="px-6 py-5 border-b">
              <div className="text-sm font-semibold tracking-tight">Market Sponsorship</div>
              <div className="text-xs text-muted-foreground">Automation MVP</div>
            </div>
            <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              <NavLinks onClick={() => setOpen(false)} />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
