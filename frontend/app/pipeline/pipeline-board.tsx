"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GripVertical } from "lucide-react";
import { useToast } from "@/components/ui/toaster";

type Stage = { key: string; label: string; color: string; border: string };

type PipelineCompany = {
  id: string; company_name: string; industry?: string | null; status?: string | null;
  pipeline_stage?: string | null; updated_at?: string | null;
};

export function PipelineBoard({
  initialCompanies,
  stages,
}: {
  initialCompanies: PipelineCompany[];
  stages: Stage[];
}) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const stageGroups = stages.reduce<Record<string, PipelineCompany[]>>((acc, s) => {
    acc[s.key] = companies.filter((c) => c.pipeline_stage === s.key);
    return acc;
  }, {});

  const activeCompany = companies.find((c) => c.id === activeId) ?? null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const companyId = String(active.id);
    const newStage = String(over.id);
    const company = companies.find((c) => c.id === companyId);
    if (!company || company.pipeline_stage === newStage) return;

    const previousStage = company.pipeline_stage;
    setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, pipeline_stage: newStage } : c)));

    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_stage: newStage }),
      });
      if (!res.ok) throw new Error("Failed to update stage");
    } catch {
      setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, pipeline_stage: previousStage } : c)));
      toast({ title: "Couldn't move lead", description: "The stage change didn't save — try again.", variant: "destructive" });
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* Found in the 2026-09-23 UX audit: this rendered as full-width
          sections stacked vertically down the page (a 36,000px-tall
          document with most of 540 leads in one stage), directly
          contradicting its own "Kanban board... drag a card between
          stages" copy. Real side-by-side columns now, each independently
          scrollable so one heavily-loaded stage (534 of 540 leads sit in
          "prospect" today) doesn't blow out the page height — it just
          scrolls within its own column, same as Trello/Pipedrive. */}
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {stages
          .filter((s) => s.key !== "closed_lost" || stageGroups["closed_lost"].length > 0)
          .map((stage) => {
            const stageCompanies = stageGroups[stage.key] || [];
            if (stageCompanies.length === 0 && stage.key === "closed_won") return null;
            return <StageColumn key={stage.key} stage={stage} companies={stageCompanies} />;
          })}
      </div>

      <DragOverlay>
        {activeCompany ? (
          <div className="rounded-md border bg-background shadow-lg p-3 w-72">
            <p className="text-sm font-medium truncate">{activeCompany.company_name}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function StageColumn({ stage, companies }: { stage: Stage; companies: PipelineCompany[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });

  return (
    <Card
      ref={setNodeRef}
      className={`w-[300px] flex-shrink-0 flex flex-col max-h-[calc(100vh-320px)] min-h-[200px] ${isOver ? "ring-2 ring-primary/50 transition-shadow" : "transition-shadow"}`}
    >
      <CardHeader className="pb-2 flex-shrink-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${stage.color}`}>{stage.label}</span>
          <span className="text-muted-foreground">({companies.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 flex-1 overflow-y-auto min-h-0">
        {companies.length > 0 ? (
          <div className="divide-y">
            {companies.map((company) => (
              <DraggableCompanyRow key={company.id} company={company} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">Drop a lead here to move it to this stage</p>
        )}
      </CardContent>
    </Card>
  );
}

function DraggableCompanyRow({ company }: { company: PipelineCompany }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: company.id });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`py-2.5 flex items-start gap-1.5 bg-background ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
        aria-label={`Drag ${company.company_name} to another stage`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <Link href={`/companies/${company.id}`} className="text-sm font-medium truncate hover:underline text-primary block">
          {company.company_name}
        </Link>
        <div className="flex items-center gap-1 flex-wrap mt-0.5">
          {company.industry && <Badge variant="outline" className="text-[10px] capitalize shrink-0 px-1.5 py-0">{company.industry}</Badge>}
          {company.status && <span className="text-[10px] text-muted-foreground capitalize">{company.status}</span>}
        </div>
      </div>
    </div>
  );
}
