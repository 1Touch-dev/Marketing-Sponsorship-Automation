"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { Flame, Loader2, ChevronRight, CalendarDays } from "lucide-react";

type Step = { step: number; type: string; label: string; delay_days: number };
type Sequence = { id: string; name: string; steps: Step[] | string; is_default?: boolean };
type MatchLite = { id: string; opponent: string; match_date: string };
type Enrollment = {
  id: string;
  sequence_id: string;
  current_step: number;
  status: "active" | "paused" | "completed" | "cancelled";
  next_action_at: string | null;
  contact_name: string | null;
  match_id: string | null;
  warmup_sequences?: { name: string; steps: Step[] | string };
  matches?: { opponent: string; match_date: string } | null;
};

function parseSteps(raw: Step[] | string | undefined): Step[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw) as Step[];
  } catch {
    return [];
  }
}

export function WarmupStrategyPanel({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [matches, setMatches] = useState<MatchLite[]>([]);
  const [migrationPending, setMigrationPending] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [selectedSequence, setSelectedSequence] = useState("");
  const [selectedMatch, setSelectedMatch] = useState("");
  const [contactName, setContactName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [enrRes, seqRes, matchRes] = await Promise.all([
        fetch(`/api/warmup-enrollments?company_id=${companyId}`).then((r) => r.json()).catch(() => ({ data: [] })),
        fetch("/api/warmup-sequences").then((r) => r.json()).catch(() => ({ data: [] })),
        fetch("/api/matches?limit=20").then((r) => r.json()).catch(() => ({ data: [] })),
      ]);
      if (cancelled) return;
      setEnrollments(enrRes.data ?? []);
      setSequences(seqRes.data ?? []);
      setMatches(matchRes.data ?? []);
      setMigrationPending(!!enrRes.migration_pending);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  async function enroll() {
    if (!selectedSequence) {
      toast({ variant: "destructive", title: "Choose a strategy" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/warmup-enrollments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sequence_id: selectedSequence,
          company_id: companyId,
          contact_name: contactName || undefined,
          match_id: selectedMatch || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Enroll failed");
      const seq = sequences.find((s) => s.id === selectedSequence);
      setEnrollments((prev) => [{ ...j.data, warmup_sequences: seq ? { name: seq.name, steps: seq.steps } : undefined }, ...prev]);
      setEnrolling(false);
      setContactName("");
      setSelectedMatch("");
      toast({ variant: "success", title: "Enrolled" });
    } catch (e) {
      toast({ variant: "destructive", title: "Enroll failed", description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  async function advance(enrollmentId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/warmup-enrollments/${enrollmentId}/advance`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Advance failed");
      setEnrollments((prev) => prev.map((e) => (e.id === enrollmentId ? { ...e, ...j.data } : e)));
      toast({ variant: "success", title: j.done ? "Strategy completed" : "Step marked done" });
    } catch (e) {
      toast({ variant: "destructive", title: "Failed", description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  if (migrationPending) return null; // silently hide until the migration is applied

  const activeEnrollments = enrollments.filter((e) => e.status === "active");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          Warm-up Strategy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {activeEnrollments.map((e) => {
              const steps = parseSteps(e.warmup_sequences?.steps);
              const current = steps[e.current_step];
              return (
                <div key={e.id} className="rounded-lg border p-3 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{e.warmup_sequences?.name ?? "Warm-up strategy"}</span>
                    <Badge variant="outline" className="text-[9px]">
                      step {e.current_step + 1}/{steps.length}
                    </Badge>
                  </div>
                  {e.contact_name && <p className="text-xs text-muted-foreground">Contact: {e.contact_name}</p>}
                  {e.matches && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> vs {e.matches.opponent} ·{" "}
                      {new Date(e.matches.match_date + "T00:00:00").toLocaleDateString("pt-BR")}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {steps.map((s, i) => (
                      <Badge key={i} variant={i < e.current_step ? "secondary" : i === e.current_step ? "default" : "outline"} className="text-[10px]">
                        {s.label}
                      </Badge>
                    ))}
                  </div>
                  {current && (
                    <Button size="sm" onClick={() => advance(e.id)} disabled={busy} className="gap-1.5">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      Mark &quot;{current.label}&quot; done
                    </Button>
                  )}
                </div>
              );
            })}

            {!enrolling ? (
              <Button variant="outline" size="sm" onClick={() => setEnrolling(true)} className="gap-1.5 w-full">
                <Flame className="h-3.5 w-3.5" /> Start a warm-up strategy
              </Button>
            ) : (
              <div className="rounded-lg border p-3 space-y-2">
                <select
                  value={selectedSequence}
                  onChange={(e) => setSelectedSequence(e.target.value)}
                  className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                >
                  <option value="">Choose a strategy…</option>
                  {sequences.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Contact name — e.g. the CMO (optional)"
                  className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                />
                <select
                  value={selectedMatch}
                  onChange={(e) => setSelectedMatch(e.target.value)}
                  className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                >
                  <option value="">Link to a match (optional)…</option>
                  {matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      vs {m.opponent} · {new Date(m.match_date + "T00:00:00").toLocaleDateString("pt-BR")}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button size="sm" onClick={enroll} disabled={busy} className="gap-1.5">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
                    Enroll
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEnrolling(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {sequences.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground">
                No strategies configured yet — create one under Settings → Warm-up Strategies.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
