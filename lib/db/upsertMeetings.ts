import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmReadyMeeting, SimpleCityCard, SimpleCitySummary } from "@/lib/types";
import {
  usesRegionalSupabase,
  type JurisdictionConfig
} from "@/lib/config/jurisdictions";
import {
  compatibleLegacyMeetingSourceHashes,
  meetingSourceHash
} from "@/lib/db/meetingSourceHash";
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
  compatibleSourceHashes: string[];
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
const MAX_STORED_RAW_AGENDA_ITEM_CHARACTERS = 4_000;
export const SUMMARY_CARD_WRITE_BATCH_SIZE = 20;

type SupabaseWriteError = {
  code?: string | null;
  message?: string | null;
};

type SupabaseWriteResult<T> = {
  data: T | null;
  error: SupabaseWriteError | null;
};

export function isTransientSupabaseWriteError(error: SupabaseWriteError | null) {
  if (!error) return false;
  if (["40P01", "55P03", "57014"].includes(String(error.code || "").toUpperCase())) {
    return true;
  }

  return /(?:statement|lock) timeout|canceling statement due to|deadlock detected|connection (?:reset|terminated)|fetch failed|gateway timeout|temporarily unavailable/i.test(
    error.message || ""
  );
}

export async function retryTransientSupabaseWrite<T>(
  operation: () => PromiseLike<SupabaseWriteResult<T>>,
  options: {
    delaysMs?: number[];
    sleep?: (milliseconds: number) => Promise<void>;
    onRetry?: (error: SupabaseWriteError, nextAttempt: number, delayMs: number) => void;
  } = {}
) {
  const delaysMs = options.delaysMs || [2_000, 5_000];
  const wait = options.sleep || ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 0; ; attempt += 1) {
    const result = await operation();
    const delayMs = delaysMs[attempt];
    if (!result.error || !isTransientSupabaseWriteError(result.error) || delayMs === undefined) {
      return result;
    }

    options.onRetry?.(result.error, attempt + 2, delayMs);
    await wait(delayMs);
  }
}

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

export function obsoleteAuthoritativeSourceCardIds(
  cards: Array<{
    id: string;
    source_item_id?: string | null;
    is_featured?: boolean | null;
    admin_notes?: string | null;
  }>,
  authoritativeSourceItemIds: ReadonlySet<string> | null
) {
  if (!authoritativeSourceItemIds) return [];
  return cards
    .filter(
      (card) =>
        Boolean(card.source_item_id) &&
        card.is_featured !== true &&
        !card.admin_notes?.trim() &&
        !authoritativeSourceItemIds.has(card.source_item_id as string)
    )
    .map((card) => card.id);
}

/**
 * Postgres refuses to let one ON CONFLICT DO UPDATE statement touch the same row
 * twice, and a meeting can legitimately list one URL under several document
 * types. Later duplicates win per column, but a later row that omits extracted
 * text must not erase text an earlier duplicate supplied — which is exactly what
 * sequential per-document upserts did.
 */
export function collapseDocumentRowsByConflictTarget<T extends { source_url: string }>(
  rows: T[]
) {
  const byUrl = new Map<string, T>();
  for (const row of rows) {
    const existing = byUrl.get(row.source_url);
    byUrl.set(row.source_url, existing ? { ...existing, ...row } : row);
  }
  return [...byUrl.values()];
}

export const DOCUMENT_WRITE_BATCH_SIZE = 10;
export const DOCUMENT_WRITE_BATCH_CHARACTERS = 1_000_000;

/**
 * Document rows carry extracted text up to the per-type storage cap, so batches
 * are bounded by payload size as well as row count. One oversized minutes row
 * still ships on its own rather than being dropped.
 */
export function documentWriteBatches<T extends { extracted_text?: unknown }>(
  rows: T[],
  batchSize = DOCUMENT_WRITE_BATCH_SIZE,
  batchCharacters = DOCUMENT_WRITE_BATCH_CHARACTERS
) {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentCharacters = 0;

  for (const row of rows) {
    const rowCharacters =
      typeof row.extracted_text === "string" ? row.extracted_text.length : 0;
    if (
      current.length > 0 &&
      (current.length >= batchSize || currentCharacters + rowCharacters > batchCharacters)
    ) {
      batches.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push(row);
    currentCharacters += rowCharacters;
  }
  if (current.length > 0) batches.push(current);

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

export function documentExtractionFieldsForStorage(
  type: string,
  extractedText?: string | null,
  archived?: {
    extracted_text?: string | null;
    extraction_character_count?: number | null;
  }
) {
  const storedExtractedText = documentExtractedTextForStorage(
    type,
    extractedText || archived?.extracted_text
  );
  if (!storedExtractedText) return {};

  return {
    extracted_text: storedExtractedText,
    extraction_character_count: storedExtractedText.length
  };
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
    sourceItemId?: string | null;
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
      : {
          source_item_id:
            options.sourceItemId !== undefined
              ? options.sourceItemId
              : card.sourceItemId || null
        }),
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
    rowText: "",
    htmlAgendaText: null,
    detailText: null,
    llmInputText: "",
    publicCommentsInputText: null,
    documents: meeting.documents.map((document) => ({
      ...document,
      extractedText: null
    })),
    items: meeting.items?.map((item) => ({
      ...item,
      rowText: item.rowText.slice(0, MAX_STORED_RAW_AGENDA_ITEM_CHARACTERS),
      legislationText: item.legislationText?.slice(0, MAX_STORED_RAW_AGENDA_ITEM_CHARACTERS) || null,
      attachments: item.attachments?.map((document) => ({
        ...document,
        extractedText: null
      }))
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

  const insertedBySourceItemId = new Map(
    insertedCards.flatMap((card) =>
      card.source_item_id ? [[card.source_item_id, card] as const] : []
    )
  );
  // Keyed by agenda item and URL rather than identity, so a card that adopted a
  // row already carrying a source item ID still finds its persisted row here.
  const uniqueLegacyInsertedByKey = new Map<string, InsertedCardIdentity | null>();
  for (const inserted of insertedCards) {
    const key = exactCardKey(inserted.agenda_item, inserted.source_url);
    uniqueLegacyInsertedByKey.set(
      key,
      uniqueLegacyInsertedByKey.has(key) ? null : inserted
    );
  }
  const now = new Date().toISOString();
  const translationRows = cards
    .map(({ card, summaryIndex }) => {
      const translation = translations[summaryIndex];
      const inserted =
        (card.sourceItemId
          ? insertedBySourceItemId.get(card.sourceItemId)
          : null) ||
        uniqueLegacyInsertedByKey.get(exactCardKey(card.agendaItem, card.source));
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
    const compatibleSourceHashes = compatibleLegacyMeetingSourceHashes(safeMeeting);
    const jurisdictionColumns = jurisdiction
      ? {
          jurisdiction_name: jurisdiction.name,
          jurisdiction_slug: jurisdiction.slug,
          platform: jurisdiction.platform
        }
      : {};
    const regionalDatabase = Boolean(jurisdiction && usesRegionalSupabase(jurisdiction));
    const compactRaw = compactMeetingRawForStorage(safeMeeting);

    const { data, error } = await retryTransientSupabaseWrite<{
      id: string;
      summarized_source_hash: string | null;
    }>(
      () => supabase
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
        .single(),
      {
        onRetry: (retryError, nextAttempt, delayMs) => {
          console.warn(
            `[SimpleCity] Meeting upsert timed out for ${meeting.title}; retrying attempt ${nextAttempt} in ${delayMs}ms: ${retryError.message || "transient database error"}`
          );
        }
      }
    );

    if (error) throw new Error(`Failed to upsert meeting ${meeting.title}: ${error.message}`);
    if (!data?.id) throw new Error(`Failed to read meeting id for ${meeting.title}.`);

    const minutesWithoutCurrentText = safeMeeting.documents
      .filter((doc) => /minutes/i.test(doc.type) && !doc.extractedText)
      .map((doc) => doc.url);
    const archivedExtractions = new Map<
      string,
      { extracted_text?: string | null; extraction_character_count?: number | null }
    >();
    if (minutesWithoutCurrentText.length > 0) {
      const { data: archivedDocuments, error: archivedDocumentsError } =
        await retryTransientSupabaseWrite(
          () => supabase
            .from("documents")
            .select("source_url,extracted_text,extraction_character_count")
            .eq("meeting_id", data.id)
            .in("source_url", [...new Set(minutesWithoutCurrentText)]),
          {
            onRetry: (retryError, nextAttempt, delayMs) => {
              console.warn(
                `[SimpleCity] Archived minutes lookup timed out for ${meeting.title}; retrying attempt ${nextAttempt} in ${delayMs}ms: ${retryError.message || "transient database error"}`
              );
            }
          }
        );

      if (archivedDocumentsError) {
        throw new Error(
          `Failed to preserve archived minutes text for ${meeting.title}: ${archivedDocumentsError.message}`
        );
      }
      for (const archived of archivedDocuments || []) {
        if (archived.source_url && archived.extracted_text) {
          archivedExtractions.set(archived.source_url, archived);
        }
      }
    }

    const documentRows = collapseDocumentRowsByConflictTarget(
      safeMeeting.documents.map((doc) => ({
        ...jurisdictionColumns,
        meeting_id: data.id,
        type: doc.type,
        label: doc.label,
        source_url: doc.url,
        local_path: doc.localPath || null,
        storage_path: doc.storagePath || null,
        bytes: doc.bytes || null,
        download_error: doc.downloadError || null,
        ...documentExtractionFieldsForStorage(
          doc.type,
          doc.extractedText,
          archivedExtractions.get(doc.url)
        ),
        is_scanned: doc.isScanned || false
      }))
    );

    for (const batch of documentWriteBatches(documentRows)) {
      const { error: docError } = await retryTransientSupabaseWrite(
        () => supabase.from("documents").upsert(
          batch,
          { onConflict: regionalDatabase ? "jurisdiction_slug,source_url" : "source_url" }
        ),
        {
          onRetry: (retryError, nextAttempt, delayMs) => {
            console.warn(
              `[SimpleCity] Document upsert timed out for ${meeting.title}; retrying attempt ${nextAttempt} in ${delayMs}ms: ${retryError.message || "transient database error"}`
            );
          }
        }
      );

      if (docError) {
        throw new Error(
          `Failed to upsert ${batch.length} document(s) for ${meeting.title}: ${docError.message}`
        );
      }
    }

    const existingCardCount = await countCardsForMeeting(supabase, data.id);

    upserted.push({
      externalId,
      id: data.id,
      meeting: safeMeeting,
      sourceHash,
      compatibleSourceHashes,
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
    authoritativeSourceItemIds?: readonly string[];
  } = {}
) {
  const sourceItemIdAvailable = await supportsSourceItemId(supabase);
  const authoritativeSourceItemIds =
    sourceItemIdAvailable && options.authoritativeSourceItemIds?.length
      ? new Set(options.authoritativeSourceItemIds)
      : null;
  const cardsToInsert = summary.cards
    .map((card, summaryIndex) => ({ card, summaryIndex }))
    .filter(
      ({ card }) =>
        !authoritativeSourceItemIds ||
        Boolean(card.sourceItemId && authoritativeSourceItemIds.has(card.sourceItemId))
    );
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

  if (cardsToInsert.length === 0) {
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
    authoritativeSourceItemIds?: readonly string[];
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
  const authoritativeSourceItemIds =
    sourceItemIdAvailable && options.authoritativeSourceItemIds?.length
      ? new Set(options.authoritativeSourceItemIds)
      : null;
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
  const obsoleteSourceCardIds = obsoleteAuthoritativeSourceCardIds(
    existingCardRows,
    authoritativeSourceItemIds
  );
  const existingCardIdsToDelete = [
    ...new Set([...placeholderIdsToDelete, ...obsoleteSourceCardIds])
  ];
  const retainedExistingCards = existingCardRows.filter(
    (card) => !existingCardIdsToDelete.includes(card.id)
  );
  const existingBySourceItemId = new Map(
    retainedExistingCards
      .filter((card) => Boolean(card.source_item_id))
      .map((card) => [card.source_item_id as string, card])
  );
  const legacyExistingCards = retainedExistingCards.filter(
    (card) => !card.source_item_id
  );
  const uniqueMatchWithin = (
    candidates: ExistingAppendCard[],
    card: SimpleCityCard,
    excludedIds: ReadonlySet<string>
  ) => {
    const available = candidates.filter((existing) => !excludedIds.has(existing.id));
    const exactMatches = available.filter(
      (existing) =>
        exactCardKey(existing.agenda_item, existing.source_url) ===
        exactCardKey(card.agendaItem, card.source)
    );
    if (exactMatches.length === 1) return exactMatches[0];

    const agendaMatches = available.filter(
      (existing) => normalizeCardKey(existing.agenda_item) === normalizeCardKey(card.agendaItem)
    );
    if (agendaMatches.length === 1) return agendaMatches[0];

    const fuzzyMatches = available.filter(
      (existing) => areLikelySameAgendaItem(existing.agenda_item || "", card.agendaItem)
    );
    return fuzzyMatches.length === 1 ? fuzzyMatches[0] : null;
  };

  const seenSourceItemIds = new Set<string>();
  const seenLegacyKeys = new Set<string>();
  const cardsToPersist = summary.cards
    .map((card, summaryIndex) => ({ card, summaryIndex }))
    .filter(
      ({ card }) =>
        !authoritativeSourceItemIds ||
        Boolean(card.sourceItemId && authoritativeSourceItemIds.has(card.sourceItemId))
    )
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
      if (seenLegacyKeys.has(exactKey)) return false;
      seenLegacyKeys.add(exactKey);
      return true;
    });

  // A regenerated card whose source item ID the model failed to re-emit still
  // describes an agenda item that already owns a row. Let it adopt that row
  // instead of inserting a near-duplicate, but never take a row whose identity
  // another card in this batch is about to claim.
  const incomingSourceItemIds = new Set(
    cardsToPersist.flatMap(({ card }) => (card.sourceItemId ? [card.sourceItemId] : []))
  );
  const adoptableIdentifiedCards = retainedExistingCards.filter(
    (card) =>
      Boolean(card.source_item_id) &&
      !incomingSourceItemIds.has(card.source_item_id as string)
  );
  const uniqueExistingMatch = (
    card: SimpleCityCard,
    excludedIds: ReadonlySet<string>
  ) => {
    const legacyMatch = uniqueMatchWithin(legacyExistingCards, card, excludedIds);
    if (legacyMatch || card.sourceItemId) return legacyMatch;
    return uniqueMatchWithin(adoptableIdentifiedCards, card, excludedIds);
  };

  if (existingCardIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("summary_cards")
      .delete()
      .in("id", existingCardIdsToDelete);

    if (deleteError) {
      throw new Error(`Failed to delete obsolete summary cards: ${deleteError.message}`);
    }
  }

  if (cardsToPersist.length === 0) {
    await writeSpanishMeetingTranslation(supabase, meetingId, summary, rawLlmJson);
    await markMeetingSummarized(supabase, meetingId, options.sourceHash);
    return [];
  }

  const updatedCards: InsertedCardIdentity[] = [];
  const cardsToInsert: CardWithSummaryIndex[] = [];
  const claimedExistingIds = new Set<string>();
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
      uniqueExistingMatch(entry.card, claimedExistingIds);
    if (!existing) {
      cardsToInsert.push(entry);
      continue;
    }
    if (claimedExistingIds.has(existing.id)) continue;
    claimedExistingIds.add(existing.id);

    const row = cardInsertRow(
      meetingId,
      entry.card,
      rawPayloadAssigned ? null : rawLlmJson,
      {
        jurisdiction: options.jurisdiction,
        includeSourceItemId: sourceItemIdAvailable,
        // Adopting a row must never strip the identity it already carries.
        sourceItemId: entry.card.sourceItemId || existing.source_item_id || null,
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
