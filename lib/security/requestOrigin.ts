/**
 * Same-origin check for state-changing API requests.
 *
 * Lives here rather than in the route module because a Next.js route file may
 * only export the HTTP method handlers and a few known config names. Exporting a
 * helper from one made `tsc --noEmit` fail the route's generated type constraint,
 * even though the build tolerated it.
 */
export function isAllowedInterestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // A missing Origin header means a non-browser or same-origin navigation.
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
