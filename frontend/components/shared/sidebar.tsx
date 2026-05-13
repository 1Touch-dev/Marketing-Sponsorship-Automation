"use client";

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
  { href: "/audit", label: "Audit", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r bg-card">
      <div className="px-6 py-5 border-b">
        <div className="text-sm font-semibold tracking-tight">Market Sponsorship</div>
        <div className="text-xs text-muted-foreground">Automation MVP</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t text-xs text-muted-foreground">
        Phase 1 MVP
      </div>
    </aside>
  );
}
