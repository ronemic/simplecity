import {
  SCHOOL_CATEGORIES,
  type SchoolCategoryName
} from "@/lib/constants";
import type { LlmReadyMeeting, SimpleCitySummary } from "@/lib/types";

const SCHOOL_DISTRICT_SLUG = "los-altos-school-district";
const SCHOOL_CATEGORY_SET = new Set<string>(SCHOOL_CATEGORIES);
const BOARD_ADMINISTRATION: SchoolCategoryName = "Board & Administration";

const SCHOOL_CATEGORY_PATTERNS: Array<[SchoolCategoryName, RegExp]> = [
  [
    "Teaching & Learning",
    /\b(curricul(?:um|a)|instruction|academic|assessment|textbook|course|classroom|teaching|learning|literacy|mathematics|science|language arts|educational program)\b/i
  ],
  [
    "Students & Families",
    /\b(student services?|famil(?:y|ies)|parents?|childcare|child care|special education|after[- ]school|nutrition|school meals?|food services?|community program)\b/i
  ],
  [
    "School Buildings & Grounds",
    /\b(facilit(?:y|ies)|campus|classrooms?|building|construction|renovation|repair|roof|hvac|playground|asphalt|field|grounds?|landscap|paving|portable|modernization)\b/i
  ],
  [
    "School Funding",
    /\b(budget|parcel tax|bond|funding|funds?|grant|financial|fiscal|expenditure|revenue|appropriation|audit)\b/i
  ],
  [
    "Teachers & Staff",
    /\b(teachers?|staff|employees?|personnel|hiring|recruitment|compensation|salary|salaries|benefits|labor|collective bargaining|union|professional development)\b/i
  ],
  [
    "Safety & Wellness",
    /\b(safety|security|emergency|mental health|physical health|wellness|counseling|counselors?|nurses?|bullying|suicide prevention|social[- ]emotional)\b/i
  ],
  [
    "Enrollment & Boundaries",
    /\b(enrollment|attendance area|boundar(?:y|ies)|school assignment|transfers?|interdistrict|intradistrict|registration|school capacity)\b/i
  ],
  [
    BOARD_ADMINISTRATION,
    /\b(board|governance|superintendent|administration|administrative|district policy|bylaws?|board meeting|organizational)\b/i
  ]
];

export function inferSchoolCategoryTags(context: string): SchoolCategoryName[] {
  const categories = SCHOOL_CATEGORY_PATTERNS
    .filter(([, pattern]) => pattern.test(context))
    .map(([category]) => category)
    .filter((category) => category !== BOARD_ADMINISTRATION)
    .slice(0, 2);

  return categories.length > 0 ? categories : [BOARD_ADMINISTRATION];
}

export function categoryTagsForMeeting(
  meeting: Pick<LlmReadyMeeting, "jurisdictionSlug">,
  categoryTags: string[],
  context = ""
) {
  if (meeting.jurisdictionSlug !== SCHOOL_DISTRICT_SLUG) return categoryTags;

  const schoolCategories = categoryTags
    .filter((category): category is SchoolCategoryName => SCHOOL_CATEGORY_SET.has(category))
    .filter((category, index, categories) => categories.indexOf(category) === index);
  const substantiveCategories = schoolCategories.filter(
    (category) => category !== BOARD_ADMINISTRATION
  );

  if (substantiveCategories.length > 0) return substantiveCategories.slice(0, 2);
  return inferSchoolCategoryTags(context);
}

export function applyMeetingTopicPolicy(
  meeting: Pick<LlmReadyMeeting, "jurisdictionSlug">,
  summary: SimpleCitySummary
): SimpleCitySummary {
  if (meeting.jurisdictionSlug !== SCHOOL_DISTRICT_SLUG) return summary;

  return {
    ...summary,
    cards: summary.cards.map((card) => ({
      ...card,
      categoryTags: categoryTagsForMeeting(
        meeting,
        card.categoryTags,
        [
          card.agendaItem,
          ...card.whatIsHappening,
          card.whyItMatters,
          ...card.whoItAffects
        ].join(" ")
      )
    }))
  };
}
