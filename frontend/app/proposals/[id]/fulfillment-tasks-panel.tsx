"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  status: "pending" | "done";
  created_at: string;
  completed_at: string | null;
}

export function FulfillmentTasksPanel({ proposalId, initialTasks }: { proposalId: string; initialTasks: Task[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [busyId, setBusyId] = useState<string | null>(null);

  const doneCount = tasks.filter((t) => t.status === "done").length;

  async function toggle(task: Task) {
    const nextStatus = task.status === "done" ? "pending" : "done";
    setBusyId(task.id);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      const res = await fetch(`/api/proposals/${proposalId}/fulfillment-tasks`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: task.id, status: nextStatus }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      // Revert on failure
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Progress</span>
        <span className="font-medium">{doneCount}/{tasks.length}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-green-500 transition-[width]"
          style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%` }}
        />
      </div>
      <div className="space-y-1 pt-1">
        {tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => toggle(task)}
            disabled={busyId === task.id}
            className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50 transition-colors disabled:opacity-60"
          >
            {task.status === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <Circle className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
            )}
            <span className={cn("text-xs", task.status === "done" ? "text-muted-foreground line-through" : "text-slate-700")}>
              {task.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
