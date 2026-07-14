export const MEETING_VIEW_PREFERENCE_COOKIE = "simplecity.meeting-view";
export const MEETING_VIEW_STORAGE_KEY = "simplecity.meeting-list-view";

export type MeetingView = "calendar" | "list";

export function normalizeMeetingView(value: string | null | undefined): MeetingView {
  return value === "list" ? "list" : "calendar";
}
