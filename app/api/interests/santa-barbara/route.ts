import {
  getSantaBarbaraInterestCardUpdates,
  setSantaBarbaraDecisionInterest
} from "@/lib/interests/santaBarbaraServer";
import { isInterestUuid } from "@/lib/interests/santaBarbara";
import { consumeRateLimit, getRequestIp, rateLimitedResponse } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = Response.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function isAllowedInterestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return false;

    const forwardedProtocol =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      requestUrl.protocol.replace(/:$/, "");
    const requestHosts = [
      requestUrl.host,
      request.headers.get("host")?.split(",")[0]?.trim(),
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    ].filter((host): host is string => Boolean(host));

    return requestHosts.some((host) => {
      try {
        return originUrl.origin === new URL(`${forwardedProtocol}://${host}`).origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cardIds = url.searchParams.getAll("id");
  if (cardIds.length > 50 || cardIds.some((id) => !isInterestUuid(id))) {
    return jsonResponse({ error: "Invalid interested-card request." }, { status: 400 });
  }

  const rateLimit = await consumeRateLimit({
    scope: "santa-barbara-interest-read-ip",
    identifier: getRequestIp(request),
    limit: 120,
    windowSeconds: 60 * 60,
    blockSeconds: 15 * 60
  });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit.retryAfterSeconds);

  try {
    return jsonResponse({
      cards: await getSantaBarbaraInterestCardUpdates(cardIds)
    });
  } catch (error) {
    console.error("[SimpleCity] Failed to load Santa Barbara interested cards:", error);
    return jsonResponse(
      { error: "Interested-card updates are temporarily unavailable." },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  if (!isAllowedInterestOrigin(request)) {
    return jsonResponse({ error: "Request origin is not allowed." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonResponse({ error: "JSON is required." }, { status: 415 });
  }

  const body = (await request.json().catch(() => null)) as {
    cardId?: unknown;
    deviceToken?: unknown;
    interested?: unknown;
  } | null;
  if (
    !body ||
    !isInterestUuid(body.cardId) ||
    !isInterestUuid(body.deviceToken) ||
    typeof body.interested !== "boolean"
  ) {
    return jsonResponse({ error: "Invalid interest request." }, { status: 400 });
  }

  const ip = getRequestIp(request);
  const [ipLimit, deviceLimit] = await Promise.all([
    consumeRateLimit({
      scope: "santa-barbara-interest-write-ip",
      identifier: ip,
      limit: 200,
      windowSeconds: 60 * 60,
      blockSeconds: 60 * 60
    }),
    consumeRateLimit({
      scope: "santa-barbara-interest-write-device",
      identifier: body.deviceToken,
      limit: 250,
      windowSeconds: 60 * 60,
      blockSeconds: 60 * 60
    })
  ]);
  if (!ipLimit.allowed || !deviceLimit.allowed) {
    return rateLimitedResponse(Math.max(ipLimit.retryAfterSeconds, deviceLimit.retryAfterSeconds));
  }

  if (body.interested) {
    const cardIpLimit = await consumeRateLimit({
      scope: "santa-barbara-interest-add-card-ip",
      identifier: `${body.cardId}:${ip}`,
      limit: 8,
      windowSeconds: 24 * 60 * 60,
      blockSeconds: 24 * 60 * 60
    });
    if (!cardIpLimit.allowed) return rateLimitedResponse(cardIpLimit.retryAfterSeconds);
  }

  try {
    const result = await setSantaBarbaraDecisionInterest({
      cardId: body.cardId,
      deviceToken: body.deviceToken,
      interested: body.interested
    });
    if (!result) return jsonResponse({ error: "Decision card not found." }, { status: 404 });
    return jsonResponse(result);
  } catch (error) {
    console.error("[SimpleCity] Failed to update Santa Barbara interest:", error);
    return jsonResponse(
      { error: "The interest pilot is temporarily unavailable." },
      { status: 503 }
    );
  }
}
