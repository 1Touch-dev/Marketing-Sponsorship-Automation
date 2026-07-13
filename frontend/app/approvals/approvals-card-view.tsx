"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Check, X, Pencil, ChevronLeft, ChevronRight, Mail, Loader2, ExternalLink, PartyPopper, Building2, Keyboard } from "lucide-react";

export type ApprovalItem = {
  id: string;
  type: "proposal" | "campaign" | "email";
  title: string;
  company: string;
  status: string;
  preview?: string;
  editUrl: string;
};

type EmailTemplate = {
  id: string;
  name: string;
  subject_template: string;
};

type Props = {
  items: ApprovalItem[];
};

type DecisionMap = Record<string, "approved" | "rejected">;
type QueueTab = "all" | "proposal" | "campaign" | "email";

export function ApprovalsCardView({ items }: Props) {
  const [queueTab, setQueueTab] = useState<QueueTab>("all");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [decisions, setDecisions] = useState<DecisionMap>({});
  const [loading, setLoading] = useState(false);

  // Email template picker
  const [showEmailPicker, setShowEmailPicker] = useState(false);
  const [approvedItem, setApprovedItem] = useState<ApprovalItem | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  // Drag/swipe state
  const [dragDelta, setDragDelta] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const cardRef = useRef<HTMLDivElement>(null);

  // Queue filtering by tab
  const queueItems = queueTab === "all" ? items : items.filter(i => i.type === queueTab);

  const currentItem = queueItems[currentIndex] ?? null;
  const reviewedCount = queueItems.filter(i => reviewed.has(i.id)).length;
  const allDone = reviewedCount === queueItems.length && queueItems.length > 0;

  const approvedCount = Object.values(decisions).filter((d) => d === "approved").length;
  const rejectedCount = Object.values(decisions).filter((d) => d === "rejected").length;

  const typeCountMap: Record<QueueTab, number> = {
    all: items.length,
    proposal: items.filter(i => i.type === "proposal").length,
    campaign: items.filter(i => i.type === "campaign").length,
    email: items.filter(i => i.type === "email").length,
  };

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, queueItems.length - 1));
    setDragDelta(0);
  }, [queueItems.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
    setDragDelta(0);
  }, []);

  // Reset index when tab changes
  useEffect(() => {
    setCurrentIndex(0);
    setDragDelta(0);
  }, [queueTab]);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/email-templates");
      if (res.ok) {
        const json = await res.json();
        const arr = Array.isArray(json) ? json : (json.data ?? []);
        setEmailTemplates(arr);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const handleAction = useCallback(
    async (action: "approved" | "rejected") => {
      if (!currentItem || loading) return;
      setLoading(true);
      setIsAnimating(true);

      const apiMap: Record<ApprovalItem["type"], string> = {
        proposal: `/api/proposals/${currentItem.id}/approve`,
        campaign: `/api/campaigns/${currentItem.id}/status`,
        email: `/api/emails/${currentItem.id}/status`,
      };

      const bodyMap: Record<ApprovalItem["type"], object> = {
        proposal: { decision: action === "approved" ? "approve" : "reject" },
        campaign: { status: action },
        email: { status: action },
      };

      try {
        const res = await fetch(apiMap[currentItem.type], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyMap[currentItem.type]),
        });

        if (res.ok) {
          setReviewed((prev) => new Set(prev).add(currentItem.id));
          setDecisions((prev) => ({ ...prev, [currentItem.id]: action }));

          setTimeout(() => {
            setIsAnimating(false);
            setDragDelta(0);
            if (action === "approved" && currentItem.type === "proposal") {
              setApprovedItem(currentItem);
              setShowEmailPicker(true);
              void fetchTemplates();
            } else if (currentIndex < queueItems.length - 1) {
              goNext();
            }
          }, 300);
        } else {
          setIsAnimating(false);
          setDragDelta(0);
        }
      } catch {
        setIsAnimating(false);
        setDragDelta(0);
      } finally {
        setLoading(false);
      }
    },
    [currentItem, currentIndex, queueItems.length, goNext, loading, fetchTemplates],
  );

  const handleSendEmail = useCallback(async () => {
    if (!approvedItem || !selectedTemplate) return;
    setSendingEmail(true);
    try {
      const genRes = await fetch(`/api/proposals/${approvedItem.id}/generate-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: selectedTemplate }),
      });
      if (!genRes.ok) throw new Error("Failed to generate email");
      const genData = await genRes.json();
      const emailId = genData.email_id ?? genData.id;

      if (emailId) {
        await fetch(`/api/emails/${emailId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "send" }),
        });
      }

      setShowEmailPicker(false);
      if (currentIndex < queueItems.length - 1) goNext();
    } catch {
      // silently fail
    } finally {
      setSendingEmail(false);
    }
  }, [approvedItem, selectedTemplate, currentIndex, queueItems.length, goNext]);

  const handleEdit = useCallback(() => {
    if (!currentItem) return;
    window.open(currentItem.editUrl, "_blank");
  }, [currentItem]);

  // Mouse drag handlers for visual feedback
  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
  };

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setDragDelta(e.clientX - dragStartX.current);
  }, []);

  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (dragDelta > 80) {
      void handleAction("approved");
    } else if (dragDelta < -80) {
      void handleAction("rejected");
    } else {
      setDragDelta(0);
    }
  }, [dragDelta, handleAction]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't fire when typing in inputs
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (showEmailPicker) {
        if (e.key === "Escape") {
          setShowEmailPicker(false);
          if (currentIndex < queueItems.length - 1) goNext();
        }
        return;
      }
      if (e.key === "ArrowRight" || e.key === "l" || e.key === "L") void handleAction("approved");
      if (e.key === "ArrowLeft" || e.key === "j" || e.key === "J") void handleAction("rejected");
      if (e.key === "e" || e.key === "E") handleEdit();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, handleAction, handleEdit, showEmailPicker, currentIndex, queueItems.length]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nenhum item para revisar.
      </div>
    );
  }

  // "Review Complete!" summary state
  if (allDone) {
    return (
      <div className="flex flex-col items-center gap-6 py-10">
        <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
          <PartyPopper className="h-10 w-10 text-emerald-600" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Review Complete!</h2>
          <p className="text-muted-foreground">You've reviewed all {queueItems.length} item{queueItems.length !== 1 ? "s" : ""} in this queue.</p>
        </div>
        <div className="flex gap-6">
          <div className="flex flex-col items-center gap-1">
            <span className="text-3xl font-bold text-emerald-600">{approvedCount}</span>
            <span className="text-sm text-muted-foreground">Approved</span>
          </div>
          <div className="w-px bg-border" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-3xl font-bold text-red-500">{rejectedCount}</span>
            <span className="text-sm text-muted-foreground">Rejected</span>
          </div>
        </div>
        <Button variant="outline" onClick={() => { setReviewed(new Set()); setDecisions({}); setCurrentIndex(0); }}>
          Review Again
        </Button>
      </div>
    );
  }

  const typeLabel: Record<ApprovalItem["type"], string> = {
    proposal: "Proposal",
    campaign: "Campaign",
    email: "Email",
  };

  const typeBadgeColor: Record<ApprovalItem["type"], string> = {
    proposal: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    campaign: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    email: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  };

  const dragPercent = Math.min(Math.abs(dragDelta) / 100, 1);
  const isSwipingRight = dragDelta > 10;
  const isSwipingLeft = dragDelta < -10;

  const tabLabels: Array<{ key: QueueTab; label: string }> = [
    { key: "all", label: "All" },
    { key: "proposal", label: "Proposals" },
    { key: "campaign", label: "Campaigns" },
    { key: "email", label: "Emails" },
  ];

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      {/* Email template picker modal */}
      {showEmailPicker && approvedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Proposta aprovada! 🎉</h3>
                <p className="text-xs text-muted-foreground">{approvedItem.title}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Enviar email de outreach agora?
              </p>
              {loadingTemplates ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando templates…
                </div>
              ) : emailTemplates.length > 0 ? (
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecione um template…</option>
                  {emailTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-muted-foreground bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                  Nenhum template disponível.{" "}
                  <a href="/emails" className="text-indigo-600 underline" target="_blank">Criar template →</a>
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowEmailPicker(false);
                  if (currentIndex < queueItems.length - 1) goNext();
                }}
              >
                Pular
              </Button>
              <Button
                asChild
                variant="outline"
                className="gap-1.5"
              >
                <a href={`/proposals/${approvedItem.id}`} target="_blank">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver proposta
                </a>
              </Button>
              <Button
                className="flex-1 gap-1.5"
                onClick={() => void handleSendEmail()}
                disabled={!selectedTemplate || sendingEmail}
              >
                {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Enviar email
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Queue tabs */}
      <div className="w-full max-w-2xl flex items-center gap-1 bg-muted/40 rounded-xl p-1 border">
        {tabLabels.map(tab => (
          <button
            key={tab.key}
            onClick={() => setQueueTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              queueTab === tab.key
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {typeCountMap[tab.key] > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                queueTab === tab.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {typeCountMap[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-2xl space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {reviewedCount} of {queueItems.length} reviewed
          </span>
          <span className="text-muted-foreground text-xs">
            {queueItems.length - reviewedCount} remaining
          </span>
        </div>
        <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${queueItems.length > 0 ? (reviewedCount / queueItems.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon" onClick={goPrev} disabled={currentIndex === 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[60px] text-center">{currentIndex + 1} / {queueItems.length}</span>
        <Button variant="ghost" size="icon" onClick={goNext} disabled={currentIndex === queueItems.length - 1}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Main card with drag and swipe */}
      {currentItem && (
        <div className="relative w-full max-w-2xl">
          {/* Swipe overlays */}
          {isSwipingRight && (
            <div
              className="absolute inset-0 z-10 rounded-xl pointer-events-none flex items-center justify-start pl-8 overflow-hidden"
              style={{ opacity: dragPercent }}
            >
              <div className="absolute inset-0 bg-emerald-500 rounded-xl opacity-20" />
              <div className="relative flex items-center gap-2 bg-emerald-500 text-white font-bold text-lg px-4 py-2 rounded-xl shadow-lg">
                <Check className="h-6 w-6" /> APPROVE
              </div>
            </div>
          )}
          {isSwipingLeft && (
            <div
              className="absolute inset-0 z-10 rounded-xl pointer-events-none flex items-center justify-end pr-8 overflow-hidden"
              style={{ opacity: dragPercent }}
            >
              <div className="absolute inset-0 bg-red-500 rounded-xl opacity-20" />
              <div className="relative flex items-center gap-2 bg-red-500 text-white font-bold text-lg px-4 py-2 rounded-xl shadow-lg">
                REJECT <X className="h-6 w-6" />
              </div>
            </div>
          )}

          <Card
            ref={cardRef}
            className="w-full cursor-grab active:cursor-grabbing hover:shadow-lg"
            style={{
              transform: isAnimating
                ? `translateX(${dragDelta > 0 ? "120%" : "-120%"}) rotate(${dragDelta > 0 ? 15 : -15}deg)`
                : `translateX(${dragDelta}px) rotate(${dragDelta * 0.03}deg)`,
              transition: isDragging.current ? "none" : "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
              opacity: isAnimating ? 0 : 1,
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0].clientX;
              touchStartY.current = e.touches[0].clientY;
            }}
            onTouchMove={(e) => {
              const dx = e.touches[0].clientX - touchStartX.current;
              const dy = e.touches[0].clientY - touchStartY.current;
              if (Math.abs(dx) > Math.abs(dy)) {
                setDragDelta(dx);
              }
            }}
            onTouchEnd={(e) => {
              const dx = e.changedTouches[0].clientX - touchStartX.current;
              const dy = e.changedTouches[0].clientY - touchStartY.current;
              if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
                if (dx > 0) void handleAction("approved");
                else void handleAction("rejected");
              } else {
                setDragDelta(0);
              }
            }}
          >
            <CardHeader className="pb-3">
              {/* Type badge + status row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeBadgeColor[currentItem.type]}`}>
                    {typeLabel[currentItem.type]}
                  </span>
                  <StatusBadge status={currentItem.status} />
                  {reviewed.has(currentItem.id) && (
                    <Badge variant="success">Reviewed</Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{currentIndex + 1}/{queueItems.length}</span>
              </div>

              {/* Company name — prominent */}
              <div className="flex items-center gap-2 mt-3">
                <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <Building2 className="h-4.5 w-4.5 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground leading-none mb-0.5">Company</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-100 leading-tight">{currentItem.company}</p>
                </div>
              </div>

              <CardTitle className="mt-3 text-lg leading-snug">{currentItem.title}</CardTitle>
            </CardHeader>

            {currentItem.preview && (
              <CardContent className="pt-0">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 min-h-[120px] max-h-[240px] overflow-y-auto">
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {currentItem.preview}
                  </p>
                </div>
              </CardContent>
            )}

            <CardFooter className="flex justify-center gap-3 pt-4 pb-6">
              <Button
                variant="destructive"
                size="lg"
                onClick={() => void handleAction("rejected")}
                disabled={loading}
                className="min-w-[120px] gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Reject
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleEdit}
                className="min-w-[110px] gap-2 border-amber-400 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button
                size="lg"
                onClick={() => void handleAction("approved")}
                disabled={loading}
                className="min-w-[120px] gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Approve
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      <p className="text-xs text-muted-foreground text-center flex items-center gap-1 flex-wrap justify-center">
        <Keyboard className="h-3 w-3" />
        <kbd className="border rounded px-1 font-mono">→</kbd> Approve
        {" · "}
        <kbd className="border rounded px-1 font-mono">←</kbd> Reject
        {" · "}
        <kbd className="border rounded px-1 font-mono">E</kbd> Edit
        {" · "}
        Drag card to swipe
      </p>
    </div>
  );
}

