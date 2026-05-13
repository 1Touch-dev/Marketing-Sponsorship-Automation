import { NextResponse } from "next/server";
import { gmailAuthUrl } from "@/lib/gmail/client";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const url = gmailAuthUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
