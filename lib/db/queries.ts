import { unstable_cache } from "next/cache";
import {
  ALL_JURISDICTIONS_SLUG,
  getDefaultJurisdiction,
  getJurisdictionSlugFromRow,
  getPublicSupabaseClientsForSelection,
  getServiceSupabaseClientsForSelection,
  type JurisdictionConfig,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";
import { PUBLIC_CACHE_REVALIDATE_SECONDS, PUBLIC_CONTENT_CACHE_TAG } from "@/lib/db/publicCache";
import type { AnnouncementRow, DocumentRow, MeetingRow, SummaryCardRow } from "@/lib/types";

const PUBLIC_CARD_MEETING_COLUMNS =
  "id,jurisdiction_name,jurisdiction_slug,platform,title,meeting_type,date_text,meeting_datetime,status";
const PUBLIC_MEETING_LIST_COLUMNS =
  "id,jurisdiction_name,jurisdiction_slug,platform,title,meeting_type,date_text,meeting_datetime,status,source_type,source_url";
const PUBLIC_MEETING_DETAIL_COLUMNS =
  "id,jurisdiction_name,jurisdiction_slug,platform,title,meeting_type,date_text,meeting_datetime,status,source_type,source_url,public_comments_input_text";
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

function logQueryError(context: string, error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  console.error(`[SimpleCity] ${context}: ${message}`);
}

function normalizeSearch(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function toIlikePattern(value: string) {
  const safeValue = value.replace(/[%,()]/g, " ").replace(/\s+/g, "%").trim();
  return safeValue ? `%${safeValue}%` : "";
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
  return {
    ...row,
    jurisdiction_name: row.jurisdiction_name || jurisdiction.name,
    jurisdiction_slug: row.jurisdiction_slug || jurisdiction.slug,
    platform: row.platform || jurisdiction.platform
  };
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

function announcementJurisdictionFilter<T extends { or: (filter: string) => T }>(
  query: T,
  selection: JurisdictionSelection
) {
  if (selection === ALL_JURISDICTIONS_SLUG) return query;
  return query.or(`jurisdiction_slug.is.null,jurisdiction_slug.eq.${selection}`);
}

const getCachedPublishedCards = unstable_cache(
  async (selection: JurisdictionSelection) => {
    const clients = getSafePublicClients(selection);
    if (clients.length === 0) return [] as SummaryCardRow[];

    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        const { data, error } = await supabase
          .from("summary_cards")
          .select(PUBLIC_SUMMARY_CARD_SELECT)
          .eq("is_published", true)
          .order("is_featured", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) {
          logQueryError(`Failed to load ${jurisdiction.name} published summary cards`, error);
          return [] as SummaryCardRow[];
        }

        return ((data || []) as unknown as SummaryCardRow[]).map((row) =>
          withCardJurisdictionFallback(row, jurisdiction)
        );
      })
    );

    return sortCards(results.flat());
  },
  ["published-summary-cards"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedActiveAnnouncements = unstable_cache(
  async (selection: JurisdictionSelection) => {
    const clients = getSafePublicClients(selection);
    if (clients.length === 0) return [] as AnnouncementRow[];

    const now = new Date().toISOString();
    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        let query = supabase
          .from("announcements")
          .select(PUBLIC_ANNOUNCEMENT_COLUMNS)
          .eq("is_published", true)
          .or(`starts_at.is.null,starts_at.lte.${now}`)
          .or(`ends_at.is.null,ends_at.gte.${now}`)
          .order("created_at", { ascending: false });

        query = announcementJurisdictionFilter(query, selection);

        const { data, error } = await query;

        if (error) {
          logQueryError(`Failed to load ${jurisdiction.name} announcements`, error);
          return [] as AnnouncementRow[];
        }

        return ((data || []) as unknown as AnnouncementRow[]).map((row) =>
          withAnnouncementJurisdictionFallback(row)
        );
      })
    );

    return dedupeAnnouncements(sortByCreatedAt(results.flat()));
  },
  ["active-announcements"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedMeetings = unstable_cache(
  async (selection: JurisdictionSelection, search: string, status: string) => {
    const clients = getSafePublicClients(selection);
    if (clients.length === 0) return [] as MeetingRow[];

    const pattern = toIlikePattern(search);
    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        let query = supabase
          .from("meetings")
          .select(PUBLIC_MEETING_LIST_COLUMNS)
          .order("meeting_datetime", { ascending: false, nullsFirst: false });

        if (status) {
          query = query.eq("status", status);
        }

        if (pattern) {
          query = query.or(
            [
              `title.ilike.${pattern}`,
              `meeting_type.ilike.${pattern}`,
              `date_text.ilike.${pattern}`,
              `status.ilike.${pattern}`
            ].join(",")
          );
        }

        const { data, error } = await query;

        if (error) {
          logQueryError(`Failed to load ${jurisdiction.name} meetings`, error);
          return [] as MeetingRow[];
        }

        return ((data || []) as unknown as MeetingRow[]).map((row) =>
          withMeetingJurisdictionFallback(row, jurisdiction)
        );
      })
    );

    return sortMeetings(results.flat());
  },
  ["public-meetings"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedMeetingDetail = unstable_cache(
  async (selection: JurisdictionSelection, id: string) => {
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
          supabase.from("meetings").select(PUBLIC_MEETING_DETAIL_COLUMNS).eq("id", id).maybeSingle(),
          supabase
            .from("summary_cards")
            .select(PUBLIC_SUMMARY_CARD_SELECT)
            .eq("meeting_id", id)
            .eq("is_published", true)
            .order("created_at", { ascending: true }),
          supabase
            .from("documents")
            .select(PUBLIC_DOCUMENT_COLUMNS)
            .eq("meeting_id", id)
            .order("type", { ascending: true })
        ]);

        logQueryError(`Failed to load ${jurisdiction.name} meeting ${id}`, meetingError);
        logQueryError(`Failed to load ${jurisdiction.name} cards for meeting ${id}`, cardsError);
        logQueryError(`Failed to load ${jurisdiction.name} documents for meeting ${id}`, documentsError);

        return {
          meeting: meeting
            ? withMeetingJurisdictionFallback(meeting as unknown as MeetingRow, jurisdiction)
            : null,
          cards: ((cards || []) as unknown as SummaryCardRow[]).map((row) =>
            withCardJurisdictionFallback(row, jurisdiction)
          ),
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

const getCachedCategoryCards = unstable_cache(
  async (selection: JurisdictionSelection, category: string) => {
    const clients = getSafePublicClients(selection);
    if (clients.length === 0) return [] as SummaryCardRow[];

    const results = await Promise.all(
      clients.map(async ({ jurisdiction, supabase }) => {
        const { data, error } = await supabase
          .from("summary_cards")
          .select(PUBLIC_SUMMARY_CARD_SELECT)
          .eq("is_published", true)
          .contains("category_tags", [category])
          .order("is_featured", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) {
          logQueryError(`Failed to load ${jurisdiction.name} category ${category}`, error);
          return [] as SummaryCardRow[];
        }

        return ((data || []) as unknown as SummaryCardRow[]).map((row) =>
          withCardJurisdictionFallback(row, jurisdiction)
        );
      })
    );

    return sortCards(results.flat());
  },
  ["category-summary-cards"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

export async function getPublishedCards(selection: JurisdictionSelection = getDefaultJurisdiction().slug) {
  return getCachedPublishedCards(selection);
}

export async function getActiveAnnouncements(selection: JurisdictionSelection = getDefaultJurisdiction().slug) {
  return getCachedActiveAnnouncements(selection);
}

export async function getMeetings(
  filters: { search?: string; status?: string; jurisdiction?: JurisdictionSelection } = {}
) {
  return getCachedMeetings(
    filters.jurisdiction || getDefaultJurisdiction().slug,
    normalizeSearch(filters.search),
    normalizeSearch(filters.status)
  );
}

export async function getMeetingDetail(
  id: string,
  selection: JurisdictionSelection = getDefaultJurisdiction().slug
) {
  return getCachedMeetingDetail(selection, id);
}

export async function getCategoryCards(
  category: string,
  selection: JurisdictionSelection = getDefaultJurisdiction().slug
) {
  return getCachedCategoryCards(selection, category);
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

  const results = await Promise.all(
    clients.map(async ({ jurisdiction, supabase }) => {
      const [meetings, cards, announcements, documents, scraperRuns, auditLog] = await Promise.all([
        supabase.from("meetings").select("*").order("created_at", { ascending: false }).limit(100),
        supabase
          .from("summary_cards")
          .select("*, meetings(*)")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("documents").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("scraper_runs").select("*").order("started_at", { ascending: false }).limit(20),
        supabase.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(50)
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
