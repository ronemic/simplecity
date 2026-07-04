import { NextResponse } from "next/server";
import { unsubscribeEmailSubscriber } from "@/lib/email/subscriptions";
import { getPublicAppUrlForRequest } from "@/lib/email/config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const redirectUrl = new URL("/subscribe", getPublicAppUrlForRequest(request));

  if (!token) {
    redirectUrl.searchParams.set("status", "invalid-unsubscribe");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const subscriber = await unsubscribeEmailSubscriber(token);
    redirectUrl.searchParams.set("status", subscriber ? "unsubscribed" : "invalid-unsubscribe");
  } catch {
    redirectUrl.searchParams.set("status", "error");
  }

  return NextResponse.redirect(redirectUrl);
}
