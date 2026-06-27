import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n";

function queryLocale(value: string | null): Locale | null {
  return LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

export function middleware(request: NextRequest) {
  const locale = queryLocale(request.nextUrl.searchParams.get("lang"));
  if (!locale) return NextResponse.next();

  request.cookies.set(LOCALE_COOKIE, locale);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("cookie", request.cookies.toString());

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax"
  });

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"]
};
