"use client";

import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Play, CheckCircle2, XCircle, Loader2, Clock,
  Mail, Send, Users, Linkedin, BarChart2, FileText,
  ChevronDown, ChevronUp, ExternalLink, StopCircle,
} from "lucide-react";
import type { AgentMode, SSEEvent, AgentResult, AgentStep } from "@/lib/agents/types";

type StepDisplay = {
  step: number;
  tool: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  label: string;
  result?: Record<string, unknown>;
};

type PanelState =
  | { phase: "idle" }
  | { phase: "running"; run_id: string; steps: StepDisplay[]; company_name: string }
  | { phase: "paused"; run_id: string; steps: StepDisplay[]; email_id: string; email_subject: string; email_preview: string; recipient: string; recipient_name: string }
  | { phase: "done"; run_id: string; steps: StepDisplay[]; result: AgentResult; summary: string }
  | { phase: "error"; message: string; run_id?: string; steps: StepDisplay[] };

const TOOL_ICON: Record<string, React.ReactNode> = {
  enrich_contacts: <Users className="h-3.5 w-3.5" />,
  scrape_company_intelligence: <Linkedin className="h-3.5 w-3.5" />,
  get_or_create_proposal: <FileText className="h-3.5 w-3.5" />,
  generate_outreach_email: <Mail className="h-3.5 w-3.5" />,
  send_email: <Send className="h-3.5 w-3.5" />,
};

const STEP_ORDER = [
  "enrich_contacts",
  "scrape_company_intelligence",
  "get_or_create_proposal",
  "generate_outreach_email",
  "send_email",
];

export function OutreachAgentPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [mode, setMode] = useState<AgentMode>("supervised");
  const [panelState, setPanelState] = useState<PanelState>({ phase: "idle" });
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const startAgent = useCallback(async () => {
    abortRef.current = new AbortController();
    setPanelState({ phase: "running", run_id: "", steps: [], company_name: companyName });
    setExpanded(true);

    try {
      const response = await fetch("/api/agents/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, mode }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }));
        setPanelState({ phase: "error", message: err.error ?? "Failed to start agent", steps: [] });
        return;
      }

      const runId = response.headers.get("X-Agent-Run-Id") ?? "";
      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      const updateSteps = (steps: StepDisplay[]) =>
        setPanelState((prev) =>
          prev.phase === "running" || prev.phase === "paused"
            ? { ...prev, steps }
            : prev
        );

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));
            handleEvent(event, runId, updateSteps);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setPanelState((prev) => ({
        phase: "error",
        message: err instanceof Error ? err.message : "Connection failed",
        steps: "steps" in prev ? prev.steps : [],
      }));
    }
  }, [companyId, companyName, mode]);

  const handleEvent = (event: SSEEvent, runId: string, updateSteps: (s: StepDisplay[]) => void) => {
    if (event.type === "started") {
      setPanelState({ phase: "running", run_id: runId || event.run_id, steps: [], company_name: event.company_name });
    }

    if (event.type === "step") {
      setPanelState((prev) => {
        const steps = "steps" in prev ? [...prev.steps] : [];
        const idx = steps.findIndex((s) => s.tool === event.tool && s.status === "running");
        const newStep: StepDisplay = {
          step: event.step,
          tool: event.tool,
          status: event.status,
          label: event.label,
          result: event.result,
        };
        if (idx >= 0) steps[idx] = newStep;
        else steps.push(newStep);
        return prev.phase !== "idle" ? { ...prev, steps } : prev;
      });
    }

    if (event.type === "paused") {
      setPanelState((prev) => ({
        phase: "paused",
        run_id: runId,
        steps: "steps" in prev ? prev.steps : [],
        email_id: event.email_id,
        email_subject: event.email_subject,
        email_preview: event.email_preview,
        recipient: event.recipient,
        recipient_name: event.recipient_name,
      }));
    }

    if (event.type === "done") {
      setPanelState((prev) => ({
        phase: "done",
        run_id: event.run_id,
        steps: "steps" in prev ? prev.steps : [],
        result: event.result,
        summary: event.summary,
      }));
    }

    if (event.type === "error") {
      setPanelState((prev) => ({
        phase: "error",
        message: event.message,
        run_id: event.run_id,
        steps: "steps" in prev ? prev.steps : [],
      }));
    }
  };

  const cancelRun = async () => {
    abortRef.current?.abort();
    if (panelState.phase === "running" && panelState.run_id) {
      await fetch(`/api/agents/outreach/${panelState.run_id}`, { method: "DELETE" });
    }
    setPanelState({ phase: "idle" });
  };

  const approveAndSend = async () => {
    if (panelState.phase !== "paused") return;
    setApproving(true);
    try {
      const res = await fetch(`/api/agents/outreach/${panelState.run_id}/approve`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setPanelState((prev) => {
          if (prev.phase !== "paused") return prev;
          const sendStep: StepDisplay = {
            step: prev.steps.length + 1,
            tool: "send_email",
            status: data.success ? "done" : "error",
            label: data.summary,
          };
          return {
            phase: "done",
            run_id: prev.run_id,
            steps: [...prev.steps, sendStep],
            result: { pipedrive_activity_id: data.pipedrive_activity_id ?? null },
            summary: data.summary,
          };
        });
      } else {
        alert(`Send failed: ${data.error}`);
      }
    } finally {
      setApproving(false);
    }
  };

  const resetPanel = () => setPanelState({ phase: "idle" });

  const steps = "steps" in panelState ? panelState.steps : [];
  const isRunning = panelState.phase === "running";
  const isPaused = panelState.phase === "paused";
  const isDone = panelState.phase === "done";
  const isError = panelState.phase === "error";
  const isIdle = panelState.phase === "idle";

  return (
    <Card className="border-2 border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50/50 to-white dark:from-violet-950/20 dark:to-background">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
              <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Outreach Agent</CardTitle>
              <p className="text-xs text-muted-foreground">One-click full outreach pipeline</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isIdle && (
              <>
                <div className="flex items-center gap-1 text-xs border rounded-md overflow-hidden">
                  <button
                    onClick={() => setMode("supervised")}
                    className={`px-2.5 py-1.5 transition-colors ${mode === "supervised" ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    Supervised
                  </button>
                  <button
                    onClick={() => setMode("auto")}
                    className={`px-2.5 py-1.5 transition-colors ${mode === "auto" ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    Auto
                  </button>
                </div>
                <Button size="sm" onClick={startAgent} className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
                  <Play className="h-3.5 w-3.5" />
                  Run Agent
                </Button>
              </>
            )}

            {isRunning && (
              <Button size="sm" variant="outline" onClick={cancelRun} className="gap-1.5 text-destructive border-destructive/30">
                <StopCircle className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}

            {(isDone || isError || isPaused) && (
              <Button size="sm" variant="outline" onClick={resetPanel}>
                New Run
              </Button>
            )}

            {steps.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)} className="text-muted-foreground">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* Status badges */}
        {isRunning && (
          <div className="flex items-center gap-1.5 mt-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
            <span className="text-xs text-violet-700 dark:text-violet-400">Running in {mode} mode…</span>
          </div>
        )}
        {isPaused && (
          <div className="flex items-center gap-1.5 mt-1">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs text-amber-700 dark:text-amber-400">Waiting for your approval before sending</span>
          </div>
        )}
        {isDone && (
          <div className="flex items-center gap-1.5 mt-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <span className="text-xs text-green-700 dark:text-green-400">
              {panelState.phase === "done" ? panelState.summary : "Completed"}
            </span>
          </div>
        )}
        {isError && (
          <div className="flex items-center gap-1.5 mt-1">
            <XCircle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-xs text-destructive">{panelState.phase === "error" ? panelState.message : ""}</span>
          </div>
        )}
      </CardHeader>

      {(expanded || isPaused || isDone) && (
        <CardContent className="pt-0 space-y-3">
          {/* Step progress */}
          {steps.length > 0 && (
            <div className="space-y-1.5">
              {steps.map((step) => (
                <div key={`${step.tool}-${step.step}`} className="flex items-start gap-2 text-xs">
                  <div className="mt-0.5 flex-shrink-0">
                    {step.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />}
                    {step.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                    {step.status === "error" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                    {step.status === "skipped" && <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                    {step.status === "pending" && <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />}
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-muted-foreground flex-shrink-0">{TOOL_ICON[step.tool]}</span>
                    <span className={`truncate ${step.status === "running" ? "text-violet-700 dark:text-violet-300 font-medium" : step.status === "error" ? "text-destructive" : "text-foreground"}`}>
                      {step.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending steps (visual only when running) */}
          {isRunning && (
            <div className="space-y-1.5">
              {STEP_ORDER.filter((tool) => !steps.some((s) => s.tool === tool)).map((tool, i) => (
                <div key={tool} className="flex items-center gap-2 text-xs opacity-40">
                  <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                  <span className="text-muted-foreground">{TOOL_ICON[tool]}</span>
                  <span className="text-muted-foreground capitalize">{tool.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          )}

          {/* Email approval panel (supervised mode) */}
          {isPaused && panelState.phase === "paused" && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">Email Draft Ready — Review Before Sending</span>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-14 flex-shrink-0">To:</span>
                  <span className="font-medium">
                    {panelState.recipient_name ? `${panelState.recipient_name} ` : ""}
                    <span className="text-violet-700 dark:text-violet-400">&lt;{panelState.recipient}&gt;</span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-14 flex-shrink-0">Subject:</span>
                  <span className="font-medium">{panelState.email_subject}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-14 flex-shrink-0">Preview:</span>
                  <span className="text-muted-foreground italic line-clamp-2">{panelState.email_preview}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={approveAndSend}
                  disabled={approving}
                  className="bg-green-600 hover:bg-green-700 text-white gap-1.5 flex-1"
                >
                  {approving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {approving ? "Sending…" : "Approve & Send"}
                </Button>
                <Button size="sm" variant="outline" onClick={cancelRun} className="gap-1.5">
                  Discard
                </Button>
              </div>
            </div>
          )}

          {/* Done summary */}
          {isDone && panelState.phase === "done" && (
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs font-semibold text-green-800 dark:text-green-300">Outreach Complete</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {panelState.result.contacts_found !== undefined && (
                  <>
                    <span className="text-muted-foreground">Contacts found</span>
                    <span className="font-medium">{panelState.result.contacts_found}</span>
                  </>
                )}
                {panelState.result.proposal_title && (
                  <>
                    <span className="text-muted-foreground">Proposal used</span>
                    <span className="font-medium truncate">{panelState.result.proposal_title}</span>
                  </>
                )}
                {panelState.result.recipient && (
                  <>
                    <span className="text-muted-foreground">Sent to</span>
                    <span className="font-medium truncate">{panelState.result.recipient}</span>
                  </>
                )}
                {panelState.result.pipedrive_activity_id && (
                  <>
                    <span className="text-muted-foreground">Pipedrive activity</span>
                    <span className="font-medium">#{panelState.result.pipedrive_activity_id}</span>
                  </>
                )}
                {panelState.result.total_tokens && (
                  <>
                    <span className="text-muted-foreground">Tokens used</span>
                    <span className="font-medium">{panelState.result.total_tokens.toLocaleString()}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Mode info */}
          {isIdle && (
            <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
              <p className="font-medium">What this agent does:</p>
              <ol className="space-y-0.5 list-decimal list-inside">
                <li>Finds decision maker emails (Hunter.io)</li>
                <li>Scrapes LinkedIn + ad campaign signals (Apify)</li>
                <li>Fetches or auto-approves existing proposal</li>
                <li>Generates personalised PT-BR email (Bedrock)</li>
                <li className={mode === "supervised" ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
                  {mode === "supervised" ? "⏸ Pauses for your approval before sending" : "Auto-sends via Pipedrive"}
                </li>
              </ol>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
