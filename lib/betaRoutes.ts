export const BETA_PREFIX = "/beta";
export const BETA_REQUEST_HEADER = "x-simplecity-beta";

export function isBetaPath(pathname: string) {
  return pathname === BETA_PREFIX || pathname.startsWith(`${BETA_PREFIX}/`);
}

export function withoutBetaPrefix(pathname: string) {
  if (!isBetaPath(pathname)) return pathname;
  return pathname.slice(BETA_PREFIX.length) || "/";
}

export function siteHref(href: string, beta: boolean) {
  if (!beta || !href.startsWith("/") || href.startsWith("//")) return href;
  const pathname = href.split(/[?#]/, 1)[0];
  if (isBetaPath(pathname) || pathname === "/api" || pathname.startsWith("/api/")) return href;
  return pathname === "/" ? `${BETA_PREFIX}${href.slice(1)}` : `${BETA_PREFIX}${href}`;
}
