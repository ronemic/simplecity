import { assertAdminForRoute } from "@/lib/supabase/admin";
import { runSimpleCityPipeline } from "@/lib/pipeline";
import { revalidatePublicContent } from "@/lib/db/revalidatePublicContent";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const { response } = await assertAdminForRoute();
  if (response) return response;

  const result = await runSimpleCityPipeline({
    scrapeHtmlAgendas: true,
    downloadDocuments: true,
    persist: true,
    summarize: true
  });

  if (result.status !== "failed") {
    revalidatePublicContent();
  }

  return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
}
