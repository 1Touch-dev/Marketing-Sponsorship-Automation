"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Trash2, X, Loader2 } from "lucide-react";

type Preview = {
  blockers: string[];
  dependents: Record<string, number>;
};

export function DeleteCompanyButton({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [tombstoneId, setTombstoneId] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const res = await fetch(
        `/api/tombstones?preview_type=companies&preview_id=${encodeURIComponent(companyId)}`,
        { cache: "no-store" },
      );
      const j = await res.json().catch(() => ({})) as Preview & { error?: string };
      if (res.ok) {
        setPreview({ blockers: j.blockers ?? [], dependents: j.dependents ?? {} });
        return;
      }
      // Fallback: unconfirmed DELETE returns blockers on 409
      const del = await fetch(`/api/companies/${companyId}`, { method: "DELETE" });
      const dj = await del.json().catch(() => ({})) as {
        error?: string;
        blockers?: string[];
        dependents?: Record<string, number>;
      };
      if (del.status === 409) {
        setPreview({ blockers: dj.blockers ?? [], dependents: dj.dependents ?? {} });
        return;
      }
      setPreviewError(j.error ?? dj.error ?? "Could not preview delete");
    } catch {
      setPreviewError("Could not preview delete");
    } finally {
      setLoadingPreview(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setDeleted(false);
    setTombstoneId(null);
    void loadPreview();
  }, [open, loadPreview]);

  const blockers = preview?.blockers ?? [];
  const dependents = preview?.dependents ?? {};
  const needsReason = blockers.length > 0;
  const reasonOk = !needsReason || reason.trim().length >= 10;

  async function confirmDelete() {
    if (!reasonOk) return;
    setDeleting(true);
    try {
      const qs = new URLSearchParams({ confirm: "true" });
      if (reason.trim()) qs.set("reason", reason.trim());
      const res = await fetch(`/api/companies/${companyId}?${qs.toString()}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({})) as {
        error?: string;
        blockers?: string[];
        dependents?: Record<string, number>;
        success?: boolean;
      };
      if (!res.ok) {
        if (j.blockers?.length) setPreview({ blockers: j.blockers, dependents: j.dependents ?? dependents });
        toast({ variant: "destructive", title: "Delete failed", description: j.error ?? `HTTP ${res.status}` });
        return;
      }

      // Look up tombstone for Undo
      let tid: string | null = null;
      try {
        const tRes = await fetch(
          `/api/tombstones?type=companies&record_id=${encodeURIComponent(companyId)}&limit=1`,
          { cache: "no-store" },
        );
        const tJ = await tRes.json().catch(() => ({})) as { data?: Array<{ id: string }> };
        tid = tJ.data?.[0]?.id ?? null;
      } catch { /* undo optional */ }

      setTombstoneId(tid);
      setDeleted(true);
      toast({
        variant: "success",
        title: "Company deleted",
        description: tid ? "You can undo from this dialog for a moment." : `${companyName} was removed.`,
        duration: 8000,
      });
    } catch {
      toast({ variant: "destructive", title: "Delete failed", description: "Network error" });
    } finally {
      setDeleting(false);
    }
  }

  async function undoDelete() {
    if (!tombstoneId) return;
    setRestoring(true);
    try {
      const res = await fetch(`/api/tombstones/${tombstoneId}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "Undo from company delete dialog" }),
      });
      const j = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        toast({ variant: "destructive", title: "Undo failed", description: j.error ?? `HTTP ${res.status}` });
        return;
      }
      toast({ variant: "success", title: "Company restored", description: companyName });
      setOpen(false);
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Undo failed", description: "Network error" });
    } finally {
      setRestoring(false);
    }
  }

  function finishAndLeave() {
    setOpen(false);
    router.push("/companies");
  }

  const dependentEntries = Object.entries(dependents).filter(([, n]) => n > 0);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4 mr-1" />
        Delete
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => { if (!deleting && !restoring) { if (deleted) finishAndLeave(); else setOpen(false); } }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-company-title"
            className="relative z-10 w-full max-w-md rounded-xl border bg-background p-5 shadow-lg space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="delete-company-title" className="text-base font-semibold">
                  {deleted ? "Company deleted" : "Delete company"}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">{companyName}</p>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                onClick={() => { if (deleted) finishAndLeave(); else setOpen(false); }}
                disabled={deleting || restoring}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {deleted ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The company was removed and kept as a tombstone so it can be undone.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  {tombstoneId && (
                    <Button type="button" variant="outline" onClick={() => void undoDelete()} disabled={restoring}>
                      {restoring ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                      Undo delete
                    </Button>
                  )}
                  <Button type="button" onClick={finishAndLeave} disabled={restoring}>
                    Back to companies
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {loadingPreview && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking what this would remove…
                  </p>
                )}
                {previewError && (
                  <p className="text-sm text-destructive">{previewError}</p>
                )}
                {!loadingPreview && preview && (
                  <div className="space-y-3 text-sm">
                    {blockers.length > 0 ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 space-y-1.5">
                        <p className="font-medium text-amber-900 dark:text-amber-200">Live commitments block a quiet delete</p>
                        <ul className="list-disc pl-4 text-amber-800 dark:text-amber-300 space-y-0.5">
                          {blockers.map((b) => <li key={b}>{b}</li>)}
                        </ul>
                        <p className="text-xs text-amber-700 dark:text-amber-400 pt-1">
                          Confirming requires a written reason (10+ characters). The delete can still be undone.
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">
                        No live contracts or delivery commitments are blocking this delete. A tombstone will be kept so it can be undone.
                      </p>
                    )}

                    {dependentEntries.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Also affected</p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {dependentEntries.map(([k, n]) => (
                            <li key={k}>{k}: {n}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div>
                      <label htmlFor="delete-company-reason" className="text-xs font-medium text-muted-foreground block mb-1">
                        Reason {needsReason ? "(required, 10+ characters)" : "(optional)"}
                      </label>
                      <textarea
                        id="delete-company-reason"
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={needsReason ? "Why is this company being deleted despite live commitments?" : "Optional note for the tombstone…"}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
                      />
                      {needsReason && reason.trim().length > 0 && reason.trim().length < 10 && (
                        <p className="text-xs text-destructive mt-1">{10 - reason.trim().length} more characters needed</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void confirmDelete()}
                    disabled={deleting || loadingPreview || !!previewError || !preview || !reasonOk}
                  >
                    {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                    {needsReason ? "Confirm delete" : "Delete company"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
