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
};

type CardWithSummaryIndex = {
  card: SimpleCityCard;
  summaryIndex: number;
};

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

function normalizeCardKey(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function exactCardKey(agendaItem?: string | null, sourceUrl?: string | null) {
  return `${normalizeCardKey(agendaItem)}|${normalizeCardKey(sourceUrl)}`;
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
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function loadExistingExternalIdsByMeetingDetailsUrl(
  supabase: SupabaseClient,
  meetings: LlmReadyMeeting[],
  jurisdiction?: JurisdictionConfig
) {
  const urls = [...new Set(meetings.map((meeting) => meeting.meetingDetailsUrl).filter(Boolean))] as string[];
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

    for (const row of data || []) {
      const existing = row as unknown as {
        external_id?: string | null;
        meeting_details_url?: string | null;
      };
      if (existing.external_id && existing.meeting_details_url) {
        externalIds.set(existing.meeting_details_url, existing.external_id);
      }
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
  const rows = cards
    .map(({ card, summaryIndex }) => {
      const translation = translations[summaryIndex];
      const inserted = insertedByKey.get(exactCardKey(card.agendaItem, card.source));
      if (!translation || !inserted?.id) return null;

      return sanitizeForDatabase({
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
        raw_llm_json: rawLlmJson,
        translated_at: now
      });
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("summary_card_translations")
    .upsert(rows, { onConflict: "summary_card_id,locale" });

  if (error) throw new Error(`Failed to write summary card translations: ${error.message}`);
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
        ? existingExternalIds.get(meeting.meetingDetailsUrl)
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
          raw: safeMeeting,
          scraped_at: scrapedAt || new Date().toISOString()
        },
        { onConflict: regionalDatabase ? "jurisdiction_slug,external_id" : "external_id" }
      )
      .select("id,summarized_source_hash")
      .single();

    if (error) throw new Error(`Failed to upsert meeting ${meeting.title}: ${error.message}`);
    if (!data?.id) throw new Error(`Failed to read meeting id for ${meeting.title}.`);

    for (const doc of safeMeeting.documents) {
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
          extracted_text: doc.extractedText || null,
          extraction_character_count: doc.extractionCharacterCount || null,
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
  const rows = cardsToInsert.map(({ card }) => {
    const preserved =
      preservedByExactKey.get(exactCardKey(card.agendaItem, card.source)) ||
      preservedByAgendaKey.get(normalizeCardKey(card.agendaItem));

    return cardInsertRow(meetingId, card, rawLlmJson, {
      jurisdiction: options.jurisdiction,
      isPublished:
        typeof preserved?.is_published === "boolean" ? preserved.is_published : true,
      isFeatured:
        typeof preserved?.is_featured === "boolean" ? preserved.is_featured : false,
      adminNotes: preserved?.admin_notes || null
    });
  });

  const { data, error } = await supabase
    .from("summary_cards")
    .insert(rows)
    .select("id,agenda_item,source_url");

  if (error) throw new Error(`Failed to insert summary cards: ${error.message}`);

  await writeSpanishMeetingTranslation(supabase, meetingId, summary, rawLlmJson);
  await writeSpanishCardTranslations(
    supabase,
    ((data || []) as unknown as InsertedCardIdentity[]),
    cardsToInsert,
    summary,
    rawLlmJson
  );

  await markMeetingSummarized(supabase, meetingId, options.sourceHash);

  return data || [];
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
  const { data: existingCards, error: existingError } = await supabase
    .from("summary_cards")
    .select("agenda_item,source_url")
    .eq("meeting_id", meetingId);

  if (existingError) throw new Error(`Failed to read existing cards: ${existingError.message}`);

  const existingExactKeys = new Set<string>();
  const existingAgendaKeys = new Set<string>();
  const existingAgendaItems: string[] = [];

  for (const card of existingCards || []) {
    existingExactKeys.add(exactCardKey(card.agenda_item, card.source_url));
    existingAgendaKeys.add(normalizeCardKey(card.agenda_item));
    if (card.agenda_item) existingAgendaItems.push(card.agenda_item);
  }

  const newCards = summary.cards
    .map((card, summaryIndex) => ({ card, summaryIndex }))
    .filter(({ card }) => {
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

  if (newCards.length === 0) {
    await writeSpanishMeetingTranslation(supabase, meetingId, summary, rawLlmJson);
    await markMeetingSummarized(supabase, meetingId, options.sourceHash);
    return [];
  }

  const rows = newCards.map(({ card }) =>
    cardInsertRow(meetingId, card, rawLlmJson, {
      jurisdiction: options.jurisdiction,
      isPublished: true,
      isFeatured: false,
      adminNotes: null
    })
  );

  const { data, error } = await supabase
    .from("summary_cards")
    .insert(rows)
    .select("id,agenda_item,source_url");

  if (error) throw new Error(`Failed to append summary cards: ${error.message}`);

  await writeSpanishMeetingTranslation(supabase, meetingId, summary, rawLlmJson);
  await writeSpanishCardTranslations(
    supabase,
    ((data || []) as unknown as InsertedCardIdentity[]),
    newCards,
    summary,
    rawLlmJson
  );

  await markMeetingSummarized(supabase, meetingId, options.sourceHash);

  return data || [];
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
