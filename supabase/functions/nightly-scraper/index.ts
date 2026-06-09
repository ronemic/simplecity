Deno.serve(async () => {
  const appUrl = Deno.env.get("NEXT_PUBLIC_APP_URL");
  const cronSecret = Deno.env.get("SUPABASE_CRON_SECRET");

  if (!appUrl || !cronSecret) {
    return new Response(
      JSON.stringify({ error: "NEXT_PUBLIC_APP_URL and SUPABASE_CRON_SECRET are required." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/scrape`, {
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
