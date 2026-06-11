import { getAuthenticatedAdmin } from "@/lib/supabase/admin";
import { runJurisdictionPipelines, runSimpleCityPipeline } from "@/lib/pipeline";
import { revalidatePublicContent } from "@/lib/db/revalidatePublicContent";
import {
  ALL_JURISDICTIONS_SLUG,
  getDefaultJurisdiction,
  requireValidJurisdictionSlug,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";

export const runtime = "nodejs";
export const maxDuration = 300;

const globalForScrapers = globalThis as typeof globalThis & {
  simpleCityActiveScrapers?: Set<string>;
};

const activeScrapers = globalForScrapers.simpleCityActiveScrapers ?? new Set<string>();
globalForScrapers.simpleCityActiveScrapers = activeScrapers;

async function isAuthorized(request: Request) {
  const cronSecret = process.env.SUPABASE_CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const admin = await getAuthenticatedAdmin();
  return Boolean(admin);
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
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "Not authorized." }, { status: 401 });
  }

  let jurisdiction;
  try {
    jurisdiction = await getRequestedJurisdiction(request);
  } catch (error) {
    return Response.json(
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

  return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
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
    return Response.json(
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

  return Response.json(
    { status: "started", jurisdiction },
    { status: 202 }
  );
}
