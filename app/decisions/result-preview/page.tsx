import type { Metadata } from "next";
import { SummaryCard } from "@/components/SummaryCard";
import type { DecisionOutcome, MeetingRow, SummaryCardRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Decision result UI preview | SimpleCity",
  robots: { index: false, follow: false }
};

const meetingBase: MeetingRow = {
  id: "result-preview-meeting",
  external_id: "preview-0714",
  jurisdiction_name: "San Mateo County",
  jurisdiction_slug: "san-mateo-county",
  platform: "preview",
  title: "Board of Supervisors",
  meeting_type: "Board of Supervisors",
  date_text: "July 14, 2026",
  time_text: "9:00 AM",
  location: "County Government Center",
  meeting_datetime: "2026-07-14T16:00:00.000Z",
  section: "Past Meetings",
  status: "Past",
  source_type: "preview",
  source_url: "https://www.smcgov.org/bos",
  row_text: null,
  has_html_agenda: true,
  has_pdf: true,
  llm_input_text: null,
  public_comments_input_text: null,
  source_hash: null,
  summarized_source_hash: null,
  cards_generated_at: null,
  extraction_notes: null,
  raw: null,
  scraped_at: null,
  created_at: "2026-07-10T18:00:00.000Z",
  updated_at: "2026-07-14T22:30:00.000Z"
};

const approvedCard: SummaryCardRow = {
  id: "result-preview-approved",
  meeting_id: meetingBase.id,
  jurisdiction_name: "San Mateo County",
  jurisdiction_slug: "san-mateo-county",
  platform: "preview",
  agenda_item: "Approve funding for 120 new affordable homes in North Fair Oaks",
  what_is_happening: [
    "The county considered a $14.2 million loan to help build 120 income-restricted apartments near Middlefield Road."
  ],
  what_is_happening_points: [
    "The county considered a $14.2 million loan to help build 120 income-restricted apartments near Middlefield Road."
  ],
  why_it_matters:
    "The project would add below-market homes in an area where housing costs have risen quickly.",
  who_it_affects: ["North Fair Oaks residents", "Renters", "Nearby neighbors"],
  category_tags: ["Housing"],
  status: "Past",
  comment_window_opens: null,
  comment_window_closes: null,
  how_to_act_attend: null,
  how_to_act_email: null,
  how_to_act_submit_comment: null,
  source_url: "https://www.smcgov.org/bos",
  confidence: "high",
  is_published: true,
  is_featured: false,
  admin_notes: null,
  decision_sort_at: "2026-07-14T22:30:00.000Z",
  created_at: "2026-07-10T18:00:00.000Z",
  updated_at: "2026-07-14T22:30:00.000Z",
  meetings: meetingBase
};

const approvedOutcome: DecisionOutcome = {
  kind: "approved",
  headline: "Approved unanimously",
  summary:
    "The Board approved the loan on July 14, 2026. Construction is expected to begin in spring 2027.",
  decided_at: "Jul 14, 2026",
  vote: "5–0",
  next_step: "Final loan documents and building permits",
  source_url: "https://www.smcgov.org/bos"
};

const pendingCard: SummaryCardRow = {
  ...approvedCard,
  id: "result-preview-pending",
  agenda_item: "Adopt an ordinance to expand tenant protections",
  what_is_happening: [
    "The county is considering stronger notice requirements and limits on rent increases for certain rental units."
  ],
  what_is_happening_points: [
    "The county is considering stronger notice requirements and limits on rent increases for certain rental units."
  ],
  why_it_matters: "The rules could change notice periods and annual costs for renters and landlords.",
  who_it_affects: ["Renters", "Landlords"],
  status: "Upcoming vote",
  comment_window_closes: "2026-07-28T16:00:00.000Z",
  decision_sort_at: "2026-07-28T16:00:00.000Z",
  meetings: {
    ...meetingBase,
    id: "result-preview-pending-meeting",
    external_id: "preview-0728",
    date_text: "July 28, 2026",
    meeting_datetime: "2026-07-28T16:00:00.000Z",
    status: "Upcoming"
  }
};

export default function DecisionResultPreviewPage() {
  return (
    <div className="section-shell py-10">
      <div className="mb-7 max-w-3xl">
        <h1 className="page-title">San Mateo County decisions</h1>
        <p className="page-copy mt-3 text-base">
          Track proposals, votes, and what happens next — in plain English.
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-3 border-b border-black/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black text-ink">Decision result UI preview</p>
          <p className="mt-1 text-sm leading-6 text-black/60">
            Results appear inside the original decision when a verified update is available.
          </p>
        </div>
        <p className="text-sm font-bold text-civic">2 example decisions</p>
      </div>

      <div className="grid gap-4">
        <SummaryCard
          card={approvedCard}
          outcome={approvedOutcome}
          defaultOutcomeExpanded
          locale="en"
        />
        <SummaryCard card={pendingCard} locale="en" />
      </div>
    </div>
  );
}
