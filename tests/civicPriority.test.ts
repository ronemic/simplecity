import assert from "node:assert/strict";
import test from "node:test";
import {
  compareCardsByPublicInterest,
  isPublicInterestCard,
  publicAgendaTitle,
  publicInterestScore
} from "@/lib/utils/civicPriority";
import type { SummaryCardRow } from "@/lib/types";

function card(input: Partial<SummaryCardRow> = {}): SummaryCardRow {
  const { meetings: meetingInput, ...rest } = input;
  return {
    id: rest.id || "card",
    meeting_id: "meeting",
    jurisdiction_name: "Santa Clara County",
    jurisdiction_slug: "santa-clara-county",
    platform: "iqm2",
    agenda_item: rest.agenda_item || "",
    what_is_happening: rest.what_is_happening || "",
    why_it_matters: rest.why_it_matters || "",
    who_it_affects: rest.who_it_affects || [],
    category_tags: rest.category_tags || [],
    status: rest.status || "Information only",
    comment_window_opens: "Not listed in the source document.",
    comment_window_closes: "Not listed in the source document.",
    how_to_act_attend: "Attend the meeting.",
    how_to_act_email: "Not listed in the source document.",
    how_to_act_submit_comment: "Not listed in the source document.",
    source_url: "https://example.com",
    confidence: "medium",
    is_published: true,
    is_featured: false,
    admin_notes: null,
    created_at: rest.created_at || "2026-06-01T00:00:00.000Z",
    updated_at: rest.updated_at || "2026-06-01T00:00:00.000Z",
    meetings:
      meetingInput === null
        ? null
        : {
          id: "meeting",
          external_id: "meeting",
          jurisdiction_name: "Santa Clara County",
          jurisdiction_slug: "santa-clara-county",
          platform: "iqm2",
          title: "Board of Supervisors",
          meeting_type: "Board of Supervisors",
          date_text: "June 18, 2026 1:30 PM",
          meeting_datetime: "2026-06-18T20:30:00.000Z",
          section: "Upcoming Meetings",
          status: "Upcoming",
          source_type: "Agenda",
          source_url: "https://example.com",
          row_text: "",
          has_html_agenda: false,
          has_pdf: true,
          llm_input_text: null,
          public_comments_input_text: null,
          source_hash: null,
          summarized_source_hash: null,
          cards_generated_at: null,
          extraction_notes: [],
          raw: {},
          scraped_at: null,
          created_at: null,
          updated_at: null,
          ...(meetingInput || {})
        },
    ...rest
  };
}

test("public-interest ranking puts impactful items before routine recognitions and minutes", () => {
  const budget = card({
    id: "budget",
    agenda_item: "Continued Budget Hearing",
    what_is_happening: "The board will discuss budget funding and service levels.",
    category_tags: ["Budget & Taxes"],
    status: "Under discussion"
  });
  const minutes = card({
    id: "minutes",
    agenda_item: "Approve Consent Calendar minutes from February 19, 2026",
    category_tags: ["City Services"],
    status: "Upcoming vote"
  });
  const recognition = card({
    id: "recognition",
    agenda_item: "Recognize May 2027 as National Preservation Month",
    category_tags: ["Parks & Environment"],
    status: "Upcoming vote"
  });

  assert.ok(publicInterestScore(budget) > publicInterestScore(minutes));
  assert.ok(publicInterestScore(budget) > publicInterestScore(recognition));
  assert.deepEqual([minutes, budget, recognition].sort(compareCardsByPublicInterest).map((item) => item.id), [
    "budget",
    "minutes",
    "recognition"
  ]);
  assert.equal(isPublicInterestCard(budget), true);
  assert.equal(isPublicInterestCard(minutes), false);
});

test("future meetings sort ahead of past ones even when the past item scores higher", () => {
  const now = Date.UTC(2026, 5, 15, 12, 0, 0);
  const past = card({
    id: "past",
    agenda_item: "Transportation update",
    category_tags: ["Transportation"],
    status: "Upcoming vote",
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    meetings: {
      ...card().meetings!,
      meeting_datetime: "2025-01-01T20:00:00.000Z",
      date_text: "January 1, 2025 12:00 PM",
      status: "Past"
    }
  });
  const future = card({
    id: "future",
    agenda_item: "City services update",
    category_tags: ["City Services"],
    status: "Information only",
    created_at: "2026-06-14T00:00:00.000Z",
    updated_at: "2026-06-14T00:00:00.000Z",
    meetings: {
      ...card().meetings!,
      meeting_datetime: "2026-06-16T20:00:00.000Z",
      date_text: "June 16, 2026 12:00 PM",
      status: "Upcoming"
    }
  });

  assert.ok(publicInterestScore(past) > publicInterestScore(future));
  assert.deepEqual([past, future].sort((left, right) => compareCardsByPublicInterest(left, right, now)).map((item) => item.id), [
    "future",
    "past"
  ]);
});

test("agenda titles get plain-English wording for common procedural phrases", () => {
  assert.equal(
    publicAgendaTitle(card({ agenda_item: "Establish Nominating Ad Hoc Committee and appoint commissioners" })),
    "Create a temporary nominating committee and appoint commissioners"
  );
  assert.equal(
    publicAgendaTitle(card({ agenda_item: "Approve Consent Calendar minutes from February 19, 2026" })),
    "Approve minutes from February 19, 2026"
  );
});

test("agenda titles translate broad official item names into resident-facing headlines", () => {
  assert.equal(
    publicAgendaTitle(card({
      agenda_item: "Adopt Resolution approving the Recommended Budget of the County of Santa Clara and Special Districts for FY 2026-2027 (Item 9)"
    })),
    "Santa Clara County 2026-27 budget vote"
  );
  assert.equal(
    publicAgendaTitle(card({ agenda_item: "Special Programs and Reserves adjustments (Item 10)" })),
    "Special program and reserve fund changes"
  );
  assert.equal(
    publicAgendaTitle(card({ agenda_item: "Behavioral Health Services Department staffing changes (Item 28)" })),
    "Staffing changes for behavioral health services"
  );
  assert.equal(
    publicAgendaTitle(card({ agenda_item: "Probation Department - FY 2026-2027 Budget" })),
    "Probation 2026-27 budget"
  );
});

test("agenda titles hide case numbers while keeping the concrete project", () => {
  assert.equal(
    publicAgendaTitle(card({
      agenda_item: "616 S. B Street - New Eight\u2011Story Commercial/Residential Mixed\u2011Use Building (PA-2025-039)"
    })),
    "New 8-story mixed-use building at 616 S. B Street"
  );
  assert.equal(
    publicAgendaTitle(card({ agenda_item: "Juvenile Diversion Program Case Management Services - Agreement" })),
    "Juvenile diversion case management contract"
  );
  assert.equal(
    publicAgendaTitle(card({ agenda_item: "Citywide Street Rehabilitation Package 6-B2 - Agreement" })),
    "Citywide street repairs 6-B2 contract"
  );
  assert.equal(
    publicAgendaTitle(card({
      agenda_item: "Gilead Sciences Campus Expansion - multiple resolutions (EA2025-0001, RZ2025-0005, UP2025-0012, RS2025-0002) and parking agreement"
    })),
    "Gilead campus expansion approvals and parking agreement"
  );
});

test("agenda titles simplify planning and policy phrases", () => {
  assert.equal(
    publicAgendaTitle(card({ agenda_item: "Storm Drain Master Plan - Adoption Recommendation" })),
    "Recommend adopting the storm drain plan"
  );
  assert.equal(
    publicAgendaTitle(card({ agenda_item: "Amendments to Accessory Dwelling Unit (ADU) Zoning (Chapter 17.78)" })),
    "Rules for accessory dwelling units (ADUs)"
  );
  assert.equal(
    publicAgendaTitle(card({ agenda_item: "5.2 Foster City Climate Action Plan Overview" })),
    "Foster City climate action plan update"
  );
});
