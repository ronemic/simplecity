import "@/lib/env/bootstrap";
import { getJurisdictions, getServiceSupabaseClientForJurisdiction } from "@/lib/config/jurisdictions";
import { areLikelySameAgendaItem } from "@/lib/utils/agendaItemIdentity";

type Card = { id: string; meeting_id: string | null; agenda_item: string | null; source_item_id: string | null };

async function main() {
  for (const jurisdiction of getJurisdictions()) {
    let supabase;
    try {
      supabase = getServiceSupabaseClientForJurisdiction(jurisdiction.slug);
    } catch {
      continue;
    }

    const { data, error } = await supabase
      .from("summary_cards")
      .select("id,meeting_id,agenda_item,source_item_id")
      .eq("jurisdiction_slug", jurisdiction.slug)
      .limit(5000);
    if (error) {
      console.log(`${jurisdiction.name}: skipped (${error.message})`);
      continue;
    }

    const byMeeting = new Map<string, Card[]>();
    for (const card of (data || []) as Card[]) {
      if (!card.meeting_id) continue;
      byMeeting.set(card.meeting_id, [...(byMeeting.get(card.meeting_id) || []), card]);
    }

    let bothNull = 0;
    let mixed = 0;
    let bothIds = 0;
    const examples: string[] = [];
    for (const cards of byMeeting.values()) {
      for (let i = 0; i < cards.length; i += 1) {
        for (let j = i + 1; j < cards.length; j += 1) {
          const a = cards[i];
          const b = cards[j];
          if (!areLikelySameAgendaItem(a.agenda_item || "", b.agenda_item || "")) continue;
          if (!a.source_item_id && !b.source_item_id) bothNull += 1;
          else if (a.source_item_id && b.source_item_id) bothIds += 1;
          else {
            mixed += 1;
            if (examples.length < 3) {
              examples.push(`    "${a.agenda_item}" [${a.source_item_id || "null"}] ~ "${b.agenda_item}" [${b.source_item_id || "null"}]`);
            }
          }
        }
      }
    }

    const total = bothNull + mixed + bothIds;
    if (total === 0) {
      console.log(`${jurisdiction.name}: no near-duplicate pairs.`);
      continue;
    }
    console.log(
      `${jurisdiction.name}: ${total} near-duplicate pairs — both null ${bothNull}, one null ${mixed}, both have ids ${bothIds}`
    );
    for (const example of examples) console.log(example);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
