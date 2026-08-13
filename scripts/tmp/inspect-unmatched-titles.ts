import "@/lib/env/bootstrap";
import { getServiceSupabaseClientForJurisdiction } from "@/lib/config/jurisdictions";

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

async function main() {
  const slug = argument("jurisdiction") || "san-mateo-county";
  const supabase = getServiceSupabaseClientForJurisdiction(slug);

  const { data: cards, error } = await supabase
    .from("summary_cards")
    .select("agenda_item,meeting_id,meetings!inner(title,date_text)")
    .eq("jurisdiction_slug", slug)
    .is("source_item_id", null)
    .limit(500);
  if (error) throw new Error(error.message);

  const byMeeting = new Map<string, string[]>();
  for (const card of cards || []) {
    const meeting = card.meetings as unknown as { title: string; date_text: string };
    const key = `${meeting.title} ${meeting.date_text || ""}`;
    byMeeting.set(key, [...(byMeeting.get(key) || []), card.agenda_item as string]);
  }

  const ranked = [...byMeeting.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6);
  for (const [meeting, titles] of ranked) {
    console.log(`\n## ${meeting} — ${titles.length} unmatched cards`);
    for (const title of titles) console.log(`  - ${title}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
