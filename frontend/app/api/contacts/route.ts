import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";

const contactSchema = z.object({
  company_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  seniority: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  linkedin_url: z.string().optional().nullable(),
  source: z.enum(["hunter", "apollo", "manual", "linkedin"]).default("manual"),
  confidence: z.number().int().min(0).max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const bulkSchema = z.object({
  contacts: z.array(contactSchema).min(1).max(50),
});

export async function GET(req: Request) {
  const sb = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");

  let query = sb
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false });

  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query.limit(200);
  if (error) {
    // Gracefully handle missing table (migration not yet applied)
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  // Support both single contact and bulk
  const isBulk = Array.isArray(body.contacts);
  const parsed = isBulk
    ? bulkSchema.safeParse(body)
    : contactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const contactsToInsert = isBulk
    ? (parsed.data as z.infer<typeof bulkSchema>).contacts
    : [parsed.data as z.infer<typeof contactSchema>];

  const { data, error } = await sb
    .from("contacts")
    .upsert(contactsToInsert, { onConflict: "company_id,email", ignoreDuplicates: false })
    .select("*");

  if (error) {
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json(
        { error: "Contacts table not yet created. Apply migration 0021 in Supabase SQL editor first.", migration_needed: "0021" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    saved: data?.length ?? 0,
    contacts: data,
    message: `${data?.length ?? 0} contact${(data?.length ?? 0) !== 1 ? "s" : ""} saved successfully`,
  });
}
