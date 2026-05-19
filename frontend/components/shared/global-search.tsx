"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Building2, FileText, Lightbulb, Package, Loader2, X } from "lucide-react";

type SearchResult = {
  type: string; id: string; title: string; subtitle: string; url: string; badge?: string;
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  company: Building2, proposal: FileText, campaign: Lightbulb, inventory: Package,
};

const TYPE_COLORS: Record<string, string> = {
  company: "text-blue-500", proposal: "text-purple-500",
  campaign: "text-amber-500", inventory: "text-green-500",
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=10`);
      const data = await res.json() as { results: SearchResult[] };
      setResults(data.results ?? []);
      setSelected(0);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 200);
  }, [query, search]);

  function handleSelect(result: SearchResult) {
    router.push(result.url);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) handleSelect(results[selected]);
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors w-full max-w-xs"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="text-[10px] border rounded px-1 py-0.5 bg-background hidden sm:block">⌘K</kbd>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4" onClick={() => setOpen(false)}>
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search companies, proposals, campaigns…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {query && !loading && <button onClick={() => { setQuery(""); setResults([]); }}><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>}
              <kbd className="text-[10px] border rounded px-1.5 py-0.5 bg-muted text-muted-foreground">ESC</kbd>
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div className="max-h-80 overflow-y-auto py-2">
                {results.map((result, i) => {
                  const Icon = TYPE_ICONS[result.type] ?? Search;
                  const color = TYPE_COLORS[result.type] ?? "text-muted-foreground";
                  return (
                    <button
                      key={result.id + result.type}
                      onClick={() => handleSelect(result)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === selected ? "bg-accent" : "hover:bg-accent/50"}`}
                    >
                      <Icon className={`h-4 w-4 flex-shrink-0 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{result.title}</div>
                        {result.subtitle && <div className="text-xs text-muted-foreground truncate">{result.subtitle}</div>}
                      </div>
                      {result.badge && <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full capitalize flex-shrink-0">{result.badge}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {query.length >= 2 && !loading && results.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</div>
            )}

            {!query && (
              <div className="px-4 py-4 text-xs text-muted-foreground space-y-1">
                <div className="font-medium text-foreground mb-2">Quick navigation</div>
                {[
                  { label: "Companies", url: "/companies", icon: Building2 },
                  { label: "New Proposal", url: "/proposals/new", icon: FileText },
                  { label: "Campaigns", url: "/campaigns", icon: Lightbulb },
                ].map(item => (
                  <button key={item.url} onClick={() => { router.push(item.url); setOpen(false); }} className="flex items-center gap-2 w-full hover:text-foreground transition-colors py-1">
                    <item.icon className="h-3.5 w-3.5" /> {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
