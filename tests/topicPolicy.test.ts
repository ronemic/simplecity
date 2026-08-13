import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CATEGORIES, SCHOOL_CATEGORIES } from "@/lib/constants";
import {
  applyMeetingTopicPolicy,
  categoryTagsForMeeting,
  inferSchoolCategoryTags
} from "@/lib/llm/topicPolicy";
import type { SimpleCitySummary } from "@/lib/types";

function summary(categoryTags: string[]): SimpleCitySummary {
  return {
    meetingSummary: {
      title: "Board of Trustees",
      date: "August 3, 2026",
      status: "Upcoming",
      oneSentenceSummary: "The board will consider school business."
    },
    cards: [
      {
        agendaItem: "Vote on playground asphalt repairs at Egan School",
        whatIsHappening: ["The board will approve a school playground repair contract."],
        whyItMatters: "The work affects a school campus.",
        whoItAffects: ["students"],
        categoryTags,
        status: "Upcoming vote",
        commentWindow: { opens: "Not listed.", closes: "Not listed." },
        howToAct: { attend: "Attend.", email: "Not listed.", submitComment: "Not listed." },
        source: "https://example.test/agenda",
        confidence: "high"
      }
    ]
  };
}

test("school-district topic policy replaces a parks classification with buildings and grounds", () => {
  const corrected = applyMeetingTopicPolicy(
    { jurisdictionSlug: "los-altos-school-district" },
    summary(["Parks & Environment"])
  );

  assert.deepEqual(corrected.cards[0].categoryTags, ["School Buildings & Grounds"]);
});

test("school taxonomy uses eight distinct noun labels outside the city topic browser", () => {
  assert.deepEqual(SCHOOL_CATEGORIES, [
    "Teaching & Learning",
    "Students & Families",
    "School Buildings & Grounds",
    "School Funding",
    "Teachers & Staff",
    "Safety & Wellness",
    "Enrollment & Boundaries",
    "Board & Administration"
  ]);
  assert.equal(CATEGORIES.includes("Board & Administration" as never), false);
});

test("board and administration is only retained when no substantive school topic exists", () => {
  assert.deepEqual(
    categoryTagsForMeeting(
      { jurisdictionSlug: "los-altos-school-district" },
      ["Board & Administration", "School Funding"]
    ),
    ["School Funding"]
  );
  assert.deepEqual(
    categoryTagsForMeeting(
      { jurisdictionSlug: "los-altos-school-district" },
      ["Board & Administration"],
      "Approve playground asphalt repairs."
    ),
    ["School Buildings & Grounds"]
  );
  assert.deepEqual(
    categoryTagsForMeeting(
      { jurisdictionSlug: "los-altos-school-district" },
      ["Board & Administration"],
      "Approve updates to Board governance bylaws."
    ),
    ["Board & Administration"]
  );
});

test("deterministic fallbacks cover every school-specific label", () => {
  const examples = [
    ["Adopt the mathematics curriculum", "Teaching & Learning"],
    ["Expand family childcare services", "Students & Families"],
    ["Repair playground asphalt", "School Buildings & Grounds"],
    ["Approve the parcel tax budget", "School Funding"],
    ["Approve the teacher labor agreement", "Teachers & Staff"],
    ["Expand student mental health counseling", "Safety & Wellness"],
    ["Change attendance area boundaries", "Enrollment & Boundaries"],
    ["Update superintendent governance policy", "Board & Administration"]
  ] as const;

  for (const [context, expected] of examples) {
    assert.equal(inferSchoolCategoryTags(context)[0], expected);
  }
});

test("topic policy leaves non-school jurisdictions unchanged", () => {
  const original = summary(["Parks & Environment"]);

  assert.equal(applyMeetingTopicPolicy({ jurisdictionSlug: "los-altos" }, original), original);
});

test("migration normalizes already-published school-district cards", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260812010000_normalize_school_district_topics.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(migration, /jurisdiction_slug = 'los-altos-school-district'/);
  assert.match(migration, /'School Buildings & Grounds'/);
  assert.match(migration, /'Board & Administration'/);
});
