import assert from "node:assert/strict";
import test from "node:test";
import {
  compareCardsByPublicInterest,
  isPublicInterestCard,
  publicAgendaTitle,
  publicInterestScore
} from "@/lib/utils/civicPriority";
import type { SummaryCardRow } from "@/lib/types";

function card(input: Partial<SummaryCardRow>): SummaryCardRow {
  return {
    id: input.id || "card",
    meeting_id: "meeting",
    jurisdiction_name: "Santa Clara County",
    jurisdiction_slug: "santa-clara-county",
    platform: "iqm2",
    agenda_item: input.agenda_item || "",
    what_is_happening: input.what_is_happening || "",
    why_it_matters: input.why_it_matters || "",
    who_it_affects: input.who_it_affects || [],
    category_tags: input.category_tags || [],
    status: input.status || "Information only",
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
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    meetings: {
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
      updated_at: null
    },
    ...input
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
