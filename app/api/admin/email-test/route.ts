import { getPublishedCards } from "@/lib/db/queries";
import { labelForEmailSelection, sendNewPostsDigestEmail } from "@/lib/email/newPosts";
import {
  getDefaultJurisdiction,
  requireValidJurisdictionSlug
} from "@/lib/config/jurisdictions";
import { assertAdminForRoute } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_TEST_CARDS = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.min(MAX_TEST_CARDS, Math.floor(parsed));
}

function parseRecipient(value: unknown) {
  const recipient = String(value || "").trim();
  return EMAIL_PATTERN.test(recipient) ? recipient : null;
}

export async function POST(request: Request) {
  const { response } = await assertAdminForRoute();
  if (response) return response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const to = parseRecipient(body.to);

  if (!to) {
    return Response.json({ error: "A valid recipient email is required." }, { status: 400 });
  }

  let jurisdiction;
  try {
    jurisdiction = requireValidJurisdictionSlug(
      String(body.jurisdiction || getDefaultJurisdiction().slug)
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid jurisdiction." },
      { status: 400 }
    );
  }

  const limit = parseLimit(body.limit);
  let cards;

  try {
    cards = (await getPublishedCards(jurisdiction, "en")).slice(0, limit);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load published cards." },
      { status: 500 }
    );
  }

  if (cards.length === 0) {
    return Response.json({ error: "No published cards found for this jurisdiction." }, { status: 404 });
  }

  try {
    const result = await sendNewPostsDigestEmail({
      to,
      cards,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      selectionLabel: labelForEmailSelection(jurisdiction)
    });

    return Response.json({
      ok: true,
      id: result.id,
      sentTo: to,
      cardCount: cards.length,
      jurisdiction
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to send email." },
      { status: 500 }
    );
  }
}
