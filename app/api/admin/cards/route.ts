import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedAdminFromCookies } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/db/upsertMeetings";
import { revalidatePublicContent } from "@/lib/db/revalidatePublicContent";
import { meetingRowToLlmReadyMeeting } from "@/lib/db/meetingTransform";
import { validateSimpleCitySummary, validationOptionsForMeeting } from "@/lib/llm/validateSummary";
import {
  getDefaultJurisdiction,
  getServiceSupabaseClientForJurisdiction,
  requireValidJurisdictionSlug
} from "@/lib/config/jurisdictions";
import type { MeetingRow } from "@/lib/types";
import { summaryPointsFromLines, summaryPointsStorageText } from "@/lib/utils/summaryPoints";

function listFromCommaText(value: unknown) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function requireAdmin(request: NextRequest) {
  const admin = getAuthenticatedAdminFromCookies(request.cookies);
  if (!admin) {
    return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  }
  return admin;
}

function getConcreteJurisdiction(body: Record<string, unknown>) {
  const requested = String(body.jurisdiction || body.jurisdiction_slug || getDefaultJurisdiction().slug);
  const slug = requireValidJurisdictionSlug(requested);
  if (slug === "all") throw new Error("A concrete jurisdiction is required.");
  return slug;
}

async function validatePublishedCardUpdate(
  supabase: ReturnType<typeof getServiceSupabaseClientForJurisdiction>,
  before: Record<string, unknown>,
  update: {
    agenda_item: string;
    what_is_happening: string[];
    why_it_matters: string;
    who_it_affects: string[];
    category_tags: string[];
    status: string;
    comment_window_opens: string;
    comment_window_closes: string;
    how_to_act_attend: string;
    how_to_act_email: string;
    how_to_act_submit_comment: string;
    source_url: string;
    is_published: boolean;
  }
) {
  if (!update.is_published) return null;

  const meetingId = String(before.meeting_id || "");
  if (!meetingId) {
    return "Published cards must be linked to a meeting so their facts can be checked against source text.";
  }

  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .maybeSingle();

  if (error) return error.message;
  if (!meeting) return "Meeting not found for card validation.";

  const llmMeeting = meetingRowToLlmReadyMeeting(meeting as MeetingRow);
  const issues: string[] = [];
  const validated = validateSimpleCitySummary(
    {
      meetingSummary: {
        title: llmMeeting.title,
        date: llmMeeting.dateText || "",
        status: llmMeeting.status,
        oneSentenceSummary: ""
      },
      cards: [
        {
          agendaItem: update.agenda_item,
          whatIsHappening: update.what_is_happening,
          whyItMatters: update.why_it_matters,
          whoItAffects: update.who_it_affects,
          categoryTags: update.category_tags,
          status: update.status,
          commentWindow: {
            opens: update.comment_window_opens,
            closes: update.comment_window_closes
          },
          howToAct: {
            attend: update.how_to_act_attend,
            email: update.how_to_act_email,
            submitComment: update.how_to_act_submit_comment
          },
          source: update.source_url,
          confidence:
            before.confidence === "high" || before.confidence === "low" || before.confidence === "medium"
              ? before.confidence
              : "medium"
        }
      ]
    },
    validationOptionsForMeeting(llmMeeting, (issue) => {
      issues.push(`${issue.reason}${issue.value ? ` (${issue.value})` : ""}`);
    })
  );

  if (validated.cards.length === 1) {
    const card = validated.cards[0];
    update.source_url = card.source;
    update.status = card.status;
    update.category_tags = card.categoryTags;
    update.comment_window_opens = card.commentWindow.opens;
    update.comment_window_closes = card.commentWindow.closes;
    return null;
  }

  return issues[0] || "Published card did not pass source-grounding validation.";
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  let jurisdiction;
  try {
    jurisdiction = getConcreteJurisdiction(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid jurisdiction." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabaseClientForJurisdiction(jurisdiction);
  const { data: before, error: beforeError } = await supabase
    .from("summary_cards")
    .select("*")
    .eq("id", id)
    .eq("jurisdiction_slug", jurisdiction)
    .maybeSingle();

  if (beforeError) return NextResponse.json({ error: beforeError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Summary card not found." }, { status: 404 });

  const update = {
    agenda_item: String(body.agenda_item || ""),
    what_is_happening: summaryPointsFromLines(body.what_is_happening),
    why_it_matters: String(body.why_it_matters || ""),
    who_it_affects: Array.isArray(body.who_it_affects) ? body.who_it_affects.map(String) : listFromCommaText(body.who_it_affects),
    category_tags: Array.isArray(body.category_tags) ? body.category_tags.map(String) : [],
    status: String(body.status || ""),
    comment_window_opens: String(body.comment_window_opens || ""),
    comment_window_closes: String(body.comment_window_closes || ""),
    how_to_act_attend: String(body.how_to_act_attend || ""),
    how_to_act_email: String(body.how_to_act_email || ""),
    how_to_act_submit_comment: String(body.how_to_act_submit_comment || ""),
    source_url: String(body.source_url || ""),
    is_published: Boolean(body.is_published),
    is_featured: Boolean(body.is_featured),
    admin_notes: String(body.admin_notes || "")
  };

  if (update.what_is_happening.length < 1 || update.what_is_happening.length > 3) {
    return NextResponse.json(
      { error: "What is happening must contain between one and three points." },
      { status: 400 }
    );
  }

  const normalizedPoints = update.what_is_happening.map((point) => point.toLowerCase());
  if (new Set(normalizedPoints).size !== normalizedPoints.length) {
    return NextResponse.json(
      { error: "What is happening points must be unique." },
      { status: 400 }
    );
  }

  const validationError = await validatePublishedCardUpdate(supabase, before, update);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const databaseUpdate = {
    ...update,
    what_is_happening: summaryPointsStorageText(update.what_is_happening)
  };
  const { data: updated, error } = await supabase
    .from("summary_cards")
    .update(databaseUpdate)
    .eq("id", id)
    .eq("jurisdiction_slug", jurisdiction)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Summary card not found." }, { status: 404 });

  await writeAuditLog(supabase, {
    adminEmail: admin.email,
    action: "update",
    entityType: "summary_card",
    entityId: id,
    jurisdictionSlug: jurisdiction,
    before,
    after: databaseUpdate
  });

  revalidatePath("/admin/cards");
  revalidatePublicContent();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  let jurisdiction;
  try {
    jurisdiction = getConcreteJurisdiction(body as Record<string, unknown>);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid jurisdiction." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabaseClientForJurisdiction(jurisdiction);
  const { data: before, error: beforeError } = await supabase
    .from("summary_cards")
    .select("*")
    .eq("id", id)
    .eq("jurisdiction_slug", jurisdiction)
    .maybeSingle();

  if (beforeError) return NextResponse.json({ error: beforeError.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Summary card not found." }, { status: 404 });

  const { data: deleted, error } = await supabase
    .from("summary_cards")
    .delete()
    .eq("id", id)
    .eq("jurisdiction_slug", jurisdiction)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: "Summary card not found." }, { status: 404 });

  await writeAuditLog(supabase, {
    adminEmail: admin.email,
    action: "delete",
    entityType: "summary_card",
    entityId: id,
    jurisdictionSlug: jurisdiction,
    before
  });

  revalidatePath("/admin/cards");
  revalidatePublicContent();
  return NextResponse.json({ ok: true });
}
