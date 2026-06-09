import { getAuthenticatedAdmin } from "@/lib/supabase/admin";
import { runSimpleCityPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

async function isAuthorized(request: Request) {
  const cronSecret = process.env.SUPABASE_CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const admin = await getAuthenticatedAdmin();
  return Boolean(admin);
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "Not authorized." }, { status: 401 });
  }

  const result = await runSimpleCityPipeline({
    scrapeHtmlAgendas: true,
    downloadDocuments: true,
    persist: true,
    summarize: true
  });

  return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
}
