"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Check, X, Pencil, ChevronLeft, ChevronRight, Mail, Loader2, ExternalLink } from "lucide-react";

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

export function ApprovalsCardView({ items }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Email template picker
  const [showEmailPicker, setShowEmailPicker] = useState(false);
  const [approvedItem, setApprovedItem] = useState<ApprovalItem | null>(null);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  const currentItem = items[currentIndex] ?? null;
  const reviewedCount = reviewed.size;

  // Touch/swipe support
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, items.length - 1));
  }, [items.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/email-templates");
      if (res.ok) {
        const json = await res.json();
        // API returns { data: [...] }
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

          // If proposal approved, show email template picker
          if (action === "approved" && currentItem.type === "proposal") {
            setApprovedItem(currentItem);
            setShowEmailPicker(true);
            fetchTemplates();
          } else if (currentIndex < items.length - 1) {
            goNext();
          }
        }
      } catch {
        // silently fail - user can retry
      } finally {
        setLoading(false);
      }
    },
    [currentItem, currentIndex, items.length, goNext, loading, fetchTemplates],
  );

  const handleSendEmail = useCallback(async () => {
    if (!approvedItem || !selectedTemplate) return;
    setSendingEmail(true);
    try {
      // Step 1: generate the email draft from the template
      const genRes = await fetch(`/api/proposals/${approvedItem.id}/generate-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: selectedTemplate }),
      });
      if (!genRes.ok) throw new Error("Failed to generate email");
      const genData = await genRes.json();
      const emailId = genData.email_id ?? genData.id;

      // Step 2: immediately send the generated email
      if (emailId) {
        await fetch(`/api/emails/${emailId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "send" }),
        });
      }

      setShowEmailPicker(false);
      if (currentIndex < items.length - 1) goNext();
    } catch {
      // silently fail
    } finally {
      setSendingEmail(false);
    }
  }, [approvedItem, selectedTemplate, currentIndex, items.length, goNext]);

  const handleEdit = useCallback(() => {
    if (!currentItem) return;
    window.open(currentItem.editUrl, "_blank");
  }, [currentItem]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (showEmailPicker) return;
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "a" || e.key === "A") handleAction("approved");
      if (e.key === "r" || e.key === "R") handleAction("rejected");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, handleAction, showEmailPicker]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Nenhum item para revisar.
      </div>
    );
  }

  const typeLabel: Record<ApprovalItem["type"], string> = {
    proposal: "Proposta",
    campaign: "Campanha",
    email: "Email",
  };

  const typeBadgeVariant: Record<ApprovalItem["type"], "default" | "info" | "warning"> = {
    proposal: "default",
    campaign: "warning",
    email: "info",
  };

  return (
    <div className="flex flex-col items-center gap-4">
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
                  if (currentIndex < items.length - 1) goNext();
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
                onClick={handleSendEmail}
                disabled={!selectedTemplate || sendingEmail}
              >
                {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Enviar email
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Progress indicator */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="font-medium">
          {reviewedCount} / {items.length} revisado{items.length !== 1 ? "s" : ""}
        </span>
        <div className="w-48 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(reviewedCount / items.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon" onClick={goPrev} disabled={currentIndex === 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>{currentIndex + 1} / {items.length}</span>
        <Button variant="ghost" size="icon" onClick={goNext} disabled={currentIndex === items.length - 1}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Main card with touch swipe */}
      {currentItem && (
        <Card
          className="w-full max-w-2xl touch-pan-y"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
            touchStartY.current = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            const dy = e.changedTouches[0].clientY - touchStartY.current;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
              if (dx < 0) goNext();
              else goPrev();
            }
          }}
        >
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={typeBadgeVariant[currentItem.type]}>
                  {typeLabel[currentItem.type]}
                </Badge>
                <StatusBadge status={currentItem.status} />
                {reviewed.has(currentItem.id) && (
                  <Badge variant="success">Revisado</Badge>
                )}
              </div>
            </div>
            <CardTitle className="mt-2">{currentItem.title}</CardTitle>
            <p className="text-sm text-muted-foreground">{currentItem.company}</p>
          </CardHeader>

          {currentItem.preview && (
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {currentItem.preview}
              </p>
            </CardContent>
          )}

          <CardFooter className="flex justify-center gap-4 pt-4 pb-6">
            <Button
              variant="destructive"
              size="lg"
              onClick={() => handleAction("rejected")}
              disabled={loading}
              className="min-w-[120px]"
            >
              <X className="h-4 w-4 mr-2" />
              Rejeitar
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={handleEdit}
              className="min-w-[120px] border-amber-400 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </Button>
            <Button
              size="lg"
              onClick={() => handleAction("approved")}
              disabled={loading}
              className="min-w-[120px] bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Aprovar
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Keyboard shortcuts hint */}
      <p className="text-xs text-muted-foreground">
        Use ← → para navegar • <kbd className="border rounded px-1">A</kbd> aprovar • <kbd className="border rounded px-1">R</kbd> rejeitar • Swipe no mobile
      </p>
    </div>
  );
}
