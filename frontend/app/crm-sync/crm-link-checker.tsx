"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

type Suggestion = { company_id: string; company_name: string; pipedrive_org_id: number; pipedrive_name: string };
type Confirmed = { company_id: string; pipedrive_org_id: number; linked: boolean; reason?: string };
type LinkReport = {
  dry_run: boolean;
  deals: { missing: Array<{ proposal_id: string; pipedrive_deal_id: number }> };
  organizations: {
    name_differs: Array<{ company_id: string; company_name: string; pipedrive_org_id: number; pipedrive_name: string }>;
    missing: Array<{ company_id: string; company_name: string; pipedrive_org_id: number }>;
  };
  suggestions: Suggestion[];
  confirmed: Confirmed[];
  stopped_early: boolean;
  problems: string[];
};

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({})) as { error?: unknown };
  return typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
}

export function CrmLinkChecker() {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [report, setReport] = useState<LinkReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Confirmed[] | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function dryRun() {
    setLoading(true);
    setError(null);
    setConfirmed(null);
    setSelected(new Set());
    try {
      const res = await fetch("/api/crm/link-existing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggest: true }),
      });
      if (!res.ok) {
        setError(await readError(res));
        setReport(null);
        return;
      }
      setReport(await res.json() as LinkReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!report || loading || confirming || selected.size === 0) return;
    const link = report.suggestions
      .filter((s) => selected.has(s.company_id))
      .map((s) => ({ company_id: s.company_id, pipedrive_org_id: s.pipedrive_org_id }));
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/link-existing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true, link }),
      });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const body = await res.json() as LinkReport;
      setConfirmed(body.confirmed);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Check existing Pipedrive links</CardTitle>
        <CardDescription>Reads Pipedrive first. Nothing is linked until you confirm a suggested pair.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button type="button" size="sm" onClick={() => void dryRun()} disabled={loading || confirming}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
          {loading ? "Checking…" : "Check links"}
        </Button>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        {report?.stopped_early && (
          <p role="alert" className="text-sm text-amber-700">This check stopped early. The list is incomplete.</p>
        )}
        {report && report.problems.length > 0 && (
          <ul className="text-sm text-red-600 space-y-1">
            {report.problems.map((problem) => <li key={problem} role="alert">{problem}</li>)}
          </ul>
        )}

        {report && (
          <div className="space-y-4 text-sm">
            <section>
              <h3 className="font-medium">Deals not found in Pipedrive ({report.deals.missing.length})</h3>
              {report.deals.missing.length === 0 ? <p className="text-muted-foreground text-xs mt-1">None.</p> : (
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {report.deals.missing.map((d) => <li key={`${d.proposal_id}-${d.pipedrive_deal_id}`}>Proposal {d.proposal_id} · deal {d.pipedrive_deal_id}</li>)}
                </ul>
              )}
            </section>
            <section>
              <h3 className="font-medium">Organization name differs ({report.organizations.name_differs.length})</h3>
              <p className="text-xs text-muted-foreground mt-1">Listed for review. These are not linked from this screen.</p>
              {report.organizations.name_differs.length === 0 ? <p className="text-muted-foreground text-xs mt-1">None.</p> : (
                <ul className="mt-1 space-y-1 text-xs">
                  {report.organizations.name_differs.map((o) => (
                    <li key={o.company_id}>{o.company_name} · Pipedrive “{o.pipedrive_name}” ({o.pipedrive_org_id})</li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="font-medium">Suggested matches ({report.suggestions.length})</h3>
              {report.suggestions.length === 0 ? <p className="text-muted-foreground text-xs mt-1">None.</p> : (
                <ul className="mt-2 space-y-2">
                  {report.suggestions.map((s) => (
                    <li key={s.company_id}>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.has(s.company_id)}
                          onChange={() => toggle(s.company_id)}
                          disabled={loading || confirming}
                        />
                        <span>{s.company_name} · Pipedrive “{s.pipedrive_name}” ({s.pipedrive_org_id})</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Button type="button" size="sm" onClick={() => void confirm()} disabled={loading || confirming || !report || selected.size === 0}>
              {confirming ? "Linking…" : `Confirm ${selected.size} selected`}
            </Button>
          </div>
        )}

        {confirmed && (
          <ul className="text-sm space-y-1">
            {confirmed.map((c) => (
              <li key={`${c.company_id}-${c.pipedrive_org_id}`}>
                {c.linked ? "Linked" : "Not linked"} · organization {c.pipedrive_org_id}
                {c.reason ? ` · ${c.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
