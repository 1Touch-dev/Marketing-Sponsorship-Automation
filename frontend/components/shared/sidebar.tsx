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
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  group?: string;
};

const NAV: NavItem[] = [
  // Core CRM
  { href: "/", label: "Dashboard", icon: LayoutDashboard, group: "core" },
  { href: "/companies", label: "Companies", icon: Building2, group: "core" },
  { href: "/pipeline", label: "Pipeline", icon: TrendingUp, group: "core" },
  // Proposal workflow
  { href: "/campaigns", label: "Campaigns", icon: Lightbulb, group: "proposals" },
  { href: "/proposals", label: "Proposals", icon: FileText, group: "proposals" },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, group: "proposals" },
  { href: "/emails", label: "Emails", icon: Mail, group: "proposals" },
  { href: "/threads", label: "Threads", icon: MessageSquare, group: "proposals" },
  { href: "/followups", label: "Follow-ups", icon: Clock, group: "proposals" },
  // Intelligence
  { href: "/coritiba-intelligence", label: "Coritiba Intel", icon: Trophy, group: "intelligence" },
  { href: "/inventory", label: "Inventory", icon: Package, group: "intelligence" },
  { href: "/barter", label: "Barter / Procurement", icon: Repeat2, group: "intelligence" },
  { href: "/lei-de-incentivo", label: "Lei de Incentivo", icon: Heart, group: "intelligence" },
  { href: "/media", label: "AI Media", icon: Image, group: "intelligence" },
  { href: "/brand-assets", label: "Brand Assets", icon: Shield, group: "intelligence" },
  // System
  { href: "/workflow-events", label: "Workflows", icon: Activity, group: "system" },
  { href: "/audit", label: "Audit", icon: ScrollText, group: "system" },
  { href: "/system", label: "Maintenance", icon: Wrench, group: "system" },
  { href: "/settings", label: "Settings", icon: Settings, group: "system" },
];

const GROUPS: Record<string, string> = {
  core: "CRM",
  proposals: "Proposal Workflow",
  intelligence: "Intelligence",
  system: "System",
};

function NavLinks({ onClick }: { onClick?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  const groupedItems = NAV.reduce<Record<string, NavItem[]>>((acc, item) => {
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

export function Sidebar() {
  const pathname = usePathname();
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return null;
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r bg-card">
      <div className="px-6 py-5 border-b">
        <div className="text-sm font-semibold tracking-tight">Market Sponsorship</div>
        <div className="text-xs text-muted-foreground">Automation MVP</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <NavLinks />
      </nav>
      <div className="px-3 py-3 border-t text-xs text-muted-foreground">Commercial Intelligence Platform</div>
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
      <header className="md:hidden flex items-center justify-between border-b bg-card px-4 py-3 sticky top-0 z-30">
        <span className="text-sm font-semibold tracking-tight">Market Sponsorship</span>
        <button
          aria-label="Toggle menu"
          className="rounded-md p-1.5 hover:bg-accent transition-colors"
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
