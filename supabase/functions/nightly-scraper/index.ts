Deno.serve(async (request) => {
  const appUrl = Deno.env.get("NEXT_PUBLIC_APP_URL");
  const cronSecret = Deno.env.get("SUPABASE_CRON_SECRET");

  if (!appUrl || !cronSecret) {
    return new Response(
      JSON.stringify({ error: "NEXT_PUBLIC_APP_URL and SUPABASE_CRON_SECRET are required." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(request.url);
  const jurisdiction = url.searchParams.get("jurisdiction") || "san-mateo-city";
  const scrapeUrl = new URL("/api/scrape", appUrl.replace(/\/$/, ""));
  scrapeUrl.searchParams.set("jurisdiction", jurisdiction);

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
