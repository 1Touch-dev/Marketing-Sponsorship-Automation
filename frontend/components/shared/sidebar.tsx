"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  FileText,
  Settings,
  Menu,
  X,
  Trophy,
  Package,
  ChevronLeft,
  ChevronRight,
  LogOut,
  CalendarDays,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/lib/auth/use-user-role";
import { useLang, t } from "@/lib/i18n/lang-context";
import { NAV_MODULES, moduleForPath, type NavModule } from "@/lib/nav/modules";

function LangToggle() {
  const { lang, toggle } = useLang();
  return (
    <button
      onClick={toggle}
      title={lang === "pt" ? "Switch to English" : "Mudar para Português"}
      className="flex items-center gap-0.5 rounded border overflow-hidden text-[10px] font-semibold hover:opacity-90 transition-opacity"
    >
      <span className={`px-1.5 py-0.5 ${lang === "pt" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>PT</span>
      <span className="text-muted-foreground px-0.5">|</span>
      <span className={`px-1.5 py-0.5 ${lang === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>EN</span>
    </button>
  );
}

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

const MODULE_ICONS: Record<string, React.ElementType> = {
  hoje: LayoutDashboard,
  relacionamentos: Building2,
  projetos: CalendarDays,
  estudio: FileText,
  ativos: Package,
  agentes: Bot,
  settings: Settings,
};

function ModuleLink({
  navModule,
  active,
  onClick,
  sidebarCollapsed,
}: {
  navModule: NavModule;
  active: boolean;
  onClick?: () => void;
  sidebarCollapsed?: boolean;
}) {
  const { lang } = useLang();
  const Icon = MODULE_ICONS[navModule.id] ?? LayoutDashboard;
  const label = t(navModule.labelKey, lang);
  return (
    <Link
      href={navModule.href}
      onClick={onClick}
      title={sidebarCollapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-md py-1.5 text-sm font-medium transition-colors",
        sidebarCollapsed ? "justify-center px-0" : "gap-2 px-3",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!sidebarCollapsed && <span>{label}</span>}
    </Link>
  );
}

function NavLinks({ onClick, sidebarCollapsed }: { onClick?: () => void; sidebarCollapsed?: boolean }) {
  const pathname = usePathname();
  const active = moduleForPath(pathname);
  const workModules = NAV_MODULES.filter((navModule) => !navModule.utility);
  const settingsModule = NAV_MODULES.find((navModule) => navModule.utility);

  return (
    <>
      <div className="space-y-0.5">
        {workModules.map((navModule) => (
          <ModuleLink
            key={navModule.id}
            navModule={navModule}
            active={active?.id === navModule.id}
            onClick={onClick}
            sidebarCollapsed={sidebarCollapsed}
          />
        ))}
      </div>
      {settingsModule && (
        <div className={cn("mt-2 border-t pt-2", sidebarCollapsed && "mx-1")}>
          <ModuleLink
            navModule={settingsModule}
            active={active?.id === settingsModule.id}
            onClick={onClick}
            sidebarCollapsed={sidebarCollapsed}
          />
        </div>
      )}
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

export function Sidebar({
  clubName = "Coritiba FC",
  tagline = "Commercial Intelligence",
  crestUrl,
}: {
  clubName?: string;
  tagline?: string;
  crestUrl?: string | null;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("sidebar-collapsed") === "true";
    return false;
  });
  const toggle = () => setCollapsed(c => { const n = !c; localStorage.setItem("sidebar-collapsed", String(n)); return n; });

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return null;
  return (
    <aside
      className={cn(
        "hidden md:flex md:flex-col border-r bg-card overflow-hidden transition-all duration-200",
        collapsed ? "md:w-[60px]" : "md:w-60"
      )}
    >
      <div className={cn("px-5 py-4 border-b flex-shrink-0", collapsed && "px-2 flex justify-center")}>
        {collapsed ? (
          <div className="h-5 w-5 flex items-center justify-center">
            {crestUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={crestUrl} alt={clubName} className="h-5 w-5 object-contain" />
            ) : (
              <Trophy className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {crestUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={crestUrl} alt={clubName} className="h-6 w-6 object-contain shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight text-foreground truncate">{clubName}</div>
              <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5 truncate">{tagline}</div>
            </div>
          </div>
        )}
      </div>
      {!collapsed && (
        <div className="px-3 py-2 border-b flex-shrink-0">
          <GlobalSearchCompact />
        </div>
      )}
      <nav className={cn("flex-1 min-h-0 py-3 space-y-0.5 overflow-y-auto", collapsed ? "px-1" : "px-3")}>
        <NavLinks sidebarCollapsed={collapsed} />
      </nav>
      {!collapsed && <CurrentUserBadge />}
      <div className={cn("px-3 py-2 border-t flex-shrink-0", collapsed ? "flex justify-center" : "flex items-center justify-between gap-2")}>
        {!collapsed && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
            Platform v2.0 · Live
          </div>
        )}
        {!collapsed && <LangToggle />}
        <button
          onClick={toggle}
          className={cn(
            "flex items-center justify-center rounded-md p-1.5 hover:bg-accent text-muted-foreground transition-colors",
            collapsed ? "w-full" : ""
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span className="ml-1 text-xs">Collapse</span>
            </>
          )}
        </button>
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
