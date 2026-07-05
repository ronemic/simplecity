import "@/lib/env/bootstrap";
import {
  getJurisdictionBySlug,
  getServiceSupabaseClientForJurisdiction,
  type JurisdictionConfig,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";
import { getEmailConfig } from "@/lib/email/config";
import {
  labelForEmailSelection,
  sendNewPostsDigestEmail,
  type LocalizedDigestCard
} from "@/lib/email/newPosts";
import {
  getActiveSubscribersForDigest,
  recordDigestDelivery,
  unsubscribeUrl,
  updateSubscriptionDigestTimestamp,
  type EmailSubscriberWithSubscriptions,
  type EmailSubscriptionRow
} from "@/lib/email/subscriptions";
import {
  meetingTranslationFingerprint,
  summaryCardTranslationFingerprint
} from "@/lib/db/translationFingerprint";
import type {
  MeetingRow,
  MeetingTranslationRow,
  SummaryCardRow,
  SummaryCardTranslationRow
} from "@/lib/types";

type DigestOptions = {
  dryRun: boolean;
  limitSubscribers: number | null;
};

const DIGEST_CARD_MEETING_COLUMNS =
  "id,jurisdiction_name,jurisdiction_slug,platform,title,meeting_type,date_text,time_text,meeting_datetime,status";
const DIGEST_SUMMARY_CARD_COLUMNS = [
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
  "admin_notes",
  "created_at",
  "updated_at"
].join(",");
const DIGEST_SUMMARY_CARD_SELECT = `${DIGEST_SUMMARY_CARD_COLUMNS},meetings(${DIGEST_CARD_MEETING_COLUMNS})`;
const DIGEST_CARD_TRANSLATION_COLUMNS = [
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
const DIGEST_MEETING_TRANSLATION_COLUMNS =
  "meeting_id,locale,title,meeting_type,source_fingerprint,translation_status";

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function maskEmail(email: string) {
  const [localPart = "", domain = ""] = email.split("@");
  if (!localPart || !domain) return "[redacted email]";
  return `${localPart[0]}***@${domain}`;
}

function getOptions(): DigestOptions {
  const rawLimit = getArgValue("limit-subscribers");
  const limitSubscribers = rawLimit ? Number(rawLimit) : null;

  if (limitSubscribers !== null && (!Number.isInteger(limitSubscribers) || limitSubscribers <= 0)) {
    throw new Error("--limit-subscribers must be a positive integer.");
  }

  return {
    dryRun: hasFlag("dry-run"),
    limitSubscribers
  };
}

function mostRecentSentAt(subscription: EmailSubscriptionRow) {
  return subscription.last_digest_sent_at || subscription.created_at || new Date(0).toISOString();
}

function withJurisdictionFallback(card: SummaryCardRow, jurisdiction: JurisdictionConfig) {
  return {
    ...card,
    jurisdiction_name: card.jurisdiction_name || jurisdiction.name,
    jurisdiction_slug: card.jurisdiction_slug || jurisdiction.slug,
    platform: card.platform || jurisdiction.platform,
    meetings: card.meetings
      ? {
          ...card.meetings,
          jurisdiction_name: card.meetings.jurisdiction_name || jurisdiction.name,
          jurisdiction_slug: card.meetings.jurisdiction_slug || jurisdiction.slug,
          platform: card.meetings.platform || jurisdiction.platform
        }
      : card.meetings
  };
}

function uniqueCards(cards: SummaryCardRow[]) {
  const seen = new Set<string>();
  const result: SummaryCardRow[] = [];

  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    result.push(card);
  }

  return result;
}

function translatedMeeting(
  meeting: MeetingRow | null | undefined,
  translations: Map<string, MeetingTranslationRow>
) {
  if (!meeting?.id) return meeting || null;

  const translation = translations.get(meeting.id);
  if (!translation) return meeting;
  if (translation.source_fingerprint !== meetingTranslationFingerprint(meeting)) return meeting;

  return {
    ...meeting,
    title: translation.title || meeting.title,
    meeting_type: translation.meeting_type || meeting.meeting_type
  };
}

function translatedCard(
  card: SummaryCardRow,
  cardTranslations: Map<string, SummaryCardTranslationRow>,
  meetingTranslations: Map<string, MeetingTranslationRow>
) {
  const translation = cardTranslations.get(card.id);
  if (!translation) return null;
  if (translation.source_fingerprint !== summaryCardTranslationFingerprint(card)) return null;

  return {
    ...card,
    agenda_item: translation.agenda_item || card.agenda_item,
    what_is_happening: translation.what_is_happening || card.what_is_happening,
    why_it_matters: translation.why_it_matters || card.why_it_matters,
    who_it_affects: translation.who_it_affects || card.who_it_affects,
    status: translation.status || card.status,
    comment_window_opens: translation.comment_window_opens || card.comment_window_opens,
    comment_window_closes: translation.comment_window_closes || card.comment_window_closes,
    how_to_act_attend: translation.how_to_act_attend || card.how_to_act_attend,
    how_to_act_email: translation.how_to_act_email || card.how_to_act_email,
    how_to_act_submit_comment:
      translation.how_to_act_submit_comment || card.how_to_act_submit_comment,
    meetings: translatedMeeting(card.meetings, meetingTranslations)
  };
}

async function applySpanishTranslations(
  supabase: ReturnType<typeof getServiceSupabaseClientForJurisdiction>,
  cards: SummaryCardRow[]
) {
  if (cards.length === 0) return cards as LocalizedDigestCard[];

  const cardIds = cards.map((card) => card.id);
  const meetingIds = cards
    .map((card) => card.meetings?.id)
    .filter((id): id is string => Boolean(id));

  const [{ data: cardTranslationRows, error: cardTranslationError }, meetingResult] =
    await Promise.all([
      supabase
        .from("summary_card_translations")
        .select(DIGEST_CARD_TRANSLATION_COLUMNS)
        .eq("locale", "es")
        .in("translation_status", ["machine", "reviewed"])
        .in("summary_card_id", cardIds),
      meetingIds.length > 0
        ? supabase
            .from("meeting_translations")
            .select(DIGEST_MEETING_TRANSLATION_COLUMNS)
            .eq("locale", "es")
            .in("translation_status", ["machine", "reviewed"])
            .in("meeting_id", meetingIds)
        : Promise.resolve({ data: [], error: null })
    ]);

  if (cardTranslationError) {
    throw new Error(`Failed to load Spanish digest card translations: ${cardTranslationError.message}`);
  }

  if (meetingResult.error) {
    throw new Error(`Failed to load Spanish digest meeting translations: ${meetingResult.error.message}`);
  }

  const cardTranslations = new Map(
    ((cardTranslationRows || []) as unknown as SummaryCardTranslationRow[]).map(
      (translation) => [translation.summary_card_id, translation]
    )
  );
  const meetingTranslations = new Map(
    ((meetingResult.data || []) as unknown as MeetingTranslationRow[]).map(
      (translation) => [translation.meeting_id, translation]
    )
  );

  return cards.map((card) => {
    const spanish = translatedCard(card, cardTranslations, meetingTranslations);
    return spanish
      ? ({
          ...card,
          translations: { es: spanish }
        } satisfies LocalizedDigestCard)
      : (card as LocalizedDigestCard);
  });
}

async function cardsForSubscription(subscription: EmailSubscriptionRow) {
  const jurisdiction = getJurisdictionBySlug(subscription.jurisdiction_slug);
  if (!jurisdiction) throw new Error(`Unknown jurisdiction: ${subscription.jurisdiction_slug}`);

  const supabase = getServiceSupabaseClientForJurisdiction(subscription.jurisdiction_slug);
  const { data, error } = await supabase
    .from("summary_cards")
    .select(DIGEST_SUMMARY_CARD_SELECT)
    .eq("is_published", true)
    .gt("created_at", mostRecentSentAt(subscription))
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Failed to load ${jurisdiction.name} digest cards: ${error.message}`);
  }

  const cards = ((data || []) as unknown as SummaryCardRow[]).map((card) =>
    withJurisdictionFallback(card, jurisdiction)
  );
  return applySpanishTranslations(supabase, cards);
}

function subscriptionLabel(subscriptions: EmailSubscriptionRow[]) {
  if (subscriptions.length === 1) {
    return labelForEmailSelection(subscriptions[0].jurisdiction_slug);
  }

  return `${subscriptions.length} SimpleCity areas`;
}

async function sendDigestForSubscriber(
  subscriber: EmailSubscriberWithSubscriptions,
  options: DigestOptions
) {
  const subscriptions = subscriber.email_subscriptions || [];
  const batches = await Promise.all(
    subscriptions.map(async (subscription) => ({
      subscription,
      cards: await cardsForSubscription(subscription)
    }))
  );
  const cards = uniqueCards(batches.flatMap((batch) => batch.cards));
  const subscriptionIds = batches
    .filter((batch) => batch.cards.length > 0)
    .map((batch) => batch.subscription.id);
  const jurisdictionSlugs = batches
    .filter((batch) => batch.cards.length > 0)
    .map((batch) => batch.subscription.jurisdiction_slug);

  if (cards.length === 0) {
    console.log(`No new cards for ${maskEmail(subscriber.email)}.`);
    return { sent: false, cardCount: 0 };
  }

  if (options.dryRun) {
    console.log(`[dry-run] Would send ${cards.length} cards to ${maskEmail(subscriber.email)}.`);
    return { sent: false, cardCount: cards.length };
  }

  const sentAt = new Date().toISOString();
  const result = await sendNewPostsDigestEmail({
    to: subscriber.email,
    cards,
    appUrl: getEmailConfig().appUrl,
    selectionLabel: subscriptionLabel(subscriptions),
    unsubscribeUrl: unsubscribeUrl(subscriber.unsubscribe_token)
  });

  await updateSubscriptionDigestTimestamp(subscriptionIds, sentAt);
  await recordDigestDelivery({
    subscriberId: subscriber.id,
    jurisdictionSlugs: jurisdictionSlugs as JurisdictionSlug[],
    cardIds: cards.map((card) => card.id),
    status: "sent",
    providerMessageId: result.id,
    sentAt
  });
  console.log(`Sent ${cards.length} cards to ${maskEmail(subscriber.email)}.`);
  return { sent: true, cardCount: cards.length };
}

async function main() {
  const options = getOptions();
  const subscribers = await getActiveSubscribersForDigest();
  const limitedSubscribers =
    options.limitSubscribers === null ? subscribers : subscribers.slice(0, options.limitSubscribers);
  let sentCount = 0;
  let cardCount = 0;
  let failureCount = 0;

  for (const subscriber of limitedSubscribers) {
    try {
      const result = await sendDigestForSubscriber(subscriber, options);
      if (result.sent) sentCount += 1;
      cardCount += result.cardCount;
    } catch (error) {
      failureCount += 1;
      console.error(`Failed to send digest to ${maskEmail(subscriber.email)}:`, error);
      await recordDigestDelivery({
        subscriberId: subscriber.id,
        jurisdictionSlugs: (subscriber.email_subscriptions || []).map(
          (subscription) => subscription.jurisdiction_slug
        ),
        cardIds: [],
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown digest error."
      }).catch((recordError) => {
        console.error("Failed to record digest failure:", recordError);
      });
    }
  }

  console.log(
    `Weekly digest complete. Subscribers sent: ${sentCount}. Cards included: ${cardCount}. Failures: ${failureCount}.`
  );

  if (failureCount > 0) {
    throw new Error(`Weekly digest failed for ${failureCount} subscriber(s).`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
