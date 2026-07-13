type MeetingStatusFields = {
  meeting_datetime?: string | null;
  section?: string | null;
  status?: string | null;
};

export function effectiveMeetingStatus(
  status?: string | null,
  meetingDatetime?: string | null,
  now: Date = new Date()
) {
  if (status !== "Upcoming" || !meetingDatetime) return status;

  const meetingTime = new Date(meetingDatetime).getTime();
  if (Number.isNaN(meetingTime) || meetingTime >= now.getTime()) return status;

  return "Past";
}

export function withEffectiveMeetingStatus<T extends MeetingStatusFields>(
  meeting: T,
  now: Date = new Date()
): T {
  const status = effectiveMeetingStatus(meeting.status, meeting.meeting_datetime, now);
  if (status === meeting.status) return meeting;

  return {
    ...meeting,
    status,
    section:
      meeting.section === "Unknown" ||
      meeting.section === "Upcoming Meetings" ||
      meeting.section === "Current And Upcoming Meetings"
        ? "Past Meetings"
        : meeting.section
  };
}
