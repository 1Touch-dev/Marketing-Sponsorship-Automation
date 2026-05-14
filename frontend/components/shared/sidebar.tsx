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
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/campaigns", label: "Campaigns", icon: Lightbulb },
  { href: "/proposals", label: "Proposals", icon: FileText },
  { href: "/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/emails", label: "Emails", icon: Mail },
  { href: "/threads", label: "Threads", icon: MessageSquare },
  { href: "/followups", label: "Follow-ups", icon: Clock },
  { href: "/workflow-events", label: "Workflows", icon: Activity },
  { href: "/audit", label: "Audit", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onClick }: { onClick?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((item) => {
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
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
      <div className="px-3 py-3 border-t text-xs text-muted-foreground">Phase 1 MVP</div>
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
