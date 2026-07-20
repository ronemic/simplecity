import crypto from "node:crypto";
import type { DecisionOutcome, MeetingRow, SummaryCardRow } from "@/lib/types";
import { summaryPointsStorageText } from "@/lib/utils/summaryPoints";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ");
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)])
    );
  }
  return value ?? null;
}

function fingerprint(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

export function meetingTranslationFingerprint(
  meeting: Pick<MeetingRow, "title" | "meeting_type">
) {
  return fingerprint({
    title: meeting.title,
    meeting_type: meeting.meeting_type
  });
}

export function summaryCardTranslationFingerprint(
  card: Pick<
    SummaryCardRow,
    | "agenda_item"
    | "what_is_happening"
    | "why_it_matters"
    | "who_it_affects"
    | "status"
    | "comment_window_opens"
    | "comment_window_closes"
    | "how_to_act_attend"
    | "how_to_act_email"
    | "how_to_act_submit_comment"
  >
) {
  return fingerprint({
    agenda_item: card.agenda_item,
    what_is_happening: summaryPointsStorageText(card.what_is_happening),
    why_it_matters: card.why_it_matters,
    who_it_affects: card.who_it_affects,
    status: card.status,
    comment_window_opens: card.comment_window_opens,
    comment_window_closes: card.comment_window_closes,
    how_to_act_attend: card.how_to_act_attend,
    how_to_act_email: card.how_to_act_email,
    how_to_act_submit_comment: card.how_to_act_submit_comment
  });
}

export function decisionOutcomeTranslationFingerprint(
  outcome: Pick<DecisionOutcome, "headline" | "summary" | "vote" | "next_step">
) {
  return fingerprint({
    headline: outcome.headline,
    summary: outcome.summary,
    vote: outcome.vote,
    next_step: outcome.next_step
  });
}
