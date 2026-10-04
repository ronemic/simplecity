import { ALL_JURISDICTIONS_SLUG } from "@/lib/config/jurisdictions";
import { getCardEventsForCards, getPublishedCardsByIds } from "@/lib/db/queries";
import { isCardUuid, MAX_FOLLOWED_CARDS } from "@/lib/follows/followedCards";
import { consumeRateLimit, getRequestIp, rateLimitedResponse } from "@/lib/security/rateLimit";

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
  if (cardIds.length > MAX_FOLLOWED_CARDS || cardIds.some((id) => !isCardUuid(id))) {
    return jsonResponse({ error: "Invalid followed-card request." }, { status: 400 });
  }
  if (cardIds.length === 0) return jsonResponse({ cards: [], events: {} });

  const rateLimit = await consumeRateLimit({
    scope: "followed-cards-read-ip",
    identifier: getRequestIp(request),
    limit: 120,
    windowSeconds: 60 * 60,
    blockSeconds: 15 * 60
  });
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit.retryAfterSeconds);

  try {
    const cards = await getPublishedCardsByIds(cardIds, ALL_JURISDICTIONS_SLUG, locale);
    const events = await getCardEventsForCards(cards);
    return jsonResponse({ cards, events });
  } catch (error) {
    console.error("[SimpleCity] Failed to load followed cards:", error);
    return jsonResponse(
      { error: "Followed decisions are temporarily unavailable." },
      { status: 503 }
    );
  }
}
