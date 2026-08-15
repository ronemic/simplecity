import type { MeetingRow, SummaryCardRow } from "@/lib/types";

export const SANTA_BARBARA_BODY_VIEWS = ["all", "board", "planning"] as const;
export type SantaBarbaraBodyView = (typeof SANTA_BARBARA_BODY_VIEWS)[number];

export function normalizeSantaBarbaraBodyView(
  value?: string | null
): SantaBarbaraBodyView {
  if (value === "all" || value === "planning") return value;
  return "board";
}

export function isSantaBarbaraPlanningMeeting(
  meeting?: Pick<MeetingRow, "jurisdiction_slug" | "meeting_type" | "title"> | null
) {
  if (!meeting || meeting.jurisdiction_slug !== "santa-barbara-county") return false;
  return /planning commission|comisi[oó]n de planificaci[oó]n/i.test(
    `${meeting.meeting_type || ""} ${meeting.title || ""}`
  );
}

export function isSantaBarbaraPlanningCard(
  card: Pick<SummaryCardRow, "jurisdiction_slug" | "meetings">
) {
  const jurisdiction = card.jurisdiction_slug || card.meetings?.jurisdiction_slug;
  if (jurisdiction !== "santa-barbara-county") return false;
  return /planning commission|comisi[oó]n de planificaci[oó]n/i.test(
    `${card.meetings?.meeting_type || ""} ${card.meetings?.title || ""}`
  );
}

export function matchesSantaBarbaraBody(
  meeting: Pick<MeetingRow, "jurisdiction_slug" | "meeting_type" | "title">,
  body: SantaBarbaraBodyView
) {
  if (body === "all") {
    return meeting.jurisdiction_slug === "santa-barbara-county";
  }
  return body === "planning"
    ? isSantaBarbaraPlanningMeeting(meeting)
    : meeting.jurisdiction_slug === "santa-barbara-county" &&
        /board of supervisors|junta de supervisores/i.test(
          `${meeting.meeting_type || ""} ${meeting.title || ""}`
        );
}
