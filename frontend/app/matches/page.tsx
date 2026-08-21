import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { MatchesManager } from "./matches-manager";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const sb = supabaseAdmin();

  let matches: Record<string, unknown>[] = [];
  let migrationPending = false;

  try {
    const { data, error } = await sb
      .from("matches")
      .select("*, match_media_reach(*)")
      .order("match_date", { ascending: false })
      .limit(100);
    if (error) migrationPending = true;
    else matches = (data as Record<string, unknown>[]) ?? [];
  } catch {
    migrationPending = true;
  }

  return (
    <>
      <PageHeader
        title="Matches"
        description="Fixtures the club plays, with an editable media-reach breakdown (official / fan / rival accounts / media-TV-radio views) used to power per-match proposals."
      />
      <MatchesManager initialMatches={matches} migrationPending={migrationPending} />
    </>
  );
}
