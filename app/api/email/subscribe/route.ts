import { createOrRefreshSubscription } from "@/lib/email/subscriptions";
import { getPublicAppUrlForRequest } from "@/lib/email/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    jurisdictions?: unknown;
    company?: unknown;
  };

  if (String(body.company || "").trim()) {
    return Response.json({ ok: true });
  }

  try {
    const jurisdictions = Array.isArray(body.jurisdictions)
      ? body.jurisdictions.map(String)
      : [];

    await createOrRefreshSubscription({
      email: String(body.email || ""),
      jurisdictions,
      baseUrl: getPublicAppUrlForRequest(request)
    });

    return Response.json({
      ok: true,
      message: "Check your inbox to confirm your SimpleCity email updates."
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to subscribe." },
      { status: 400 }
    );
  }
}
