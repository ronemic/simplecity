import { runJurisdictionPipelines, runSimpleCityPipeline } from "@/lib/pipeline";
import { revalidatePublicContent } from "@/lib/db/revalidatePublicContent";
import {
  ALL_JURISDICTIONS_SLUG,
  getDefaultJurisdiction,
  requireValidJurisdictionSlug,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";
import { consumeRateLimit, rateLimitedResponse } from "@/lib/security/rateLimit";
import { isValidScrapeRequestSignature } from "@/lib/security/scrapeRequest";

export const runtime = "nodejs";
export const maxDuration = 300;

const globalForScrapers = globalThis as typeof globalThis & {
  simpleCityActiveScrapers?: Set<string>;
};

const activeScrapers = globalForScrapers.simpleCityActiveScrapers ?? new Set<string>();
globalForScrapers.simpleCityActiveScrapers = activeScrapers;

function scrapeApiEnabled() {
  return process.env.SCRAPE_API_ENABLED === "true";
}

function isAuthorized(request: Request) {
  return isValidScrapeRequestSignature({
    secret: process.env.SUPABASE_CRON_SECRET,
    timestamp: request.headers.get("x-simplecity-timestamp"),
    signature: request.headers.get("x-simplecity-signature"),
    requestUrl: request.url,
    method: request.method
  });
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = Response.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function getRequestedJurisdiction(request: Request) {
  const url = new URL(request.url);
  let requested = url.searchParams.get("jurisdiction");

  if (!requested) {
    const body = (await request.json().catch(() => null)) as { jurisdiction?: string } | null;
    requested = body?.jurisdiction || null;
  }

  return requireValidJurisdictionSlug(requested || getDefaultJurisdiction().slug);
}

export async function POST(request: Request) {
  if (!scrapeApiEnabled()) {
    return jsonResponse({ error: "Not found." }, { status: 404 });
  }

  if (!isAuthorized(request)) {
    return jsonResponse({ error: "Not authorized." }, { status: 401 });
  }

  const rateLimit = await consumeRateLimit({
    scope: "scrape-api-global",
    identifier: "authorized",
    limit: 12,
    windowSeconds: 60 * 60,
    blockSeconds: 60 * 60
  });
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  let jurisdiction;
  try {
    jurisdiction = await getRequestedJurisdiction(request);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Invalid jurisdiction." },
      { status: 400 }
    );
  }

  const options = {
    scrapeHtmlAgendas: true,
    downloadDocuments: true,
    persist: true,
    summarize: true
  };

  const url = new URL(request.url);
  const runInBackground = url.searchParams.get("background") === "true";

  if (runInBackground) {
    return startBackgroundScraper(jurisdiction, options);
  }

  const result =
    jurisdiction === ALL_JURISDICTIONS_SLUG
      ? await runJurisdictionPipelines(jurisdiction, options)
      : await runSimpleCityPipeline({
          ...options,
          jurisdiction
        });

  if (result.status !== "failed") {
    revalidatePublicContent();
  }

  return jsonResponse(result, { status: result.status === "failed" ? 500 : 200 });
}

function startBackgroundScraper(
  jurisdiction: JurisdictionSelection,
  options: {
    scrapeHtmlAgendas: boolean;
    downloadDocuments: boolean;
    persist: boolean;
    summarize: boolean;
  }
) {
  const key = jurisdiction;

  if (activeScrapers.has(key)) {
    return jsonResponse(
      { status: "already_running", jurisdiction },
      { status: 202 }
    );
  }

  activeScrapers.add(key);

  void (async () => {
    try {
      const result =
        jurisdiction === ALL_JURISDICTIONS_SLUG
          ? await runJurisdictionPipelines(jurisdiction, options)
          : await runSimpleCityPipeline({
              ...options,
              jurisdiction
            });

      if (result.status !== "failed") {
        revalidatePublicContent();
      }
    } catch (error) {
      console.error("Background scraper failed", error);
    } finally {
      activeScrapers.delete(key);
    }
  })();

  return jsonResponse(
    { status: "started", jurisdiction },
    { status: 202 }
  );
}
