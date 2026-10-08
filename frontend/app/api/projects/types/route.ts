import { NextResponse } from "next/server";
import { TYPE_DEFINITIONS } from "@/lib/projects/model";

export const runtime = "nodejs";

/** What each project type needs to be opened and what it takes to complete it. */
export async function GET() {
  return NextResponse.json({ data: TYPE_DEFINITIONS });
}
