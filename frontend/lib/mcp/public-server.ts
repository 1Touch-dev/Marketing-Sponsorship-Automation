/**
 * Public read-only MCP server (Phase 9 — master_report.md Section 5's
 * "longer-horizon" item: "a read-only public MCP server exposing the
 * platform itself... lets partner agencies/n8n workflows query
 * sponsorship data programmatically").
 *
 * Scope, deliberately: a working v1, not the full multi-partner platform
 * the report envisions 2-3 quarters out. Auth is a single bearer token
 * (MCP_PUBLIC_API_KEY) rather than per-partner issued/revocable keys —
 * there is exactly one real external consumer class today (n8n/agency
 * workflows the operator sets up themselves), so a shared secret is the
 * honest v1 rather than building partner-key management ahead of a real
 * partner needing it. Tenant scope is likewise the single default tenant
 * for the same reason (see PLATFORM_ROADMAP.md).
 *
 * Every tool here is read-only by construction — no tool in this file
 * performs an insert/update/delete, and none exposes PII (contact email/
 * phone) or internal cost fields (inventory_items.production_cost) or raw
 * proposal content (could contain sensitive negotiation detail) — only
 * the metadata a partner agency would need to build on top of this data.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

function toolText(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function createPublicMcpServer(tenantId: string): McpServer {
  const server = new McpServer({ name: "market-sponsorship-automation-public", version: "1.0.0" });
  const sb = supabaseAdmin();

  server.registerTool(
    "list_companies",
    {
      title: "List companies",
      description: "List sponsor/prospect companies in the pipeline — name, industry, status, pipeline stage. No contact details.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(25), status: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, status }) => {
      let q = sb.from("companies").select("id, company_name, industry, status, pipeline_stage, segment, country")
        .eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(limit);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) return toolText({ error: error.message });
      return toolText(data ?? []);
    },
  );

  server.registerTool(
    "get_company",
    {
      title: "Get company",
      description: "Get details for one company by id — name, industry, status, pipeline stage. No contact details.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const { data, error } = await sb.from("companies")
        .select("id, company_name, industry, status, pipeline_stage, segment, country, company_size, business_type")
        .eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      if (error) return toolText({ error: error.message });
      if (!data) return toolText({ error: "Not found" });
      return toolText(data);
    },
  );

  server.registerTool(
    "list_proposals",
    {
      title: "List proposals",
      description: "List sponsorship proposals — title, status, type, company, dates. Does not include the proposal's full drafted content.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(25), status: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, status }) => {
      let q = sb.from("proposals").select("id, title, status, proposal_type, version, created_at, updated_at, companies(company_name)")
        .eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(limit);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) return toolText({ error: error.message });
      return toolText(data ?? []);
    },
  );

  server.registerTool(
    "list_campaigns",
    {
      title: "List campaigns",
      description: "List sponsorship campaign strategies — title, status, company, objective.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(25) },
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const { data, error } = await sb.from("campaigns")
        .select("id, title, summary, status, objective, created_at, companies(company_name)")
        .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(limit);
      if (error) return toolText({ error: error.message });
      return toolText(data ?? []);
    },
  );

  server.registerTool(
    "list_inventory",
    {
      title: "List sponsorship inventory",
      description: "List available sponsorship inventory (jersey placements, LED boards, hospitality, etc.) with public pricing ranges. Excludes internal production cost.",
      inputSchema: { limit: z.number().int().min(1).max(100).default(50) },
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const { data, error } = await sb.from("inventory_items")
        .select("id, name, description, inventory_type, category, price_min, price_max, currency, unit, availability, status")
        .eq("tenant_id", tenantId).eq("status", "active").limit(limit);
      if (error) return toolText({ error: error.message });
      return toolText(data ?? []);
    },
  );

  return server;
}
