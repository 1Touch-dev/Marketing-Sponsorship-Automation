"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type ObligationListRow = {
  id: string;
  title: string;
  due_date: string;
  owner_email: string;
  status: string;
  timing: "overdue" | "due_soon" | "upcoming" | "done";
  proof: "attached" | "stated" | "none";
  actions: string[];
  match_id: string | null;
};

type HistoryEvent = {
  event_type: string;
  evidence_kind: string | null;
  evidence_ref: string | null;
  note: string | null;
  reason: string | null;
  actor_email: string;
  created_at: string;
};

const GROUPS: Array<{ timing: ObligationListRow["timing"]; label: string }> = [
  { timing: "overdue", label: "Overdue" },
  { timing: "due_soon", label: "Due soon" },
  { timing: "upcoming", label: "Upcoming" },
  { timing: "done", label: "Done" },
];

function showDate(value: string) {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : value;
}

export function HandoffButton({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/contracts/${contractId}/handoff`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Handoff could not run.");
        return;
      }
      const created = typeof body.created === "number" ? body.created : 0;
      setNote(created > 0 ? `Handoff added ${created} obligation${created === 1 ? "" : "s"}.` : "Handoff ran. Nothing new was added.");
      router.refresh();
    } catch {
      setError("Handoff could not run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Running handoff…" : "Run handoff"}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

export function ProofPackButton({ contractId }: { contractId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${contractId}/proof-pack`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "The proof pack could not be downloaded.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const named = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
      link.href = url;
      link.download = named?.[1] ?? "proof-pack.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("The proof pack could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
      >
        {busy ? "Preparing proof pack…" : "Proof pack"}
      </button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </span>
  );
}

export function DeliveryBoard({ rows }: { rows: ObligationListRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Array<{ id: string; opponent: string; match_date: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/matches?limit=200");
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(body.data)) setMatches(body.data);
      } catch {
        // The due-date groups still show if the match list cannot be loaded.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      {GROUPS.map((group) => {
        const items = rows.filter((row) => row.timing === group.timing);
        if (items.length === 0) return null;
        return (
          <section key={group.timing} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label} <span className="font-normal normal-case">({items.length})</span>
            </h2>
            <div className="divide-y rounded-xl border bg-card">
              {items.map((row) => (
                <div key={row.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                    aria-expanded={openId === row.id}
                    onClick={() => setOpenId((current) => (current === row.id ? null : row.id))}
                  >
                    <span className="font-medium">{row.title}</span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Due {showDate(row.due_date)}</span>
                      <span>{row.owner_email}</span>
                      <span className="capitalize">{row.status}</span>
                      <span>Proof: {row.proof}</span>
                    </span>
                  </button>
                  {openId === row.id && (
                    <ObligationDetail
                      obligationId={row.id}
                      matchId={row.match_id}
                      dueDate={row.due_date}
                      matches={matches}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ObligationDetail({
  obligationId,
  matchId,
  dueDate,
  matches,
}: {
  obligationId: string;
  matchId: string | null;
  dueDate: string;
  matches: Array<{ id: string; opponent: string; match_date: string }>;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<{ actions: string[]; history: HistoryEvent[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<"link" | "file" | "statement">("link");
  const [ref, setRef] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [chosenMatch, setChosenMatch] = useState(matchId ?? "");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/obligations/${obligationId}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(typeof body.error === "string" ? body.error : "Couldn't load this obligation.");
        setDetail(null);
        return;
      }
      setDetail({
        actions: Array.isArray(body.actions) ? body.actions.filter((a: unknown) => typeof a === "string") : [],
        history: Array.isArray(body.history) ? body.history : [],
      });
    } catch {
      setLoadError("Couldn't load this obligation.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Load this obligation once when the row opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obligationId]);

  async function saveMatch(next: string) {
    setChosenMatch(next);
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/obligations/${obligationId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ match_id: next || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(typeof body.error === "string" ? body.error : "The match could not be saved.");
        setChosenMatch(matchId ?? "");
        return;
      }
      router.refresh();
    } catch {
      setActionError("The match could not be saved.");
      setChosenMatch(matchId ?? "");
    } finally {
      setBusy(false);
    }
  }

  async function post(action: string) {
    setBusy(true);
    setActionError(null);
    try {
      const payload: Record<string, string> = { action };
      if (action === "evidence") {
        payload.evidence_kind = kind;
        if (kind === "file") {
          if (!file) {
            setActionError("Choose a file.");
            return;
          }
          const form = new FormData();
          form.set("file", file);
          const uploaded = await fetch(`/api/obligations/${obligationId}/proof-files`, { method: "POST", body: form });
          const saved = await uploaded.json().catch(() => ({}));
          if (!uploaded.ok || typeof saved.id !== "string") {
            setActionError(typeof saved.error === "string" ? saved.error : "The file could not be uploaded.");
            return;
          }
          payload.evidence_ref = saved.id;
        } else {
          payload.evidence_ref = ref;
        }
      }
      if ((action === "deliver" || action === "evidence" || action === "accept") && note.trim()) payload.note = note.trim();
      if (action === "waive" || action === "reopen") payload.reason = reason.trim();
      const res = await fetch(`/api/obligations/${obligationId}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(typeof body.error === "string" ? body.error : "That action could not be saved.");
        return;
      }
      setRef("");
      setFile(null);
      setNote("");
      setReason("");
      await load();
      router.refresh();
    } catch {
      setActionError("That action could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !detail) return <p className="px-4 py-3 text-sm text-muted-foreground">Loading this obligation.</p>;
  if (loadError) return <p role="alert" className="px-4 py-3 text-sm text-red-600">{loadError}</p>;
  if (!detail) return null;

  const actions = new Set(detail.actions);

  return (
    <div className="space-y-4 border-t bg-muted/10 px-4 py-4">
      <div>
        <h3 className="text-sm font-semibold">History</h3>
        {detail.history.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {detail.history.map((event, index) => (
              <li key={`${event.created_at}-${index}`} className="text-sm">
                <span className="font-medium capitalize">{event.event_type}</span>
                <span className="text-muted-foreground"> · {event.actor_email} · {showDate(event.created_at)}</span>
                {event.evidence_kind && (
                  <span className="block text-xs text-muted-foreground">
                    {event.evidence_kind}{event.evidence_ref ? `: ${event.evidence_ref}` : ""}
                  </span>
                )}
                {event.note && <span className="block text-xs text-muted-foreground">{event.note}</span>}
                {event.reason && <span className="block text-xs text-muted-foreground">{event.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <div className="space-y-2">
          <label className="block text-xs font-medium" htmlFor={`${obligationId}-match`}>Match</label>
          <select
            id={`${obligationId}-match`}
            value={chosenMatch}
            disabled={busy}
            onChange={(event) => { void saveMatch(event.target.value); }}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">No match</option>
            {matches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.opponent} · {showDate(match.match_date)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">The due date stays {showDate(dueDate)}.</p>
        </div>
        {actions.has("deliver") && (
          <div className="space-y-2">
            <p className="text-sm">Record delivery. This is not proof, and it is not acceptance.</p>
            <label className="block text-xs font-medium" htmlFor={`${obligationId}-deliver-note`}>Note</label>
            <textarea
              id={`${obligationId}-deliver-note`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <button type="button" disabled={busy} onClick={() => post("deliver")} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              Record delivery
            </button>
          </div>
        )}

        {actions.has("evidence") && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Add proof</p>
            <label className="block text-xs font-medium" htmlFor={`${obligationId}-kind`}>Proof kind</label>
            <select
              id={`${obligationId}-kind`}
              value={kind}
              onChange={(event) => setKind(event.target.value as "link" | "file" | "statement")}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="link">Link</option>
              <option value="file">File</option>
              <option value="statement">Written statement</option>
            </select>
            {kind === "file" ? (
              <>
                <label className="block text-xs font-medium" htmlFor={`${obligationId}-file`}>File</label>
                <input
                  id={`${obligationId}-file`}
                  type="file"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
              </>
            ) : (
              <>
                <label className="block text-xs font-medium" htmlFor={`${obligationId}-ref`}>
                  {kind === "statement" ? "Statement" : "Web address"}
                </label>
                <textarea
                  id={`${obligationId}-ref`}
                  value={ref}
                  onChange={(event) => setRef(event.target.value)}
                  rows={kind === "statement" ? 3 : 2}
                  placeholder={kind === "statement" ? "What was delivered, when, and how it was confirmed (20+ characters)." : "https://…"}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </>
            )}
            <button type="button" disabled={busy} onClick={() => post("evidence")} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              Save proof
            </button>
          </div>
        )}

        {actions.has("accept") && (
          <div className="space-y-2">
            <p className="text-sm">
              Accept is an internal confirmation by a different person from the one who recorded delivery. It is separate from ticking the task done on the proposal.
            </p>
            <button type="button" disabled={busy} onClick={() => post("accept")} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              Accept
            </button>
          </div>
        )}

        {(actions.has("waive") || actions.has("reopen")) && (
          <div className="space-y-2">
            <label className="block text-xs font-medium" htmlFor={`${obligationId}-reason`}>Reason</label>
            <textarea
              id={`${obligationId}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="At least 5 characters."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {actions.has("waive") && (
                <button type="button" disabled={busy} onClick={() => post("waive")} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
                  Waive
                </button>
              )}
              {actions.has("reopen") && (
                <button type="button" disabled={busy} onClick={() => post("reopen")} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
                  Reopen
                </button>
              )}
            </div>
          </div>
        )}

        {actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}
      </form>
    </div>
  );
}
