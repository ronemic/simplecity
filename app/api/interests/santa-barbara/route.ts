import {
  getSantaBarbaraInterestCardUpdates,
  setSantaBarbaraDecisionInterest
} from "@/lib/interests/santaBarbaraServer";
import {
  isInterestUuid,
  SANTA_BARBARA_INTEREST_JURISDICTION
} from "@/lib/interests/santaBarbara";
import { getPublishedCardsByIds } from "@/lib/db/queries";
import { consumeRateLimit, getRequestIp, rateLimitedResponse } from "@/lib/security/rateLimit";
import { isAllowedInterestOrigin } from "@/lib/security/requestOrigin";

export const runtime = "nodejs";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = Response.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cardIds = url.searchParams.getAll("id");
  const locale = url.searchParams.get("lang") === "es" ? "es" : "en";
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
    const [updates, cards] = await Promise.all([
      getSantaBarbaraInterestCardUpdates(cardIds),
      getPublishedCardsByIds(cardIds, SANTA_BARBARA_INTEREST_JURISDICTION, locale)
    ]);
    return jsonResponse({
      updates,
      cards
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
