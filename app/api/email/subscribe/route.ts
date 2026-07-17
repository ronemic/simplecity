import {
  createOrRefreshSubscription,
  EmailSubscriptionInputError,
  EmailSubscriptionRateLimitError,
  normalizeSubscriberEmail
} from "@/lib/email/subscriptions";
import { getPublicAppUrlForRequest } from "@/lib/email/config";
import { consumeRateLimit, getRequestIp, rateLimitedResponse } from "@/lib/security/rateLimit";

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
    const email = String(body.email || "");
    const ipLimit = await consumeRateLimit({
      scope: "email-subscribe-ip",
      identifier: getRequestIp(request),
      limit: 10,
      windowSeconds: 60 * 60,
      blockSeconds: 60 * 60
    });
    if (!ipLimit.allowed) return rateLimitedResponse(ipLimit.retryAfterSeconds);

    const emailLimit = await consumeRateLimit({
      scope: "email-subscribe-address",
      identifier: normalizeSubscriberEmail(email),
      limit: 1,
      windowSeconds: 15 * 60,
      blockSeconds: 15 * 60
    });
    if (!emailLimit.allowed) return rateLimitedResponse(emailLimit.retryAfterSeconds);

    const jurisdictions = Array.isArray(body.jurisdictions)
      ? body.jurisdictions.map(String)
      : [];

    await createOrRefreshSubscription({
      email,
      jurisdictions,
      baseUrl: getPublicAppUrlForRequest(request)
    });

    return Response.json({
      ok: true,
      message:
        "Check your inbox to confirm your SimpleCity email updates. If you were already subscribed, your preferences will update after you confirm."
    });
  } catch (error) {
    if (error instanceof EmailSubscriptionInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof EmailSubscriptionRateLimitError) {
      return rateLimitedResponse(error.retryAfterSeconds, error.message);
    }

    console.error("[SimpleCity] Email subscription failed:", error);
    return Response.json(
      { error: "We could not start that subscription. Please try again in a moment." },
      { status: 500 }
    );
  }
}
