import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Smartphone, Tag, DollarSign, Eye, Plus, AlertCircle } from "lucide-react";
import { InventoryForm } from "./inventory-form";

export const dynamic = "force-dynamic";

const PHYSICAL_CATEGORIES: Record<string, string> = {
  jersey: "Jersey Sponsorship",
  led_board: "LED Board",
  banner: "Stadium Banner",
  scoreboard: "Scoreboard",
  press_backdrop: "Press Backdrop",
  stadium_branding: "Stadium Branding",
  training_kit: "Training Kit",
  vip_area: "VIP Area",
};

const DIGITAL_CATEGORIES: Record<string, string> = {
  social_post: "Social Feed Post",
  stories: "Stories / Reels",
  youtube: "YouTube",
  reels: "Reels / TikTok",
  influencer: "Player / Influencer",
  sponsored_content: "Sponsored Content",
  email_newsletter: "Email Newsletter",
  app_push: "App Push Notification",
};

const AVAILABILITY_COLORS: Record<string, string> = {
  available: "text-green-700 bg-green-50 border-green-200",
  limited: "text-amber-700 bg-amber-50 border-amber-200",
  sold: "text-red-700 bg-red-50 border-red-200",
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const sb = supabaseAdmin();
  const tab = searchParams.tab || "physical";

  let items: Record<string, unknown>[] = [];
  let migrationNeeded = false;

  try {
    const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
      .from("inventory_items" as "companies")
      .select("*")
      .eq("status", "active")
      .eq("inventory_type", tab)
      .order("sort_order");

    if (error?.message?.includes("not find") || error?.message?.includes("does not exist")) {
      migrationNeeded = true;
    } else {
      items = (data ?? []) as Record<string, unknown>[];
    }
  } catch {
    migrationNeeded = true;
  }

  const catMap = tab === "physical" ? PHYSICAL_CATEGORIES : DIGITAL_CATEGORIES;
  const byCategory = items.reduce<Record<string, Record<string, unknown>[]>>((acc, item) => {
    const cat = (item.category as string) || "other";
    acc[cat] = acc[cat] || [];
    acc[cat].push(item);
    return acc;
  }, {});

  const totalAvailable = items.filter((i) => i.availability === "available").length;
  const totalLimited = items.filter((i) => i.availability === "limited").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sponsorship Inventory"
        description="Manage all Coritiba FC physical and digital sponsorship assets"
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
              The inventory tables need to be created. Go to{" "}
              <a href="/coritiba-intelligence" className="underline font-medium">Coritiba Intelligence</a>{" "}
              and click &quot;Apply Migrations&quot; to set up the database.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Items" value={items.length.toString()} color="blue" icon={<Package className="h-4 w-4" />} />
        <StatCard label="Available" value={totalAvailable.toString()} color="green" icon={<Tag className="h-4 w-4" />} />
        <StatCard label="Limited" value={totalLimited.toString()} color="amber" icon={<AlertCircle className="h-4 w-4" />} />
        <StatCard label="Categories" value={Object.keys(byCategory).length.toString()} color="purple" icon={<Eye className="h-4 w-4" />} />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b pb-2">
        {["physical", "digital"].map((t) => (
          <a key={t} href={`/inventory?tab=${t}`}>
            <Button
              variant={tab === t ? "default" : "outline"}
              size="sm"
              className="capitalize"
            >
              {t === "physical" ? <Package className="h-4 w-4 mr-1" /> : <Smartphone className="h-4 w-4 mr-1" />}
              {t} Inventory
            </Button>
          </a>
        ))}
      </div>

      {/* Items by category */}
      {Object.keys(catMap).map((cat) => {
        const catItems = byCategory[cat] || [];
        return (
          <Card key={cat}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {tab === "physical" ? <Package className="h-4 w-4 text-blue-500" /> : <Smartphone className="h-4 w-4 text-purple-500" />}
                {catMap[cat]}
                <Badge variant="secondary" className="text-xs ml-auto">{catItems.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {catItems.length > 0 ? (
                <div className="divide-y">
                  {catItems.map((item) => (
                    <InventoryRow key={item.id as string} item={item} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No {catMap[cat]} items yet</p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Add form */}
      {!migrationNeeded && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Inventory Item
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InventoryForm
              physicalCategories={PHYSICAL_CATEGORIES}
              digitalCategories={DIGITAL_CATEGORIES}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InventoryRow({ item }: { item: Record<string, unknown> }) {
  const avail = (item.availability as string) || "available";
  const availStyle = AVAILABILITY_COLORS[avail] || AVAILABILITY_COLORS.available;

  return (
    <div className="py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">{item.name as string}</p>
          <Badge className={`text-xs border ${availStyle} capitalize`} variant="outline">
            {avail}
          </Badge>
          {!!item.placement_zone && (
            <Badge variant="outline" className="text-xs">{(item.placement_zone as string).replace(/_/g, " ")}</Badge>
          )}
        </div>
        {!!item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description as string}</p>}
        {!!item.exposure_reach && (
          <div className="flex items-center gap-1 mt-1">
            <Eye className="h-3 w-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{item.exposure_reach as string}</p>
          </div>
        )}
      </div>
      <div className="shrink-0 text-right space-y-0.5">
        {!!(item.price_min || item.price_max) && (
          <div className="flex items-center gap-1 justify-end">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <p className="text-xs font-medium">
              {item.price_min && item.price_max
                ? `R$ ${Number(item.price_min).toLocaleString("pt-BR")} – ${Number(item.price_max).toLocaleString("pt-BR")}`
                : item.price_min
                ? `R$ ${Number(item.price_min).toLocaleString("pt-BR")}+`
                : `até R$ ${Number(item.price_max).toLocaleString("pt-BR")}`}
            </p>
          </div>
        )}
        {!!item.unit && <p className="text-xs text-muted-foreground">{item.unit as string}</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ReactNode }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-purple-50 text-purple-700",
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[color] || ""}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">{icon}{label}</div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
