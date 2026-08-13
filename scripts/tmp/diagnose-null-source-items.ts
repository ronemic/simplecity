import "@/lib/env/bootstrap";
import {
  getJurisdictionBySlug,
  getJurisdictions,
  getServiceSupabaseClientForJurisdiction
} from "@/lib/config/jurisdictions";
import { uniqueSourceItemIds } from "@/lib/utils/sourceItemIdentity";
import { resolveCardSourceItemId } from "@/lib/utils/cardSourceIdentity";
import { cleanText } from "@/lib/utils/slug";
import type { AgendaItem } from "@/lib/types";

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

type NullCard = {
  id: string;
  meeting_id: string | null;
  agenda_item: string | null;
  source_url: string | null;
  what_is_happening_points: string[] | null;
  is_published: boolean | null;
};

async function auditJurisdiction(slug: string, name: string, meetingLimit: number) {
  const supabase = getServiceSupabaseClientForJurisdiction(slug);

  const [{ count: totalCards }, { count: nullCards }] = await Promise.all([
    supabase
      .from("summary_cards")
      .select("id", { count: "exact", head: true })
      .eq("jurisdiction_slug", slug),
    supabase
      .from("summary_cards")
      .select("id", { count: "exact", head: true })
      .eq("jurisdiction_slug", slug)
      .is("source_item_id", null)
  ]);

  if (!nullCards) {
    console.log(`\n=== ${name} (${slug}) === ${totalCards || 0} cards, 0 unmatched.`);
    return;
  }

  const { data: cards, error: cardError } = await supabase
    .from("summary_cards")
    .select("id,meeting_id,agenda_item,source_url,what_is_happening_points,is_published")
    .eq("jurisdiction_slug", slug)
    .is("source_item_id", null)
    .limit(2000);
  if (cardError) throw new Error(`${name}: card fetch failed: ${cardError.message}`);

  const byMeeting = new Map<string, NullCard[]>();
  for (const card of (cards || []) as NullCard[]) {
    if (!card.meeting_id) continue;
    byMeeting.set(card.meeting_id, [...(byMeeting.get(card.meeting_id) || []), card]);
  }

  const meetingIds = [...byMeeting.keys()].slice(0, meetingLimit);
  const meetings = new Map<
    string,
    {
      external_id: string;
      title: string;
      date_text: string | null;
      status: string | null;
      cards_generated_at: string | null;
      llm_input_chars: number;
      items: AgendaItem[] | null;
    }
  >();

  for (const batch of chunks(meetingIds, 10)) {
    const { data, error } = await supabase
      .from("meetings")
      .select("id,external_id,title,date_text,status,cards_generated_at,llm_input_text,items:raw->items")
      .in("id", batch);
    if (error) throw new Error(`${name}: meeting fetch failed: ${error.message}`);
    for (const row of data || []) {
      meetings.set(row.id as string, {
        external_id: row.external_id as string,
        title: row.title as string,
        date_text: (row.date_text as string) || null,
        status: (row.status as string) || null,
        cards_generated_at: (row.cards_generated_at as string) || null,
        llm_input_chars: String(row.llm_input_text || "").length,
        items: (row.items as AgendaItem[] | null) || null
      });
    }
  }

  // How many cards on each inspected meeting DID get an id? A meeting where every
  // card is null points at meeting-level input; a mix points at per-card matching.
  const matchedPerMeeting = new Map<string, number>();
  for (const batch of chunks(meetingIds, 10)) {
    const { data, error } = await supabase
      .from("summary_cards")
      .select("meeting_id,source_item_id")
      .in("meeting_id", batch)
      .not("source_item_id", "is", null);
    if (error) throw new Error(`${name}: matched card fetch failed: ${error.message}`);
    for (const row of data || []) {
      const key = row.meeting_id as string;
      matchedPerMeeting.set(key, (matchedPerMeeting.get(key) || 0) + 1);
    }
  }
  let allNullMeetings = 0;
  let mixedMeetings = 0;
  for (const meetingId of meetingIds) {
    if ((matchedPerMeeting.get(meetingId) || 0) > 0) mixedMeetings += 1;
    else allNullMeetings += 1;
  }

  let meetingsWithoutRawItems = 0;
  let meetingsWithItems = 0;
  let cardsOnMeetingsWithoutItems = 0;
  let cardsWithBlankIdItems = 0;
  let cardsLostToDuplicateIds = 0;
  let cardsRematchableNow = 0;
  let cardsNoTitleMatch = 0;
  const samples: string[] = [];
  const noItemSamples: string[] = [];
  const coverage: string[] = [];
  let itemsEqualMatched = 0;
  let itemsExceedMatched = 0;
  let matchedExceedItems = 0;

  for (const meetingId of meetingIds) {
    const meeting = meetings.get(meetingId);
    const cardsForMeeting = byMeeting.get(meetingId) || [];
    const items = meeting?.items || [];

    if (items.length === 0) {
      meetingsWithoutRawItems += 1;
      cardsOnMeetingsWithoutItems += cardsForMeeting.length;
      if (noItemSamples.length < 8) {
        noItemSamples.push(
          `  ${meeting?.title || "?"} ${meeting?.date_text || ""} | ${cardsForMeeting.length} unmatched, ${matchedPerMeeting.get(meetingId) || 0} matched | llmChars=${meeting?.llm_input_chars ?? 0} | ${meeting?.external_id || "?"}`
        );
      }
      continue;
    }

    meetingsWithItems += 1;
    const withIds = items.filter((item) => String(item.externalId || "").trim());
    const unique = uniqueSourceItemIds(items);
    const duplicateIds = withIds.length - unique.size;
    const matched = matchedPerMeeting.get(meetingId) || 0;
    if (matched === items.length) itemsEqualMatched += 1;
    else if (items.length > matched) itemsExceedMatched += 1;
    else matchedExceedItems += 1;
    if (coverage.length < 12) {
      coverage.push(
        `  ${items.length} official items | ${matched} matched cards | ${cardsForMeeting.length} unmatched cards | ${meeting?.title || "?"} ${meeting?.date_text || ""}`
      );
    }

    for (const card of cardsForMeeting) {
      const resolved = resolveCardSourceItemId(
        { items },
        {
          sourceItemId: null,
          agendaItem: card.agenda_item || "",
          whatIsHappening: card.what_is_happening_points || [],
          source: card.source_url || ""
        }
      );
      if (resolved) {
        cardsRematchableNow += 1;
        continue;
      }

      const normalizedTitle = cleanText(card.agenda_item || "").toLowerCase();
      const titleMatch = items.find(
        (item) => cleanText(item.title || "").toLowerCase() === normalizedTitle
      );
      if (titleMatch && !String(titleMatch.externalId || "").trim()) {
        cardsWithBlankIdItems += 1;
      } else if (titleMatch && !unique.has(titleMatch.externalId)) {
        cardsLostToDuplicateIds += 1;
      } else {
        cardsNoTitleMatch += 1;
        if (samples.length < 12) {
          samples.push(
            `  [title diverges] ${matchedPerMeeting.get(meetingId) || 0} matched cards on this meeting | card "${(card.agenda_item || "").slice(0, 60)}" | items: ${items
              .slice(0, 2)
              .map((item) => `"${cleanText(item.title || "").slice(0, 45)}"`)
              .join(", ")} (${items.length} items, ${duplicateIds} dup ids)`
          );
        }
      }
    }
  }

  console.log(`\n=== ${name} (${slug}) ===`);
  console.log(`  cards: ${totalCards || 0} total, ${nullCards} unmatched (source_item_id null)`);
  console.log(`  unmatched cards span ${byMeeting.size} meetings; inspected ${meetingIds.length}`);
  console.log(`  inspected meetings where EVERY card is unmatched: ${allNullMeetings}; mixed: ${mixedMeetings}`);
  console.log(`  meetings with zero raw.items: ${meetingsWithoutRawItems} (${cardsOnMeetingsWithoutItems} cards)`);
  console.log(`  meetings with raw.items: ${meetingsWithItems}`);
  console.log(`    cards re-matchable with today's matcher: ${cardsRematchableNow}`);
  console.log(`    cards whose title matches an item with a blank externalId: ${cardsWithBlankIdItems}`);
  console.log(`    cards whose title matches an item dropped as a duplicate id: ${cardsLostToDuplicateIds}`);
  console.log(`    cards with no title match at all: ${cardsNoTitleMatch}`);
  console.log(
    `  item-vs-matched-card coverage: exact ${itemsEqualMatched}, items>matched ${itemsExceedMatched}, matched>items ${matchedExceedItems}`
  );
  if (coverage.length) {
    console.log("  coverage detail (meetings that DO have raw.items):");
    for (const line of coverage) console.log(line);
  }
  if (noItemSamples.length) {
    console.log("  meetings with zero raw.items:");
    for (const line of noItemSamples) console.log(line);
  }
  if (samples.length) {
    console.log("  unmatched card samples:");
    for (const sample of samples.slice(0, 5)) console.log(sample);
  }
}

async function main() {
  const requested = argument("jurisdiction") || "san-mateo-county";
  const meetingLimit = Number(argument("meetings") || "40");
  const jurisdictions =
    requested === "all" ? getJurisdictions() : [getJurisdictionBySlug(requested)].filter(Boolean);
  if (jurisdictions.length === 0) throw new Error(`Unknown jurisdiction: ${requested}`);

  for (const jurisdiction of jurisdictions) {
    if (!jurisdiction) continue;
    try {
      await auditJurisdiction(jurisdiction.slug, jurisdiction.name, meetingLimit);
    } catch (error) {
      console.log(`\n=== ${jurisdiction.name} (${jurisdiction.slug}) === skipped: ${error instanceof Error ? error.message : error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
