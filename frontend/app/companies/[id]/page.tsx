import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2, Globe, Calendar, Tag, Users, Briefcase,
  TrendingUp, Brain, Target, ArrowLeft, Plus, Pencil,
  MapPin, Phone, Mail, Activity
} from "lucide-react";
import { CompanyEditForm } from "./company-edit-form";
import { CompanyAIAnalysis } from "./company-ai-analysis";
import { InventorySuggestionPanel } from "@/components/companies/inventory-suggestion-panel";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const sb = supabaseAdmin();

  const { data: company, error } = await sb
    .from("companies")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !company) return notFound();

  // Fetch related proposals
  const { data: proposals } = await sb
    .from("proposals")
    .select("id, title, status, created_at, content")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Fetch related campaigns
  const { data: campaigns } = await sb
    .from("campaigns")
    .select("id, idea_title, status, created_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Fetch pipeline leads
  const { data: leads } = await sb
    .from("pipeline_leads" as "companies")
    .select("*")
    .eq("company_id", company.id)
    .limit(5);

  const hasIntelligence = !!(company as Record<string, unknown>).full_intelligence || !!(company as Record<string, unknown>).intelligence;
  const intelligence = ((company as Record<string, unknown>).full_intelligence ?? (company as Record<string, unknown>).intelligence) as Record<string, unknown> | null;
  const tags = ((company as Record<string, unknown>).tags as string[]) || [];
  const segment = (company as Record<string, unknown>).segment as string | null;
  const companySize = (company as Record<string, unknown>).company_size as string | null;
  const businessType = (company as Record<string, unknown>).business_type as string | null;
  const contactName = (company as Record<string, unknown>).contact_name as string | null;
  const contactEmail = (company as Record<string, unknown>).contact_email as string | null;
  const contactPhone = (company as Record<string, unknown>).contact_phone as string | null;
  const competitors = ((company as Record<string, unknown>).competitors as string[]) || [];
  const pipelineStage = (company as Record<string, unknown>).pipeline_stage as string | null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={company.company_name}
        description={company.industry || "Company details"}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/companies">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                All Companies
              </Button>
            </Link>
            <Link href={`/campaigns?company=${encodeURIComponent(company.company_name)}`}>
              <Button variant="outline" size="sm">
                <Activity className="h-4 w-4 mr-1" />
                Campaigns
              </Button>
            </Link>
            <Link href={`/proposals/generate?company_id=${company.id}`} className="hidden sm:block">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New Campaign
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — details + edit */}
        <div className="lg:col-span-2 space-y-6">

          {/* Company info cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoCard icon={<Building2 className="h-4 w-4 text-blue-500" />} label="Status" value={<StatusBadge status={company.status} />} />
            <InfoCard icon={<Tag className="h-4 w-4 text-purple-500" />} label="Segment" value={segment ? <Badge variant="outline" className="capitalize">{segment}</Badge> : <span className="text-muted-foreground text-sm">—</span>} />
            <InfoCard icon={<Briefcase className="h-4 w-4 text-green-500" />} label="Size" value={companySize ? <Badge variant="outline" className="capitalize">{companySize}</Badge> : <span className="text-muted-foreground text-sm">—</span>} />
            <InfoCard icon={<Users className="h-4 w-4 text-orange-500" />} label="Type" value={businessType ? <Badge variant="outline">{businessType}</Badge> : <span className="text-muted-foreground text-sm">—</span>} />
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  <Tag className="h-3 w-3 mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Edit form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                Company Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CompanyEditForm company={company as Record<string, unknown>} />
            </CardContent>
          </Card>

          {/* AI Intelligence */}
          <CompanyAIAnalysis
            companyId={company.id}
            companyName={company.company_name}
            industry={company.industry}
            website={company.website}
            notes={company.notes}
            hasIntelligence={hasIntelligence}
            intelligence={intelligence}
            competitors={competitors}
          />

          {/* Competitor list */}
          {competitors.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-red-500" />
                  Competitors Identified
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(competitors as string[]).map((c, i) => (
                    <Badge key={i} variant="destructive" className="text-xs opacity-80">{c}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column — sidebar */}
        <div className="space-y-4">

          {/* AI Inventory Suggestion */}
          <InventorySuggestionPanel companyId={company.id} companyName={company.company_name} />

          {/* Contact info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {company.website && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                    {company.website.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              )}
              {contactName && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{contactName}</span>
                </div>
              )}
              {contactEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:underline">{contactEmail}</a>
                </div>
              )}
              {contactPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{contactPhone}</span>
                </div>
              )}
              {company.country && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{company.country}</span>
                </div>
              )}
              {company.created_at && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Added {new Date(company.created_at).toLocaleDateString("pt-BR")}</span>
                </div>
              )}
              {pipelineStage && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Badge variant="outline" className="capitalize text-xs">{pipelineStage.replace("_", " ")}</Badge>
                </div>
              )}
              {(!contactName && !contactEmail && !contactPhone) && (
                <p className="text-muted-foreground text-xs">No contact info — add via edit form</p>
              )}
            </CardContent>
          </Card>

          {/* Recent proposals */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                <span>Proposals ({proposals?.length ?? 0})</span>
                <Link href={`/proposals?company=${encodeURIComponent(company.company_name)}`} className="text-blue-600 hover:underline text-xs normal-case">View all</Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {proposals && proposals.length > 0 ? proposals.map((p) => (
                <Link key={p.id} href={`/proposals/${p.id}`} className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors group">
                  <span className="text-sm truncate">{p.title || "Untitled"}</span>
                  <StatusBadge status={p.status} />
                </Link>
              )) : (
                <p className="text-sm text-muted-foreground">No proposals yet</p>
              )}
            </CardContent>
          </Card>

          {/* Recent campaigns */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                <span>Campaigns ({campaigns?.length ?? 0})</span>
                <Link href={`/campaigns?company=${encodeURIComponent(company.company_name)}`} className="text-blue-600 hover:underline text-xs normal-case">View all</Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {campaigns && campaigns.length > 0 ? campaigns.map((c) => (
                <Link key={c.id} href={`/campaigns/${c.id}`} className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors">
                  <span className="text-sm truncate">{c.idea_title || "Untitled"}</span>
                  <StatusBadge status={c.status} />
                </Link>
              )) : (
                <p className="text-sm text-muted-foreground">No campaigns yet</p>
              )}
            </CardContent>
          </Card>

          {/* Pipeline */}
          {leads && leads.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {leads.map((l) => (
                  <div key={(l as Record<string, unknown>).id as string} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                    <span className="text-sm truncate">{(l as Record<string, unknown>).title as string}</span>
                    <Badge variant="outline" className="text-xs capitalize">{((l as Record<string, unknown>).stage as string)?.replace("_", " ")}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {company.notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{company.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}
