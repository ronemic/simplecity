Deno.serve(async (request) => {
  const appUrl = getConfiguredAppUrl();
  const cronSecret = Deno.env.get("SUPABASE_CRON_SECRET");

  if (!cronSecret) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_CRON_SECRET is required." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(request.url);
  const jurisdiction = url.searchParams.get("jurisdiction") || "san-mateo-city";
  const scrapeUrl = new URL("/api/scrape", appUrl.replace(/\/$/, ""));
  scrapeUrl.searchParams.set("jurisdiction", jurisdiction);
  scrapeUrl.searchParams.set("background", "true");

  const response = await fetch(scrapeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`
    }
  });

  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" }
  });
});

function getConfiguredAppUrl() {
  const configured = normalizeAppUrl(Deno.env.get("NEXT_PUBLIC_APP_URL"), "");
  if (configured && !isLocalAppUrl(configured)) return configured;
  return "https://simplecity.app";
}

function normalizeAppUrl(value: string | null | undefined, fallback = "https://simplecity.app") {
  return String(value || "").trim().replace(/\/+$/, "") || fallback;
}

function isLocalAppUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return true;
  }
}
