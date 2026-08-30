import { NextRequest, NextResponse } from "next/server";
import { getPublishedCard } from "@/lib/db/queries";
import { getRequestLocale } from "@/lib/i18n/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid decision id" }, { status: 400 });
  }

  const requestedLocale = request.nextUrl.searchParams.get("lang");
  const urlLocale = requestedLocale === "en" || requestedLocale === "es" ? requestedLocale : null;
  const locale = urlLocale || (await getRequestLocale());
  const card = await getPublishedCard(id, locale);

  if (!card) {
    return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  }

  return NextResponse.json(
    { card },
    {
      headers: {
        // The URL locale makes this response safe to share between readers.
        // Browser and edge caches keep repeat previews from querying again.
        "Cache-Control": urlLocale
          ? "public, max-age=300, s-maxage=300, stale-while-revalidate=600"
          : "private, max-age=300"
      }
    }
  );
}
