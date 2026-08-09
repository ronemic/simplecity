import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabaseClientForJurisdiction } from "@/lib/config/jurisdictions";
import {
  isInterestUuid,
  latestIsoTimestamp,
  SANTA_BARBARA_INTEREST_JURISDICTION,
  type SantaBarbaraInterestCardUpdate
} from "@/lib/interests/santaBarbara";

type InterestClient = Pick<SupabaseClient, "from">;

function interestSecret() {
  const secret =
    process.env.INTEREST_HASH_SECRET?.trim() ||
    process.env.RATE_LIMIT_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim();
  if (!secret) throw new Error("Missing INTEREST_HASH_SECRET or RATE_LIMIT_SECRET.");
  return secret;
}

function interestClient() {
  return getServiceSupabaseClientForJurisdiction(SANTA_BARBARA_INTEREST_JURISDICTION);
}

export function createDeviceCardHash(deviceToken: string, cardId: string, secret = interestSecret()) {
  if (!isInterestUuid(deviceToken) || !isInterestUuid(cardId)) {
    throw new Error("A valid device token and card id are required.");
  }

  return createHmac("sha256", secret)
    .update(`simplecity-santa-barbara-interest:v1:${cardId}:${deviceToken}`)
    .digest("hex");
}

async function requirePublishedSantaBarbaraCard(cardId: string, supabase: InterestClient) {
  const { data, error } = await supabase
    .from("summary_cards")
    .select("id")
    .eq("id", cardId)
    .eq("jurisdiction_slug", SANTA_BARBARA_INTEREST_JURISDICTION)
    .eq("is_published", true)
    .maybeSingle();

  if (error) throw new Error(`Failed to verify interest card: ${error.message}`);
  return Boolean(data);
}

export async function setSantaBarbaraDecisionInterest(
  input: { cardId: string; deviceToken: string; interested: boolean },
  supabase: InterestClient = interestClient()
) {
  if (!isInterestUuid(input.cardId) || !isInterestUuid(input.deviceToken)) {
    throw new Error("Invalid interest request.");
  }
  if (!(await requirePublishedSantaBarbaraCard(input.cardId, supabase))) return null;

  const deviceCardHash = createDeviceCardHash(input.deviceToken, input.cardId);
  if (input.interested) {
    const { error } = await supabase.from("decision_interests").upsert(
      {
        summary_card_id: input.cardId,
        device_card_hash: deviceCardHash
      },
      { onConflict: "summary_card_id,device_card_hash", ignoreDuplicates: true }
    );
    if (error) throw new Error(`Failed to save interest: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("decision_interests")
      .delete()
      .eq("summary_card_id", input.cardId)
      .eq("device_card_hash", deviceCardHash);
    if (error) throw new Error(`Failed to remove interest: ${error.message}`);
  }

  return { cardId: input.cardId, interested: input.interested };
}

export async function getSantaBarbaraInterestCardUpdates(
  cardIds: string[],
  supabase: InterestClient = interestClient()
): Promise<SantaBarbaraInterestCardUpdate[]> {
  const ids = [...new Set(cardIds.filter(isInterestUuid))].slice(0, 50);
  if (ids.length === 0) return [];

  const [cardsResult, outcomesResult] = await Promise.all([
    supabase
      .from("summary_cards")
      .select("id,updated_at,meetings(status)")
      .eq("jurisdiction_slug", SANTA_BARBARA_INTEREST_JURISDICTION)
      .eq("is_published", true)
      .in("id", ids),
    supabase
      .from("decision_outcomes")
      .select("summary_card_id,updated_at")
      .eq("jurisdiction_slug", SANTA_BARBARA_INTEREST_JURISDICTION)
      .in("summary_card_id", ids)
  ]);

  if (cardsResult.error) {
    throw new Error(`Failed to load interested cards: ${cardsResult.error.message}`);
  }
  if (outcomesResult.error) {
    throw new Error(`Failed to load interested-card results: ${outcomesResult.error.message}`);
  }

  const outcomeActivity = new Map<string, string>();
  for (const row of (outcomesResult.data || []) as Array<{
    summary_card_id: string;
    updated_at: string | null;
  }>) {
    const latest = latestIsoTimestamp(outcomeActivity.get(row.summary_card_id), row.updated_at);
    if (latest) outcomeActivity.set(row.summary_card_id, latest);
  }

  return ((cardsResult.data || []) as unknown as Array<{
    id: string;
    updated_at: string | null;
    meetings: { status?: string | null } | null;
  }>).map((card) => ({
    cardId: card.id,
    latestActivityAt: latestIsoTimestamp(
      card.updated_at,
      outcomeActivity.get(card.id)
    ),
    hasResult: outcomeActivity.has(card.id),
    meetingStatus: card.meetings?.status || null
  }));
}
