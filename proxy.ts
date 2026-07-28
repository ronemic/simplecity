import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n";

function queryLocale(value: string | null): Locale | null {
  return LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/api/summarize"
  ) {
    return NextResponse.rewrite(new URL("/__simplecity_not_found__", request.url));
  }

  const hasLanguageParam = request.nextUrl.searchParams.has("lang");
  const locale = queryLocale(request.nextUrl.searchParams.get("lang"));
  const legacyJurisdiction =
    request.nextUrl.searchParams.get("jurisdiction") === "san-mateo-city";
  const ignoresJurisdiction = ["/about", "/subscribe", "/topics"].includes(pathname);
  const hasIgnoredJurisdiction =
    ignoresJurisdiction && request.nextUrl.searchParams.has("jurisdiction");
  const invalidLanguageParam = hasLanguageParam && !locale;
  if (legacyJurisdiction || hasIgnoredJurisdiction || invalidLanguageParam) {
    const canonicalUrl = request.nextUrl.clone();
    if (invalidLanguageParam) canonicalUrl.searchParams.delete("lang");
    if (legacyJurisdiction) canonicalUrl.searchParams.set("jurisdiction", "san-mateo");
    if (ignoresJurisdiction) canonicalUrl.searchParams.delete("jurisdiction");
    const response = NextResponse.redirect(canonicalUrl, 307);
    if (locale) {
      response.cookies.set(LOCALE_COOKIE, locale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax"
      });
    }
    return response;
  }

  if (!locale) return NextResponse.next();

  request.cookies.set(LOCALE_COOKIE, locale);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("cookie", request.cookies.toString());
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax"
  });
  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/summarize",
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      has: [{ type: "query", key: "lang" }]
    },
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      has: [{ type: "query", key: "jurisdiction" }]
    }
  ]
};
