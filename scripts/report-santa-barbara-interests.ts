import "@/lib/env/bootstrap";
import { getServiceSupabaseClientForJurisdiction } from "@/lib/config/jurisdictions";

type InterestTotalRow = {
  summary_card_id: string;
  agenda_item: string | null;
  meeting_id: string | null;
  interest_signals: number | string;
  latest_interest_at: string | null;
};

const supabase = getServiceSupabaseClientForJurisdiction("santa-barbara-county");
const { data, error } = await supabase
  .from("santa_barbara_decision_interest_totals")
  .select("summary_card_id,agenda_item,meeting_id,interest_signals,latest_interest_at")
  .order("interest_signals", { ascending: false })
  .order("latest_interest_at", { ascending: false });

if (error) {
  throw new Error(`Failed to load Santa Barbara interest totals: ${error.message}`);
}

const rows = (data || []) as InterestTotalRow[];
if (rows.length === 0) {
  console.log("No Santa Barbara interest signals have been recorded yet.");
} else {
  console.table(
    rows.map((row) => ({
      interests: Number(row.interest_signals) || 0,
      agenda_item: row.agenda_item || "Untitled decision",
      card_id: row.summary_card_id,
      meeting_id: row.meeting_id || "",
      latest_interest_at: row.latest_interest_at || ""
    }))
  );
}
