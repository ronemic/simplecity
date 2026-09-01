import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DECISION_CARD_PAGE_SIZE,
  MAX_DECISION_CARD_PAGE,
  MAX_DECISION_CARD_PAGE_SIZE,
  type CategoryName
} from "@/lib/constants";
import {
  ALL_JURISDICTIONS_SLUG,
  getDefaultJurisdiction,
  getJurisdictions,
  getJurisdictionSlugFromRow,
  getPublicSupabaseClientsForSelection,
  getPublicSupabaseProjectsForSelection,
  getServiceSupabaseClientsForSelection,
  getServiceSupabaseProjectsForSelection,
  type JurisdictionConfig,
  type JurisdictionProject,
  type JurisdictionSelection,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";
import {
  PUBLIC_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONTENT_CACHE_TAG,
  PUBLIC_STATS_CACHE_REVALIDATE_SECONDS
} from "@/lib/db/publicCache";
import {
  meetingTranslationFingerprint,
  summaryCardTranslationFingerprint
} from "@/lib/db/translationFingerprint";
import type {
  AnnouncementRow,
  DecisionOutcome,
  DecisionOutcomeTranslationRow,
  DecisionMapPoint,
  DocumentRow,
  MeetingRow,
  MeetingTranslationRow,
  SummaryCardRow,
  SummaryCardTranslationRow
} from "@/lib/types";
import { LOCALES, type Locale } from "@/lib/i18n";
import {
  applyDecisionOutcomeTranslation,
} from "@/lib/i18n/decisionOutcome";
import { hasCommentOptionInfo } from "@/lib/utils/commentDeadline";
import { isUpcomingMeetingDate, meetingDateParts } from "@/lib/utils/date";
import {
  decisionCardSearchFilters,
  decisionMeetingSearchFilters,
  matchesDecisionFilters
} from "@/lib/utils/decisionFilters";
import { getMeetingVideoDocuments } from "@/lib/utils/videoEmbed";
import { withEffectiveMeetingStatus } from "@/lib/utils/meetingStatus";
import { matchesMeetingFilters } from "@/lib/utils/meetingFilters";
import { compareCardsByDecisionOrder } from "@/lib/utils/decisionOrder";
import {
  compareCardsByPublicInterest,
  isPublicInterestCard,
  selectDiverseCards
} from "@/lib/utils/civicPriority";
import {
  matchesDecisionResultFilter,
  type DecisionResultFilter
} from "@/lib/utils/decisionResultFilter";
import {
  cardJurisdictionLabel,
  cardMeetingDate,
  cardSharePath,
  cardShareTitle
} from "@/lib/utils/cardShare";
import {
  matchesSantaBarbaraBody,
  type SantaBarbaraBodyView
} from "@/lib/utils/santaBarbaraBody";
import { decisionMapCutoff, type DecisionMapTimeframe } from "@/lib/maps/timeframe";

const PUBLIC_CARD_MEETING_COLUMNS =
  "id,jurisdiction_name,jurisdiction_slug,platform,title,meeting_type,date_text,time_text,meeting_datetime,status,updated_at";
const PUBLIC_MEETING_LIST_COLUMNS =
  "id,jurisdiction_name,jurisdiction_slug,platform,title,meeting_type,date_text,time_text,meeting_datetime,status,source_type,source_url,scraped_at,created_at,updated_at";
const PUBLIC_MEETING_DETAIL_COLUMNS =
  "id,jurisdiction_name,jurisdiction_slug,platform,title,meeting_type,date_text,time_text,location,meeting_datetime,status,source_type,source_url,public_comments_input_text,scraped_at,created_at,updated_at";
const PUBLIC_DOCUMENT_COLUMNS =
  "id,meeting_id,jurisdiction_name,jurisdiction_slug,platform,type,label,source_url";
const PUBLIC_ANNOUNCEMENT_COLUMNS =
  "id,title,body,type,jurisdiction_slug,starts_at,ends_at,is_published,created_at,updated_at";
const PUBLIC_SUMMARY_CARD_COLUMNS = [
  "id",
  "meeting_id",
  "jurisdiction_name",
  "jurisdiction_slug",
  "platform",
  "agenda_item",
  "what_is_happening",
  "why_it_matters",
  "who_it_affects",
  "category_tags",
  "status",
  "comment_window_opens",
  "comment_window_closes",
  "how_to_act_attend",
  "how_to_act_email",
  "how_to_act_submit_comment",
  "source_url",
  "confidence",
  "is_published",
  "is_featured",
  "created_at",
  "updated_at"
].join(",");
const PUBLIC_SUMMARY_CARD_SELECT = `${PUBLIC_SUMMARY_CARD_COLUMNS},meetings(${PUBLIC_CARD_MEETING_COLUMNS})`;
const PAGED_PUBLIC_SUMMARY_CARD_SELECT = `${PUBLIC_SUMMARY_CARD_COLUMNS},decision_sort_at,meetings(${PUBLIC_CARD_MEETING_COLUMNS})`;
const PUBLIC_DECISION_MAP_SELECT = [
  PUBLIC_SUMMARY_CARD_COLUMNS,
  "decision_sort_at",
  "location_label",
  "location_latitude",
  "location_longitude",
  "location_precision",
  "location_confidence",
  "location_status",
  `meetings(${PUBLIC_CARD_MEETING_COLUMNS})`
].join(",");
/**
 * The homepage ranks a pool of candidates down to four cards, so the pool has to
 * be wide enough to contain the good ones. At a flat 80 per jurisdiction, Santa
 * Barbara County (491 cards, many of them meeting cancellations) had almost
 * nothing left after filtering and rendered two items.
 *
 * A flat 200 fixed that but made the "all jurisdictions" view time out, since the
 * cost is per-jurisdiction and every row gets translation enrichment. So the pool
 * is a shared budget: one jurisdiction gets a deep pool, thirteen split it.
 */
const HOME_CARD_PREVIEW_BUDGET = 520;
const HOME_CARD_PREVIEW_MIN_PER_JURISDICTION = 40;
const HOME_CARD_PREVIEW_MAX_PER_JURISDICTION = 200;
const HOME_CARD_PREVIEW_FAST_SINGLE_JURISDICTION = 80;
// A safety bound on the upcoming slice rather than a tuned budget: no
// jurisdiction is near it today (the busiest has ~120 future-dated cards), and
// trimming upcoming decisions is what this split exists to avoid.
const HOME_CARD_UPCOMING_MAX_PER_JURISDICTION = 250;

function homeCardPreviewLimit(clientCount: number) {
  if (clientCount <= 0) return HOME_CARD_PREVIEW_MIN_PER_JURISDICTION;
  return Math.min(
    HOME_CARD_PREVIEW_MAX_PER_JURISDICTION,
    Math.max(
      HOME_CARD_PREVIEW_MIN_PER_JURISDICTION,
      Math.floor(HOME_CARD_PREVIEW_BUDGET / clientCount)
    )
  );
}

function homepageSelectionPreviewLimit(
  selection: JurisdictionSelection,
  jurisdictionCount: number
) {
  // Santa Barbara needs the deep pool because cancellation-heavy imports can
  // otherwise crowd out real decisions. Other single-jurisdiction homepages do
  // not need to transfer and rank 200 full cards to display four.
  if (selection !== "all" && selection !== "santa-barbara-county") {
    return HOME_CARD_PREVIEW_FAST_SINGLE_JURISDICTION;
  }
  return homeCardPreviewLimit(jurisdictionCount);
}
const TRANSLATION_LOOKUP_BATCH_SIZE = 100;
// The triple count-query below measures ~3s per jurisdiction, so the old 4s
// budget tripped under any contention and silently reported 0. These stats are
// cached for PUBLIC_CACHE_REVALIDATE_SECONDS, so the latency is not user-facing.
const PUBLIC_STATS_QUERY_TIMEOUT_MS = 12_000;
const PUBLIC_DECISION_OUTCOME_COLUMNS = [
  "id",
  "summary_card_id",
  "meeting_id",
  "jurisdiction_name",
  "jurisdiction_slug",
  "platform",
  "kind",
  "headline",
  "summary",
  "decided_at",
  "vote",
  "next_step",
  "source_url",
  "created_at",
  "updated_at"
].join(",");

type AdjacentMeetings = {
  newerMeeting: MeetingRow | null;
  olderMeeting: MeetingRow | null;
};

type DecisionCardPageFilters = {
  selection: JurisdictionSelection;
  locale: Locale;
  search: string;
  category?: CategoryName;
  result?: DecisionResultFilter;
  body?: SantaBarbaraBodyView;
  page: number;
  pageSize: number;
};

export type DecisionCardPageResult = {
  cards: SummaryCardRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type DecisionResultFreshness = Partial<Record<JurisdictionSlug, string | null>>;

function logQueryError(context: string, error: unknown) {
  if (!error) return;
  if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "PGRST205") {
    return;
  }

  const message = error instanceof Error ? error.message : JSON.stringify(error);
  if (message.includes("Could not find the table")) return;
  console.error(`[SimpleCity] ${context}: ${message}`);
}

function isMissingDecisionSortColumn(error: unknown) {
  if (!error) return false;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  return message.includes("decision_sort_at") && /PGRST(204|205)|column/i.test(message);
}

function isMissingDecisionLocationColumn(error: unknown) {
  if (!error) return false;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  return /location_(?:status|latitude|longitude)/.test(message) && /PGRST(204|205)|column/i.test(message);
}

function normalizeSearch(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function toIlikePattern(value: string) {
  const safeValue = value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, "%")
    .trim();
  return safeValue ? `%${safeValue}%` : "";
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function withFallbackTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  fallback: T,
  context: string
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => {
          console.warn(`[SimpleCity] ${context} timed out after ${timeoutMs}ms.`);
          resolve(fallback);
        }, timeoutMs);
      })
    ]);
  } catch (error) {
    logQueryError(context, error);
    return fallback;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizePositiveInteger(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * Pagination has to be clamped here as well as at the route, because the
 * aggregate view's candidate fetch scales with the page number and the cache
 * key is built from these values. An unclamped page reaching this layer costs a
 * multi-million-row scan per jurisdiction and a permanent cache entry.
 */
function normalizeDecisionPage(value: number) {
  return Math.min(normalizePositiveInteger(value, 1), MAX_DECISION_CARD_PAGE);
}

function normalizeDecisionPageSize(value: number) {
  return Math.min(
    normalizePositiveInteger(value, DECISION_CARD_PAGE_SIZE),
    MAX_DECISION_CARD_PAGE_SIZE
  );
}

function getSafePublicClients(selection: JurisdictionSelection) {
  try {
    return getPublicSupabaseClientsForSelection(selection);
  } catch (error) {
    if (selection === getDefaultJurisdiction().slug) {
      logQueryError("Failed to create public Supabase client", error);
      return [];
    }

    throw error;
  }
}

function getSafeServiceClients(selection: JurisdictionSelection) {
  try {
    return getServiceSupabaseClientsForSelection(selection);
  } catch (error) {
    if (selection === getDefaultJurisdiction().slug) {
      logQueryError("Failed to create service Supabase client", error);
      return [];
    }

    throw error;
  }
}

function getSafePublicProjects(selection: JurisdictionSelection) {
  return groupSelectionProjects(selection, getPublicSupabaseProjectsForSelection, "public");
}

function getSafeServiceProjects(selection: JurisdictionSelection) {
  return groupSelectionProjects(selection, getServiceSupabaseProjectsForSelection, "service");
}

function groupSelectionProjects(
  selection: JurisdictionSelection,
  resolve: (selection: JurisdictionSelection) => JurisdictionProject[],
  scope: "public" | "service"
) {
  try {
    return resolve(selection);
  } catch (error) {
    if (selection === getDefaultJurisdiction().slug) {
      logQueryError(`Failed to create ${scope} Supabase client`, error);
      return [];
    }

    throw error;
  }
}

/**
 * Rows from a grouped query arrive interleaved from several jurisdictions, so the
 * jurisdiction fallbacks have to be keyed off each row's own slug instead of a
 * single config. An `in("jurisdiction_slug", slugs)` filter cannot match a null
 * slug, so every row is guaranteed to resolve; the last-resort fallback only
 * guards against a slug that is somehow outside the queried set.
 */
function jurisdictionResolver(jurisdictions: JurisdictionConfig[]) {
  const bySlug = new Map(jurisdictions.map((jurisdiction) => [jurisdiction.slug, jurisdiction]));
  return (slug: string | null | undefined) =>
    bySlug.get(String(slug || "") as JurisdictionSlug) || jurisdictions[0];
}

function projectSlugs(project: JurisdictionProject) {
  return project.jurisdictions.map((jurisdiction) => jurisdiction.slug);
}

/** Names the jurisdictions a grouped query covered, for error logging. */
function projectLabel(project: JurisdictionProject) {
  return project.jurisdictions.map((jurisdiction) => jurisdiction.name).join(", ");
}

function withMeetingJurisdictionFallback<T extends Partial<MeetingRow>>(
  row: T,
  jurisdiction: JurisdictionConfig
): T {
  return withEffectiveMeetingStatus({
    ...row,
    jurisdiction_name: row.jurisdiction_name || jurisdiction.name,
    jurisdiction_slug: row.jurisdiction_slug || jurisdiction.slug,
    platform: row.platform || jurisdiction.platform
  });
}

function withCardJurisdictionFallback(
  row: SummaryCardRow,
  jurisdiction: JurisdictionConfig
): SummaryCardRow {
  const meeting = row.meetings
    ? withMeetingJurisdictionFallback(row.meetings, jurisdiction)
    : row.meetings;

  return {
    ...row,
    jurisdiction_name: row.jurisdiction_name || jurisdiction.name,
    jurisdiction_slug: row.jurisdiction_slug || jurisdiction.slug,
    platform: row.platform || jurisdiction.platform,
    meetings: meeting || null
  };
}

function withDocumentJurisdictionFallback(
  row: DocumentRow,
  jurisdiction: JurisdictionConfig
): DocumentRow {
  return {
    ...row,
    jurisdiction_name: row.jurisdiction_name || jurisdiction.name,
    jurisdiction_slug: row.jurisdiction_slug || jurisdiction.slug,
    platform: row.platform || jurisdiction.platform
  };
}

function withAnnouncementJurisdictionFallback(row: AnnouncementRow): AnnouncementRow {
  return {
    ...row,
    jurisdiction_slug:
      row.jurisdiction_slug === null || row.jurisdiction_slug === undefined
        ? null
        : getJurisdictionSlugFromRow(row.jurisdiction_slug)
  };
}

function sortCards(cards: SummaryCardRow[]) {
  return [...cards].sort(compareCardsByDecisionOrder);
}

function sortMeetings(meetings: MeetingRow[]) {
  return [...meetings].sort((left, right) => {
    const leftDate = new Date(left.meeting_datetime || left.created_at || 0).getTime();
    const rightDate = new Date(right.meeting_datetime || right.created_at || 0).getTime();
    return rightDate - leftDate;
  });
}

function sortByCreatedAt<T extends { created_at?: string | null }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftDate = new Date(left.created_at || 0).getTime();
    const rightDate = new Date(right.created_at || 0).getTime();
    return rightDate - leftDate;
  });
}

function rowTime(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isAnnouncementActive(row: AnnouncementRow, now = Date.now()) {
  const startsAt = rowTime(row.starts_at);
  const endsAt = rowTime(row.ends_at);

  return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
}

function closestNewerMeeting(rows: MeetingRow[], currentTime: number) {
  return rows.reduce<MeetingRow | null>((closest, row) => {
    const time = rowTime(row.meeting_datetime);
    if (!time || time <= currentTime) return closest;
    if (!closest) return row;
    return time < rowTime(closest.meeting_datetime) ? row : closest;
  }, null);
}

function closestOlderMeeting(rows: MeetingRow[], currentTime: number) {
  return rows.reduce<MeetingRow | null>((closest, row) => {
    const time = rowTime(row.meeting_datetime);
    if (!time || time >= currentTime) return closest;
    if (!closest) return row;
    return time > rowTime(closest.meeting_datetime) ? row : closest;
  }, null);
}

function dedupeAnnouncements(rows: AnnouncementRow[]) {
  const seen = new Set<string>();
  const deduped: AnnouncementRow[] = [];

  for (const row of rows) {
    const key = [
      row.title,
      row.body,
      row.type,
      row.jurisdiction_slug || "all",
      row.starts_at || "",
      row.ends_at || ""
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

async function applyMeetingTranslations(
  supabase: { from: SupabaseClient["from"] },
  rows: MeetingRow[],
  locale: Locale
) {
  if (locale === "en" || rows.length === 0) return rows;

  const ids = rows.map((row) => row.id);
  const results = await Promise.all(
    chunkValues(ids, TRANSLATION_LOOKUP_BATCH_SIZE).map((batchIds) =>
      supabase
        .from("meeting_translations")
        .select("meeting_id,locale,title,meeting_type,source_fingerprint,translation_status")
        .eq("locale", locale)
        .in("translation_status", ["machine", "reviewed"])
        .in("meeting_id", batchIds)
    )
  );

  for (const result of results) {
    logQueryError("Failed to load meeting translations", result.error);
  }

  const data = results.flatMap((result) => result.data || []);

  const translations = new Map(
    ((data || []) as unknown as MeetingTranslationRow[]).map((row) => [row.meeting_id, row])
  );

  return rows.map((row) => {
    const translation = translations.get(row.id);
    if (!translation) return row;
    if (translation.source_fingerprint !== meetingTranslationFingerprint(row)) return row;

    return {
      ...row,
      title: translation.title || row.title,
      meeting_type: translation.meeting_type || row.meeting_type
    };
  });
}

async function applyCardTranslations(
  supabase: { from: SupabaseClient["from"] },
  rows: SummaryCardRow[],
  locale: Locale
) {
  if (locale === "en" || rows.length === 0) return rows;

  const cardIds = rows.map((row) => row.id);
  const meetingRows = rows
    .map((row) => row.meetings)
    .filter((meeting): meeting is MeetingRow => Boolean(meeting?.id));
  const translationColumns = [
    "summary_card_id",
    "locale",
    "agenda_item",
    "what_is_happening",
    "why_it_matters",
    "who_it_affects",
    "status",
    "comment_window_opens",
    "comment_window_closes",
    "how_to_act_attend",
    "how_to_act_email",
    "how_to_act_submit_comment",
    "source_fingerprint",
    "translation_status"
  ].join(",");
  const [cardTranslationResults, translatedMeetings] = await Promise.all([
    Promise.all(
      chunkValues(cardIds, TRANSLATION_LOOKUP_BATCH_SIZE).map((batchIds) =>
        supabase
          .from("summary_card_translations")
          .select(translationColumns)
          .eq("locale", locale)
          .in("translation_status", ["machine", "reviewed"])
          .in("summary_card_id", batchIds)
      )
    ),
    applyMeetingTranslations(supabase, meetingRows, locale)
  ]);

  for (const result of cardTranslationResults) {
    logQueryError("Failed to load summary card translations", result.error);
  }

  const data = cardTranslationResults.flatMap((result) => result.data || []);

  const meetingById = new Map(translatedMeetings.map((meeting) => [meeting.id, meeting]));
  const translations = new Map(
    ((data || []) as unknown as SummaryCardTranslationRow[]).map((row) => [
      row.summary_card_id,
      row
    ])
  );

  return rows.map((row) => {
    const translation = translations.get(row.id);
    const translatedMeeting = row.meetings?.id ? meetingById.get(row.meetings.id) : null;
    const baseRow = translatedMeeting ? { ...row, meetings: translatedMeeting } : row;

    if (!translation) return baseRow;
    if (translation.source_fingerprint !== summaryCardTranslationFingerprint(row)) return baseRow;

    return {
      ...baseRow,
      agenda_item: translation.agenda_item || row.agenda_item,
      what_is_happening: translation.what_is_happening || row.what_is_happening,
      why_it_matters: translation.why_it_matters || row.why_it_matters,
      who_it_affects: translation.who_it_affects || row.who_it_affects,
      status: translation.status || row.status,
      comment_window_opens: translation.comment_window_opens || row.comment_window_opens,
      comment_window_closes: translation.comment_window_closes || row.comment_window_closes,
      how_to_act_attend: translation.how_to_act_attend || row.how_to_act_attend,
      how_to_act_email: translation.how_to_act_email || row.how_to_act_email,
      how_to_act_submit_comment:
        translation.how_to_act_submit_comment || row.how_to_act_submit_comment
    };
  });
}

async function loadDecisionOutcomes(
  supabase: { from: SupabaseClient["from"] },
  rows: SummaryCardRow[],
  locale: Locale
) {
  if (rows.length === 0) return new Map<string, DecisionOutcome>();

  const results = await Promise.all(
    chunkValues(
      rows.map((row) => row.id),
      TRANSLATION_LOOKUP_BATCH_SIZE
    ).map((cardIds) =>
      supabase
        .from("decision_outcomes")
        .select(PUBLIC_DECISION_OUTCOME_COLUMNS)
        .in("summary_card_id", cardIds)
    )
  );

  for (const result of results) {
    logQueryError("Failed to load decision outcomes", result.error);
  }

  const outcomes = (results.flatMap((result) => result.data || []) as unknown as DecisionOutcome[])
    .filter((outcome) => Boolean(outcome.summary_card_id));
  if (locale === "en" || outcomes.length === 0) {
    return new Map(outcomes.map((outcome) => [outcome.summary_card_id!, outcome]));
  }

  const translationResults = await Promise.all(
    chunkValues(
      outcomes.flatMap((outcome) => (outcome.id ? [outcome.id] : [])),
      TRANSLATION_LOOKUP_BATCH_SIZE
    ).map((outcomeIds) =>
      supabase
        .from("decision_outcome_translations")
        .select(
          "decision_outcome_id,locale,headline,summary,vote,next_step,source_fingerprint,translation_status"
        )
        .eq("locale", locale)
        .in("translation_status", ["machine", "reviewed"])
        .in("decision_outcome_id", outcomeIds)
    )
  );

  for (const result of translationResults) {
    logQueryError("Failed to load decision outcome translations", result.error);
  }
  const translations = new Map(
    (translationResults.flatMap((result) => result.data || []) as unknown as DecisionOutcomeTranslationRow[])
      .map((translation) => [translation.decision_outcome_id, translation])
  );

  return new Map(
    outcomes.map((outcome) => {
      const translation = outcome.id ? translations.get(outcome.id) : null;
      return [
        outcome.summary_card_id!,
        applyDecisionOutcomeTranslation(outcome, translation)
      ];
    })
  );
}

async function enrichPublicCards(
  supabase: { from: SupabaseClient["from"] },
  rows: SummaryCardRow[],
  locale: Locale
): Promise<SummaryCardRow[]> {
  const [translatedRows, outcomes] = await Promise.all([
    applyCardTranslations(supabase, rows, locale),
    loadDecisionOutcomes(supabase, rows, locale)
  ]);

  return translatedRows.map((row): SummaryCardRow => ({
    ...row,
    outcome: outcomes.get(row.id) || null
  }));
}

/**
 * Reads one jurisdiction's cards without enriching them.
 *
 * The fetch has to stay per jurisdiction because `options.limit` is a
 * per-jurisdiction pool (see HOME_CARD_PREVIEW_BUDGET) -- a shared `in(...)`
 * limit would let one busy jurisdiction crowd out the rest. Enrichment has no
 * such constraint, so callers hand the combined rows to enrichPublicCards once
 * per database instead of once per jurisdiction.
 */
async function loadPublishedCardRowsForJurisdiction(
  {
    jurisdiction,
    supabase
  }: {
    jurisdiction: JurisdictionConfig;
    supabase: SupabaseClient;
  },
  options: { limit?: number; splitUpcoming?: boolean } = {}
) {
  // Ordered by decision date, not row-creation date.
  //
  // `created_at` is when the summarizer wrote the row, which has nothing to do
  // with when the decision happens. A single bulk import gave 80 cards the same
  // created_at, so a limited preview returned one arbitrary batch — Santa Barbara's
  // homepage drew four cards from an import with no upcoming meetings and no
  // usable summaries, while the actual pending decisions sat outside the window.
  //
  // `decision_sort_at` is coalesce(meeting_datetime, updated_at, created_at), kept
  // current by a trigger, so upcoming meetings sort to the top where they belong.
  function buildQuery(orderByDecisionDate: boolean) {
    let query = supabase
      .from("summary_cards")
      .select(PUBLIC_SUMMARY_CARD_SELECT)
      .eq("jurisdiction_slug", jurisdiction.slug)
      .eq("is_published", true)
      .order("is_featured", { ascending: false });

    if (orderByDecisionDate) {
      query = query.order("decision_sort_at", { ascending: false, nullsFirst: false });
    }

    query = query.order("created_at", { ascending: false });

    return options.limit ? query.limit(options.limit) : query;
  }

  // A single descending slice fills from the *furthest-out* meeting backwards,
  // which is the opposite of what a capped pool wants: Los Altos Hills has more
  // future-dated cards than the cap, so a Planning Commission meeting two days
  // later crowded out most of an Emergency Preparedness agenda happening first,
  // and the homepage picked that meeting's leftovers.
  //
  // Upcoming decisions are read as their own slice instead, and the cap applies
  // only to the past backfill. Capping the upcoming slice as well just moves the
  // truncation: soonest-first, San Francisco's 74-item Board of Supervisors
  // agenda fills a 40-row pool by itself and the next two days of committee
  // meetings vanish. There are only a few hundred future-dated cards across
  // every jurisdiction, so taking them whole costs little and is exactly the
  // data both homepage sections rank.
  function buildSplitQuery(upcoming: boolean, cutoff: string, limit: number) {
    let query = supabase
      .from("summary_cards")
      .select(PUBLIC_SUMMARY_CARD_SELECT)
      .eq("jurisdiction_slug", jurisdiction.slug)
      .eq("is_published", true);

    query = upcoming
      ? query.gte("decision_sort_at", cutoff)
      : // Nulls are kept on the past side. `decision_sort_at` is maintained by a
        // trigger, but a row written before it existed should still be a
        // candidate rather than disappearing from both slices.
        query.or(`decision_sort_at.lt.${cutoff},decision_sort_at.is.null`);

    return query
      .order("is_featured", { ascending: false })
      .order("decision_sort_at", { ascending: upcoming, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);
  }

  const limit = options.limit;

  if (options.splitUpcoming && limit) {
    const cutoff = new Date().toISOString();
    const [upcomingResult, pastResult] = await Promise.all([
      buildSplitQuery(true, cutoff, HOME_CARD_UPCOMING_MAX_PER_JURISDICTION),
      buildSplitQuery(false, cutoff, limit)
    ]);

    const splitError = upcomingResult.error || pastResult.error;
    if (!splitError) {
      const upcomingRows = (upcomingResult.data || []) as unknown as SummaryCardRow[];
      const pastRows = (pastResult.data || []) as unknown as SummaryCardRow[];
      return [...upcomingRows, ...pastRows].map((row) =>
        withCardJurisdictionFallback(row, jurisdiction)
      );
    }

    // Older deployments may not have the column yet; the single-query path below
    // has its own fallback for that. Any other failure is logged there too.
    if (!isMissingDecisionSortColumn(splitError)) {
      logQueryError(
        `Failed to load ${jurisdiction.name} upcoming and past summary cards`,
        splitError
      );
    }
  }

  let { data, error } = await buildQuery(true);

  // Older deployments may not have the column yet; fall back rather than 500.
  if (error && isMissingDecisionSortColumn(error)) {
    ({ data, error } = await buildQuery(false));
  }

  if (error) {
    logQueryError(`Failed to load ${jurisdiction.name} published summary cards`, error);
    return [] as SummaryCardRow[];
  }

  return ((data || []) as unknown as SummaryCardRow[]).map((row) =>
    withCardJurisdictionFallback(row, jurisdiction)
  );
}

/**
 * Fetches each of a database's jurisdictions separately to preserve the
 * per-jurisdiction pool, then enriches the whole batch in one pass so the
 * translation and decision-outcome lookups cost one round trip per database
 * rather than one per jurisdiction.
 */
async function loadPublishedCardsForProject(
  project: JurisdictionProject,
  locale: Locale,
  options: { limit?: number } = {}
) {
  const rowGroups = await Promise.all(
    project.jurisdictions.map((jurisdiction) =>
      loadPublishedCardRowsForJurisdiction({ jurisdiction, supabase: project.supabase }, options)
    )
  );

  return enrichPublicCards(project.supabase, rowGroups.flat(), locale);
}

/** Homepage previews do not render outcome panels, so skip that extra database
 * round trip. These rows are untranslated on purpose -- ranking runs on the
 * English text and only the selected cards are translated afterwards. */
async function loadHomepagePreviewRowsForProject(
  project: JurisdictionProject,
  limit: number
) {
  const rowGroups = await Promise.all(
    project.jurisdictions.map((jurisdiction) =>
      loadPublishedCardRowsForJurisdiction(
        { jurisdiction, supabase: project.supabase },
        { limit, splitUpcoming: true }
      )
    )
  );
  return rowGroups.flat();
}

/**
 * Translates an already-chosen handful of cards.
 *
 * Each card has to go back to the database it came from, so they are regrouped
 * by project -- keyed off each row's own jurisdiction rather than the candidate
 * pool, so this needs nothing but the cards themselves and can therefore run
 * against a cached selection. Cards whose project cannot be resolved keep their
 * English text rather than being dropped.
 */
async function translateSelectedCards(
  selection: JurisdictionSelection,
  cards: SummaryCardRow[],
  locale: Locale
) {
  if (locale === "en" || cards.length === 0) return cards;

  const projectBySlug = new Map<string, JurisdictionProject>();
  for (const project of getSafePublicProjects(selection)) {
    for (const jurisdiction of project.jurisdictions) {
      projectBySlug.set(jurisdiction.slug, project);
    }
  }

  const groups = new Map<JurisdictionProject, SummaryCardRow[]>();
  for (const card of cards) {
    const project = projectBySlug.get(card.jurisdiction_slug || "");
    if (!project) continue;
    const existing = groups.get(project);
    if (existing) existing.push(card);
    else groups.set(project, [card]);
  }

  const translated = new Map<string, SummaryCardRow>();
  await Promise.all(
    [...groups].map(async ([project, rows]) => {
      for (const row of await applyCardTranslations(project.supabase, rows, locale)) {
        translated.set(row.id, row);
      }
    })
  );

  return cards.map((card) => translated.get(card.id) || card);
}

/**
 * The soonest upcoming meetings represented in the ranked pool, one card each.
 */
function selectUpcomingMeetingCards(cards: SummaryCardRow[], limit: number) {
  const seen = new Set<string>();
  return cards
    .filter((card) => {
      const meeting = card.meetings;
      if (!meeting || /^cancel{1,2}ed$/i.test(String(meeting.status || "").trim())) return false;
      if (!isUpcomingMeetingDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text)) {
        return false;
      }
      const key = meeting.id || `${meeting.title}-${meeting.date_text || meeting.meeting_datetime || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const leftParts = meetingDateParts(left.meetings?.date_text, left.meetings?.meeting_datetime);
      const rightParts = meetingDateParts(right.meetings?.date_text, right.meetings?.meeting_datetime);
      return (leftParts?.iso || "").localeCompare(rightParts?.iso || "");
    })
    .slice(0, limit);
}

async function loadPublishedCardsForSelection(
  selection: JurisdictionSelection,
  locale: Locale
) {
  const projects = getSafePublicProjects(selection);
  if (projects.length === 0) return [] as SummaryCardRow[];

  const results = await Promise.all(
    projects.map((project) => loadPublishedCardsForProject(project, locale))
  );

  return sortCards(results.flat());
}

export const HOMEPAGE_DECISION_CARD_COUNT = 4;
const HOMEPAGE_MEETING_CARD_COUNT = 5;

export type HomepageCardSelection = {
  cards: SummaryCardRow[];
  meetingCards: SummaryCardRow[];
  totalCount: number;
};

type LocalizedHomepageSelection = Record<Locale, HomepageCardSelection>;

function emptyLocalizedSelection(): LocalizedHomepageSelection {
  return LOCALES.reduce((selection, locale) => {
    selection[locale] = { cards: [], meetingCards: [], totalCount: 0 };
    return selection;
  }, {} as LocalizedHomepageSelection);
}

/**
 * The nine-or-so cards the homepage actually renders, ranked and ready.
 *
 * What is cached here is the *answer*, not the candidate pool. Caching the pool
 * looked equivalent but was not: every request still deserialized ~1MB of cards
 * and re-ran the ranking sort, which is ~275ms for a 520-card pool on a fast
 * machine and several seconds on a small shared instance. That cost sat outside
 * the cache, so it was paid on every hit and no amount of cache warming helped.
 * Ranking inside the cache makes a hit a lookup of ~20KB and nothing else.
 *
 * Ranking also happens before translation, on the English rows. The scoring
 * patterns are English, so ranking translated text scored Spanish cards near
 * zero and gave the two locales different homepages; now both locales pick the
 * same decisions and only the survivors are translated.
 */
const getCachedHomepageSelection = unstable_cache(
  async (selection: JurisdictionSelection): Promise<LocalizedHomepageSelection> => {
    const projects = getSafePublicProjects(selection);
    if (projects.length === 0) return emptyLocalizedSelection();

    // The pool is budgeted per jurisdiction, not per database, so the divisor
    // stays the jurisdiction count however those jurisdictions are grouped.
    const jurisdictionCount = projects.reduce(
      (total, project) => total + project.jurisdictions.length,
      0
    );
    const limit = homepageSelectionPreviewLimit(selection, jurisdictionCount);
    const [rowGroups, publishedCount] = await Promise.all([
      Promise.all(projects.map((project) => loadHomepagePreviewRowsForProject(project, limit))),
      countPublishedCards(selection)
    ]);

    const pool = rowGroups.flat();
    const prioritized = sortCards(pool).sort(compareCardsByPublicInterest);
    const publicInterestCards = prioritized.filter(isPublicInterestCard);
    const preferred = publicInterestCards.length > 0 ? publicInterestCards : prioritized;

    const cards = selectDiverseCards(preferred, HOMEPAGE_DECISION_CARD_COUNT);
    const meetingCards = selectUpcomingMeetingCards(preferred, HOMEPAGE_MEETING_CARD_COUNT);
    // The pool is capped by `limit`, so its length is a query limit rather than
    // a count -- reporting it told every reader there were exactly 80 (or 200,
    // or 520) published decisions. A failed count returns 0, in which case the
    // pool size is at least an honest lower bound.
    const totalCount = publishedCount || pool.length;

    // Ranking runs on English text, so every locale gets the same cards and
    // only the wording differs. Building them all here keeps the expensive
    // fan-out to one cache entry: switching language then costs nothing beyond
    // the render, rather than repeating the whole query to reach an identical
    // selection. Nesting a second unstable_cache to do this per locale does not
    // work -- an inner cached call inside a cache scope always recomputes.
    const localized = await Promise.all(
      LOCALES.map(async (entryLocale): Promise<[Locale, HomepageCardSelection]> => {
        if (entryLocale === "en") {
          return [entryLocale, { cards, meetingCards, totalCount }];
        }

        const [localizedCards, localizedMeetingCards] = await Promise.all([
          translateSelectedCards(selection, cards, entryLocale),
          translateSelectedCards(selection, meetingCards, entryLocale)
        ]);

        return [
          entryLocale,
          { cards: localizedCards, meetingCards: localizedMeetingCards, totalCount }
        ];
      })
    );

    return Object.fromEntries(localized) as LocalizedHomepageSelection;
  },
  ["homepage-selection-v2"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

type UpcomingMeetingShape = {
  meeting_datetime: string | null;
  date_text: string | null;
  time_text: string | null;
  status: string | null;
};

type UpcomingDecisionRow = {
  comment_window_closes: string | null;
  how_to_act_email: string | null;
  how_to_act_submit_comment: string | null;
  meetings: UpcomingMeetingShape | null;
};

// The SQL lower bound is deliberately loose — one day back — so the exact
// "is this still ahead?" decision is made by isUpcomingMeetingDate, which knows
// about Pacific time and about meetings that are mid-session.
const UPCOMING_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const UPCOMING_MEETING_SCAN_LIMIT = 60;

function isCancelledMeetingStatus(status?: string | null) {
  return /^cancel{1,2}ed$/i.test(String(status || "").trim());
}

function isAttendableUpcomingMeeting(meeting: UpcomingMeetingShape | null | undefined) {
  if (!meeting) return false;
  if (isCancelledMeetingStatus(meeting.status)) return false;
  return isUpcomingMeetingDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text);
}

const getCachedUpcomingDecisionSnapshot = unstable_cache(
  async (selection: JurisdictionSelection) => {
    const empty = { openForCommentCount: 0, nextMeetingIso: null as string | null };
    const projects = getSafePublicProjects(selection);
    if (projects.length === 0) return empty;

    const since = new Date(Date.now() - UPCOMING_LOOKBACK_MS).toISOString();

    const results = await Promise.all(
      projects.map(async (project) => {
        const { supabase } = project;
        const slugs = projectSlugs(project);
        // Two separate questions, so two separate sources.
        //
        // The next meeting comes from the meetings table, because a resident
        // asking "when can I show up?" wants the real calendar — not just the
        // meetings that happen to have a summarized card yet. Santa Barbara's
        // genuine next meeting had no card at all, and the soonest one that did
        // have a card was cancelled.
        //
        // The open-for-comment count comes from published cards, because that
        // claim is about decisions we actually summarized.
        const [meetingResult, cardResult] = await Promise.all([
          // The scan limit is now per project rather than per jurisdiction. Only
          // the single earliest meeting is ever read off this list, and the rows
          // come back in ascending order, so a shared window still contains it.
          supabase
            .from("meetings")
            .select("meeting_datetime,date_text,time_text,status")
            .in("jurisdiction_slug", slugs)
            .gte("meeting_datetime", since)
            .order("meeting_datetime", { ascending: true })
            .limit(UPCOMING_MEETING_SCAN_LIMIT),
          supabase
            .from("summary_cards")
            .select(
              "comment_window_closes,how_to_act_email,how_to_act_submit_comment,meetings!inner(meeting_datetime,date_text,time_text,status)"
            )
            .in("jurisdiction_slug", slugs)
            .eq("is_published", true)
            .gte("meetings.meeting_datetime", since)
        ]);

        if (meetingResult.error) {
          logQueryError(
            `Failed to load ${projectLabel(project)} upcoming meetings`,
            meetingResult.error
          );
        }
        if (cardResult.error) {
          logQueryError(
            `Failed to load ${projectLabel(project)} upcoming decisions`,
            cardResult.error
          );
        }

        return {
          meetings: (meetingResult.data || []) as unknown as UpcomingMeetingShape[],
          cards: (cardResult.data || []) as unknown as UpcomingDecisionRow[]
        };
      })
    );

    const openForCommentCount = results
      .flatMap((result) => result.cards)
      .filter((row) => isAttendableUpcomingMeeting(row.meetings))
      .filter((row) =>
        hasCommentOptionInfo({
          closes: row.comment_window_closes,
          actionTexts: [row.how_to_act_submit_comment, row.how_to_act_email]
        })
      ).length;

    const nextMeetingIso =
      results
        .flatMap((result) => result.meetings)
        .filter(isAttendableUpcomingMeeting)
        .map((meeting) => meeting.meeting_datetime)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => left.localeCompare(right))[0] || null;

    return { openForCommentCount, nextMeetingIso };
  },
  ["upcoming-decision-snapshot"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

async function countPublishedCards(selection: JurisdictionSelection) {
  const projects = getSafePublicProjects(selection);
  if (projects.length === 0) return 0;

  const results = await Promise.all(
    projects.map(async (project) => {
      const { count, error } = await project.supabase
        .from("summary_cards")
        .select("id", { count: "exact", head: true })
        .in("jurisdiction_slug", projectSlugs(project))
        .eq("is_published", true);

      if (error) {
        logQueryError(
          `Failed to count ${projectLabel(project)} published summary cards`,
          error
        );
        return 0;
      }

      return count || 0;
    })
  );

  return results.reduce((sum, count) => sum + count, 0);
}

const getCachedPublishedCardCount = unstable_cache(countPublishedCards, ["published-summary-card-count"], {
  revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONTENT_CACHE_TAG]
});

const getCachedDecisionResultFreshness = unstable_cache(
  async (
    santaBarbaraBody: SantaBarbaraBodyView | "" = ""
  ): Promise<DecisionResultFreshness> => {
    const clients = getSafePublicClients(ALL_JURISDICTIONS_SLUG);
    if (clients.length === 0) return {};

    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        const meetingIds =
          jurisdiction.slug === "santa-barbara-county" && santaBarbaraBody
            ? await getSantaBarbaraMeetingIdsForBody(supabase, santaBarbaraBody)
            : null;
        if (meetingIds && meetingIds.length === 0) {
          return [jurisdiction.slug, null] as const;
        }

        let query = supabase
          .from("decision_outcomes")
          .select("decided_at")
          .eq("jurisdiction_slug", jurisdiction.slug)
          .not("decided_at", "is", null);
        if (meetingIds) query = query.in("meeting_id", meetingIds);

        const { data, error } = await query
          .order("decided_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          logQueryError(`Failed to load ${jurisdiction.name} decision-result freshness`, error);
          return null;
        }

        const decidedAt = (data as { decided_at?: string | null } | null)?.decided_at || null;
        return [jurisdiction.slug, decidedAt] as const;
      })
    );

    return Object.fromEntries(results.filter((result) => result !== null));
  },
  ["decision-result-freshness-v2"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedPublishedCard = unstable_cache(
  async (id: string, locale: Locale) => {
    const clients = getSafePublicClients(ALL_JURISDICTIONS_SLUG);
    if (clients.length === 0) return null;

    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        const { data, error } = await supabase
          .from("summary_cards")
          .select(PUBLIC_SUMMARY_CARD_SELECT)
          .eq("id", id)
          .eq("is_published", true)
          .maybeSingle();

        if (error) {
          logQueryError(`Failed to load shared card ${id} from ${jurisdiction.name}`, error);
          return null;
        }
        if (!data) return null;

        const [translated] = await enrichPublicCards(
          supabase,
          [withCardJurisdictionFallback(data as unknown as SummaryCardRow, jurisdiction)],
          locale
        );
        return translated || null;
      })
    );

    return results.find((card): card is SummaryCardRow => Boolean(card)) || null;
  },
  ["published-summary-card"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedActiveAnnouncements = unstable_cache(
  async (selection: JurisdictionSelection) => {
    // This query carries no jurisdiction filter -- announcements are scoped in JS
    // below -- so fanning out per jurisdiction sent one database the byte-identical
    // request up to five times per render. Grouping asks each project once.
    const projects = getSafePublicProjects(selection);
    if (projects.length === 0) return [] as AnnouncementRow[];

    const now = Date.now();
    const results = await Promise.all(
      projects.map(async (project) => {
        const { data, error } = await project.supabase
          .from("announcements")
          .select(PUBLIC_ANNOUNCEMENT_COLUMNS)
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        if (error) {
          logQueryError(`Failed to load ${projectLabel(project)} announcements`, error);
          return [] as AnnouncementRow[];
        }

        return ((data || []) as unknown as AnnouncementRow[])
          .map((row) => withAnnouncementJurisdictionFallback(row))
          .filter((row) => isAnnouncementActive(row, now))
          .filter((row) => {
            if (selection === ALL_JURISDICTIONS_SLUG) return true;
            return row.jurisdiction_slug === null || row.jurisdiction_slug === selection;
          });
      })
    );

    return dedupeAnnouncements(sortByCreatedAt(results.flat()));
  },
  ["active-announcements"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

async function getMatchingMeetingIdsForSearch(
  supabase: SupabaseClient,
  jurisdictionSlug: string,
  jurisdictionName: string,
  pattern: string
) {
  const { data, error } = await supabase
    .from("meetings")
    .select("id")
    .eq("jurisdiction_slug", jurisdictionSlug)
    .or(decisionMeetingSearchFilters(pattern))
    .limit(100);

  if (error) {
    logQueryError(`Failed to search ${jurisdictionName} meetings for decisions`, error);
    return [] as string[];
  }

  return ((data || []) as Array<{ id?: string | null }>)
    .map((row) => row.id)
    .filter((id): id is string => Boolean(id));
}

async function getSantaBarbaraMeetingIdsForBody(
  supabase: SupabaseClient,
  body: SantaBarbaraBodyView
) {
  const pattern = body === "planning" ? "%Planning Commission%" : "%Board of Supervisors%";
  const { data, error } = await supabase
    .from("meetings")
    .select("id")
    .eq("jurisdiction_slug", "santa-barbara-county")
    .ilike("meeting_type", pattern)
    .limit(1000);

  if (error) {
    logQueryError(`Failed to filter Santa Barbara ${body} meetings`, error);
    return [] as string[];
  }

  return ((data || []) as Array<{ id?: string | null }>)
    .map((row) => row.id)
    .filter((id): id is string => Boolean(id));
}

async function loadDecisionCardCandidatesForJurisdiction(
  {
    jurisdiction,
    supabase
  }: {
    jurisdiction: JurisdictionConfig;
    supabase: SupabaseClient;
  },
  filters: Omit<DecisionCardPageFilters, "selection" | "locale">,
  locale: Locale,
  range: { from: number; to: number }
) {
  const search = normalizeSearch(filters.search);
  const pattern = toIlikePattern(search);
  const meetingIds = pattern
    ? await getMatchingMeetingIdsForSearch(
        supabase,
        jurisdiction.slug,
        jurisdiction.name,
        pattern
      )
    : [];
  const bodyMeetingIds =
    jurisdiction.slug === "santa-barbara-county" && filters.body
      ? await getSantaBarbaraMeetingIdsForBody(supabase, filters.body)
      : null;
  if (bodyMeetingIds && bodyMeetingIds.length === 0) {
    return { cards: [] as SummaryCardRow[], count: 0, paginationSupported: true };
  }
  let query = supabase
    .from("summary_cards")
    .select(PAGED_PUBLIC_SUMMARY_CARD_SELECT, { count: "exact" })
    .eq("jurisdiction_slug", jurisdiction.slug)
    .eq("is_published", true);

  if (filters.category) {
    query = query.contains("category_tags", [filters.category]);
  }

  if (bodyMeetingIds) {
    query = query.in("meeting_id", bodyMeetingIds);
  }

  if (pattern) {
    query = query.or(decisionCardSearchFilters(pattern, meetingIds));
  }

  const { data, error, count } = await query
    .order("is_featured", { ascending: false })
    .order("decision_sort_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(range.from, range.to);

  if (error) {
    const paginationSupported = !isMissingDecisionSortColumn(error);
    if (paginationSupported) {
      logQueryError(`Failed to load ${jurisdiction.name} decision cards`, error);
    }
    return {
      cards: [] as SummaryCardRow[],
      count: 0,
      paginationSupported
    };
  }

  const rows = ((data || []) as unknown as SummaryCardRow[]).map((row) =>
    withCardJurisdictionFallback(row, jurisdiction)
  );

  return {
    cards: await enrichPublicCards(supabase, rows, locale),
    count: count || 0,
    paginationSupported: true
  };
}

async function loadLegacyDecisionCardPage(
  selection: JurisdictionSelection,
  locale: Locale,
  search: string,
  category: CategoryName | "",
  result: DecisionResultFilter | "",
  body: SantaBarbaraBodyView | "",
  page: number,
  pageSize: number
): Promise<DecisionCardPageResult> {
  const offset = (page - 1) * pageSize;
  const matchingCards = sortCards(
    (await loadPublishedCardsForSelection(selection, locale)).filter((card) =>
      matchesDecisionFilters(card, search, category || undefined, result || undefined) &&
      (!body ||
        (card.meetings
          ? matchesSantaBarbaraBody(card.meetings, body)
          : false))
    )
  );
  const totalCount = matchingCards.length;

  return {
    cards: matchingCards.slice(offset, offset + pageSize),
    totalCount,
    page,
    pageSize,
    pageCount: totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0
  };
}

const getCachedDecisionCardPage = unstable_cache(
  async (
    selection: JurisdictionSelection,
    locale: Locale,
    search: string,
    category: CategoryName | "",
    result: DecisionResultFilter | "",
    body: SantaBarbaraBodyView | "",
    page: number,
    pageSize: number
  ): Promise<DecisionCardPageResult> => {
    const normalizedPage = normalizeDecisionPage(page);
    const normalizedPageSize = normalizeDecisionPageSize(pageSize);
    const offset = (normalizedPage - 1) * normalizedPageSize;
    const normalizedSearch = normalizeSearch(search);

    if (normalizedSearch || result) {
      return loadLegacyDecisionCardPage(
        selection,
        locale,
        normalizedSearch,
        category,
        result,
        body,
        normalizedPage,
        normalizedPageSize
      );
    }

    const clients = getSafePublicClients(selection);

    if (clients.length === 0) {
      return {
        cards: [],
        totalCount: 0,
        page: normalizedPage,
        pageSize: normalizedPageSize,
        pageCount: 0
      };
    }

    const isAggregatePage = selection === ALL_JURISDICTIONS_SLUG && clients.length > 1;
    const candidateCount = isAggregatePage
      ? normalizedPage * normalizedPageSize
      : normalizedPageSize;
    const range = isAggregatePage
      ? { from: 0, to: candidateCount - 1 }
      : { from: offset, to: offset + normalizedPageSize - 1 };
    const results = await Promise.all(
      clients.map((client) =>
        loadDecisionCardCandidatesForJurisdiction(
          client,
          {
            search: "",
            category: category || undefined,
            body: body || undefined,
            page: normalizedPage,
            pageSize: normalizedPageSize
          },
          locale,
          range
        )
      )
    );
    if (results.some((result) => !result.paginationSupported)) {
      return loadLegacyDecisionCardPage(
        selection,
        locale,
        "",
        category,
        "",
        body,
        normalizedPage,
        normalizedPageSize
      );
    }
    const totalCount = results.reduce((sum, result) => sum + result.count, 0);
    const candidates = results.flatMap((result) => result.cards);
    const sortedCards = sortCards(candidates);
    const cards = isAggregatePage
      ? sortedCards.slice(offset, offset + normalizedPageSize)
      : sortedCards;

    return {
      cards,
      totalCount,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      pageCount: totalCount > 0 ? Math.ceil(totalCount / normalizedPageSize) : 0
    };
  },
  ["decision-card-page-rendered-search-v8"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedDecisionMapPoints = unstable_cache(
  async (
    selection: JurisdictionSelection,
    locale: Locale,
    search: string,
    category: CategoryName | "",
    result: DecisionResultFilter | "",
    timeframe: DecisionMapTimeframe,
    body: SantaBarbaraBodyView | ""
  ): Promise<DecisionMapPoint[]> => {
    const clients = getSafePublicClients(selection);
    const normalizedSearch = normalizeSearch(search);
    const pattern = toIlikePattern(normalizedSearch);
    const cutoff = decisionMapCutoff(timeframe);

    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        const meetingIds = pattern
          ? await getMatchingMeetingIdsForSearch(
              supabase,
              jurisdiction.slug,
              jurisdiction.name,
              pattern
            )
          : [];
        const bodyMeetingIds =
          jurisdiction.slug === "santa-barbara-county" && body
            ? await getSantaBarbaraMeetingIdsForBody(supabase, body)
            : null;
        if (bodyMeetingIds && bodyMeetingIds.length === 0) return [] as SummaryCardRow[];

        let query = supabase
          .from("summary_cards")
          .select(PUBLIC_DECISION_MAP_SELECT)
          .eq("jurisdiction_slug", jurisdiction.slug)
          .eq("is_published", true)
          .eq("location_status", "verified")
          .not("location_latitude", "is", null)
          .not("location_longitude", "is", null);

        if (category) query = query.contains("category_tags", [category]);
        if (bodyMeetingIds) query = query.in("meeting_id", bodyMeetingIds);
        if (pattern) query = query.or(decisionCardSearchFilters(pattern, meetingIds));
        if (cutoff) query = query.gte("decision_sort_at", cutoff);

        const { data, error } = await query
          .order("decision_sort_at", { ascending: false, nullsFirst: false })
          .limit(500);
        if (error) {
          if (!isMissingDecisionLocationColumn(error)) {
            logQueryError(`Failed to load ${jurisdiction.name} decision map`, error);
          }
          return [] as SummaryCardRow[];
        }

        const rows = ((data || []) as unknown as SummaryCardRow[]).map((row) =>
          withCardJurisdictionFallback(row, jurisdiction)
        );
        return enrichPublicCards(supabase, rows, locale);
      })
    );

    return sortCards(results.flat())
      .filter((card) => matchesDecisionResultFilter(card, result || undefined))
      .flatMap((card): DecisionMapPoint[] => {
        const latitude = card.location_latitude;
        const longitude = card.location_longitude;
        const precision = card.location_precision;
        if (
          typeof latitude !== "number" ||
          typeof longitude !== "number" ||
          !precision ||
          !card.location_label
        ) {
          return [];
        }
        const outcome = card.outcome?.kind ||
          (card.status === "Upcoming vote" && card.meetings?.status === "Past" ? "awaiting" : null);
        return [{
          id: card.id,
          title: cardShareTitle(card),
          jurisdiction: cardJurisdictionLabel(card, locale),
          latitude,
          longitude,
          locationLabel: card.location_label,
          locationPrecision: precision,
          locationConfidence: card.location_confidence ?? 0,
          category: card.category_tags?.[0] || null,
          result: outcome,
          meetingDate: cardMeetingDate(card, locale) || null,
          href: cardSharePath(card.id)
        }];
      })
      .slice(0, 750);
  },
  ["decision-map-points-v3"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedMeetings = unstable_cache(
  async (
    selection: JurisdictionSelection,
    search: string,
    locale: Locale,
    body: SantaBarbaraBodyView | ""
  ) => {
    const projects = getSafePublicProjects(selection);
    if (projects.length === 0) return [] as MeetingRow[];

    const results = await Promise.all(
      projects.map(async (project) => {
        const { supabase } = project;
        const query = supabase
          .from("meetings")
          .select(PUBLIC_MEETING_LIST_COLUMNS)
          .in("jurisdiction_slug", projectSlugs(project))
          .order("meeting_datetime", { ascending: false, nullsFirst: false });

        const { data, error } = await query;

        if (error) {
          logQueryError(`Failed to load ${projectLabel(project)} meetings`, error);
          return [] as MeetingRow[];
        }

        const resolveJurisdiction = jurisdictionResolver(project.jurisdictions);
        const rows = ((data || []) as unknown as MeetingRow[]).map((row) =>
          withMeetingJurisdictionFallback(row, resolveJurisdiction(row.jurisdiction_slug))
        );
        const translatedRows = await applyMeetingTranslations(supabase, rows, locale);
        return translatedRows
          .filter((row) => !body || matchesSantaBarbaraBody(row, body))
          .filter((row) => matchesMeetingFilters(row, search, locale));
      })
    );

    return sortMeetings(results.flat());
  },
  ["public-meetings-rendered-search-v4"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedMeetingDetail = unstable_cache(
  async (selection: JurisdictionSelection, id: string, locale: Locale) => {
    const clients = getSafePublicClients(selection);
    if (clients.length === 0) {
      return {
        meeting: null,
        cards: [] as SummaryCardRow[],
        documents: [] as DocumentRow[]
      };
    }

    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        const [
          { data: meeting, error: meetingError },
          { data: cards, error: cardsError },
          { data: documents, error: documentsError }
        ] = await Promise.all([
          supabase
            .from("meetings")
            .select(PUBLIC_MEETING_DETAIL_COLUMNS)
            .eq("id", id)
            .eq("jurisdiction_slug", jurisdiction.slug)
            .maybeSingle(),
          supabase
            .from("summary_cards")
            .select(PUBLIC_SUMMARY_CARD_SELECT)
            .eq("meeting_id", id)
            .eq("jurisdiction_slug", jurisdiction.slug)
            .eq("is_published", true)
            .order("created_at", { ascending: true }),
          supabase
            .from("documents")
            .select(PUBLIC_DOCUMENT_COLUMNS)
            .eq("meeting_id", id)
            .eq("jurisdiction_slug", jurisdiction.slug)
            .order("type", { ascending: true })
        ]);

        logQueryError(`Failed to load ${jurisdiction.name} meeting ${id}`, meetingError);
        logQueryError(`Failed to load ${jurisdiction.name} cards for meeting ${id}`, cardsError);
        logQueryError(`Failed to load ${jurisdiction.name} documents for meeting ${id}`, documentsError);

        const meetingRow = meeting
            ? withMeetingJurisdictionFallback(meeting as unknown as MeetingRow, jurisdiction)
            : null;
        const translatedMeetings = meetingRow
          ? await applyMeetingTranslations(supabase, [meetingRow], locale)
          : [];
        const cardRows = ((cards || []) as unknown as SummaryCardRow[]).map((row) =>
            withCardJurisdictionFallback(row, jurisdiction)
          );
        const translatedCards = await enrichPublicCards(supabase, cardRows, locale);

        return {
          meeting: translatedMeetings[0] || meetingRow,
          cards: translatedCards,
          documents: ((documents || []) as unknown as DocumentRow[]).map((row) =>
            withDocumentJurisdictionFallback(row, jurisdiction)
          )
        };
      })
    );

    return (
      results.find((result) => result.meeting) || {
        meeting: null,
        cards: [] as SummaryCardRow[],
        documents: [] as DocumentRow[]
      }
    );
  },
  ["public-meeting-detail"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedAdjacentMeetings = unstable_cache(
  async (
    selection: JurisdictionSelection,
    currentMeetingId: string,
    currentMeetingDatetime: string,
    locale: Locale,
    body: SantaBarbaraBodyView | ""
  ): Promise<AdjacentMeetings> => {
    const currentTime = rowTime(currentMeetingDatetime);
    if (!currentTime) {
      return {
        newerMeeting: null,
        olderMeeting: null
      };
    }

    const clients = getSafePublicClients(selection);
    if (clients.length === 0) {
      return {
        newerMeeting: null,
        olderMeeting: null
      };
    }

    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        const [newer, older] = await Promise.all([
          supabase
            .from("meetings")
            .select(PUBLIC_MEETING_LIST_COLUMNS)
            .eq("jurisdiction_slug", jurisdiction.slug)
            .not("meeting_datetime", "is", null)
            .neq("id", currentMeetingId)
            .gt("meeting_datetime", currentMeetingDatetime)
            .order("meeting_datetime", { ascending: true, nullsFirst: false })
            .limit(body ? 25 : 1),
          supabase
            .from("meetings")
            .select(PUBLIC_MEETING_LIST_COLUMNS)
            .eq("jurisdiction_slug", jurisdiction.slug)
            .not("meeting_datetime", "is", null)
            .neq("id", currentMeetingId)
            .lt("meeting_datetime", currentMeetingDatetime)
            .order("meeting_datetime", { ascending: false, nullsFirst: false })
            .limit(body ? 25 : 1)
        ]);

        logQueryError(`Failed to load newer ${jurisdiction.name} meeting for ${currentMeetingId}`, newer.error);
        logQueryError(`Failed to load older ${jurisdiction.name} meeting for ${currentMeetingId}`, older.error);

        const rows = ([...(newer.data || []), ...(older.data || [])] as unknown as MeetingRow[]).map(
          (row) => withMeetingJurisdictionFallback(row, jurisdiction)
        );
        const translatedRows = await applyMeetingTranslations(supabase, rows, locale);

        return translatedRows.filter((row) => !body || matchesSantaBarbaraBody(row, body));
      })
    );

    const candidates = results.flat();

    return {
      newerMeeting: closestNewerMeeting(candidates, currentTime),
      olderMeeting: closestOlderMeeting(candidates, currentTime)
    };
  },
  ["adjacent-meetings"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedCategoryCards = unstable_cache(
  async (selection: JurisdictionSelection, category: string, locale: Locale) => {
    const projects = getSafePublicProjects(selection);
    if (projects.length === 0) return [] as SummaryCardRow[];

    const results = await Promise.all(
      projects.map(async (project) => {
        const { supabase } = project;
        const { data, error } = await supabase
          .from("summary_cards")
          .select(PUBLIC_SUMMARY_CARD_SELECT)
          .in("jurisdiction_slug", projectSlugs(project))
          .eq("is_published", true)
          .contains("category_tags", [category])
          .order("is_featured", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) {
          logQueryError(`Failed to load ${projectLabel(project)} category ${category}`, error);
          return [] as SummaryCardRow[];
        }

        const resolveJurisdiction = jurisdictionResolver(project.jurisdictions);
        const rows = ((data || []) as unknown as SummaryCardRow[]).map((row) =>
          withCardJurisdictionFallback(row, resolveJurisdiction(row.jurisdiction_slug))
        );
        return enrichPublicCards(supabase, rows, locale);
      })
    );

    return sortCards(results.flat());
  },
  ["category-summary-cards"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

// null means "could not read", which is NOT the same as a real count of 0.
// Rendering a failed read as 0 is how the homepage came to advertise "0+".
const UNAVAILABLE_JURISDICTION_STATS = {
  agendaItemsAnalyzed: null,
  meetingsAnalyzed: null,
  publishedCards: null
} as const;

const getCachedPublicStats = unstable_cache(
  async () => {
    const jurisdictionsSupported = getJurisdictions().length;
    const projects = getSafeServiceProjects(ALL_JURISDICTIONS_SLUG);

    const results = await Promise.all(
      projects.map(async (project) => {
        const { supabase } = project;
        const slugs = projectSlugs(project);
        const label = projectLabel(project);

        return withFallbackTimeout<{
          agendaItemsAnalyzed: number | null;
          meetingsAnalyzed: number | null;
          publishedCards: number | null;
        }>(
          Promise.all([
            supabase
              .from("summary_cards")
              .select("id", { count: "exact", head: true })
              .in("jurisdiction_slug", slugs)
              .eq("is_published", true)
              .not("meeting_id", "is", null),
            supabase
              .from("meetings")
              .select("id", { count: "exact", head: true })
              .in("jurisdiction_slug", slugs)
              .not("cards_generated_at", "is", null),
            supabase
              .from("meetings")
              .select("id,summary_cards!inner(id)", { count: "exact", head: true })
              .in("jurisdiction_slug", slugs)
              .is("cards_generated_at", null)
              .eq("summary_cards.is_published", true),
            // Published cards including those with no meeting attached. The
            // homepage needs this to state the agenda-item total, and reading it
            // here rather than through getPublishedCardCount(ALL) keeps a second
            // whole-estate fan-out off the request path. Anon RLS exposes exactly
            // the published rows, so the service client counts the same set.
            supabase
              .from("summary_cards")
              .select("id", { count: "exact", head: true })
              .in("jurisdiction_slug", slugs)
              .eq("is_published", true)
          ]).then(([cards, meetings, legacyMeetingsWithCards, publishedCards]) => {
            logQueryError(`Failed to count ${label} published summary cards`, cards.error);
            logQueryError(`Failed to count ${label} analyzed meetings`, meetings.error);
            logQueryError(
              `Failed to count ${label} legacy meetings with published cards`,
              legacyMeetingsWithCards.error
            );
            logQueryError(`Failed to count ${label} published cards`, publishedCards.error);

            return {
              agendaItemsAnalyzed: cards.count || 0,
              meetingsAnalyzed: (meetings.count || 0) + (legacyMeetingsWithCards.count || 0),
              publishedCards: publishedCards.count || 0
            };
          }),
          PUBLIC_STATS_QUERY_TIMEOUT_MS,
          UNAVAILABLE_JURISDICTION_STATS,
          `Public stats for ${label}`
        );
      })
    );

    // Sum whatever was readable: these are displayed rounded down with a "+",
    // so a partial sum is a truthful lower bound. Only when every jurisdiction
    // failed is there no number to show at all, and null says so explicitly.
    const sumAvailable = (pick: (result: (typeof results)[number]) => number | null) => {
      const available = results.map(pick).filter((value): value is number => value !== null);
      return available.length === 0 ? null : available.reduce((sum, value) => sum + value, 0);
    };

    return {
      agendaItemsAnalyzed: sumAvailable((result) => result.agendaItemsAnalyzed),
      meetingsAnalyzed: sumAvailable((result) => result.meetingsAnalyzed),
      publishedCards: sumAvailable((result) => result.publishedCards),
      jurisdictionsSupported
    };
  },
  ["public-stats-v2"],
  {
    revalidate: PUBLIC_STATS_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_CONTENT_CACHE_TAG]
  }
);

export async function getPublishedCards(
  selection: JurisdictionSelection = getDefaultJurisdiction().slug,
  locale: Locale = "en"
) {
  return loadPublishedCardsForSelection(selection, locale);
}

export async function getHomepageCardSelection(
  selection: JurisdictionSelection = getDefaultJurisdiction().slug,
  locale: Locale = "en"
) {
  const localized = await getCachedHomepageSelection(selection);
  return localized[locale] || localized.en;
}

/**
 * Everything the homepage renders, for either the default view or a search.
 *
 * Search results come from the already-cached decision page query and are
 * ranked inline: a page of results is small enough that ranking it costs
 * nothing, and caching per search term would fill the cache with one-off keys.
 */
export async function getHomepageContent({
  jurisdiction = getDefaultJurisdiction().slug,
  locale = "en",
  search = ""
}: {
  jurisdiction?: JurisdictionSelection;
  locale?: Locale;
  search?: string;
}): Promise<HomepageCardSelection> {
  if (!search) return getHomepageCardSelection(jurisdiction, locale);

  const { cards, totalCount } = await getDecisionCardPage({ jurisdiction, locale, search });
  const prioritized = [...cards].sort(compareCardsByPublicInterest);
  const publicInterestCards = prioritized.filter(isPublicInterestCard);
  const preferred = publicInterestCards.length > 0 ? publicInterestCards : prioritized;

  return {
    cards: prioritized,
    meetingCards: selectUpcomingMeetingCards(preferred, HOMEPAGE_MEETING_CARD_COUNT),
    totalCount
  };
}

export async function getPublishedCardCount(
  selection: JurisdictionSelection = getDefaultJurisdiction().slug
) {
  return getCachedPublishedCardCount(selection);
}

/**
 * Counts and next-meeting date for the homepage status line.
 *
 * This deliberately does NOT reuse the homepage card preview. That preview is
 * the newest 80 cards per jurisdiction by `created_at`, which has nothing to do
 * with meeting dates — for Santa Barbara County all 80 came from one import
 * batch and none had an upcoming meeting, so the page silently claimed there
 * was no next meeting while a Board hearing was scheduled for that afternoon.
 *
 * Filtering happens in the database on the joined meeting, so the result covers
 * every published card rather than a slice of them.
 */
export async function getUpcomingDecisionSnapshot(
  selection: JurisdictionSelection = getDefaultJurisdiction().slug
) {
  return getCachedUpcomingDecisionSnapshot(selection);
}

export async function getDecisionResultFreshness(
  santaBarbaraBody: SantaBarbaraBodyView | "" = ""
) {
  return getCachedDecisionResultFreshness(santaBarbaraBody);
}

export async function getPublishedDecisionCards(
  selection: JurisdictionSelection = getDefaultJurisdiction().slug,
  locale: Locale = "en"
) {
  return loadPublishedCardsForSelection(selection, locale);
}

export async function getPublishedCardsByIds(
  cardIds: string[],
  selection: JurisdictionSelection = getDefaultJurisdiction().slug,
  locale: Locale = "en"
) {
  const ids = [...new Set(cardIds)].slice(0, 50);
  if (ids.length === 0) return [] as SummaryCardRow[];

  const clients = getSafePublicClients(selection);
  const results = await Promise.all(
    clients.map(async ({ jurisdiction, supabase }) => {
      const { data, error } = await supabase
        .from("summary_cards")
        .select(PUBLIC_SUMMARY_CARD_SELECT)
        .eq("jurisdiction_slug", jurisdiction.slug)
        .eq("is_published", true)
        .in("id", ids);

      if (error) {
        logQueryError(`Failed to load ${jurisdiction.name} published summary cards by id`, error);
        return [] as SummaryCardRow[];
      }

      const rows = ((data || []) as unknown as SummaryCardRow[]).map((row) =>
        withCardJurisdictionFallback(row, jurisdiction)
      );
      return enrichPublicCards(supabase, rows, locale);
    })
  );

  return results.flat();
}

export async function getPublishedCard(id: string, locale: Locale = "en") {
  return getCachedPublishedCard(id, locale);
}

export async function getDecisionCardPage({
  jurisdiction = getDefaultJurisdiction().slug,
  locale = "en",
  search = "",
  category,
  result,
  body,
  page = 1,
  pageSize = DECISION_CARD_PAGE_SIZE
}: {
  jurisdiction?: JurisdictionSelection;
  locale?: Locale;
  search?: string;
  category?: CategoryName;
  result?: DecisionResultFilter;
  body?: SantaBarbaraBodyView;
  page?: number;
  pageSize?: number;
}) {
  return getCachedDecisionCardPage(
    jurisdiction,
    locale,
    normalizeSearch(search),
    category || "",
    result || "",
    body || "",
    normalizeDecisionPage(page),
    normalizeDecisionPageSize(pageSize)
  );
}

export async function getDecisionMapPoints({
  jurisdiction = getDefaultJurisdiction().slug,
  locale = "en",
  search = "",
  category,
  result,
  timeframe = "12m",
  body
}: {
  jurisdiction?: JurisdictionSelection;
  locale?: Locale;
  search?: string;
  category?: CategoryName;
  result?: DecisionResultFilter;
  timeframe?: DecisionMapTimeframe;
  body?: SantaBarbaraBodyView;
}) {
  return getCachedDecisionMapPoints(
    jurisdiction,
    locale,
    normalizeSearch(search),
    category || "",
    result || "",
    timeframe,
    body || ""
  );
}

export async function getActiveAnnouncements(selection: JurisdictionSelection = getDefaultJurisdiction().slug) {
  return getCachedActiveAnnouncements(selection);
}

export async function getMeetings(
  filters: {
    search?: string;
    jurisdiction?: JurisdictionSelection;
    locale?: Locale;
    body?: SantaBarbaraBodyView;
  } = {}
) {
  return getCachedMeetings(
    filters.jurisdiction || getDefaultJurisdiction().slug,
    normalizeSearch(filters.search),
    filters.locale || "en",
    filters.body || ""
  );
}

export async function getMeetingDetail(
  id: string,
  selection: JurisdictionSelection = getDefaultJurisdiction().slug,
  locale: Locale = "en"
) {
  return getCachedMeetingDetail(selection, id, locale);
}

export async function getAdjacentMeetingsForMeeting(
  meeting: MeetingRow,
  selection: JurisdictionSelection = getDefaultJurisdiction().slug,
  locale: Locale = "en"
): Promise<AdjacentMeetings> {
  const santaBarbaraBody: SantaBarbaraBodyView | "" =
    meeting.jurisdiction_slug === "santa-barbara-county"
      ? matchesSantaBarbaraBody(meeting, "planning")
        ? "planning"
        : "board"
      : "";

  if (!meeting.meeting_datetime) {
    const meetings = await getCachedMeetings(selection, "", locale, santaBarbaraBody);
    const currentIndex = meetings.findIndex((row) => row.id === meeting.id);

    return {
      newerMeeting: currentIndex > 0 ? meetings[currentIndex - 1] : null,
      olderMeeting:
        currentIndex >= 0 && currentIndex < meetings.length - 1
          ? meetings[currentIndex + 1]
          : null
    };
  }

  return getCachedAdjacentMeetings(
    selection,
    meeting.id,
    meeting.meeting_datetime,
    locale,
    santaBarbaraBody
  );
}

export async function getMeetingRawVideoDocuments(
  id: string,
  selection: JurisdictionSelection = getDefaultJurisdiction().slug
) {
  const clients = getSafeServiceClients(selection);
  if (clients.length === 0) return [] as DocumentRow[];

  const results = await Promise.all(
    clients.map(async ({ jurisdiction, supabase }) => {
      const { data, error } = await supabase
        .from("meetings")
        .select("raw")
        .eq("id", id)
        .eq("jurisdiction_slug", jurisdiction.slug)
        .maybeSingle();

      logQueryError(`Failed to load ${jurisdiction.name} raw meeting video documents for ${id}`, error);
      const raw = data && typeof data === "object" && "raw" in data
        ? (data as { raw?: unknown }).raw
        : null;

      return getMeetingVideoDocuments([], raw).map((row) =>
        withDocumentJurisdictionFallback(row, jurisdiction)
      );
    })
  );

  return getMeetingVideoDocuments(results.flat());
}

export async function getCategoryCards(
  category: string,
  selection: JurisdictionSelection = getDefaultJurisdiction().slug,
  locale: Locale = "en"
) {
  return getCachedCategoryCards(selection, category, locale);
}

export async function getPublicStats() {
  return getCachedPublicStats();
}

export async function getAdminCollections(
  selection: JurisdictionSelection = getDefaultJurisdiction().slug
) {
  const clients = getSafeServiceClients(selection);
  if (clients.length === 0) {
    return {
      meetings: [] as MeetingRow[],
      cards: [] as SummaryCardRow[],
      announcements: [] as AnnouncementRow[],
      documents: [] as DocumentRow[],
      scraperRuns: [] as Array<Record<string, unknown>>,
      auditLog: [] as Array<Record<string, unknown>>
    };
  }

  const announcementDatabaseUrls = new Set<string>();
  const results = await Promise.all(
    clients.map(async ({ jurisdiction, supabase }) => {
      const announcementDatabaseKey = jurisdiction.supabaseUrl || jurisdiction.slug;
      const shouldLoadAnnouncements = !announcementDatabaseUrls.has(announcementDatabaseKey);
      announcementDatabaseUrls.add(announcementDatabaseKey);
      const [meetings, cards, announcements, documents, scraperRuns, auditLog] = await Promise.all([
        supabase
          .from("meetings")
          .select("*")
          .eq("jurisdiction_slug", jurisdiction.slug)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("summary_cards")
          .select("*, meetings(*)")
          .eq("jurisdiction_slug", jurisdiction.slug)
          .order("created_at", { ascending: false })
          .limit(100),
        shouldLoadAnnouncements
          ? supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(100)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("documents")
          .select("*")
          .eq("jurisdiction_slug", jurisdiction.slug)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("scraper_runs")
          .select("*")
          .eq("jurisdiction_slug", jurisdiction.slug)
          .order("started_at", { ascending: false })
          .limit(20),
        supabase
          .from("admin_audit_log")
          .select("*")
          .eq("jurisdiction_slug", jurisdiction.slug)
          .order("created_at", { ascending: false })
          .limit(50)
      ]);

      logQueryError(`Failed to load ${jurisdiction.name} admin meetings`, meetings.error);
      logQueryError(`Failed to load ${jurisdiction.name} admin cards`, cards.error);
      logQueryError(`Failed to load ${jurisdiction.name} admin announcements`, announcements.error);
      logQueryError(`Failed to load ${jurisdiction.name} admin documents`, documents.error);
      logQueryError(`Failed to load ${jurisdiction.name} scraper runs`, scraperRuns.error);
      logQueryError(`Failed to load ${jurisdiction.name} audit log`, auditLog.error);

      return {
        meetings: ((meetings.data || []) as MeetingRow[]).map((row) =>
          withMeetingJurisdictionFallback(row, jurisdiction)
        ),
        cards: ((cards.data || []) as SummaryCardRow[]).map((row) =>
          withCardJurisdictionFallback(row, jurisdiction)
        ),
        announcements: ((announcements.data || []) as AnnouncementRow[]).map((row) =>
          ({
            ...withAnnouncementJurisdictionFallback(row),
            source_jurisdiction_slug: jurisdiction.slug
          })
        ),
        documents: ((documents.data || []) as DocumentRow[]).map((row) =>
          withDocumentJurisdictionFallback(row, jurisdiction)
        ),
        scraperRuns: (scraperRuns.data || []).map((row) => ({
          ...row,
          jurisdiction_slug: row.jurisdiction_slug || jurisdiction.slug,
          platform: row.platform || jurisdiction.platform
        })),
        auditLog: (auditLog.data || []).map((row) => ({
          ...row,
          jurisdiction_slug: row.jurisdiction_slug || jurisdiction.slug
        }))
      };
    })
  );

  return {
    meetings: sortMeetings(results.flatMap((result) => result.meetings)),
    cards: sortCards(results.flatMap((result) => result.cards)),
    announcements: sortByCreatedAt(results.flatMap((result) => result.announcements)),
    documents: sortByCreatedAt(results.flatMap((result) => result.documents)),
    scraperRuns: sortByCreatedAt(results.flatMap((result) => result.scraperRuns)),
    auditLog: sortByCreatedAt(results.flatMap((result) => result.auditLog))
  };
}
