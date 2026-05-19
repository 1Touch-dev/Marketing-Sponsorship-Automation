"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  arrayMove, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import {
  GripVertical, Sparkles, Loader2, ChevronDown, ChevronUp,
  Trash2, Copy, Lock, Unlock, Plus, Save, RotateCcw,
  Check, Eye, EyeOff,
} from "lucide-react";

type Section = {
  id: string;
  title: string;
  icon: string;
  content: string;
  isLocked?: boolean;
  isHidden?: boolean;
  isCollapsed?: boolean;
  isSaving?: boolean;
  hasUnsaved?: boolean;
};

type VariantOption = { label: string; text: string; style: string };

type Props = {
  proposalId: string;
  initialSections: Section[];
  companyName: string;
  industry: string;
  campaignTitle: string;
  proposalTitle: string;
};

function SortableSection({
  section, onUpdate, onRegenerate, onDuplicate, onDelete, onToggleLock,
  onToggleHide, onToggleCollapse, companyName, industry, campaignTitle,
}: {
  section: Section;
  onUpdate: (id: string, content: string) => void;
  onRegenerate: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string) => void;
  onToggleHide: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  companyName: string;
  industry: string;
  campaignTitle: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [showVariants, setShowVariants] = useState(false);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fetchVariants() {
    setLoadingVariants(true);
    setShowVariants(true);
    try {
      const res = await fetch(`/api/proposals/${section.id}/section-variants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          section: section.id,
          company_name: companyName,
          industry,
          campaign_title: campaignTitle,
          current_text: section.content.slice(0, 400),
        }),
      });
      const data = await res.json() as VariantOption[] | { variants?: VariantOption[] };
      setVariants(Array.isArray(data) ? data : (data as { variants?: VariantOption[] }).variants ?? []);
    } catch { /* */ } finally {
      setLoadingVariants(false);
    }
  }

  function handleContentChange(val: string) {
    onUpdate(section.id, val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onRegenerate(section.id + "_autosave");
    }, 3000);
  }

  if (section.isHidden) {
    return (
      <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/30 px-4 py-3 opacity-60">
        <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground"><GripVertical className="h-4 w-4" /></div>
        <span className="text-sm text-muted-foreground">{section.icon} {section.title} <span className="italic">(hidden)</span></span>
        <Button size="sm" variant="ghost" onClick={() => onToggleHide(section.id)} className="ml-auto h-7 px-2 gap-1 text-xs"><Eye className="h-3 w-3" /> Show</Button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className={`rounded-xl border bg-card shadow-sm transition-all ${isDragging ? "shadow-lg ring-2 ring-primary/30" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/20 rounded-t-xl">
        <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground transition-colors">
          <GripVertical className="h-4 w-4" />
        </div>
        <span className="text-sm">{section.icon}</span>
        <span className="font-medium text-sm flex-1">{section.title}</span>

        {/* Status indicators */}
        {section.hasUnsaved && <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">unsaved</span>}
        {section.isSaving && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" /> saving</span>}
        {section.isLocked && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">locked</span>}

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-500" onClick={fetchVariants} title="Generate A/B/C variants">
            <Sparkles className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => onToggleLock(section.id)} title={section.isLocked ? "Unlock" : "Lock"}>
            {section.isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => onToggleHide(section.id)} title="Hide section">
            <EyeOff className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => onDuplicate(section.id)} title="Duplicate">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-500" onClick={() => onDelete(section.id)} title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => onToggleCollapse(section.id)}>
            {section.isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Body */}
      {!section.isCollapsed && (
        <div className="p-4 space-y-3">
          <Textarea
            value={section.content}
            onChange={e => handleContentChange(e.target.value)}
            readOnly={section.isLocked}
            rows={Math.max(4, Math.min(16, Math.ceil(section.content.length / 80)))}
            className={`resize-none font-mono text-xs leading-relaxed ${section.isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
            placeholder={`Content for ${section.title}...`}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{section.content.length} chars · {section.content.split(/\s+/).filter(Boolean).length} words</span>
            {!section.isLocked && (
              <Button size="sm" variant="ghost" className="h-6 px-2 gap-1 text-xs" onClick={fetchVariants}>
                <Sparkles className="h-3 w-3 text-amber-400" /> Generate A/B/C options
              </Button>
            )}
          </div>

          {/* Variant picker */}
          {showVariants && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">AI Variants — pick one or close</span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setShowVariants(false)}>Close</Button>
              </div>
              {loadingVariants ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Generating 3 variants…
                </div>
              ) : (
                <div className="space-y-2">
                  {variants.map((v, i) => (
                    <div key={i} className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-primary">{v.label ?? `Option ${String.fromCharCode(65+i)}`}</span>
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1" onClick={() => { onUpdate(section.id, v.text); setShowVariants(false); }}>
                          <Check className="h-3 w-3" /> Use this
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-3">{v.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ProposalBlockEditor({ proposalId, initialSections, companyName, industry, campaignTitle, proposalTitle }: Props) {
  const { toast } = useToast();
  const [sections, setSections] = useState<Section[]>(initialSections.map(s => ({ ...s, isCollapsed: false })));
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSections(secs => {
        const oldIndex = secs.findIndex(s => s.id === active.id);
        const newIndex = secs.findIndex(s => s.id === over.id);
        return arrayMove(secs, oldIndex, newIndex);
      });
    }
  }

  const updateSection = useCallback((id: string, content: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, content, hasUnsaved: true } : s));
  }, []);

  const autosave = useCallback((idOrAction: string) => {
    // autosave placeholder — real save on "Save All"
  }, []);

  const duplicateSection = useCallback((id: string) => {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], id: `${id}_copy_${Date.now()}`, title: `${prev[idx].title} (copy)`, hasUnsaved: true };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }, []);

  const deleteSection = useCallback((id: string) => {
    setSections(prev => prev.filter(s => s.id !== id));
  }, []);

  const toggleLock = useCallback((id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, isLocked: !s.isLocked } : s));
  }, []);

  const toggleHide = useCallback((id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, isHidden: !s.isHidden } : s));
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, isCollapsed: !s.isCollapsed } : s));
  }, []);

  const collapseAll = () => setSections(prev => prev.map(s => ({ ...s, isCollapsed: true })));
  const expandAll = () => setSections(prev => prev.map(s => ({ ...s, isCollapsed: false })));

  function addSection() {
    const newId = `custom_${Date.now()}`;
    setSections(prev => [...prev, {
      id: newId, title: "Custom Section", icon: "📝", content: "", hasUnsaved: true,
    }]);
  }

  async function saveAll() {
    setIsSaving(true);
    try {
      const content: Record<string, string> = {};
      for (const s of sections) {
        if (!s.isHidden) content[s.id] = s.content;
      }
      const sectionOrder = sections.map(s => s.id);

      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: { ...content, _section_order: sectionOrder, _editor: "blocks" },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSections(prev => prev.map(s => ({ ...s, hasUnsaved: false })));
      setLastSaved(new Date());
      toast({ variant: "success", title: "Saved", description: "All sections saved to proposal." });
    } catch {
      toast({ variant: "destructive", title: "Save failed", description: "Could not save sections." });
    } finally {
      setIsSaving(false);
    }
  }

  const hasUnsaved = sections.some(s => s.hasUnsaved);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
      {/* Outline sidebar */}
      <div className="hidden lg:block">
        <div className="sticky top-6 rounded-xl border bg-card p-3 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground px-2 py-1">SECTIONS</div>
          {sections.map((s, i) => (
            <button
              key={s.id}
              onClick={() => document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth" })}
              className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-1.5 ${s.isHidden ? "opacity-40" : "hover:bg-accent"}`}
            >
              <span className="text-[10px]">{i + 1}.</span>
              <span>{s.icon}</span>
              <span className="truncate">{s.title}</span>
              {s.hasUnsaved && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
              {s.isLocked && <Lock className="h-2.5 w-2.5 text-blue-400 flex-shrink-0" />}
            </button>
          ))}
          <div className="border-t pt-2 mt-2 space-y-1">
            <Button size="sm" variant="ghost" onClick={collapseAll} className="w-full justify-start h-7 text-xs gap-1.5">
              <ChevronUp className="h-3 w-3" /> Collapse all
            </Button>
            <Button size="sm" variant="ghost" onClick={expandAll} className="w-full justify-start h-7 text-xs gap-1.5">
              <ChevronDown className="h-3 w-3" /> Expand all
            </Button>
          </div>
        </div>
      </div>

      {/* Blocks */}
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
          <div className="text-sm font-medium truncate max-w-[60%]">{proposalTitle}</div>
          <div className="flex items-center gap-2">
            {lastSaved && <span className="text-xs text-muted-foreground">Saved {lastSaved.toLocaleTimeString()}</span>}
            {hasUnsaved && <span className="text-xs text-amber-500">Unsaved changes</span>}
            <Button size="sm" variant="outline" onClick={addSection} className="h-7 px-2 gap-1 text-xs">
              <Plus className="h-3 w-3" /> Add section
            </Button>
            <Button size="sm" onClick={saveAll} disabled={isSaving || !hasUnsaved} className="h-7 px-3 gap-1 text-xs">
              {isSaving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving</> : <><Save className="h-3 w-3" /> Save all</>}
            </Button>
          </div>
        </div>

        {/* DnD sortable sections */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {sections.map(s => (
                <div key={s.id} id={`section-${s.id}`}>
                  <SortableSection
                    section={s}
                    onUpdate={updateSection}
                    onRegenerate={autosave}
                    onDuplicate={duplicateSection}
                    onDelete={deleteSection}
                    onToggleLock={toggleLock}
                    onToggleHide={toggleHide}
                    onToggleCollapse={toggleCollapse}
                    companyName={companyName}
                    industry={industry}
                    campaignTitle={campaignTitle}
                  />
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {sections.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm border rounded-xl">
            No sections yet. <button onClick={addSection} className="text-primary underline">Add a section</button>
          </div>
        )}
      </div>
    </div>
  );
}
