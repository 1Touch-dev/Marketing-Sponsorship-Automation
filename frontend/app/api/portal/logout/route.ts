import { NextRequest, NextResponse } from "next/server";
import { PORTAL_COOKIE } from "@/lib/portal/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/portal/login", req.url));
  res.cookies.delete(PORTAL_COOKIE);
  return res;
}
