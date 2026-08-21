"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { Loader2, Plus, Trash2, Save, ChevronDown, ChevronUp, AlertCircle, CalendarDays, BarChart3 } from "lucide-react";

type MediaReach = {
  official_views: number;
  unofficial_fan_views: number;
  rival_account_views: number;
  media_tv_radio_views: number;
  source_notes: string | null;
} | null;

type Match = {
  id: string;
  match_date: string;
  opponent: string;
  competition: string | null;
  home_away: "home" | "away";
  result: string | null;
  notes: string | null;
  match_media_reach: MediaReach[] | MediaReach;
};

function reachOf(m: Match): MediaReach {
  const r = m.match_media_reach;
  if (Array.isArray(r)) return r[0] ?? null;
  return r ?? null;
}

function totalViews(r: MediaReach): number {
  if (!r) return 0;
  return (r.official_views ?? 0) + (r.unofficial_fan_views ?? 0) + (r.rival_account_views ?? 0) + (r.media_tv_radio_views ?? 0);
}

export function MatchesManager({
  initialMatches,
  migrationPending,
}: {
  initialMatches: Record<string, unknown>[];
  migrationPending: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [matches, setMatches] = useState<Match[]>(initialMatches as unknown as Match[]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [matchDate, setMatchDate] = useState("");
  const [opponent, setOpponent] = useState("");
  const [competition, setCompetition] = useState("");
  const [homeAway, setHomeAway] = useState<"home" | "away">("home");

  const [reachDraft, setReachDraft] = useState<Record<string, MediaReach>>({});

  async function createMatch() {
    if (!matchDate || !opponent.trim()) {
      toast({ variant: "destructive", title: "Date and opponent are required" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ match_date: matchDate, opponent, competition, home_away: homeAway }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to create");
      setMatches((prev) => [{ ...j.data, match_media_reach: null }, ...prev]);
      setCreating(false);
      setMatchDate("");
      setOpponent("");
      setCompetition("");
      setHomeAway("home");
      toast({ variant: "success", title: "Match added" });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Create failed", description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteMatch(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setMatches((prev) => prev.filter((m) => m.id !== id));
      toast({ variant: "success", title: "Match removed" });
    } catch (e) {
      toast({ variant: "destructive", title: "Delete failed", description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  function draftFor(m: Match): MediaReach {
    return (
      reachDraft[m.id] ??
      reachOf(m) ?? {
        official_views: 0,
        unofficial_fan_views: 0,
        rival_account_views: 0,
        media_tv_radio_views: 0,
        source_notes: "",
      }
    );
  }

  function updateDraft(id: string, patch: Partial<NonNullable<MediaReach>>) {
    setReachDraft((prev) => ({ ...prev, [id]: { ...(prev[id] ?? draftFor(matches.find((m) => m.id === id)!)), ...patch } as MediaReach }));
  }

  async function saveReach(id: string) {
    const draft = reachDraft[id];
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${id}/media-reach`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, match_media_reach: j.data } : m)));
      toast({ variant: "success", title: "Media reach saved" });
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  if (migrationPending) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Database migration required</p>
          <p className="text-sm text-amber-700 mt-1">
            Run <code>0042_matches_media_reach_warmup.sql</code> in the Supabase SQL Editor to enable matches.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {matches.length} match{matches.length === 1 ? "" : "es"} · click a match to edit its media reach
        </p>
        <Button size="sm" onClick={() => setCreating((v) => !v)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New match
        </Button>
      </div>

      {creating && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="date"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              className="text-sm border rounded-md px-3 py-2 bg-background"
            />
            <input
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="Opponent — e.g. Flamengo"
              className="text-sm border rounded-md px-3 py-2 bg-background sm:col-span-2"
            />
            <select
              value={homeAway}
              onChange={(e) => setHomeAway(e.target.value as "home" | "away")}
              className="text-sm border rounded-md px-2 py-2 bg-background"
            >
              <option value="home">Home (Couto Pereira)</option>
              <option value="away">Away</option>
            </select>
          </div>
          <input
            value={competition}
            onChange={(e) => setCompetition(e.target.value)}
            placeholder="Competition — e.g. Brasileirão (optional)"
            className="w-full text-sm border rounded-md px-3 py-2 bg-background"
          />
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={createMatch} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save match
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {matches.map((m) => {
          const reach = reachOf(m);
          const isOpen = expanded === m.id;
          const draft = draftFor(m);
          return (
            <div key={m.id} className="rounded-xl border bg-card">
              <button
                className="w-full flex items-center justify-between gap-2 p-4 text-left"
                onClick={() => setExpanded(isOpen ? null : m.id)}
              >
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <div className="font-medium text-sm flex items-center gap-2">
                      Coritiba × {m.opponent}
                      <Badge variant="outline" className="text-[9px] capitalize">{m.home_away}</Badge>
                      {m.result && <Badge variant="secondary" className="text-[9px]">{m.result}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(m.match_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      {m.competition ? ` · ${m.competition}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BarChart3 className="h-3.5 w-3.5" />
                    {totalViews(reach).toLocaleString("pt-BR")} views
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMatch(m.id);
                    }}
                    disabled={busy}
                    className="text-red-500 hover:text-red-700"
                    title="Delete match"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {isOpen && (
                <div className="border-t p-4 space-y-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">
                    Expected/actual views for this match, broken down by source — feeds the media-reach section of
                    per-match proposals. Enter numbers manually based on past game stats.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <ReachField label="Official" value={draft?.official_views ?? 0} onChange={(v) => updateDraft(m.id, { official_views: v })} />
                    <ReachField label="Unofficial / fan" value={draft?.unofficial_fan_views ?? 0} onChange={(v) => updateDraft(m.id, { unofficial_fan_views: v })} />
                    <ReachField label="Rival accounts" value={draft?.rival_account_views ?? 0} onChange={(v) => updateDraft(m.id, { rival_account_views: v })} />
                    <ReachField label="Media / TV / radio" value={draft?.media_tv_radio_views ?? 0} onChange={(v) => updateDraft(m.id, { media_tv_radio_views: v })} />
                  </div>
                  <input
                    value={draft?.source_notes ?? ""}
                    onChange={(e) => updateDraft(m.id, { source_notes: e.target.value })}
                    placeholder="Source notes (optional) — e.g. Bentview report Aug/2026"
                    className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                  />
                  <Button size="sm" onClick={() => saveReach(m.id)} disabled={busy} className="gap-1.5">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save media reach
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {matches.length === 0 && !creating && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No matches yet. Add one to start tracking per-match media reach and scope proposals to it.
          </p>
        )}
      </div>
    </div>
  );
}

function ReachField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="space-y-1 block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
      />
    </label>
  );
}
