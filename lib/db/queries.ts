import { maybeCreateServerSupabaseClient } from "@/lib/supabase/server";
import { maybeCreateServiceSupabaseClient } from "@/lib/supabase/service";
import type { AnnouncementRow, DocumentRow, MeetingRow, SummaryCardRow } from "@/lib/types";

export async function getPublishedCards() {
  const supabase = await maybeCreateServerSupabaseClient();
  if (!supabase) return [] as SummaryCardRow[];

  const { data, error } = await supabase
    .from("summary_cards")
    .select("*, meetings(*)")
    .eq("is_published", true)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data || []) as SummaryCardRow[];
}

export async function getActiveAnnouncements() {
  const supabase = await maybeCreateServerSupabaseClient();
  if (!supabase) return [] as AnnouncementRow[];

  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data || []) as AnnouncementRow[];
}

export async function getMeetings() {
  const supabase = await maybeCreateServerSupabaseClient();
  if (!supabase) return [] as MeetingRow[];

  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .order("meeting_datetime", { ascending: false, nullsFirst: false });

  if (error) return [];
  return (data || []) as MeetingRow[];
}

export async function getMeetingDetail(id: string) {
  const supabase = await maybeCreateServerSupabaseClient();
  if (!supabase) {
    return {
      meeting: null,
      cards: [] as SummaryCardRow[],
      documents: [] as DocumentRow[]
    };
  }

  const [{ data: meeting }, { data: cards }, { data: documents }] = await Promise.all([
    supabase.from("meetings").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("summary_cards")
      .select("*, meetings(*)")
      .eq("meeting_id", id)
      .eq("is_published", true)
      .order("created_at", { ascending: true }),
    supabase.from("documents").select("*").eq("meeting_id", id).order("type", { ascending: true })
  ]);

  return {
    meeting: meeting as MeetingRow | null,
    cards: (cards || []) as SummaryCardRow[],
    documents: (documents || []) as DocumentRow[]
  };
}

export async function getCategoryCards(category: string) {
  const all = await getPublishedCards();
  return all.filter((card) => (card.category_tags || []).includes(category));
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

  return {
    meetings: (meetings.data || []) as MeetingRow[],
    cards: (cards.data || []) as SummaryCardRow[],
    announcements: (announcements.data || []) as AnnouncementRow[],
    documents: (documents.data || []) as DocumentRow[],
    scraperRuns: scraperRuns.data || [],
    auditLog: auditLog.data || []
  };
}
