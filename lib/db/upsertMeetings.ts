import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmReadyMeeting, SimpleCityCard, SimpleCitySummary } from "@/lib/types";
import {
  usesRegionalSupabase,
  type JurisdictionConfig
} from "@/lib/config/jurisdictions";
import { meetingSourceHash } from "@/lib/db/meetingSourceHash";
import {
  meetingTranslationFingerprint,
  summaryCardTranslationFingerprint
} from "@/lib/db/translationFingerprint";
import { externalMeetingId } from "@/lib/utils/slug";
import { parseMeetingDate } from "@/lib/utils/date";
import { areLikelySameAgendaItem } from "@/lib/utils/agendaItemIdentity";
import { summaryPointsStorageText } from "@/lib/utils/summaryPoints";

type UpsertedMeeting = {
  externalId: string;
  id: string;
  meeting: LlmReadyMeeting;
  sourceHash: string;
  summarizedSourceHash: string | null;
  existingCardCount: number;
};

type PreservedCardAdminState = {
  is_published: boolean | null;
  is_featured: boolean | null;
  admin_notes: string | null;
};

type InsertedCardIdentity = {
  id: string;
  agenda_item: string | null;
  source_url: string | null;
  source_item_id?: string | null;
};

type CardWithSummaryIndex = {
  card: SimpleCityCard;
  summaryIndex: number;
};

type ExistingAppendCard = InsertedCardIdentity & PreservedCardAdminState;

type AgendaAvailabilityCard = {
  agendaItem?: string | null;
  sourceItemId?: string | null;
};

const sourceItemIdSupport = new WeakMap<SupabaseClient, Promise<boolean>>();
const MAX_STORED_MINUTES_CHARACTERS = 2_000_000;
const MAX_STORED_DOCUMENT_CHARACTERS = 500_000;
export const SUMMARY_CARD_WRITE_BATCH_SIZE = 20;

export function summaryCardWriteBatches<T>(rows: T[], batchSize = SUMMARY_CARD_WRITE_BATCH_SIZE) {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("Summary card write batch size must be a positive integer.");
  }

  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    batches.push(rows.slice(index, index + batchSize));
  }
  return batches;
}

export function rawLlmJsonForBulkRow(rawLlmJson: unknown, rowIndex: number) {
  // A batched summary response can be hundreds of kilobytes. Repeating the
  // complete payload on every card makes a large agenda insert many times
  // larger than the source response and can exceed Postgres statement limits.
  // Keep one audit copy while the parsed card fields remain on every row.
  return rowIndex === 0 ? rawLlmJson : null;
}

function isMissingSourceItemIdColumn(error: { message?: string } | null) {
  return Boolean(error && /source_item_id|PGRST204|column/i.test(error.message || ""));
}

function supportsSourceItemId(supabase: SupabaseClient) {
  const existing = sourceItemIdSupport.get(supabase);
  if (existing) return existing;

  const check = Promise.resolve(
    supabase.from("summary_cards").select("source_item_id").limit(1)
  )
    .then(({ error }) => {
      if (!error) return true;
      if (isMissingSourceItemIdColumn(error)) {
        sourceItemIdSupport.delete(supabase);
        return false;
      }
      throw new Error(`Failed to inspect summary card identity support: ${error.message}`);
    })
    .catch((error) => {
      sourceItemIdSupport.delete(supabase);
      throw error;
    });
  sourceItemIdSupport.set(supabase, check);
  return check;
}

function sanitizeDatabaseString(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
}

function sanitizeForDatabase<T>(value: T): T {
  if (typeof value === "string") return sanitizeDatabaseString(value) as T;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForDatabase(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeForDatabase(item)])
    ) as T;
  }

  return value;
}

export function documentExtractedTextForStorage(
  type: string,
  extractedText?: string | null
) {
  if (!extractedText) return null;
  const limit = /minutes/i.test(type)
    ? MAX_STORED_MINUTES_CHARACTERS
    : MAX_STORED_DOCUMENT_CHARACTERS;
  return extractedText.slice(0, limit);
}

function normalizeCardKey(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function exactCardKey(agendaItem?: string | null, sourceUrl?: string | null) {
  return `${normalizeCardKey(agendaItem)}|${normalizeCardKey(sourceUrl)}`;
}

export function isAgendaUnavailablePlaceholderCard(card: AgendaAvailabilityCard) {
  if (card.sourceItemId?.trim()) return false;

  const text = String(card.agendaItem || "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\b(is|was|has|have|had)n['’]?t\b/g, "$1 not")
    .replace(/\s+/g, " ");

  return [
    /\bagenda\b.{0,120}\b(?:is|was|has|have|had)?\s*not\s+(?:yet\s+)?(?:been\s+)?(?:posted|published|available|provided|released|uploaded)\b/,
    /\bagenda\b.{0,120}\b(?:has|have|had)\s+yet\s+to\s+be\s+(?:posted|published|provided|released|uploaded)\b/,
    /\bno\s+(?:meeting\s+)?agenda\b.{0,80}\b(?:posted|published|available|provided|released|uploaded)\b/,
    /\bagenda\b.{0,60}\b(?:unavailable|pending|forthcoming)\b/,
    /\bagenda\b.{0,80}\bwill\s+be\s+(?:posted|published|available|provided|released|uploaded)\s+(?:later|soon|closer\s+to\s+the\s+meeting)\b/,
    /\bcheck\s+back\s+later\b.{0,80}\bagenda\b/
  ].some((pattern) => pattern.test(text));
}

function summaryCardFingerprintInput(card: SimpleCityCard) {
  return {
    agenda_item: card.agendaItem,
    what_is_happening: summaryPointsStorageText(card.whatIsHappening),
    why_it_matters: card.whyItMatters,
    who_it_affects: card.whoItAffects,
    status: card.status,
    comment_window_opens: card.commentWindow.opens,
    comment_window_closes: card.commentWindow.closes,
    how_to_act_attend: card.howToAct.attend,
    how_to_act_email: card.howToAct.email,
    how_to_act_submit_comment: card.howToAct.submitComment
  };
}

function cardInsertRow(
  meetingId: string,
  card: SimpleCityCard,
  rawLlmJson: unknown,
  options: {
    jurisdiction?: JurisdictionConfig | null;
    includeSourceItemId?: boolean;
    isPublished: boolean;
    isFeatured: boolean;
    adminNotes: string | null;
  }
) {
  return sanitizeForDatabase({
    ...(options.jurisdiction
      ? {
          jurisdiction_name: options.jurisdiction.name,
          jurisdiction_slug: options.jurisdiction.slug,
          platform: options.jurisdiction.platform
        }
      : {}),
    meeting_id: meetingId,
    ...(options.includeSourceItemId === false
      ? {}
      : { source_item_id: card.sourceItemId || null }),
    agenda_item: card.agendaItem,
    what_is_happening: summaryPointsStorageText(card.whatIsHappening),
    why_it_matters: card.whyItMatters,
    who_it_affects: card.whoItAffects,
    category_tags: card.categoryTags,
    status: card.status,
    comment_window_opens: card.commentWindow.opens,
    comment_window_closes: card.commentWindow.closes,
    how_to_act_attend: card.howToAct.attend,
    how_to_act_email: card.howToAct.email,
    how_to_act_submit_comment: card.howToAct.submitComment,
    source_url: card.source,
    confidence: card.confidence,
    is_published: options.isPublished,
    is_featured: options.isFeatured,
    admin_notes: options.adminNotes,
    raw_llm_json: rawLlmJson
  });
}

async function insertSummaryCardRowsInBatches(
  supabase: SupabaseClient,
  rows: Array<ReturnType<typeof cardInsertRow>>,
  sourceItemIdAvailable: boolean,
  errorAction: "insert" | "append"
) {
  const inserted: InsertedCardIdentity[] = [];
  const selectColumns = sourceItemIdAvailable
    ? "id,source_item_id,agenda_item,source_url"
    : "id,agenda_item,source_url";

  for (const batch of summaryCardWriteBatches(rows)) {
    const { data, error } = await supabase
      .from("summary_cards")
      .insert(batch)
      .select(selectColumns);

    if (error) {
      throw new Error(`Failed to ${errorAction} summary cards: ${error.message}`);
    }
    inserted.push(...((data || []) as unknown as InsertedCardIdentity[]));
  }

  return inserted;
}

function meetingDateTimeText(meeting: LlmReadyMeeting) {
  const dateText = meeting.dateText || "";
  const timeText = meeting.timeText || "";
  if (!dateText) return null;
  if (!timeText || dateText.toLowerCase().includes(timeText.toLowerCase())) return dateText;
  return `${dateText} ${timeText}`.trim();
}

function canonicalMeetingSourceUrl(meeting: LlmReadyMeeting) {
  return (
    meeting.meetingDetailsUrl ||
    meeting.documents.find((doc) => doc.type === "Meeting Details")?.url ||
    meeting.documents[0]?.url ||
    meeting.sourceUrl ||
    null
  );
}

function chunks<T>(values: T[], size: number) {
  return summaryCardWriteBatches(values, size);
}

type MeetingDetailsIdentityInput = Pick<
  LlmReadyMeeting,
  "meetingDetailsUrl" | "sectionUrl"
>;

type ExistingMeetingDetailsIdentity = {
  external_id?: string | null;
  meeting_details_url?: string | null;
};

function normalizedIdentityUrl(value?: string | null) {
  return String(value || "").trim().replace(/\/$/, "");
}

export function uniqueMeetingDetailsIdentityUrls(
  meetings: MeetingDetailsIdentityInput[]
) {
  const counts = new Map<string, number>();
  const originalUrls = new Map<string, string>();

  for (const meeting of meetings) {
    const detailsUrl = normalizedIdentityUrl(meeting.meetingDetailsUrl);
    const sectionUrl = normalizedIdentityUrl(meeting.sectionUrl);
    if (!detailsUrl || detailsUrl === sectionUrl) continue;

    counts.set(detailsUrl, (counts.get(detailsUrl) || 0) + 1);
    originalUrls.set(detailsUrl, String(meeting.meetingDetailsUrl).trim());
  }

  return Array.from(counts.entries()).flatMap(([url, count]) =>
    count === 1 ? [originalUrls.get(url) || url] : []
  );
}

export function uniqueExistingExternalIdsByMeetingDetailsUrl(
  rows: ExistingMeetingDetailsIdentity[]
) {
  const grouped = new Map<string, ExistingMeetingDetailsIdentity[]>();

  for (const row of rows) {
    const url = normalizedIdentityUrl(row.meeting_details_url);
    if (!url || !row.external_id) continue;
    grouped.set(url, [...(grouped.get(url) || []), row]);
  }

  const externalIds = new Map<string, string>();
  for (const [url, matches] of grouped) {
    if (matches.length !== 1) continue;
    externalIds.set(url, String(matches[0].external_id));
  }

  return externalIds;
}

export function compactMeetingRawForStorage(meeting: LlmReadyMeeting): LlmReadyMeeting {
  return {
    ...meeting,
    // These potentially large fields already live in dedicated meeting/document
    // columns. Keeping a second copy in raw can make historical refreshes exceed
    // the database statement timeout.
    llmInputText: "",
    publicCommentsInputText: null,
    documents: meeting.documents.map((document) => ({
      ...document,
      extractedText: null
    }))
  };
}

async function loadExistingExternalIdsByMeetingDetailsUrl(
  supabase: SupabaseClient,
  meetings: LlmReadyMeeting[],
  jurisdiction?: JurisdictionConfig
) {
  const urls = uniqueMeetingDetailsIdentityUrls(meetings);
  const externalIds = new Map<string, string>();
  if (urls.length === 0) return externalIds;

  for (const batch of chunks(urls, 50)) {
    let query = supabase
      .from("meetings")
      .select("external_id,meeting_details_url:raw->>meetingDetailsUrl")
      .in("raw->>meetingDetailsUrl", batch);

    if (jurisdiction) query = query.eq("jurisdiction_slug", jurisdiction.slug);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to reconcile official meeting identifiers: ${error.message}`);

    const uniqueMatches = uniqueExistingExternalIdsByMeetingDetailsUrl(
      (data || []) as ExistingMeetingDetailsIdentity[]
    );
    for (const [url, externalId] of uniqueMatches) {
      externalIds.set(url, externalId);
    }
  }

  return externalIds;
}

async function countCardsForMeeting(supabase: SupabaseClient, meetingId: string) {
  const { count, error } = await supabase
    .from("summary_cards")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", meetingId);

  if (error) throw new Error(`Failed to count existing cards: ${error.message}`);
  return count || 0;
}

async function writeSpanishMeetingTranslation(
  supabase: SupabaseClient,
  meetingId: string,
  summary: SimpleCitySummary,
  rawLlmJson: unknown
) {
  const translation = summary.translations?.es?.meeting;
  if (!translation?.title && !translation?.meetingType) return;

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("title,meeting_type")
    .eq("id", meetingId)
    .single();

  if (meetingError) {
    throw new Error(`Failed to load meeting for translation: ${meetingError.message}`);
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("meeting_translations").upsert(
    sanitizeForDatabase({
      meeting_id: meetingId,
      locale: "es",
      title: translation.title || meeting.title,
      meeting_type: translation.meetingType || meeting.meeting_type,
      source_fingerprint: meetingTranslationFingerprint(meeting),
      translation_status: "machine",
      raw_llm_json: rawLlmJson,
      translated_at: now
    }),
    { onConflict: "meeting_id,locale" }
  );

  if (error) throw new Error(`Failed to write meeting translation: ${error.message}`);
}

async function writeSpanishCardTranslations(
  supabase: SupabaseClient,
  insertedCards: InsertedCardIdentity[],
  cards: CardWithSummaryIndex[],
  summary: SimpleCitySummary,
  rawLlmJson: unknown
) {
  const translations = summary.translations?.es?.cards;
  if (!translations?.length || insertedCards.length === 0) return;

  const insertedByKey = new Map(
    insertedCards.map((card) => [exactCardKey(card.agenda_item, card.source_url), card])
  );
  const now = new Date().toISOString();
  const translationRows = cards
    .map(({ card, summaryIndex }) => {
      const translation = translations[summaryIndex];
      const inserted = insertedByKey.get(exactCardKey(card.agendaItem, card.source));
      if (!translation || !inserted?.id) return null;

      return {
        summary_card_id: inserted.id,
        locale: "es",
        agenda_item: translation.agendaItem,
        what_is_happening: summaryPointsStorageText(translation.whatIsHappening),
        why_it_matters: translation.whyItMatters,
        who_it_affects: translation.whoItAffects,
        status: card.status,
        comment_window_opens: translation.commentWindow.opens,
        comment_window_closes: translation.commentWindow.closes,
        how_to_act_attend: translation.howToAct.attend,
        how_to_act_email: translation.howToAct.email,
        how_to_act_submit_comment: translation.howToAct.submitComment,
        source_fingerprint: summaryCardTranslationFingerprint(summaryCardFingerprintInput(card)),
        translation_status: "machine",
        translated_at: now
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (translationRows.length === 0) return;

  const rows = translationRows.map((row, rowIndex) =>
    sanitizeForDatabase({
      ...row,
      raw_llm_json: rawLlmJsonForBulkRow(rawLlmJson, rowIndex)
    })
  );

  for (const batch of summaryCardWriteBatches(rows)) {
    const { error } = await supabase
      .from("summary_card_translations")
      .upsert(batch, { onConflict: "summary_card_id,locale" });

    if (error) throw new Error(`Failed to write summary card translations: ${error.message}`);
  }
}

export async function markMeetingSummarized(
  supabase: SupabaseClient,
  meetingId: string,
  sourceHash?: string | null
) {
  const update: Record<string, string> = {
    cards_generated_at: new Date().toISOString()
  };

  if (sourceHash) update.summarized_source_hash = sourceHash;

  const { error } = await supabase.from("meetings").update(update).eq("id", meetingId);
  if (error) throw new Error(`Failed to mark meeting summarized: ${error.message}`);
}

export async function setMeetingSummarizedSourceHash(
  supabase: SupabaseClient,
  meetingId: string,
  sourceHash: string
) {
  const { error } = await supabase
    .from("meetings")
    .update({ summarized_source_hash: sourceHash })
    .eq("id", meetingId);

  if (error) throw new Error(`Failed to backfill summarized source hash: ${error.message}`);
}

export async function upsertMeetings(
  supabase: SupabaseClient,
  meetings: LlmReadyMeeting[],
  scrapedAt?: string,
  jurisdiction?: JurisdictionConfig
) {
  const upserted: UpsertedMeeting[] = [];
  const existingExternalIds = await loadExistingExternalIdsByMeetingDetailsUrl(
    supabase,
    meetings,
    jurisdiction
  );

  for (const meeting of meetings) {
    const safeMeeting = sanitizeForDatabase(meeting);
    const identitySourceUrl = canonicalMeetingSourceUrl(meeting);
    const selectedSourceUrl = meeting.sourceUrl || identitySourceUrl;
    const externalId =
      (meeting.meetingDetailsUrl
        ? existingExternalIds.get(normalizedIdentityUrl(meeting.meetingDetailsUrl))
        : null) ||
      safeMeeting.externalId ||
      externalMeetingId(meetingDateTimeText(meeting), meeting.title, identitySourceUrl);
    const sourceHash = meetingSourceHash(safeMeeting);
    const jurisdictionColumns = jurisdiction
      ? {
          jurisdiction_name: jurisdiction.name,
          jurisdiction_slug: jurisdiction.slug,
          platform: jurisdiction.platform
        }
      : {};
    const regionalDatabase = Boolean(jurisdiction && usesRegionalSupabase(jurisdiction));
    const compactRaw = compactMeetingRawForStorage(safeMeeting);

    const { data, error } = await supabase
      .from("meetings")
      .upsert(
        {
          ...jurisdictionColumns,
          external_id: externalId,
          title: safeMeeting.title,
          meeting_type: safeMeeting.meetingType,
          date_text: safeMeeting.dateText,
          time_text: safeMeeting.timeText || null,
          meeting_datetime: parseMeetingDate(meetingDateTimeText(safeMeeting)),
          section: safeMeeting.section,
          status: safeMeeting.status,
          source_type: safeMeeting.sourceType,
          source_url: selectedSourceUrl,
          row_text: safeMeeting.rowText,
          has_html_agenda: safeMeeting.hasHtmlAgenda,
          has_pdf: safeMeeting.hasPdf,
          llm_input_text: safeMeeting.llmInputText,
          public_comments_input_text: safeMeeting.publicCommentsInputText,
          source_hash: sourceHash,
          extraction_notes: safeMeeting.extractionNotes,
          raw: compactRaw,
          scraped_at: scrapedAt || new Date().toISOString()
        },
        { onConflict: regionalDatabase ? "jurisdiction_slug,external_id" : "external_id" }
      )
      .select("id,summarized_source_hash")
      .single();

    if (error) throw new Error(`Failed to upsert meeting ${meeting.title}: ${error.message}`);
    if (!data?.id) throw new Error(`Failed to read meeting id for ${meeting.title}.`);

    for (const doc of safeMeeting.documents) {
      const storedExtractedText = documentExtractedTextForStorage(doc.type, doc.extractedText);
      const { error: docError } = await supabase.from("documents").upsert(
        {
          ...jurisdictionColumns,
          meeting_id: data.id,
          type: doc.type,
          label: doc.label,
          source_url: doc.url,
          local_path: doc.localPath || null,
          storage_path: doc.storagePath || null,
          bytes: doc.bytes || null,
          download_error: doc.downloadError || null,
          extracted_text: storedExtractedText,
          extraction_character_count: storedExtractedText?.length || null,
          is_scanned: doc.isScanned || false
        },
        { onConflict: regionalDatabase ? "jurisdiction_slug,source_url" : "source_url" }
      );

      if (docError) {
        throw new Error(`Failed to upsert document ${doc.url}: ${docError.message}`);
      }
    }

    const existingCardCount = await countCardsForMeeting(supabase, data.id);

    upserted.push({
      externalId,
      id: data.id,
      meeting: safeMeeting,
      sourceHash,
      summarizedSourceHash: data.summarized_source_hash || null,
      existingCardCount
    });
  }

  return upserted;
}

export async function replaceSummaryCardsForMeeting(
  supabase: SupabaseClient,
  meetingId: string,
  summary: SimpleCitySummary,
  rawLlmJson: unknown,
  options: {
    allowEmptyReplacement?: boolean;
    sourceHash?: string | null;
    jurisdiction?: JurisdictionConfig | null;
  } = {}
) {
  const sourceItemIdAvailable = await supportsSourceItemId(supabase);
  const { data: existingCards, error: existingError } = await supabase
    .from("summary_cards")
    .select("agenda_item,source_url,is_published,is_featured,admin_notes")
    .eq("meeting_id", meetingId);

  if (existingError) throw new Error(`Failed to read old cards: ${existingError.message}`);

  const preservedByExactKey = new Map<string, PreservedCardAdminState>();
  const preservedByAgendaKey = new Map<string, PreservedCardAdminState>();

  for (const card of existingCards || []) {
    const state = {
      is_published: card.is_published,
      is_featured: card.is_featured,
      admin_notes: card.admin_notes
    };

    preservedByExactKey.set(exactCardKey(card.agenda_item, card.source_url), state);
    preservedByAgendaKey.set(normalizeCardKey(card.agenda_item), state);
  }

  if (summary.cards.length === 0) {
    if (existingCards?.length && !options.allowEmptyReplacement) {
      return [];
    }

    const { error: deleteError } = await supabase
      .from("summary_cards")
      .delete()
      .eq("meeting_id", meetingId);

    if (deleteError) throw new Error(`Failed to delete old cards: ${deleteError.message}`);

    await writeSpanishMeetingTranslation(supabase, meetingId, summary, rawLlmJson);
    await markMeetingSummarized(supabase, meetingId, options.sourceHash);

    return [];
  }

  const { error: deleteError } = await supabase
    .from("summary_cards")
    .delete()
    .eq("meeting_id", meetingId);

  if (deleteError) throw new Error(`Failed to delete old cards: ${deleteError.message}`);

  const cardsToInsert = summary.cards.map((card, summaryIndex) => ({ card, summaryIndex }));
  const rows = cardsToInsert.map(({ card }, rowIndex) => {
    const preserved =
      preservedByExactKey.get(exactCardKey(card.agendaItem, card.source)) ||
      preservedByAgendaKey.get(normalizeCardKey(card.agendaItem));

    return cardInsertRow(meetingId, card, rawLlmJsonForBulkRow(rawLlmJson, rowIndex), {
      jurisdiction: options.jurisdiction,
      includeSourceItemId: sourceItemIdAvailable,
      isPublished:
        typeof preserved?.is_published === "boolean" ? preserved.is_published : true,
      isFeatured:
        typeof preserved?.is_featured === "boolean" ? preserved.is_featured : false,
      adminNotes: preserved?.admin_notes || null
    });
  });

  const data = await insertSummaryCardRowsInBatches(
    supabase,
    rows,
    sourceItemIdAvailable,
    "insert"
  );

  await writeSpanishMeetingTranslation(supabase, meetingId, summary, rawLlmJson);
  await writeSpanishCardTranslations(
    supabase,
    data,
    cardsToInsert,
    summary,
    rawLlmJson
  );

  await markMeetingSummarized(supabase, meetingId, options.sourceHash);

  return data;
}

export async function appendSummaryCardsForMeeting(
  supabase: SupabaseClient,
  meetingId: string,
  summary: SimpleCitySummary,
  rawLlmJson: unknown,
  options: {
    sourceHash?: string | null;
    jurisdiction?: JurisdictionConfig | null;
  } = {}
) {
  const sourceItemIdAvailable = await supportsSourceItemId(supabase);
  const existingColumns: string = sourceItemIdAvailable
    ? "id,source_item_id,agenda_item,source_url,is_published,is_featured,admin_notes"
    : "id,agenda_item,source_url,is_published,is_featured,admin_notes";
  const { data: existingCards, error: existingError } = await supabase
    .from("summary_cards")
    .select(existingColumns)
    .eq("meeting_id", meetingId);

  if (existingError) throw new Error(`Failed to read existing cards: ${existingError.message}`);

  const existingCardRows = (existingCards || []) as unknown as ExistingAppendCard[];
  const summaryContainsSubstantiveCards = summary.cards.some(
    (card) => !isAgendaUnavailablePlaceholderCard(card)
  );
  const placeholderIdsToDelete = summaryContainsSubstantiveCards
    ? existingCardRows
        .filter((card) =>
          !card.source_item_id &&
          card.is_featured !== true &&
          !card.admin_notes?.trim() &&
          isAgendaUnavailablePlaceholderCard({
            agendaItem: card.agenda_item,
            sourceItemId: card.source_item_id
          })
        )
        .map((card) => card.id)
    : [];
  const retainedExistingCards = existingCardRows.filter(
    (card) => !placeholderIdsToDelete.includes(card.id)
  );
  const existingExactKeys = new Set<string>();
  const existingAgendaKeys = new Set<string>();
  const existingAgendaItems: string[] = [];
  const existingBySourceItemId = new Map(
    retainedExistingCards
      .filter((card) => Boolean(card.source_item_id))
      .map((card) => [card.source_item_id as string, card])
  );
  const existingByExactKey = new Map(
    retainedExistingCards.map((card) => [
      exactCardKey(card.agenda_item, card.source_url),
      card
    ])
  );

  for (const card of retainedExistingCards) {
    existingExactKeys.add(exactCardKey(card.agenda_item, card.source_url));
    existingAgendaKeys.add(normalizeCardKey(card.agenda_item));
    if (card.agenda_item) existingAgendaItems.push(card.agenda_item);
  }

  const seenSourceItemIds = new Set<string>();
  const cardsToPersist = summary.cards
    .map((card, summaryIndex) => ({ card, summaryIndex }))
    .filter(
      ({ card }) =>
        !summaryContainsSubstantiveCards || !isAgendaUnavailablePlaceholderCard(card)
    )
    .filter(({ card }) => {
      if (sourceItemIdAvailable && card.sourceItemId) {
        if (seenSourceItemIds.has(card.sourceItemId)) return false;
        seenSourceItemIds.add(card.sourceItemId);
        return true;
      }
      const exactKey = exactCardKey(card.agendaItem, card.source);
      const agendaKey = normalizeCardKey(card.agendaItem);
      return (
        !existingExactKeys.has(exactKey) &&
        !existingAgendaKeys.has(agendaKey) &&
        !existingAgendaItems.some((existing) =>
          areLikelySameAgendaItem(existing, card.agendaItem)
        )
      );
    });

  if (placeholderIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("summary_cards")
      .delete()
      .in("id", placeholderIdsToDelete);

    if (deleteError) {
      throw new Error(`Failed to delete obsolete agenda placeholders: ${deleteError.message}`);
    }
  }

  if (cardsToPersist.length === 0) {
    await writeSpanishMeetingTranslation(supabase, meetingId, summary, rawLlmJson);
    await markMeetingSummarized(supabase, meetingId, options.sourceHash);
    return [];
  }

  const updatedCards: InsertedCardIdentity[] = [];
  const cardsToInsert: CardWithSummaryIndex[] = [];
  let rawPayloadAssigned = false;
  for (const entry of cardsToPersist) {
    const existingByIdentity = entry.card.sourceItemId
      ? existingBySourceItemId.get(entry.card.sourceItemId)
      : null;
    // Cards created before source_item_id was introduced can already own the
    // legacy (meeting, agenda item, source URL) unique key. Adopt that row and
    // attach the stable source ID instead of attempting a conflicting insert.
    const existing =
      existingByIdentity ||
      existingByExactKey.get(
        exactCardKey(entry.card.agendaItem, entry.card.source)
      );
    if (!existing) {
      cardsToInsert.push(entry);
      continue;
    }

    const row = cardInsertRow(
      meetingId,
      entry.card,
      rawPayloadAssigned ? null : rawLlmJson,
      {
        jurisdiction: options.jurisdiction,
        includeSourceItemId: sourceItemIdAvailable,
        isPublished: existing.is_published ?? true,
        isFeatured: existing.is_featured ?? false,
        adminNotes: existing.admin_notes || null
      }
    );
    rawPayloadAssigned = true;
    const { data, error } = await supabase
      .from("summary_cards")
      .update(row)
      .eq("id", existing.id)
      .select("id,source_item_id,agenda_item,source_url")
      .single();
    if (error) throw new Error(`Failed to update summary card by source item: ${error.message}`);
    if (data) updatedCards.push(data as InsertedCardIdentity);
  }

  let insertedCards: InsertedCardIdentity[] = [];
  if (cardsToInsert.length > 0) {
    const rows = cardsToInsert.map(({ card }, rowIndex) =>
      cardInsertRow(
        meetingId,
        card,
        rawPayloadAssigned
          ? null
          : rawLlmJsonForBulkRow(rawLlmJson, rowIndex),
        {
          jurisdiction: options.jurisdiction,
          includeSourceItemId: sourceItemIdAvailable,
          isPublished: true,
          isFeatured: false,
          adminNotes: null
        }
      )
    );
    insertedCards = await insertSummaryCardRowsInBatches(
      supabase,
      rows,
      sourceItemIdAvailable,
      "append"
    );
  }

  const persistedCards = [...updatedCards, ...insertedCards];

  await writeSpanishMeetingTranslation(supabase, meetingId, summary, rawLlmJson);
  await writeSpanishCardTranslations(
    supabase,
    persistedCards,
    cardsToPersist,
    summary,
    rawLlmJson
  );

  await markMeetingSummarized(supabase, meetingId, options.sourceHash);

  return persistedCards;
}

export async function writeAuditLog(
  supabase: SupabaseClient,
  input: {
    adminEmail: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    jurisdictionSlug?: string | null;
    before?: unknown;
    after?: unknown;
  }
) {
  await supabase.from("admin_audit_log").insert({
    admin_email: input.adminEmail,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId || null,
    jurisdiction_slug: input.jurisdictionSlug || null,
    before: input.before || null,
    after: input.after || null
  });
}
