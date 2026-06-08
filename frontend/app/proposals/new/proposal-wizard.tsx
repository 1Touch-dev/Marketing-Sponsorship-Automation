"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import {
  Check, ChevronRight, ChevronLeft, Sparkles, Building2,
  Package, Brain, Zap, FileText, Users, Globe, MapPin,
  TrendingUp, Heart, Repeat2, Loader2, Star,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────
type Company = {
  id: string; company_name: string; industry: string | null;
  segment: string | null; business_type: string | null; company_size: string | null;
  website: string | null; logo_url: string | null; notes: string | null;
};
type Campaign = { id: string; title: string; summary: string | null; status: string };
type ProposalType = "sponsorship" | "barter" | "lei_de_incentivo" | "mixed" | "esg_community" | "local_business" | "national_brand";
type Component = { id: string; name: string; category: string; type: string; icon: React.ElementType; price?: string };
type Strategy = { key: string; label: string; description: string; icon: React.ElementType; color: string };

// ── Step definitions ───────────────────────────────────────────────────────
const STEPS = [
  { n: 1, label: "Proposal Type" },
  { n: 2, label: "Select Company" },
  { n: 3, label: "Components" },
  { n: 4, label: "Strategy" },
  { n: 5, label: "Generate" },
  { n: 6, label: "Review" },
];

// ── Proposal types ─────────────────────────────────────────────────────────
const PROPOSAL_TYPES: Array<{ type: ProposalType; label: string; description: string; icon: React.ElementType; color: string }> = [
  { type: "sponsorship", label: "Sponsorship", description: "Traditional sponsor package — jersey, LED boards, digital, VIP, press", icon: Star, color: "blue" },
  { type: "barter", label: "Barter / Goods", description: "Exchange goods/services instead of cash — negotiation-driven partnership", icon: Repeat2, color: "amber" },
  { type: "lei_de_incentivo", label: "Lei de Incentivo", description: "Tax-incentive social project — ESG, community programs, sport development", icon: Heart, color: "green" },
  { type: "mixed", label: "Mixed Proposal", description: "Hybrid: cash sponsorship + barter + social impact combined", icon: Zap, color: "purple" },
  { type: "esg_community", label: "ESG / Community", description: "Social impact partnership — youth, environment, inclusion, CSR", icon: Heart, color: "emerald" },
  { type: "local_business", label: "Local Business", description: "Regional Curitiba/Paraná SME — high-visibility local activation", icon: MapPin, color: "orange" },
  { type: "national_brand", label: "National Brand", description: "Large national brand — broadcast, digital, full stadium integration", icon: TrendingUp, color: "indigo" },
];

// ── Inventory components ───────────────────────────────────────────────────
const INVENTORY_COMPONENTS: Component[] = [
  { id: "jersey_chest", name: "Jersey — Principal (Chest)", category: "jersey", type: "physical", icon: FileText, price: "R$80K–250K/mês" },
  { id: "jersey_sleeve", name: "Jersey — Sleeve", category: "jersey", type: "physical", icon: FileText, price: "R$25K–80K/mês" },
  { id: "led_board", name: "LED Perimeter Board", category: "led_board", type: "physical", icon: Zap, price: "R$20K–60K/jogo" },
  { id: "scoreboard", name: "Giant Scoreboard Ad", category: "scoreboard", type: "physical", icon: TrendingUp, price: "R$8K–25K/jogo" },
  { id: "press_backdrop", name: "Press Backdrop / Flash Zone", category: "press_backdrop", type: "physical", icon: Users, price: "R$5K–20K/mês" },
  { id: "vip_hospitality", name: "VIP Hospitality Zone", category: "vip", type: "physical", icon: Star, price: "R$15K–50K/jogo" },
  { id: "instagram_post", name: "Instagram — Sponsored Post", category: "social_post", type: "digital", icon: Globe, price: "R$2K–8K/post" },
  { id: "youtube_video", name: "YouTube — Sponsored Video", category: "youtube", type: "digital", icon: Globe, price: "R$5K–25K/vídeo" },
  { id: "player_content", name: "Player Brand Integration", category: "influencer", type: "digital", icon: Users, price: "R$5K–30K/campanha" },
  { id: "stadium_naming", name: "Stadium Area Naming Rights", category: "naming_rights", type: "physical", icon: MapPin, price: "Sob consulta" },
  { id: "matchday_activation", name: "Matchday Fan Zone Activation", category: "activation", type: "physical", icon: Zap, price: "R$10K–40K/jogo" },
  { id: "youth_academy", name: "Youth Academy Co-Branding", category: "academy", type: "community", icon: Heart, price: "R$10K–35K/mês" },
];

const BARTER_COMPONENTS: Component[] = [
  { id: "equipment_supply", name: "Equipment / Gear Supply", category: "equipment", type: "barter", icon: Package, price: "Troca" },
  { id: "food_beverage", name: "Food & Beverage Supply", category: "food", type: "barter", icon: Package, price: "Troca" },
  { id: "tech_services", name: "Tech / IT Services", category: "tech", type: "barter", icon: Package, price: "Troca" },
  { id: "transport_logistics", name: "Transport / Logistics", category: "logistics", type: "barter", icon: Package, price: "Troca" },
  { id: "media_production", name: "Media Production Services", category: "media", type: "barter", icon: Package, price: "Troca" },
];

const SOCIAL_COMPONENTS: Component[] = [
  { id: "youth_sport", name: "Youth Sport Program", category: "sport", type: "social", icon: Heart, price: "IR Dedutível" },
  { id: "digital_inclusion", name: "Digital Inclusion", category: "education", type: "social", icon: Globe, price: "IR Dedutível" },
  { id: "environmental", name: "Environmental / ESG", category: "environment", type: "social", icon: Heart, price: "IR Dedutível" },
  { id: "community_health", name: "Community Health", category: "health", type: "social", icon: Heart, price: "IR Dedutível" },
];

// ── Strategies ─────────────────────────────────────────────────────────────
const ALL_STRATEGIES: Strategy[] = [
  { key: "awareness", label: "Brand Awareness", description: "Maximum visibility — LED, jersey, TV exposure, city-wide recognition", icon: Globe, color: "blue" },
  { key: "fan_engagement", label: "Fan Engagement", description: "Deep fan connection — activations, experiences, loyalty programs", icon: Users, color: "green" },
  { key: "premium_branding", label: "Premium Branding", description: "Luxury positioning — VIP zones, hospitality, exclusive association", icon: Star, color: "purple" },
  { key: "esg", label: "ESG / Sustainability", description: "Social impact, environmental programs, community responsibility", icon: Heart, color: "emerald" },
  { key: "digital_social", label: "Digital & Social", description: "Social media, content creation, influencer, digital-first activation", icon: Zap, color: "amber" },
  { key: "community", label: "Community", description: "Local community programs, grassroots, Curitiba market presence", icon: MapPin, color: "orange" },
  { key: "youth", label: "Youth Development", description: "Youth academy, sport school, next-generation programs", icon: Heart, color: "pink" },
  { key: "hospitality", label: "Hospitality / B2B", description: "Client entertainment, matchday VIP, B2B relationship building", icon: Star, color: "slate" },
  { key: "barter_negotiation", label: "Barter Negotiation", description: "Goods/service exchange, cost reduction, procurement partnership", icon: Repeat2, color: "yellow" },
  { key: "hybrid_activation", label: "Hybrid Activation", description: "Mix of physical, digital, and community touchpoints for full impact", icon: TrendingUp, color: "indigo" },
];

// ── Step indicator ─────────────────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8 overflow-x-auto pb-1">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className="flex flex-col items-center gap-1 min-w-[56px]">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              s.n < current ? "bg-primary text-primary-foreground" :
              s.n === current ? "bg-primary text-primary-foreground ring-4 ring-primary/20" :
              "bg-muted text-muted-foreground"
            }`}>
              {s.n < current ? <Check className="h-4 w-4" /> : s.n}
            </div>
            <span className={`text-[10px] text-center leading-tight ${s.n === current ? "text-primary font-medium" : "text-muted-foreground"}`}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-0.5 w-6 flex-shrink-0 mb-4 transition-colors ${s.n < current ? "bg-primary" : "bg-border"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}


// ── DB inventory item type ─────────────────────────────────────────────────
type DbInventoryItem = {
  id: string;
  name: string;
  description: string | null;
  inventory_type: string;
  category: string;
  unit_type: string | null;
  slot_timing: string | null;
  slot_duration_sec: number | null;
  total_quantity: number | null;
  quantity_sold: number | null;
  price_min: number | null;
  price_max: number | null;
  price_small: number | null;
  price_medium: number | null;
  price_large: number | null;
  price_enterprise: number | null;
  availability: string;
  is_exclusive: boolean | null;
};

type SelectedInventoryLine = {
  inventory_id: string;
  name: string;
  quantity: number;
  scope: string;
  slot_timing: string | null;
  price_agreed: number | null;
};

// ── Main Wizard Component ─────────────────────────────────────────────────
export function ProposalWizard({
  companies,
  campaigns,
  preselectedCompanyId = "",
}: {
  companies: Company[];
  campaigns: Campaign[];
  preselectedCompanyId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  // Use a stable session key — avoid SSR/client mismatch by not touching sessionStorage during render
  const [sessionKey] = useState(() => crypto.randomUUID());
  const sessionInitialized = React.useRef(false);
  useEffect(() => {
    if (sessionInitialized.current) return;
    sessionInitialized.current = true;
    if (!sessionStorage.getItem("wizard_session")) {
      sessionStorage.setItem("wizard_session", sessionKey);
    }
  }, [sessionKey]);

  // Wizard state
  const [proposalType, setProposalType] = useState<ProposalType>("sponsorship");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(() => {
    if (preselectedCompanyId) {
      return companies.find(c => c.id === preselectedCompanyId) ?? null;
    }
    return null;
  });
  const [companySearch, setCompanySearch] = useState("");
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [selectedInventoryLines, setSelectedInventoryLines] = useState<SelectedInventoryLine[]>([]);
  const [dbInventory, setDbInventory] = useState<DbInventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [customBrief, setCustomBrief] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedId, setGeneratedId] = useState<string | null>(null);

  // Save draft to DB
  const saveDraft = useCallback(async (updates: Record<string, unknown>) => {
    await fetch("/api/proposals/wizard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_key: sessionKey, ...updates }),
    });
  }, [sessionKey]);

  // Fetch live inventory when reaching step 3 (sponsorship/mixed)
  useEffect(() => {
    if (step === 3 && (proposalType === "sponsorship" || proposalType === "mixed") && dbInventory.length === 0) {
      setInventoryLoading(true);
      fetch("/api/inventory?status=active")
        .then(r => r.json())
        .then(d => setDbInventory(d.items ?? d.data ?? []))
        .catch(() => {})
        .finally(() => setInventoryLoading(false));
    }
  }, [step, proposalType, dbInventory.length]);

  function getPriceForCompany(item: DbInventoryItem): number | null {
    const size = selectedCompany?.company_size ?? "medium";
    if (size === "small" && item.price_small) return item.price_small;
    if (size === "large" && item.price_large) return item.price_large;
    if (size === "enterprise" && item.price_enterprise) return item.price_enterprise;
    if (item.price_medium) return item.price_medium;
    return item.price_min ?? null;
  }

  function toggleInventoryLine(item: DbInventoryItem) {
    const exists = selectedInventoryLines.find(l => l.inventory_id === item.id);
    if (exists) {
      setSelectedInventoryLines(prev => prev.filter(l => l.inventory_id !== item.id));
    } else {
      const price = getPriceForCompany(item);
      setSelectedInventoryLines(prev => [...prev, {
        inventory_id: item.id,
        name: item.name,
        quantity: 1,
        scope: item.unit_type ?? "per_season",
        slot_timing: item.slot_timing ?? null,
        price_agreed: price,
      }]);
    }
  }

  function updateLineQty(inventoryId: string, qty: number) {
    setSelectedInventoryLines(prev => prev.map(l => l.inventory_id === inventoryId ? { ...l, quantity: Math.max(1, qty) } : l));
  }

  function packageTotal(): number {
    return selectedInventoryLines.reduce((sum, l) => sum + (l.price_agreed ?? 0) * l.quantity, 0);
  }

  function next() {
    saveDraft({ current_step: step + 1, proposal_type: proposalType, company_id: selectedCompany?.id, selected_components: selectedComponents, selected_strategies: selectedStrategies, custom_brief: customBrief }).catch(() => {/* non-blocking */});
    setStep(s => Math.min(s + 1, 6));
  }
  function back() { setStep(s => Math.max(s - 1, 1)); }

  // ── Generate proposal ────────────────────────────────────────────────────
  async function generateProposal() {
    if (!selectedCompany) return;
    setGenerating(true);
    try {
      // Step 1: create campaign if none selected
      const campaign = campaigns.find(c => c.status === "active") ?? null;

      // Step 2: generate via existing proposal generation pipeline
      const res = await fetch("/api/proposals/wizard/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_key: sessionKey,
          proposal_type: proposalType,
          company_id: selectedCompany.id,
          campaign_id: campaign?.id ?? null,
          selected_components: selectedComponents,
          selected_inventory_lines: selectedInventoryLines,
          selected_strategies: selectedStrategies,
          custom_brief: customBrief,
        }),
      });
      const j = await res.json() as { proposal_id?: string; error?: string };
      if (!res.ok || !j.proposal_id) throw new Error(j.error ?? "Generation failed");
      setGeneratedId(j.proposal_id);
      setStep(6);
      toast({ variant: "success", title: "Proposal generated!", description: "Review your proposal below." });
    } catch (err) {
      toast({ variant: "destructive", title: "Generation failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setGenerating(false);
    }
  }

  const filteredCompanies = companies.filter(c =>
    c.company_name.toLowerCase().includes(companySearch.toLowerCase()) ||
    (c.industry ?? "").toLowerCase().includes(companySearch.toLowerCase())
  );

  const availableComponents = proposalType === "barter" ? BARTER_COMPONENTS :
    proposalType === "lei_de_incentivo" ? SOCIAL_COMPONENTS :
    proposalType === "mixed" ? [...INVENTORY_COMPONENTS, ...BARTER_COMPONENTS.slice(0,3), ...SOCIAL_COMPONENTS.slice(0,2)] :
    INVENTORY_COMPONENTS;

  const recommendedStrategies = selectedCompany ? ALL_STRATEGIES.filter(s => {
    const bt = selectedCompany.business_type ?? "B2C";
    const seg = selectedCompany.segment ?? "local";
    if (proposalType === "lei_de_incentivo") return ["esg", "community", "youth"].includes(s.key);
    if (proposalType === "barter") return ["barter_negotiation", "hybrid_activation", "community"].includes(s.key);
    if (bt === "B2B") return ["hospitality", "premium_branding", "awareness", "barter_negotiation", "hybrid_activation"].includes(s.key);
    if (seg === "local") return ["community", "fan_engagement", "awareness", "digital_social"].includes(s.key);
    if (seg === "national" || seg === "international") return ["awareness", "premium_branding", "digital_social", "esg"].includes(s.key);
    return true;
  }) : ALL_STRATEGIES.slice(0, 5);

  const colorMap: Record<string, string> = {
    blue: "border-blue-400 bg-blue-50 dark:bg-blue-900/20",
    amber: "border-amber-400 bg-amber-50 dark:bg-amber-900/20",
    green: "border-green-400 bg-green-50 dark:bg-green-900/20",
    purple: "border-purple-400 bg-purple-50 dark:bg-purple-900/20",
    emerald: "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
    orange: "border-orange-400 bg-orange-50 dark:bg-orange-900/20",
    pink: "border-pink-400 bg-pink-50 dark:bg-pink-900/20",
    slate: "border-slate-400 bg-slate-50 dark:bg-slate-800/40",
    yellow: "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20",
    indigo: "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20",
  };

  return (
    <div className="max-w-3xl mx-auto pb-28">
      <StepIndicator current={step} />

      {/* ── STEP 1: Proposal Type ── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> What type of proposal?</CardTitle>
            <CardDescription>Choose the proposal category — this shapes the components, pricing, and AI strategy generation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {PROPOSAL_TYPES.map(pt => (
              <button
                key={pt.type}
                onClick={() => setProposalType(pt.type)}
                className={`w-full flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                  proposalType === pt.type
                    ? colorMap[pt.color] + " border-opacity-100"
                    : "border-border hover:border-muted-foreground/40 bg-card"
                }`}
              >
                <div className={`mt-0.5 rounded-lg p-2 ${proposalType === pt.type ? "bg-white/60 dark:bg-black/20" : "bg-muted"}`}>
                  <pt.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold flex items-center gap-2">
                    {pt.label}
                    {proposalType === pt.type && <Check className="h-4 w-4 text-green-500" />}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">{pt.description}</div>
                </div>
              </button>
            ))}
            <div className="flex justify-end pt-2">
              <Button onClick={next} className="gap-2">Continue <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Select Company ── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Select sponsor company</CardTitle>
            <CardDescription>Pick the company this proposal is for. Their intelligence profile will guide AI generation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="text"
              placeholder="Search companies..."
              value={companySearch}
              onChange={e => setCompanySearch(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {filteredCompanies.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCompany(c)}
                  className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                    selectedCompany?.id === c.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/40 bg-card"
                  }`}
                >
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logo_url} alt={c.company_name} className="w-10 h-10 rounded-lg object-contain bg-white border" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.company_name}</div>
                    <div className="text-xs text-muted-foreground flex gap-2 flex-wrap mt-0.5">
                      {c.industry && <span>{c.industry}</span>}
                      {c.segment && <span className="capitalize">· {c.segment}</span>}
                      {c.business_type && <span>· {c.business_type}</span>}
                    </div>
                  </div>
                  {selectedCompany?.id === c.id && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                </button>
              ))}
              {filteredCompanies.length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-sm">No companies found. <a href="/companies/new" className="text-primary underline">Add a company first.</a></div>
              )}
            </div>

            {/* Company intelligence summary */}
            {selectedCompany && (
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-1"><Brain className="h-3.5 w-3.5" /> Intelligence preview</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-blue-700 dark:text-blue-300">
                  <div><span className="opacity-60">Industry:</span> {selectedCompany.industry ?? "Unknown"}</div>
                  <div><span className="opacity-60">Type:</span> {selectedCompany.business_type ?? "Unknown"}</div>
                  <div><span className="opacity-60">Scope:</span> <span className="capitalize">{selectedCompany.segment ?? "Unknown"}</span></div>
                  <div><span className="opacity-60">Size:</span> <span className="capitalize">{selectedCompany.company_size ?? "Unknown"}</span></div>
                  {selectedCompany.notes && <div className="col-span-2 opacity-70 italic">{selectedCompany.notes.slice(0, 120)}</div>}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={back} className="gap-2"><ChevronLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={next} disabled={!selectedCompany} className="gap-2">Continue <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: Inventory / Components ── */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> Select inventory items</CardTitle>
            <CardDescription>
              Pick individual sponsorship units. Prices shown are for{" "}
              <span className="font-medium capitalize">{selectedCompany?.company_size ?? "medium"}</span>-sized companies.
              {selectedInventoryLines.length > 0 && (
                <span className="ml-2 text-emerald-600 font-medium">
                  Package total: R${packageTotal().toLocaleString("pt-BR")}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {inventoryLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading inventory…
              </div>
            )}

            {/* Live DB inventory for sponsorship/mixed */}
            {!inventoryLoading && (proposalType === "sponsorship" || proposalType === "mixed") && dbInventory.length > 0 && (
              <>
                {/* Group by category */}
                {Array.from(new Set(dbInventory.map(i => i.category))).map(cat => {
                  const items = dbInventory.filter(i => i.category === cat);
                  const catLabel: Record<string, string> = {
                    jersey: "Jersey", stadium: "Stadium / LED Boards", press: "Press & Events",
                    hospitality: "VIP Hospitality", social: "Digital / Social Media",
                    player: "Player Content", email: "Email & Newsletter",
                  };
                  return (
                    <div key={cat}>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{catLabel[cat] ?? cat}</div>
                      <div className="space-y-1.5">
                        {items.map(item => {
                          const line = selectedInventoryLines.find(l => l.inventory_id === item.id);
                          const isSelected = !!line;
                          const price = getPriceForCompany(item);
                          const available = (item.total_quantity ?? 1) - (item.quantity_sold ?? 0);
                          return (
                            <div key={item.id} className={`rounded-xl border-2 p-3 transition-all ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40 bg-card"}`}>
                              <div className="flex items-start gap-3">
                                <button
                                  onClick={() => toggleInventoryLine(item)}
                                  className={`mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-primary border-primary text-white" : "border-slate-300"}`}
                                >
                                  {isSelected && <Check className="h-3 w-3" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium">{item.name}</span>
                                    {item.is_exclusive && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Exclusive</span>}
                                    {available <= 0 && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Sold out</span>}
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                                    {price && <span className="text-emerald-700 font-medium">R${price.toLocaleString("pt-BR")}</span>}
                                    {item.unit_type && <span className="capitalize">{item.unit_type.replace(/_/g, " ")}</span>}
                                    {item.slot_timing && <span className="bg-slate-100 px-1.5 py-0.5 rounded capitalize">{item.slot_timing.replace(/_/g, " ")}</span>}
                                    {item.slot_duration_sec && <span>{item.slot_duration_sec}s slot</span>}
                                    <span>{available} of {item.total_quantity ?? 1} available</span>
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button onClick={() => updateLineQty(item.id, (line?.quantity ?? 1) - 1)} className="h-6 w-6 rounded border flex items-center justify-center text-sm hover:bg-slate-100">−</button>
                                    <span className="text-sm font-medium w-5 text-center">{line?.quantity ?? 1}</span>
                                    <button onClick={() => updateLineQty(item.id, (line?.quantity ?? 1) + 1)} className="h-6 w-6 rounded border flex items-center justify-center text-sm hover:bg-slate-100">+</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Fallback static list for barter/lei + when DB empty */}
            {!inventoryLoading && (proposalType === "barter" || proposalType === "lei_de_incentivo" || dbInventory.length === 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableComponents.map(comp => {
                  const selected = selectedComponents.includes(comp.id);
                  return (
                    <button
                      key={comp.id}
                      onClick={() => setSelectedComponents(prev =>
                        prev.includes(comp.id) ? prev.filter(id => id !== comp.id) : [...prev, comp.id]
                      )}
                      className={`flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-all ${selected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40 bg-card"}`}
                    >
                      <div className={`mt-0.5 rounded-md p-1.5 flex-shrink-0 ${selected ? "bg-primary/10" : "bg-muted"}`}>
                        <comp.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-tight">{comp.name}</div>
                        {comp.price && <div className="text-xs text-muted-foreground mt-0.5">{comp.price}</div>}
                      </div>
                      {selected && <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="text-xs text-muted-foreground text-center">
              {(proposalType === "sponsorship" || proposalType === "mixed") && dbInventory.length > 0
                ? `${selectedInventoryLines.length} item${selectedInventoryLines.length !== 1 ? "s" : ""} selected`
                : `${selectedComponents.length} component${selectedComponents.length !== 1 ? "s" : ""} selected`}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={back} className="gap-2"><ChevronLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={next} className="gap-2">Continue <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 4: Strategy ── */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> Strategy selection</CardTitle>
            <CardDescription>
              {selectedCompany ? (
                <><span className="text-foreground font-medium">{selectedCompany.company_name}</span> — recommended strategies based on their profile are highlighted.</>
              ) : "Select the strategic angles for this proposal."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendedStrategies.length > 0 && (
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" /> AI-recommended for this company
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_STRATEGIES.map(s => {
                const selected = selectedStrategies.includes(s.key);
                const isRecommended = recommendedStrategies.some(r => r.key === s.key);
                return (
                  <button
                    key={s.key}
                    onClick={() => setSelectedStrategies(prev =>
                      prev.includes(s.key) ? prev.filter(k => k !== s.key) : [...prev, s.key]
                    )}
                    className={`flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-all relative ${
                      selected ? colorMap[s.color] + " border-opacity-100" :
                      isRecommended ? "border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10 hover:border-amber-400" :
                      "border-border hover:border-muted-foreground/40 bg-card"
                    }`}
                  >
                    {isRecommended && !selected && (
                      <span className="absolute top-1.5 right-1.5 text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium">
                        Recommended
                      </span>
                    )}
                    <div className={`mt-0.5 rounded-md p-1.5 flex-shrink-0 ${selected ? "bg-white/60 dark:bg-black/20" : "bg-muted"}`}>
                      <s.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="text-sm font-medium leading-tight">{s.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{s.description}</div>
                    </div>
                    {selected && <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Additional brief / context (optional)</label>
              <textarea
                rows={3}
                value={customBrief}
                onChange={e => setCustomBrief(e.target.value)}
                placeholder="Any specific goals, tone, budget range, or context for this proposal..."
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={back} className="gap-2"><ChevronLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={next} className="gap-2">Continue <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 5: Generate ── */}
      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" /> Ready to generate</CardTitle>
            <CardDescription>Review your selections and generate the full proposal with AI.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border p-4 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Proposal type</span><span className="font-medium capitalize">{proposalType.replace(/_/g, " ")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Company</span><span className="font-medium">{selectedCompany?.company_name ?? "—"}</span></div>
              <div className="flex justify-between items-start"><span className="text-muted-foreground">Components</span>
                <span className="font-medium text-right max-w-[60%]">
                  {selectedComponents.length > 0 ? `${selectedComponents.length} selected` : "None (AI will choose)"}
                </span>
              </div>
              <div className="flex justify-between items-start"><span className="text-muted-foreground">Strategies</span>
                <span className="font-medium text-right max-w-[60%]">
                  {selectedStrategies.length > 0
                    ? ALL_STRATEGIES.filter(s => selectedStrategies.includes(s.key)).map(s => s.label).join(", ")
                    : "AI will recommend"
                  }
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-xs text-green-700 dark:text-green-300">
              <strong>Coritiba FC grounding active.</strong> AI will generate a full proposal referencing Couto Pereira, Verde e Branco identity, and the Curitiba/Paraná market. No competitor clubs will be mentioned.
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={back} className="gap-2"><ChevronLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={generateProposal} disabled={generating || !selectedCompany} className="gap-2 bg-amber-500 hover:bg-amber-600 text-white">
                {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4" /> Generate Proposal</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 6: Review ── */}
      {step === 6 && generatedId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600"><Check className="h-5 w-5" /> Proposal generated!</CardTitle>
            <CardDescription>Your proposal has been created. Review, edit sections, or view the shareable landing page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 text-center">
              <div className="text-3xl mb-2">🎉</div>
              <div className="font-semibold text-green-700 dark:text-green-300">Proposal ready for {selectedCompany?.company_name}</div>
              <div className="text-sm text-green-600 dark:text-green-400 mt-1">Full content generated with Coritiba FC context</div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button className="flex-1 gap-2" onClick={() => router.push(`/proposals/${generatedId}`)}>
                <FileText className="h-4 w-4" /> View Proposal
              </Button>
              <Button variant="outline" className="flex-1 gap-2" onClick={() => router.push(`/proposals/${generatedId}/edit`)}>
                Edit Sections
              </Button>
              <Button variant="outline" className="flex-1 gap-2" onClick={() => { setStep(1); setSelectedCompany(null); setSelectedComponents([]); setSelectedStrategies([]); setGeneratedId(null); sessionStorage.removeItem("wizard_session"); }}>
                New Proposal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
