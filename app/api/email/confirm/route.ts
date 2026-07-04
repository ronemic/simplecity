import { NextResponse } from "next/server";
import { confirmEmailSubscription } from "@/lib/email/subscriptions";
import { getPublicAppUrlForRequest } from "@/lib/email/config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const redirectUrl = new URL("/subscribe", getPublicAppUrlForRequest(request));

  if (!token) {
    redirectUrl.searchParams.set("status", "invalid");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const subscriber = await confirmEmailSubscription(token);
    redirectUrl.searchParams.set("status", subscriber ? "confirmed" : "invalid");
  } catch {
    redirectUrl.searchParams.set("status", "error");
  }

  return NextResponse.redirect(redirectUrl);
}
