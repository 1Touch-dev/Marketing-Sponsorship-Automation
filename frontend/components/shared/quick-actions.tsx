"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Plus, Wand2, Sparkles, Building2, Package, Image,
  X, Zap, FileText, Camera,
} from "lucide-react";

type Action = {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  href?: string;
  action?: () => void;
};

const ACTIONS: Action[] = [
  { id: "new_proposal", label: "New Proposal", icon: Wand2, color: "bg-purple-600 hover:bg-purple-700", href: "/proposals/new" },
  { id: "new_company", label: "Add Company", icon: Building2, color: "bg-blue-600 hover:bg-blue-700", href: "/companies/new" },
  { id: "generate_campaign", label: "Generate Campaign", icon: Sparkles, color: "bg-amber-500 hover:bg-amber-600", href: "/campaigns" },
  { id: "new_image", label: "AI Image", icon: Image, color: "bg-green-600 hover:bg-green-700", href: "/media-generation" },
  { id: "mockup", label: "Create Mockup", icon: Camera, color: "bg-rose-600 hover:bg-rose-700", href: "/mockup-editor" },
  { id: "inventory", label: "View Inventory", icon: Package, color: "bg-indigo-600 hover:bg-indigo-700", href: "/inventory" },
];

export function QuickActionsFAB() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Only show on top-level pages; hide on all detail/wizard/editor pages
  const isPublic = pathname.startsWith("/proposals/view/");
  const showOnlyOn = ["/", "/companies", "/proposals", "/campaigns", "/inventory"];
  const isTopLevel = showOnlyOn.includes(pathname);
  if (isPublic || !isTopLevel) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      {/* Action items */}
      <div className={`flex flex-col items-end gap-2 transition-all duration-300 ${open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
        {ACTIONS.map((action, i) => (
          <button
            key={action.id}
            onClick={() => {
              setOpen(false);
              if (action.href) router.push(action.href);
              else action.action?.();
            }}
            className={`flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-200 ${action.color}`}
            style={{ transitionDelay: open ? `${i * 40}ms` : "0ms" }}
          >
            <action.icon className="h-4 w-4 flex-shrink-0" />
            <span className="whitespace-nowrap">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Main FAB button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative h-14 w-14 rounded-full text-white shadow-xl transition-all duration-300 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${open ? "bg-slate-700 rotate-45 scale-110" : "bg-primary hover:scale-105 hover:shadow-2xl"}`}
        aria-label={open ? "Close quick actions" : "Quick actions"}
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        {!open && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-500 border-2 border-background animate-pulse" />
        )}
      </button>

      {/* Backdrop */}
      {open && <div className="fixed inset-0 -z-10" onClick={() => setOpen(false)} />}
    </div>
  );
}
