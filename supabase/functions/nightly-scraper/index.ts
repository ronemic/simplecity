Deno.serve(async (request) => {
  const appUrl = getConfiguredAppUrl();
  const cronSecret = Deno.env.get("SUPABASE_CRON_SECRET");

  if (!cronSecret) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_CRON_SECRET is required." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response(
      JSON.stringify({ error: "Not authorized." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(request.url);
  const jurisdiction = url.searchParams.get("jurisdiction") || "san-mateo-city";
  const scrapeUrl = new URL("/api/scrape", appUrl.replace(/\/$/, ""));
  scrapeUrl.searchParams.set("jurisdiction", jurisdiction);
  scrapeUrl.searchParams.set("background", "true");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await createScrapeSignature(cronSecret, timestamp, scrapeUrl);

  const response = await fetch(scrapeUrl, {
    method: "POST",
    headers: {
      "X-SimpleCity-Timestamp": timestamp,
      "X-SimpleCity-Signature": signature
    }
  });

  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" }
  });
});

async function createScrapeSignature(secret: string, timestamp: string, url: URL) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const payload = `${timestamp}\nPOST\n${url.pathname}${url.search}`;
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

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
