import { revalidatePath } from "next/cache";
import { AdminJurisdictionFilter } from "@/components/AdminJurisdictionFilter";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminNav } from "@/components/AdminNav";
import { FormActionButton } from "@/components/FormActionButton";
import { CategoryPill } from "@/components/CategoryPill";
import { StatusPill } from "@/components/StatusPill";
import { CATEGORIES } from "@/lib/constants";
import { getAdminCollections } from "@/lib/db/queries";
import { meetingRowToLlmReadyMeeting } from "@/lib/db/meetingTransform";
import { replaceSummaryCardsForMeeting, writeAuditLog } from "@/lib/db/upsertMeetings";
import { meetingSourceHash } from "@/lib/db/meetingSourceHash";
import { revalidatePublicContent } from "@/lib/db/revalidatePublicContent";
import { generateSummaryForMeeting } from "@/lib/llm/openrouter";
import { getAuthenticatedAdmin, requireAdmin } from "@/lib/supabase/admin";
import {
  getDefaultJurisdiction,
  getJurisdictionBySlug,
  getJurisdictionDisplayLabel,
  getJurisdictionSlugFromRow,
  getServiceSupabaseClientForJurisdiction,
  normalizeJurisdictionSelection,
  requireValidJurisdictionSlug
} from "@/lib/config/jurisdictions";
import { formatDisplayDate } from "@/lib/utils/date";
import { displayMeetingText, displayMeetingTitle, displayMeetingType } from "@/lib/utils/meetingDisplay";

async function regenerateMeetingAction(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const requestedJurisdiction = String(formData.get("jurisdiction") || getDefaultJurisdiction().slug);
  const validJurisdiction = requireValidJurisdictionSlug(requestedJurisdiction);
  if (validJurisdiction === "all") throw new Error("A concrete jurisdiction is required.");

  const supabase = getServiceSupabaseClientForJurisdiction(validJurisdiction);

  const { data: meeting, error } = await supabase.from("meetings").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!meeting) throw new Error("Meeting not found.");

  const llmMeeting = meetingRowToLlmReadyMeeting(meeting);
  if (!llmMeeting.llmInputText) throw new Error("Meeting does not have LLM input text.");

  const jurisdiction =
    getJurisdictionBySlug(getJurisdictionSlugFromRow(meeting.jurisdiction_slug || validJurisdiction)) ||
    getDefaultJurisdiction();
  const result = await generateSummaryForMeeting(llmMeeting);
  const sourceHash = meeting.source_hash || meetingSourceHash(llmMeeting);
  const cards = await replaceSummaryCardsForMeeting(supabase, id, result.summary, result.raw, {
    allowEmptyReplacement: true,
    jurisdiction,
    sourceHash
  });

  await writeAuditLog(supabase, {
    adminEmail: admin.email,
    action: "regenerate",
    entityType: "meeting",
    entityId: id,
    after: { cardsGenerated: cards.length, sourceHash }
  });

  revalidatePath("/admin/meetings");
  revalidatePath("/admin/cards");
  revalidatePublicContent([`/meetings/${id}`]);
}

export default async function AdminMeetingsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; type?: string; category?: string; date?: string; jurisdiction?: string }>;
}) {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return (
      <div className="section-shell py-10">
        <AdminLoginForm />
      </div>
    );
  }

  const params = await searchParams;
  const jurisdiction = normalizeJurisdictionSelection(params.jurisdiction);
  const { meetings, documents, cards } = await getAdminCollections(jurisdiction);
  const meetingTypes = Array.from(new Set(meetings.map((meeting) => meeting.meeting_type).filter(Boolean)));
  const matchingMeetingIdsByCategory = new Set(
    cards
      .filter((card) => !params.category || (card.category_tags || []).includes(params.category))
      .map((card) => card.meeting_id)
  );

  const filtered = meetings.filter((meeting) => {
    const matchesStatus = !params.status || meeting.status === params.status;
    const matchesType = !params.type || meeting.meeting_type === params.type;
    const matchesDate = !params.date || (meeting.date_text || "").toLowerCase().includes(params.date.toLowerCase());
    const matchesCategory = !params.category || matchingMeetingIdsByCategory.has(meeting.id);
    return matchesStatus && matchesType && matchesDate && matchesCategory;
  });

  return (
    <div className="section-shell py-10">
      <div className="mb-6">
        <p className="label-eyebrow text-civic">Admin</p>
        <h1 className="page-title mt-2">Meetings</h1>
      </div>
      <AdminNav jurisdiction={jurisdiction} />
      <AdminJurisdictionFilter selected={jurisdiction} />

      <form className="quiet-card mt-8 grid gap-3 p-4 md:grid-cols-4 lg:grid-cols-5 sm:p-5">
        <input type="hidden" name="jurisdiction" value={jurisdiction} />
        <select
          name="status"
          defaultValue={params.status || ""}
          className="input-control"
        >
          <option value="">All statuses</option>
          <option value="Upcoming">Upcoming</option>
          <option value="Past">Past</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <select name="type" defaultValue={params.type || ""} className="input-control">
          <option value="">All meeting types</option>
          {meetingTypes.map((type) => (
            <option key={type || ""} value={type || ""}>
              {displayMeetingText(type)}
            </option>
          ))}
        </select>
        <select
          name="category"
          defaultValue={params.category || ""}
          className="input-control"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <input
          name="date"
          defaultValue={params.date || ""}
          placeholder="Date text"
          className="input-control"
        />
        <button className="action-primary">Filter</button>
      </form>

      <div className="mt-6 grid gap-4">
        {filtered.map((meeting) => {
          const docs = documents.filter((doc) => doc.meeting_id === meeting.id);
          const meetingCards = cards.filter((card) => card.meeting_id === meeting.id);
          const categories = Array.from(new Set(meetingCards.flatMap((card) => card.category_tags || [])));
          const jurisdictionLabel = getJurisdictionDisplayLabel(
            meeting.jurisdiction_slug || meeting.jurisdiction_name
          );

          return (
            <article key={meeting.id} className="quiet-card p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={meeting.status} />
                    <span className="rounded-full border border-civic/15 bg-[#eef5ff] px-2.5 py-1 text-xs font-bold text-[#1646b8]">
                      {jurisdictionLabel}
                    </span>
                    <span className="text-sm font-semibold text-black/70">
                      {formatDisplayDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text)}
                    </span>
                    {categories.map((category) => (
                      <CategoryPill key={category} category={category} compact />
                    ))}
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-ink">{displayMeetingTitle(meeting)}</h2>
                  <p className="mt-1 text-sm text-black/70">{displayMeetingType(meeting)}</p>
                </div>
                <form action={regenerateMeetingAction}>
                  <input type="hidden" name="id" value={meeting.id} />
                  <input type="hidden" name="jurisdiction" value={meeting.jurisdiction_slug || "foster-city"} />
                  <FormActionButton className="action-primary" pendingLabel="Regenerating">
                    Regenerate summaries
                  </FormActionButton>
                </form>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <section>
                  <h3 className="text-sm font-bold uppercase text-black/70">Documents</h3>
                  <div className="mt-2 space-y-2">
                    {docs.length > 0 ? (
                      docs.map((doc) => (
                        <a
                          key={doc.id}
                          href={doc.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-md border border-black/10 p-3 text-sm hover:bg-black/5"
                        >
                          <span className="font-semibold text-ink">{doc.type || "Document"}</span>
                          <span className="block break-words text-black/70">{doc.source_url}</span>
                          {doc.download_error ? (
                            <span className="mt-1 block text-clay">{doc.download_error}</span>
                          ) : null}
                        </a>
                      ))
                    ) : (
                      <p className="text-sm text-black/70">No documents saved.</p>
                    )}
                  </div>
                </section>
                <section>
                  <h3 className="text-sm font-bold uppercase text-black/70">Generated cards</h3>
                  <p className="mt-2 text-sm text-black/75">{meetingCards.length} cards for this meeting.</p>
                  <details className="mt-3 rounded-md border border-black/10 bg-black/[0.025] p-3">
                    <summary className="cursor-pointer text-sm font-bold text-ink">Raw extracted text</summary>
                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-5 text-black/75">
                      {meeting.llm_input_text || "No LLM input text stored."}
                    </pre>
                  </details>
                </section>
              </div>
            </article>
          );
        })}
        {filtered.length === 0 ? (
          <div className="quiet-card p-8 text-center">
            <h2 className="text-lg font-semibold text-ink">No meetings match those filters</h2>
          </div>
        ) : null}
      </div>
    </div>
  );
}
