import { assertAdminForRoute } from "@/lib/supabase/admin";
import { runJurisdictionPipelines, runSimpleCityPipeline } from "@/lib/pipeline";
import { revalidatePublicContent } from "@/lib/db/revalidatePublicContent";
import {
  ALL_JURISDICTIONS_SLUG,
  getDefaultJurisdiction,
  requireValidJurisdictionSlug
} from "@/lib/config/jurisdictions";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  const { response } = await assertAdminForRoute();
  if (response) return response;

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
