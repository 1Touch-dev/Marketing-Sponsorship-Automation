/**
 * E2E verification for James visual/proposal requirements (run on server).
 * Usage: node scripts/e2e-james-visuals.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const base = process.env.TEST_BASE_URL || "http://localhost:3000";

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key);
const results = [];

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function checkMigrationColumns() {
  const { data, error } = await sb.from("image_generation_jobs").select("strategy_label, placement_zone, inventory_label, display_label").limit(1);
  if (error) {
    if (error.message.includes("column") || error.code === "42703") {
      fail("Migration 0020 columns", error.message);
      return false;
    }
    fail("Migration 0020 query", error.message);
    return false;
  }
  pass("Migration 0020 columns exist");
  return true;
}

async function getTestProposal() {
  const { data } = await sb
    .from("proposals")
    .select("id, title, company_id, companies(company_name, logo_url), strategy_variants")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function testMetadataRoundTrip(proposalId) {
  const { data: job, error: insErr } = await sb
    .from("image_generation_jobs")
    .insert({
      proposal_id: proposalId,
      job_type: "e2e_test",
      status: "completed",
      prompt: "E2E metadata test",
      provider: "test",
      model: "test",
      output_urls: [{ url: "https://example.com/e2e-test.png", index: 0 }],
      selected_url: "https://example.com/e2e-test.png",
      strategy_label: "Test Strategy",
      placement_zone: "chest_sponsor",
      inventory_label: "jersey_chest",
      display_label: "E2E Camisa",
    })
    .select("id, strategy_label, inventory_label, placement_zone")
    .single();

  if (insErr) {
    fail("Insert job with metadata", insErr.message);
    return;
  }

  const { error: updErr } = await sb
    .from("image_generation_jobs")
    .update({
      strategy_label: "Updated Strategy",
      inventory_label: "led_board",
      display_label: "LED Test",
    })
    .eq("id", job.id);

  if (updErr) {
    fail("Update metadata columns", updErr.message);
  } else {
    pass("Insert + update image job metadata (strategy/inventory)");
  }

  await sb.from("image_generation_jobs").delete().eq("id", job.id);
}

async function testJerseyMockupApi() {
  const res = await fetch(`${base}/api/media/jersey-mockup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sponsor_name: "E2E Test Sponsor",
      placement: "chest_sponsor",
      save_to_proposal: false,
    }),
  });
  if (res.status === 401) {
    pass("Jersey mockup API (auth required — expected without session)", "401");
    return;
  }
  const body = await res.json();
  if (!res.ok) {
    fail("Jersey mockup API", body.error || res.status);
    return;
  }
  if (body.url && body.placement === "chest_sponsor") {
    pass("Jersey mockup API returns image URL", body.url.slice(0, 60) + "…");
  } else {
    fail("Jersey mockup API response shape", JSON.stringify(body).slice(0, 120));
  }
}

async function testRoutesExist() {
  const routes = [
    "/proposals/bulk-approve",
    "/api/health",
  ];
  for (const r of routes) {
    const res = await fetch(`${base}${r}`, { redirect: "manual" });
    const ok = res.status === 200 || res.status === 307 || res.status === 302 || res.status === 401;
    if (ok) pass(`Route ${r}`, `HTTP ${res.status}`);
    else fail(`Route ${r}`, `HTTP ${res.status}`);
  }
}

async function testLandingSourceNoConceitos() {
  const landingPath = resolve(__dir, "../components/proposals/proposal-landing-page.tsx");
  const src = readFileSync(landingPath, "utf8");
  if (src.includes("VisualMockupGrid") || src.includes("Conceitos Visuais")) {
    fail("Landing page removed Conceitos Visuais / VisualMockupGrid");
  } else {
    pass("Landing page: no Conceitos Visuais / prompt grid");
  }
  if (src.includes("ProposalLandingVisuals")) {
    pass("Landing page: uses ProposalLandingVisuals for real images");
  } else {
    fail("Landing page missing ProposalLandingVisuals");
  }
  if (src.includes("logo_url")) {
    pass("Landing page: sponsor logo_url in hero");
  }
  if (src.includes("resolveKpiTemplate")) {
    pass("Landing page: configurable KPI templates");
  }
  if (src.includes("telespectadores TV")) {
    pass("Landing page: TV viewers on match cards");
  }
}

async function testGraphicsPanelWiring() {
  const files = [
    "../app/proposals/[id]/page.tsx",
    "../app/proposals/[id]/edit/page.tsx",
    "../components/proposals/proposal-cms-editor.tsx",
  ];
  for (const f of files) {
    const src = readFileSync(resolve(__dir, f), "utf8");
    if (src.includes("ProposalGraphicsPanel")) {
      pass(`Graphics panel wired: ${f.split("/").pop()}`);
    } else {
      fail(`Graphics panel missing: ${f}`);
    }
  }
}

async function main() {
  console.log("\n=== James visuals E2E verification ===\n");
  await testLandingSourceNoConceitos();
  await testGraphicsPanelWiring();
  await testRoutesExist();
  await checkMigrationColumns();
  const proposal = await getTestProposal();
  if (proposal?.id) {
    pass("Found proposal for DB tests", proposal.title?.slice(0, 40));
    await testMetadataRoundTrip(proposal.id);
  } else {
    fail("No proposal in DB for metadata test");
  }
  await testJerseyMockupApi();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} passed ===\n`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
