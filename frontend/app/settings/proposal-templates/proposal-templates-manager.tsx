"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { LayoutTemplate, Trash2, Image as ImageIcon, FileText, AlertCircle, Filter, FileCode, Settings2 } from "lucide-react";

type ImagePlaceholder = {
  key: string;
  label: string;
  type?: string;
  prompt_hint?: string;
  required?: boolean;
};

type TemplateContent = {
  sections?: string[];
  default_content?: Record<string, unknown>;
  image_placeholders?: ImagePlaceholder[];
};

type Template = {
  id: string;
  name: string;
  description?: string | null;
  industry?: string | null;
  preset_id?: string | null;
  use_count?: number;
  is_default?: boolean;
  content: TemplateContent | string;
  source_type?: "sections" | "html";
  placeholder_config?: unknown[];
};

function parseContent(c: TemplateContent | string): TemplateContent {
  if (typeof c === "string") {
    try {
      return JSON.parse(c) as TemplateContent;
    } catch {
      return {};
    }
  }
  return c ?? {};
}

export function ProposalTemplatesManager({
  initialTemplates,
  migrationPending,
}: {
  initialTemplates: Record<string, unknown>[];
  migrationPending: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>(initialTemplates as unknown as Template[]);
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const industries = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => t.industry && set.add(t.industry));
    return Array.from(set).sort();
  }, [templates]);

  const visible = templates.filter((t) =>
    industryFilter === "all" ? true : (t.industry ?? "") === industryFilter,
  );

  async function remove(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/proposal-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast({ variant: "success", title: "Template removed" });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Delete failed", description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(null);
    }
  }

  if (migrationPending) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Database migration required</p>
          <p className="text-sm text-amber-700 mt-1">
            Run <code>0025</code> (proposal_templates) and <code>0039_proposal_templates_industry.sql</code> in the
            Supabase SQL Editor to enable presentation templates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {templates.length} template{templates.length === 1 ? "" : "s"} · save from any proposal via “Salvar como
          template”.
        </p>
        {industries.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
              className="text-xs border rounded-md px-2 py-1.5 bg-background"
            >
              <option value="all">All industries</option>
              {industries.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visible.map((t) => {
          const isHtml = t.source_type === "html";
          const content = parseContent(t.content);
          const placeholders = isHtml
            ? (t.placeholder_config as { token: string; kind: string }[] | undefined) ?? []
            : content.image_placeholders ?? [];
          const sections = content.sections ?? [];
          const imageSlotCount = isHtml
            ? placeholders.filter((p) => (p as { kind?: string }).kind === "image").length
            : placeholders.length;
          return (
            <div key={t.id} className="rounded-xl border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isHtml ? (
                    <FileCode className="h-4 w-4 text-violet-500" />
                  ) : (
                    <LayoutTemplate className="h-4 w-4 text-primary" />
                  )}
                  <span className="font-medium text-sm">{t.name}</span>
                  {t.is_default && (
                    <Badge variant="outline" className="text-[9px]">
                      Default
                    </Badge>
                  )}
                  {isHtml && (
                    <Badge variant="secondary" className="text-[9px]">
                      HTML
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isHtml && (
                    <Link href={`/settings/proposal-templates/${t.id}`}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                        <Settings2 className="h-3.5 w-3.5" /> Configure &amp; render
                      </Button>
                    </Link>
                  )}
                  <button
                    onClick={() => remove(t.id)}
                    disabled={busy === t.id}
                    className="text-red-500 hover:text-red-700 disabled:opacity-50"
                    title="Remove template"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}

              <div className="flex flex-wrap items-center gap-1.5">
                {t.industry && (
                  <Badge variant="secondary" className="text-[10px]">
                    {t.industry}
                  </Badge>
                )}
                {!isHtml && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" /> {sections.length} page{sections.length === 1 ? "" : "s"}
                  </span>
                )}
                {imageSlotCount > 0 && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" /> {imageSlotCount} image slot
                    {imageSlotCount === 1 ? "" : "s"}
                  </span>
                )}
                {typeof t.use_count === "number" && t.use_count > 0 && (
                  <span className="text-[11px] text-muted-foreground">· used {t.use_count}×</span>
                )}
              </div>

              {!isHtml && placeholders.length > 0 && (
                <div className="pt-1 space-y-1">
                  {(placeholders as ImagePlaceholder[]).map((p) => (
                    <div key={p.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <ImageIcon className="h-3 w-3 text-primary/60" />
                      <span className="font-medium text-foreground/80">{p.label}</span>
                      {p.type && <span className="capitalize">· {p.type}</span>}
                      {p.required && <span className="text-amber-600">· required</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full text-center py-8">
            No templates yet. Open a proposal and click <strong>Salvar como template</strong> to create one.
          </p>
        )}
      </div>
    </div>
  );
}
