import type { MeetingRow } from "@/lib/types";

export function getAdjacentMeetings(meetings: MeetingRow[], currentMeetingId: string) {
  const currentIndex = meetings.findIndex((meeting) => meeting.id === currentMeetingId);

  if (currentIndex === -1) {
    return {
      newerMeeting: null,
      olderMeeting: null
    };
  }

  return {
    newerMeeting: currentIndex > 0 ? meetings[currentIndex - 1] : null,
    olderMeeting: currentIndex < meetings.length - 1 ? meetings[currentIndex + 1] : null
  };
}
