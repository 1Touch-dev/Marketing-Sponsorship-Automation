"use client";

import React, { useState, useRef, useCallback } from "react";
import { PenLine, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineEditProps {
  proposalId: string;
  fieldKey: string;
  value: string;
  multiline?: boolean;
  className?: string;
  renderAs?: "p" | "h1" | "h2" | "h3" | "span";
  onSaved?: (newValue: string) => void;
}

export function InlineEdit({
  proposalId,
  fieldKey,
  value,
  multiline = true,
  className,
  renderAs: Tag = "p",
  onSaved,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => ref.current?.focus(), 50);
  }, [value]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(value);
  }, [value]);

  const save = useCallback(async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { [fieldKey]: draft } }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setEditing(false);
      onSaved?.(draft);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // keep editing open on error
    } finally {
      setSaving(false);
    }
  }, [draft, value, proposalId, fieldKey, onSaved]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") cancel();
    if (!multiline && e.key === "Enter") { e.preventDefault(); save(); }
    if (multiline && e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
  }, [cancel, save, multiline]);

  if (!editing) {
    return (
      <span className="group relative inline">
        <Tag className={cn("inline", className)}>
          {saved ? draft : value}
        </Tag>
        <button
          onClick={startEdit}
          title="Click to edit"
          className="ml-1 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 bg-white/80 hover:bg-white border border-slate-200 shadow-sm align-middle"
        >
          <PenLine className="h-3 w-3 text-green-700" />
        </button>
        {saved && (
          <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-green-600 font-medium">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="relative block">
      {multiline ? (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          rows={Math.max(3, Math.ceil(draft.length / 80))}
          className={cn(
            "w-full rounded-lg border-2 border-green-500 bg-white p-3 text-slate-800 shadow-lg resize-y focus:outline-none focus:ring-2 focus:ring-green-400",
            className
          )}
        />
      ) : (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          className={cn(
            "w-full rounded-lg border-2 border-green-500 bg-white p-2 text-slate-800 shadow-lg focus:outline-none focus:ring-2 focus:ring-green-400",
            className
          )}
        />
      )}
      <div className="flex items-center gap-2 mt-1.5">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={cancel}
          className="inline-flex items-center gap-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <X className="h-3 w-3" /> Cancel
        </button>
        {multiline && (
          <span className="text-xs text-slate-400 ml-1">Ctrl+Enter to save · Esc to cancel</span>
        )}
      </div>
    </span>
  );
}
