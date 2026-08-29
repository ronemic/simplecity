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
  const urlLocale = requestedLocale === "en" || requestedLocale === "es" ? requestedLocale : null;
  const locale = urlLocale || (await getRequestLocale());
  const categories = jurisdiction === "los-altos-school-district" ? SCHOOL_CATEGORIES : CATEGORIES;
  const category = categoryFromSlug(params.get("category") || undefined, categories);
  const timeframe = normalizeDecisionMapTimeframe(params.get("mapRange"));
  const body = jurisdiction === "santa-barbara-county"
    ? normalizeSantaBarbaraBodyView(params.get("body") || undefined)
    : undefined;
  // The planning body has no recorded results, so the list view drops the
  // result filter for it. The map reads the same URL and has to agree.
  const result = body === "planning"
    ? undefined
    : decisionResultFilterFromSlug(params.get("result"));

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
        // Only URL-pinned locales are safe in a shared cache: without `lang`
        // the body is chosen by the locale cookie, which is not in the key.
        "Cache-Control": urlLocale
          ? "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
          : "private, max-age=60"
      }
    }
  );
}
