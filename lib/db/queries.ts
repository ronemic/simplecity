import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DECISION_CARD_PAGE_SIZE, type CategoryName } from "@/lib/constants";
import {
  ALL_JURISDICTIONS_SLUG,
  getDefaultJurisdiction,
  getJurisdictions,
  getJurisdictionSlugFromRow,
  getPublicSupabaseClientForJurisdiction,
  getPublicSupabaseClientsForSelection,
  getServiceSupabaseClientsForSelection,
  type JurisdictionConfig,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";
import { PUBLIC_CACHE_REVALIDATE_SECONDS, PUBLIC_CONTENT_CACHE_TAG } from "@/lib/db/publicCache";
import {
  meetingTranslationFingerprint,
  summaryCardTranslationFingerprint
} from "@/lib/db/translationFingerprint";
import type {
  AnnouncementRow,
  DocumentRow,
  MeetingRow,
  MeetingTranslationRow,
  SummaryCardRow,
  SummaryCardTranslationRow
} from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { compareCardsByPublicInterest } from "@/lib/utils/civicPriority";
import {
  decisionCardSearchFilters,
  decisionMeetingSearchFilters,
  matchesDecisionFilters
} from "@/lib/utils/decisionFilters";
import { getMeetingVideoDocuments } from "@/lib/utils/videoEmbed";
import { withEffectiveMeetingStatus } from "@/lib/utils/meetingStatus";
import { matchesMeetingFilters } from "@/lib/utils/meetingFilters";

const PUBLIC_CARD_MEETING_COLUMNS =
  "id,jurisdiction_name,jurisdiction_slug,platform,title,meeting_type,date_text,time_text,meeting_datetime,status";
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
const HOME_CARD_PREVIEW_LIMIT_PER_JURISDICTION = 80;
const DECISION_RANKING_BUFFER_PER_JURISDICTION = 12;
const TRANSLATION_LOOKUP_BATCH_SIZE = 100;

type AdjacentMeetings = {
  newerMeeting: MeetingRow | null;
  olderMeeting: MeetingRow | null;
};

type DecisionCardPageFilters = {
  selection: JurisdictionSelection;
  locale: Locale;
  search: string;
  category?: CategoryName;
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

function logQueryError(context: string, error: unknown) {
  if (!error) return;
  if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "PGRST205") {
    return;
  }

  const message = error instanceof Error ? error.message : JSON.stringify(error);
  if (message.includes("Could not find the table")) return;
  console.error(`[SimpleCity] ${context}: ${message}`);
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

function normalizePositiveInteger(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
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
  return [...cards].sort((left, right) => {
    const featuredDelta = Number(Boolean(right.is_featured)) - Number(Boolean(left.is_featured));
    if (featuredDelta !== 0) return featuredDelta;

    const leftDate = new Date(
      left.meetings?.meeting_datetime || left.updated_at || left.created_at || 0
    ).getTime();
    const rightDate = new Date(
      right.meetings?.meeting_datetime || right.updated_at || right.created_at || 0
    ).getTime();
    return rightDate - leftDate;
  });
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

async function loadPublishedCardsForJurisdiction(
  {
    jurisdiction,
    supabase
  }: {
    jurisdiction: JurisdictionConfig;
    supabase: SupabaseClient;
  },
  locale: Locale,
  options: { limit?: number } = {}
) {
  let query = supabase
    .from("summary_cards")
    .select(PUBLIC_SUMMARY_CARD_SELECT)
    .eq("jurisdiction_slug", jurisdiction.slug)
    .eq("is_published", true)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    logQueryError(`Failed to load ${jurisdiction.name} published summary cards`, error);
    return [] as SummaryCardRow[];
  }

  const rows = ((data || []) as unknown as SummaryCardRow[]).map((row) =>
    withCardJurisdictionFallback(row, jurisdiction)
  );
  return applyCardTranslations(supabase, rows, locale);
}

async function loadPublishedCardsForSelection(
  selection: JurisdictionSelection,
  locale: Locale
) {
  const clients = getSafePublicClients(selection);
  if (clients.length === 0) return [] as SummaryCardRow[];

  const results = await Promise.all(
    clients.map((client) => loadPublishedCardsForJurisdiction(client, locale))
  );

  return sortCards(results.flat());
}

const getCachedPublishedCardPreview = unstable_cache(
  async (selection: JurisdictionSelection, locale: Locale) => {
    const clients = getSafePublicClients(selection);
    if (clients.length === 0) return [] as SummaryCardRow[];

    const results = await Promise.all(
      clients.map((client) =>
        loadPublishedCardsForJurisdiction(client, locale, {
          limit: HOME_CARD_PREVIEW_LIMIT_PER_JURISDICTION
        })
      )
    );

    return sortCards(results.flat());
  },
  ["published-summary-card-preview"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedPublishedCardCount = unstable_cache(
  async (selection: JurisdictionSelection) => {
    const clients = getSafePublicClients(selection);
    if (clients.length === 0) return 0;

    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        const { count, error } = await supabase
          .from("summary_cards")
          .select("id", { count: "exact", head: true })
          .eq("jurisdiction_slug", jurisdiction.slug)
          .eq("is_published", true);

        if (error) {
          logQueryError(`Failed to count ${jurisdiction.name} published summary cards`, error);
          return 0;
        }

        return count || 0;
      })
    );

    return results.reduce((sum, count) => sum + count, 0);
  },
  ["published-summary-card-count"],
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

        const [translated] = await applyCardTranslations(
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
    const clients = getSafePublicClients(selection);
    if (clients.length === 0) return [] as AnnouncementRow[];

    const now = Date.now();
    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        const { data, error } = await supabase
          .from("announcements")
          .select(PUBLIC_ANNOUNCEMENT_COLUMNS)
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        if (error) {
          logQueryError(`Failed to load ${jurisdiction.name} announcements`, error);
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
  let query = supabase
    .from("summary_cards")
    .select(PUBLIC_SUMMARY_CARD_SELECT, { count: "exact" })
    .eq("jurisdiction_slug", jurisdiction.slug)
    .eq("is_published", true);

  if (filters.category) {
    query = query.contains("category_tags", [filters.category]);
  }

  if (pattern) {
    query = query.or(decisionCardSearchFilters(pattern, meetingIds));
  }

  const { data, error, count } = await query
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .range(range.from, range.to);

  if (error) {
    logQueryError(`Failed to load ${jurisdiction.name} decision cards`, error);
    return {
      cards: [] as SummaryCardRow[],
      count: 0
    };
  }

  const rows = ((data || []) as unknown as SummaryCardRow[]).map((row) =>
    withCardJurisdictionFallback(row, jurisdiction)
  );

  return {
    cards: await applyCardTranslations(supabase, rows, locale),
    count: count || 0
  };
}

const getCachedDecisionCardPage = unstable_cache(
  async (
    selection: JurisdictionSelection,
    locale: Locale,
    search: string,
    category: CategoryName | "",
    page: number,
    pageSize: number
  ): Promise<DecisionCardPageResult> => {
    const normalizedPage = normalizePositiveInteger(page, 1);
    const normalizedPageSize = normalizePositiveInteger(pageSize, DECISION_CARD_PAGE_SIZE);
    const offset = (normalizedPage - 1) * normalizedPageSize;
    const normalizedSearch = normalizeSearch(search);

    if (normalizedSearch) {
      const matchingCards = (await loadPublishedCardsForSelection(selection, locale))
        .filter((card) =>
          matchesDecisionFilters(card, normalizedSearch, category || undefined)
        )
        .sort(compareCardsByPublicInterest);
      const totalCount = matchingCards.length;

      return {
        cards: matchingCards.slice(offset, offset + normalizedPageSize),
        totalCount,
        page: normalizedPage,
        pageSize: normalizedPageSize,
        pageCount: totalCount > 0 ? Math.ceil(totalCount / normalizedPageSize) : 0
      };
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
      ? normalizedPage * normalizedPageSize + DECISION_RANKING_BUFFER_PER_JURISDICTION
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
            page: normalizedPage,
            pageSize: normalizedPageSize
          },
          locale,
          range
        )
      )
    );
    const totalCount = results.reduce((sum, result) => sum + result.count, 0);
    const candidates = results.flatMap((result) => result.cards);
    const sortedCards = [...candidates].sort(compareCardsByPublicInterest);
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
  ["decision-card-page-rendered-search-v5"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedMeetings = unstable_cache(
  async (selection: JurisdictionSelection, search: string, locale: Locale) => {
    const clients = getSafePublicClients(selection);
    if (clients.length === 0) return [] as MeetingRow[];

    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        const query = supabase
          .from("meetings")
          .select(PUBLIC_MEETING_LIST_COLUMNS)
          .eq("jurisdiction_slug", jurisdiction.slug)
          .order("meeting_datetime", { ascending: false, nullsFirst: false });

        const { data, error } = await query;

        if (error) {
          logQueryError(`Failed to load ${jurisdiction.name} meetings`, error);
          return [] as MeetingRow[];
        }

        const rows = ((data || []) as unknown as MeetingRow[]).map((row) =>
          withMeetingJurisdictionFallback(row, jurisdiction)
        );
        const translatedRows = await applyMeetingTranslations(supabase, rows, locale);
        return translatedRows.filter((row) => matchesMeetingFilters(row, search, locale));
      })
    );

    return sortMeetings(results.flat());
  },
  ["public-meetings-rendered-search-v3"],
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
        const translatedCards = await applyCardTranslations(supabase, cardRows, locale);

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
    locale: Locale
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
            .limit(1),
          supabase
            .from("meetings")
            .select(PUBLIC_MEETING_LIST_COLUMNS)
            .eq("jurisdiction_slug", jurisdiction.slug)
            .not("meeting_datetime", "is", null)
            .neq("id", currentMeetingId)
            .lt("meeting_datetime", currentMeetingDatetime)
            .order("meeting_datetime", { ascending: false, nullsFirst: false })
            .limit(1)
        ]);

        logQueryError(`Failed to load newer ${jurisdiction.name} meeting for ${currentMeetingId}`, newer.error);
        logQueryError(`Failed to load older ${jurisdiction.name} meeting for ${currentMeetingId}`, older.error);

        const rows = ([...(newer.data || []), ...(older.data || [])] as unknown as MeetingRow[]).map(
          (row) => withMeetingJurisdictionFallback(row, jurisdiction)
        );
        const translatedRows = await applyMeetingTranslations(supabase, rows, locale);

        return translatedRows;
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
    const clients = getSafePublicClients(selection);
    if (clients.length === 0) return [] as SummaryCardRow[];

    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        const { data, error } = await supabase
          .from("summary_cards")
          .select(PUBLIC_SUMMARY_CARD_SELECT)
          .eq("jurisdiction_slug", jurisdiction.slug)
          .eq("is_published", true)
          .contains("category_tags", [category])
          .order("is_featured", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) {
          logQueryError(`Failed to load ${jurisdiction.name} category ${category}`, error);
          return [] as SummaryCardRow[];
        }

        const rows = ((data || []) as unknown as SummaryCardRow[]).map((row) =>
          withCardJurisdictionFallback(row, jurisdiction)
        );
        return applyCardTranslations(supabase, rows, locale);
      })
    );

    return sortCards(results.flat());
  },
  ["category-summary-cards"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedPublicStats = unstable_cache(
  async () => {
    const jurisdictions = getJurisdictions();
    const jurisdictionsSupported = jurisdictions.length;

    const results = await Promise.all(
      jurisdictions.map(async (jurisdiction) => {
        let supabase;
        try {
          supabase = getPublicSupabaseClientForJurisdiction(jurisdiction.slug);
        } catch (error) {
          logQueryError(`Failed to create ${jurisdiction.name} public Supabase client`, error);
          return {
            agendaItemsAnalyzed: 0,
            meetingsAnalyzed: 0
          };
        }

        const [cards, meetings, legacyMeetingsWithCards] = await Promise.all([
          supabase
            .from("summary_cards")
            .select("id", { count: "exact", head: true })
            .eq("jurisdiction_slug", jurisdiction.slug)
            .eq("is_published", true)
            .not("meeting_id", "is", null),
          supabase
            .from("meetings")
            .select("id", { count: "exact", head: true })
            .eq("jurisdiction_slug", jurisdiction.slug)
            .not("cards_generated_at", "is", null),
          supabase
            .from("meetings")
            .select("id,summary_cards!inner(id)", { count: "exact", head: true })
            .eq("jurisdiction_slug", jurisdiction.slug)
            .is("cards_generated_at", null)
            .eq("summary_cards.is_published", true)
        ]);

        logQueryError(`Failed to count ${jurisdiction.name} published summary cards`, cards.error);
        logQueryError(`Failed to count ${jurisdiction.name} analyzed meetings`, meetings.error);
        logQueryError(
          `Failed to count ${jurisdiction.name} legacy meetings with published cards`,
          legacyMeetingsWithCards.error
        );

        return {
          agendaItemsAnalyzed: cards.count || 0,
          meetingsAnalyzed: (meetings.count || 0) + (legacyMeetingsWithCards.count || 0)
        };
      })
    );

    return {
      agendaItemsAnalyzed: results.reduce((sum, result) => sum + result.agendaItemsAnalyzed, 0),
      meetingsAnalyzed: results.reduce((sum, result) => sum + result.meetingsAnalyzed, 0),
      jurisdictionsSupported
    };
  },
  ["public-stats"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

export async function getPublishedCards(
  selection: JurisdictionSelection = getDefaultJurisdiction().slug,
  locale: Locale = "en"
) {
  return loadPublishedCardsForSelection(selection, locale);
}

export async function getPublishedCardPreview(
  selection: JurisdictionSelection = getDefaultJurisdiction().slug,
  locale: Locale = "en"
) {
  return getCachedPublishedCardPreview(selection, locale);
}

export async function getPublishedCardCount(
  selection: JurisdictionSelection = getDefaultJurisdiction().slug
) {
  return getCachedPublishedCardCount(selection);
}

export async function getPublishedDecisionCards(
  selection: JurisdictionSelection = getDefaultJurisdiction().slug,
  locale: Locale = "en"
) {
  return loadPublishedCardsForSelection(selection, locale);
}

export async function getPublishedCard(id: string, locale: Locale = "en") {
  return getCachedPublishedCard(id, locale);
}

export async function getDecisionCardPage({
  jurisdiction = getDefaultJurisdiction().slug,
  locale = "en",
  search = "",
  category,
  page = 1,
  pageSize = DECISION_CARD_PAGE_SIZE
}: {
  jurisdiction?: JurisdictionSelection;
  locale?: Locale;
  search?: string;
  category?: CategoryName;
  page?: number;
  pageSize?: number;
}) {
  return getCachedDecisionCardPage(
    jurisdiction,
    locale,
    normalizeSearch(search),
    category || "",
    normalizePositiveInteger(page, 1),
    normalizePositiveInteger(pageSize, DECISION_CARD_PAGE_SIZE)
  );
}

export async function getActiveAnnouncements(selection: JurisdictionSelection = getDefaultJurisdiction().slug) {
  return getCachedActiveAnnouncements(selection);
}

export async function getMeetings(
  filters: { search?: string; jurisdiction?: JurisdictionSelection; locale?: Locale } = {}
) {
  return getCachedMeetings(
    filters.jurisdiction || getDefaultJurisdiction().slug,
    normalizeSearch(filters.search),
    filters.locale || "en"
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
  if (!meeting.meeting_datetime) {
    const meetings = await getCachedMeetings(selection, "", locale);
    const currentIndex = meetings.findIndex((row) => row.id === meeting.id);

    return {
      newerMeeting: currentIndex > 0 ? meetings[currentIndex - 1] : null,
      olderMeeting:
        currentIndex >= 0 && currentIndex < meetings.length - 1
          ? meetings[currentIndex + 1]
          : null
    };
  }

  return getCachedAdjacentMeetings(selection, meeting.id, meeting.meeting_datetime, locale);
}

export async function getMeetingRawVideoDocuments(
  id: string,
  selection: JurisdictionSelection = getDefaultJurisdiction().slug
) {
  const clients = getSafePublicClients(selection);
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
