import type { AgendaItem } from "@/lib/types";

const STRUCTURAL_AGENDA_HEADING = /^(?:consent\s+calendar|communications?|new\s+business|old\s+business|unfinished\s+business|regular\s+agenda|reports?|resolutions?\s+for\s+adoption|study\s+sessions?|public\s+hearings?|closed\s+sessions?)[\s:;,.\-–—]*$/i;

export function isStructuralAgendaHeadingText(value?: string | null) {
  return STRUCTURAL_AGENDA_HEADING.test(String(value || "").trim());
}

export function isStructuralAgendaHeading(
  item: Pick<AgendaItem, "title" | "rowText">
) {
  return isStructuralAgendaHeadingText(item.title || item.rowText);
}
