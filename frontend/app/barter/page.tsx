import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, DollarSign, TrendingDown, AlertCircle, Plus, CheckCircle, Clock } from "lucide-react";
import { BarterForm } from "./barter-form";

export const dynamic = "force-dynamic";

const BARTER_TYPE_LABELS: Record<string, string> = {
  full_barter: "Full Barter",
  partial_barter: "Partial Barter",
  negotiated_discount: "Negotiated Discount",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-700 bg-red-50 border-red-200",
  medium: "text-amber-700 bg-amber-50 border-amber-200",
  low: "text-green-700 bg-green-50 border-green-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  open: <AlertCircle className="h-4 w-4 text-blue-500" />,
  in_negotiation: <Clock className="h-4 w-4 text-amber-500" />,
  closed: <CheckCircle className="h-4 w-4 text-green-500" />,
  cancelled: <AlertCircle className="h-4 w-4 text-red-500" />,
};

export default async function BarterPage() {
  const sb = supabaseAdmin();

  let items: Record<string, unknown>[] = [];
  let migrationNeeded = false;

  try {
    const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
      .from("barter_items" as "companies")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error?.message?.includes("not find") || error?.message?.includes("does not exist")) {
      migrationNeeded = true;
    } else {
      items = (data ?? []) as Record<string, unknown>[];
    }
  } catch {
    migrationNeeded = true;
  }

  const open = items.filter((i) => i.status === "open");
  const inNegotiation = items.filter((i) => i.status === "in_negotiation");
  const closed = items.filter((i) => i.status === "closed");
  const potentialSavings = items
    .filter((i) => i.current_price && i.target_price)
    .reduce((sum, i) => sum + (Number(i.current_price) - Number(i.target_price)), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Barter & Procurement"
        description="Manage barter opportunities, goods needed, and sponsorship negotiations"
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        }
      />

      {migrationNeeded && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Database Migration Required</p>
            <p className="text-sm text-amber-700 mt-1">
              Go to{" "}
              <a href="/coritiba-intelligence" className="underline font-medium">Coritiba Intelligence</a>{" "}
              and apply the database migrations to enable this module.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Open Needs" value={open.length.toString()} icon={<AlertCircle className="h-4 w-4" />} color="blue" />
        <StatCard label="In Negotiation" value={inNegotiation.length.toString()} icon={<Clock className="h-4 w-4" />} color="amber" />
        <StatCard label="Closed" value={closed.length.toString()} icon={<CheckCircle className="h-4 w-4" />} color="green" />
        <StatCard
          label="Potential Savings"
          value={potentialSavings > 0 ? `R$ ${(potentialSavings / 1000).toFixed(0)}K` : "—"}
          icon={<TrendingDown className="h-4 w-4" />}
          color="purple"
        />
      </div>

      {/* How it works */}
      <Card className="border-blue-100 bg-blue-50/30">
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-blue-800 mb-2">How Barter / Procurement works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-blue-700">
            <div className="flex items-start gap-2">
              <span className="font-bold text-blue-800">1.</span>
              <p>Log products/services Coritiba FC needs (food, tech, logistics, etc.)</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold text-blue-800">2.</span>
              <p>System finds suppliers who could benefit from Coritiba FC sponsorship exposure</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold text-blue-800">3.</span>
              <p>Generate barter or hybrid (discount + sponsorship) proposals directly</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items list */}
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <BarterItemCard key={item.id as string} item={item} />
          ))}
        </div>
      ) : !migrationNeeded ? (
        <Card>
          <CardContent className="text-center py-12">
            <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No barter items yet</p>
            <p className="text-sm text-muted-foreground mt-1">Add products/services Coritiba FC needs to start identifying barter opportunities</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Add form */}
      {!migrationNeeded && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Goods / Services Needed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarterForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BarterItemCard({ item }: { item: Record<string, unknown> }) {
  const priorityStyle = PRIORITY_COLORS[(item.priority as string) || "medium"] || PRIORITY_COLORS.medium;
  const savings = item.current_price && item.target_price
    ? Number(item.current_price) - Number(item.target_price)
    : null;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{STATUS_ICONS[(item.status as string) || "open"]}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{item.item_name as string}</p>
                {!!item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description as string}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={`text-xs border ${priorityStyle} capitalize`} variant="outline">
                  {item.priority as string} priority
                </Badge>
                <Badge variant="outline" className="text-xs capitalize">
                  {(item.status as string).replace("_", " ")}
                </Badge>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {!!item.category && (
                <div>
                  <p className="text-muted-foreground">Category</p>
                  <p className="font-medium capitalize">{(item.category as string).replace("_", " ")}</p>
                </div>
              )}
              {!!item.quantity && (
                <div>
                  <p className="text-muted-foreground">Quantity</p>
                  <p className="font-medium">{item.quantity as string}</p>
                </div>
              )}
              {!!item.current_supplier && (
                <div>
                  <p className="text-muted-foreground">Current Supplier</p>
                  <p className="font-medium">{item.current_supplier as string}</p>
                </div>
              )}
              {!!item.barter_type && (
                <div>
                  <p className="text-muted-foreground">Barter Type</p>
                  <p className="font-medium">{BARTER_TYPE_LABELS[(item.barter_type as string)] || item.barter_type as string}</p>
                </div>
              )}
            </div>

            {!!(item.current_price || item.target_price) && (
              <div className="mt-3 flex items-center gap-4 text-xs">
                {!!item.current_price && (
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Current:</span>
                    <span className="font-medium">R$ {Number(item.current_price).toLocaleString("pt-BR")}</span>
                  </div>
                )}
                {!!item.target_price && (
                  <div className="flex items-center gap-1">
                    <TrendingDown className="h-3 w-3 text-green-500" />
                    <span className="text-muted-foreground">Target:</span>
                    <span className="font-medium text-green-700">R$ {Number(item.target_price).toLocaleString("pt-BR")}</span>
                  </div>
                )}
                {savings && savings > 0 && (
                  <Badge variant="outline" className="text-green-700 bg-green-50 border-green-200">
                    Save R$ {savings.toLocaleString("pt-BR")}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-green-50 text-green-700",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[color] || ""}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">{icon}{label}</div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
