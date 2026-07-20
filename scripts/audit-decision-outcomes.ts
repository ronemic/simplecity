import "@/lib/env/bootstrap";
import {
  getJurisdictionBySlug,
  getJurisdictions,
  getServiceSupabaseClientForJurisdiction
} from "@/lib/config/jurisdictions";

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function normalized(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function main() {
  const requested = argument("jurisdiction") || "all";
  const jurisdictions = requested === "all"
    ? getJurisdictions()
    : [getJurisdictionBySlug(requested)].filter(Boolean);
  if (jurisdictions.length === 0) throw new Error(`Unknown jurisdiction: ${requested}`);

  const reports = [];
  for (const jurisdiction of jurisdictions) {
    if (!jurisdiction) continue;
    const supabase = getServiceSupabaseClientForJurisdiction(jurisdiction.slug);
    const [{ count: cardCount, error: cardError }, { data: outcomes, error: outcomeError }] =
      await Promise.all([
        supabase
          .from("summary_cards")
          .select("id", { count: "exact", head: true })
          .eq("jurisdiction_slug", jurisdiction.slug)
          .eq("is_published", true),
        supabase
          .from("decision_outcomes")
          .select("id,summary,source_text")
          .eq("jurisdiction_slug", jurisdiction.slug)
      ]);
    if (cardError) throw new Error(`${jurisdiction.name} card audit failed: ${cardError.message}`);
    if (outcomeError) throw new Error(`${jurisdiction.name} outcome audit failed: ${outcomeError.message}`);

    const rows = outcomes || [];
    const boilerplate = rows.filter((outcome) =>
      /official minutes record|motion and second|page\s+\d+\s+of\s+\d+|\baction\s*:/i.test(outcome.summary)
    ).length;
    const nearVerbatim = rows.filter((outcome) => {
      const summary = normalized(outcome.summary);
      const source = normalized(outcome.source_text);
      return summary.length > 20 && (source.includes(summary) || summary.includes(source));
    }).length;

    let spanishTranslations = 0;
    let translationTableAvailable = true;
    for (const outcomeIds of chunks(rows.map((outcome) => outcome.id), 200)) {
      if (outcomeIds.length === 0) continue;
      const { count, error } = await supabase
        .from("decision_outcome_translations")
        .select("id", { count: "exact", head: true })
        .eq("locale", "es")
        .in("decision_outcome_id", outcomeIds);
      if (error && /decision_outcome_translations|PGRST205/i.test(error.message)) {
        translationTableAvailable = false;
        spanishTranslations = 0;
        break;
      }
      if (error) throw new Error(`${jurisdiction.name} translation audit failed: ${error.message}`);
      spanishTranslations += count || 0;
    }

    reports.push({
      jurisdiction: jurisdiction.slug,
      publishedCards: cardCount || 0,
      outcomes: rows.length,
      visibleCoveragePercent: cardCount ? Math.round((rows.length / cardCount) * 1000) / 10 : 0,
      boilerplateSummaries: boilerplate,
      nearVerbatimSummaries: nearVerbatim,
      spanishTranslations,
      translationTableAvailable
    });
  }

  console.log(JSON.stringify(reports, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
