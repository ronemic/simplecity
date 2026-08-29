import { NextRequest, NextResponse } from "next/server";
import { getDecisionMapPoints } from "@/lib/db/queries";
import { normalizeJurisdictionSelection } from "@/lib/config/jurisdictions";
import { categoryFromSlug } from "@/lib/utils/decisionFilters";
import { decisionResultFilterFromSlug } from "@/lib/utils/decisionResultFilter";
import { normalizeSantaBarbaraBodyView } from "@/lib/utils/santaBarbaraBody";
import { getRequestLocale } from "@/lib/i18n/server";
import { CATEGORIES, SCHOOL_CATEGORIES } from "@/lib/constants";
import { normalizeDecisionMapTimeframe } from "@/lib/maps/timeframe";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const jurisdiction = normalizeJurisdictionSelection(params.get("jurisdiction") || undefined);
  const requestedLocale = params.get("lang");
  const locale = requestedLocale === "en" || requestedLocale === "es"
    ? requestedLocale
    : await getRequestLocale();
  const categories = jurisdiction === "los-altos-school-district" ? SCHOOL_CATEGORIES : CATEGORIES;
  const category = categoryFromSlug(params.get("category") || undefined, categories);
  const result = decisionResultFilterFromSlug(params.get("result"));
  const timeframe = normalizeDecisionMapTimeframe(params.get("mapRange"));
  const body = jurisdiction === "santa-barbara-county"
    ? normalizeSantaBarbaraBodyView(params.get("body") || undefined)
    : undefined;

  const points = await getDecisionMapPoints({
    jurisdiction,
    locale,
    search: params.get("q") || "",
    category,
    result,
    timeframe,
    body: body === "all" ? undefined : body
  });

  return NextResponse.json(
    { points, count: points.length },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
      }
    }
  );
}
