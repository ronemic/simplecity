import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n";
import { BETA_REQUEST_HEADER, isBetaPath, withoutBetaPrefix } from "@/lib/betaRoutes";

function queryLocale(value: string | null): Locale | null {
  return LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

export function proxy(request: NextRequest) {
  const beta = isBetaPath(request.nextUrl.pathname);
  const pathname = withoutBetaPrefix(request.nextUrl.pathname);
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
  const ignoresJurisdiction = ["/about", "/subscribe"].includes(pathname);
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

  const requestHeaders = new Headers(request.headers);
  // Derive the theme from the URL, never from a browser-supplied header or cookie.
  requestHeaders.set(BETA_REQUEST_HEADER, beta ? "1" : "0");
  if (locale) {
    request.cookies.set(LOCALE_COOKIE, locale);
    requestHeaders.set("cookie", request.cookies.toString());
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (locale) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax"
    });
  }
  if (beta) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/summarize",
    "/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)"
  ]
};
