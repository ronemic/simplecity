import { unstable_cache } from "next/cache";
import { maybeCreateServiceSupabaseClient } from "@/lib/supabase/service";
import { maybeCreatePublicSupabaseClient } from "@/lib/supabase/public";
import { PUBLIC_CACHE_REVALIDATE_SECONDS, PUBLIC_CONTENT_CACHE_TAG } from "@/lib/db/publicCache";
import type { AnnouncementRow, DocumentRow, MeetingRow, SummaryCardRow } from "@/lib/types";

const PUBLIC_CARD_MEETING_COLUMNS = "id,title,meeting_type,date_text,meeting_datetime,status";
const PUBLIC_MEETING_LIST_COLUMNS =
  "id,title,meeting_type,date_text,meeting_datetime,status,source_type,source_url";
const PUBLIC_MEETING_DETAIL_COLUMNS =
  "id,title,meeting_type,date_text,meeting_datetime,status,source_type,source_url,public_comments_input_text";
const PUBLIC_DOCUMENT_COLUMNS = "id,meeting_id,type,label,source_url";
const PUBLIC_SUMMARY_CARD_COLUMNS = [
  "id",
  "meeting_id",
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

const getCachedPublishedCards = unstable_cache(
  async () => {
    const supabase = maybeCreatePublicSupabaseClient();
    if (!supabase) return [] as SummaryCardRow[];

    const { data, error } = await supabase
      .from("summary_cards")
      .select(PUBLIC_SUMMARY_CARD_SELECT)
      .eq("is_published", true)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      logQueryError("Failed to load published summary cards", error);
      return [];
    }
    return (data || []) as unknown as SummaryCardRow[];
  },
  ["published-summary-cards"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedActiveAnnouncements = unstable_cache(
  async () => {
    const supabase = maybeCreatePublicSupabaseClient();
    if (!supabase) return [] as AnnouncementRow[];

    const { data, error } = await supabase
      .from("announcements")
      .select("id,title,body,type,starts_at,ends_at,is_published,created_at,updated_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      logQueryError("Failed to load announcements", error);
      return [];
    }
    return (data || []) as unknown as AnnouncementRow[];
  },
  ["active-announcements"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedMeetings = unstable_cache(
  async (search: string, status: string) => {
    const supabase = maybeCreatePublicSupabaseClient();
    if (!supabase) return [] as MeetingRow[];

    const pattern = toIlikePattern(search);
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
      logQueryError("Failed to load meetings", error);
      return [];
    }
    return (data || []) as unknown as MeetingRow[];
  },
  ["public-meetings"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedMeetingDetail = unstable_cache(
  async (id: string) => {
    const supabase = maybeCreatePublicSupabaseClient();
    if (!supabase) {
      return {
        meeting: null,
        cards: [] as SummaryCardRow[],
        documents: [] as DocumentRow[]
      };
    }

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
      supabase.from("documents").select(PUBLIC_DOCUMENT_COLUMNS).eq("meeting_id", id).order("type", { ascending: true })
    ]);

    logQueryError(`Failed to load meeting ${id}`, meetingError);
    logQueryError(`Failed to load cards for meeting ${id}`, cardsError);
    logQueryError(`Failed to load documents for meeting ${id}`, documentsError);

    return {
      meeting: meeting as unknown as MeetingRow | null,
      cards: (cards || []) as unknown as SummaryCardRow[],
      documents: (documents || []) as unknown as DocumentRow[]
    };
  },
  ["public-meeting-detail"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

const getCachedCategoryCards = unstable_cache(
  async (category: string) => {
    const supabase = maybeCreatePublicSupabaseClient();
    if (!supabase) return [] as SummaryCardRow[];

    const { data, error } = await supabase
      .from("summary_cards")
      .select(PUBLIC_SUMMARY_CARD_SELECT)
      .eq("is_published", true)
      .contains("category_tags", [category])
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      logQueryError(`Failed to load category ${category}`, error);
      return [];
    }
    return (data || []) as unknown as SummaryCardRow[];
  },
  ["category-summary-cards"],
  { revalidate: PUBLIC_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_CONTENT_CACHE_TAG] }
);

export async function getPublishedCards() {
  return getCachedPublishedCards();
}

export async function getActiveAnnouncements() {
  return getCachedActiveAnnouncements();
}

export async function getMeetings(filters: { search?: string; status?: string } = {}) {
  return getCachedMeetings(normalizeSearch(filters.search), normalizeSearch(filters.status));
}

export async function getMeetingDetail(id: string) {
  return getCachedMeetingDetail(id);
}

export async function getCategoryCards(category: string) {
  return getCachedCategoryCards(category);
}

export async function getAdminCollections() {
  const supabase = maybeCreateServiceSupabaseClient();
  if (!supabase) {
    return {
      meetings: [] as MeetingRow[],
      cards: [] as SummaryCardRow[],
      announcements: [] as AnnouncementRow[],
      documents: [] as DocumentRow[],
      scraperRuns: [] as Array<Record<string, unknown>>,
      auditLog: [] as Array<Record<string, unknown>>
    };
  }

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

  logQueryError("Failed to load admin meetings", meetings.error);
  logQueryError("Failed to load admin cards", cards.error);
  logQueryError("Failed to load admin announcements", announcements.error);
  logQueryError("Failed to load admin documents", documents.error);
  logQueryError("Failed to load scraper runs", scraperRuns.error);
  logQueryError("Failed to load audit log", auditLog.error);

  return {
    meetings: (meetings.data || []) as MeetingRow[],
    cards: (cards.data || []) as SummaryCardRow[],
    announcements: (announcements.data || []) as AnnouncementRow[],
    documents: (documents.data || []) as DocumentRow[],
    scraperRuns: scraperRuns.data || [],
    auditLog: auditLog.data || []
  };
}
