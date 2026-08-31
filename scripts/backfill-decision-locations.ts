import "@/lib/env/bootstrap";
import {
  getJurisdictions,
  getServiceSupabaseClientsForSelection,
  requireValidJurisdictionSlug
} from "@/lib/config/jurisdictions";
import {
  clearedDecisionLocation,
  extractStreetAddressCandidate,
  locateDecisionFromSource
} from "@/lib/maps/decisionLocation";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const retry = args.includes("--retry");
const recheck = args.includes("--recheck");
const jurisdictionArg = args.find((arg) => arg.startsWith("--jurisdiction="))?.split("=")[1];
const limitArg = Number.parseInt(
  args.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || "500",
  10
);
const limit = Number.isFinite(limitArg) ? Math.max(1, Math.min(limitArg, 5000)) : 500;
const apiKey = process.env.MAPTILER_GEOCODING_API_KEY;

// A recheck never geocodes, so it runs without a geocoding key.
if (!apiKey && !recheck) {
  throw new Error("Set MAPTILER_GEOCODING_API_KEY before backfilling locations.");
}

const jurisdictions = jurisdictionArg
  ? [getJurisdictions().find((entry) => entry.slug === requireValidJurisdictionSlug(jurisdictionArg))]
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  : getJurisdictions();

let candidates = 0;
let verified = 0;
let unresolved = 0;
let cleared = 0;

for (const jurisdiction of jurisdictions) {
  const [{ supabase }] = getServiceSupabaseClientsForSelection(jurisdiction.slug);
  let query = supabase
    .from("summary_cards")
    .select("id,model_input_text,agenda_item,location_status,location_label")
    .eq("jurisdiction_slug", jurisdiction.slug)
    .eq("is_published", true);

  // A recheck revisits pins that are already stored as verified, so extractor
  // changes that disqualify an address can retire the pin it produced. Manually
  // placed locations are never machine-derived and stay untouched.
  query = recheck
    ? query.eq("location_status", "verified").eq("location_method", "geocoded")
    : retry
      ? query.or("location_status.is.null,location_status.neq.verified")
      : query.is("location_status", null);

  const { data, error } = await query
    .order("decision_sort_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load ${jurisdiction.name} cards: ${error.message}`);
  }

  for (const card of data || []) {
    candidates += 1;
    // Newer cards retain their exact official source excerpt. Older cards can
    // still use the agenda-item title, which is the narrowest source-grounded
    // field available without trusting generated explanatory copy.
    const sourceText = card.model_input_text || card.agenda_item;

    // Rechecks only ever retire a pin, so they re-run the extractor alone and
    // leave every still-valid address at the coordinates it already has --
    // no geocoding calls, and no chance of moving a correct pin.
    if (recheck) {
      if (extractStreetAddressCandidate(sourceText)) continue;
      cleared += 1;
      console.log(`  clearing ${card.agenda_item || card.id} -> ${card.location_label}`);
      if (execute) {
        const { error: clearError } = await supabase
          .from("summary_cards")
          .update(clearedDecisionLocation())
          .eq("id", card.id);
        if (clearError) {
          throw new Error(`Failed to clear card ${card.id}: ${clearError.message}`);
        }
      }
      continue;
    }

    const location = await locateDecisionFromSource(sourceText, jurisdiction, { apiKey });
    if (!location) continue;
    if (location.location_status === "verified") verified += 1;
    else unresolved += 1;

    if (execute) {
      const { error: updateError } = await supabase
        .from("summary_cards")
        .update(location)
        .eq("id", card.id);
      if (updateError) {
        throw new Error(`Failed to update card ${card.id}: ${updateError.message}`);
      }
    }
  }

  console.log(
    `${jurisdiction.name}: reviewed ${(data || []).length} card(s)${execute ? "" : " (dry run)"}`
  );
}

console.log(
  recheck
    ? `Decision locations: ${candidates} verified pin(s) rechecked, ${cleared} no longer qualify${
        execute ? " and were cleared" : ". Re-run with --execute to save results"
      }.`
    : `Decision locations: ${candidates} checked, ${verified} verified, ${unresolved} unresolved${
        execute ? "" : ". Re-run with --execute to save results"
      }.${retry ? " Previously unresolved cards were retried." : " Use --retry to revisit unresolved cards."}`
);
