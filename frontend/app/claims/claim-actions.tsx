"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ClaimRowData {
  id: string;
  key: string;
  label: string;
  category: string;
  retired: boolean;
  versionCount: number;
  state: string;
  usable: boolean;
  reasons: string[];
  daysToExpiry: number | null;
  current: {
    id: string;
    version: number;
    value: string;
    unit: string | null;
    description: string | null;
    source_kind: string;
    source_ref: string | null;
    source_url: string | null;
    effective_date: string | null;
    expires_at: string | null;
    owner: string | null;
    created_by_email: string | null;
  };
  reviews: Array<{ decision: string; reviewer_email: string | null; note: string | null; created_at: string }>;
}

const SOURCE_KINDS = [
  ["official_club", "Official club source"],
  ["public_statistics", "Public statistics (IBGE etc.)"],
  ["third_party_report", "Third-party report"],
  ["internal_estimate", "Internal estimate"],
  ["unknown", "Unknown"],
];

const selectCls = "w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm";

async function post(url: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return (j as { error?: string }).error ?? `Request failed (${res.status})`;
}

const badgeCls = (state: string) =>
  state === "current" ? "bg-emerald-100 text-emerald-800"
  : state === "expiring_soon" ? "bg-amber-100 text-amber-800"
  : state === "disputed" || state === "expired" ? "bg-red-100 text-red-800"
  : "bg-slate-100 text-slate-700";

function VersionFields({ initial }: { initial?: ClaimRowData["current"] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="text-xs space-y-1">Value shown to sponsors
        <Input name="value" required defaultValue={initial?.value ?? ""} />
      </label>
      <label className="text-xs space-y-1">Unit (optional)
        <Input name="unit" defaultValue={initial?.unit ?? ""} />
      </label>
      <label className="text-xs space-y-1">Source (who or what says so)
        <Input name="source_ref" defaultValue={initial?.source_ref ?? ""} />
      </label>
      <label className="text-xs space-y-1">Source type
        <select name="source_kind" className={selectCls} defaultValue={initial?.source_kind ?? "unknown"}>
          {SOURCE_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="text-xs space-y-1">Source link (optional)
        <Input name="source_url" defaultValue={initial?.source_url ?? ""} />
      </label>
      <label className="text-xs space-y-1">Owner (who keeps it current)
        <Input name="owner" defaultValue={initial?.owner ?? ""} />
      </label>
      <label className="text-xs space-y-1">True from
        <Input name="effective_date" type="date" defaultValue={initial?.effective_date ?? ""} />
      </label>
      <label className="text-xs space-y-1">Expires on
        <Input name="expires_at" type="date" defaultValue={initial?.expires_at ?? ""} />
      </label>
      <label className="text-xs space-y-1 sm:col-span-2">Notes
        <Input name="description" defaultValue={initial?.description ?? ""} />
      </label>
    </div>
  );
}

function versionPayload(fd: FormData) {
  const g = (k: string) => String(fd.get(k) ?? "").trim() || null;
  return {
    value: String(fd.get("value") ?? "").trim(),
    unit: g("unit"),
    description: g("description"),
    source_kind: String(fd.get("source_kind") ?? "unknown"),
    source_ref: g("source_ref"),
    source_url: g("source_url"),
    effective_date: g("effective_date"),
    expires_at: g("expires_at"),
    owner: g("owner"),
  };
}

export function ClaimRow({ claim }: { claim: ClaimRowData }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = claim.current;

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
    else {
      setEditing(false);
      router.refresh();
    }
  }

  const verify = () => run(() => post(`/api/claims/${claim.id}/review`, { version_id: c.id, decision: "verified" }));
  const dispute = () => {
    const note = window.prompt("Why is this figure wrong or unsupported?");
    if (!note) return;
    return run(() => post(`/api/claims/${claim.id}/review`, { version_id: c.id, decision: "disputed", note }));
  };
  const retire = () => run(() => post(`/api/claims/${claim.id}/retire`, { retired: !claim.retired }));

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2" data-testid={`claim-${claim.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{claim.label}</div>
          <div className="text-xs text-muted-foreground">{claim.key} · v{c.version}{claim.versionCount > 1 ? ` (${claim.versionCount} versions)` : ""}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{c.value}{c.unit ? ` ${c.unit}` : ""}</div>
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeCls(claim.state)}`} data-testid="claim-state">{claim.state.replace("_", " ")}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <div>Source: {c.source_ref ?? "—"} ({c.source_kind.replace(/_/g, " ")})</div>
        <div>Owner: {c.owner ?? "—"}</div>
        <div>True from: {c.effective_date ?? "—"}</div>
        <div>Expires: {c.expires_at ?? "—"}{claim.daysToExpiry !== null ? ` (${claim.daysToExpiry} days)` : ""}</div>
      </div>
      {c.description && <p className="text-xs">{c.description}</p>}
      {claim.reasons.length > 0 && !claim.usable && (
        <p className="text-xs text-amber-700">Not shown to sponsors: {claim.reasons.join("; ")}.</p>
      )}
      {claim.reviews.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Last review: {claim.reviews[claim.reviews.length - 1].decision} by {claim.reviews[claim.reviews.length - 1].reviewer_email ?? "unknown"}
          {claim.reviews[claim.reviews.length - 1].note ? ` — ${claim.reviews[claim.reviews.length - 1].note}` : ""}
        </p>
      )}

      {!claim.retired && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" disabled={busy} onClick={verify} data-testid="verify">Verify this version</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={dispute} data-testid="dispute">Dispute</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing((v) => !v)} data-testid="edit">{editing ? "Cancel" : "New version"}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={retire}>Retire</Button>
        </div>
      )}
      {claim.retired && (
        <Button size="sm" variant="outline" disabled={busy} onClick={retire}>Restore</Button>
      )}
      {error && <p className="text-xs text-red-600" data-testid="claim-error">{error}</p>}

      {editing && (
        <form
          className="space-y-3 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void run(() => post(`/api/claims/${claim.id}/versions`, versionPayload(fd)));
          }}
        >
          <p className="text-xs text-muted-foreground">A new version has to be verified again before sponsors see it.</p>
          <VersionFields initial={c} />
          <Button size="sm" type="submit" disabled={busy}>Save new version</Button>
        </form>
      )}
    </div>
  );
}

export function NewClaimForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} data-testid="new-claim">{open ? "Cancel" : "Add a claim"}</Button>
      {open && (
        <form
          className="rounded-lg border bg-card p-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setBusy(true);
            setError(null);
            const err = await post("/api/claims", {
              key: String(fd.get("key") ?? "").trim(),
              category: String(fd.get("category") ?? "general").trim() || "general",
              label: String(fd.get("label") ?? "").trim(),
              ...versionPayload(fd),
            });
            setBusy(false);
            if (err) setError(err);
            else {
              setOpen(false);
              router.refresh();
            }
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs space-y-1">Key (e.g. club.avg_attendance)
              <Input name="key" required />
            </label>
            <label className="text-xs space-y-1">Category
              <Input name="category" defaultValue="club" />
            </label>
            <label className="text-xs space-y-1">Label
              <Input name="label" required />
            </label>
          </div>
          <VersionFields />
          <Button size="sm" type="submit" disabled={busy}>Add claim</Button>
          {error && <p className="text-xs text-red-600" data-testid="new-claim-error">{error}</p>}
        </form>
      )}
    </div>
  );
}
