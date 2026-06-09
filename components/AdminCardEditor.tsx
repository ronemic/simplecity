import { CATEGORIES } from "@/lib/constants";
import type { SummaryCardRow } from "@/lib/types";

export function AdminCardEditor({
  card,
  updateAction,
  deleteAction
}: {
  card: SummaryCardRow;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <article className="quiet-card p-5">
      <form action={updateAction} className="space-y-4">
        <input type="hidden" name="id" value={card.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">Agenda item</span>
            <input
              name="agenda_item"
              defaultValue={card.agenda_item || ""}
              className="mt-1 min-h-11 w-full rounded-md border border-black/15 px-3 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">What is happening</span>
            <textarea
              name="what_is_happening"
              defaultValue={card.what_is_happening || ""}
              rows={3}
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">Why it matters</span>
            <textarea
              name="why_it_matters"
              defaultValue={card.why_it_matters || ""}
              rows={3}
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">Status</span>
            <input
              name="status"
              defaultValue={card.status || ""}
              className="mt-1 min-h-11 w-full rounded-md border border-black/15 px-3 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">Who it affects</span>
            <input
              name="who_it_affects"
              defaultValue={(card.who_it_affects || []).join(", ")}
              className="mt-1 min-h-11 w-full rounded-md border border-black/15 px-3 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">Source URL</span>
            <input
              name="source_url"
              defaultValue={card.source_url || ""}
              className="mt-1 min-h-11 w-full rounded-md border border-black/15 px-3 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
            />
          </label>
          <fieldset className="md:col-span-2">
            <legend className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">Categories</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <label key={category} className="inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    name="category_tags"
                    value={category}
                    defaultChecked={(card.category_tags || []).includes(category)}
                  />
                  {category}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">Comment opens</span>
            <input
              name="comment_window_opens"
              defaultValue={card.comment_window_opens || ""}
              className="mt-1 min-h-11 w-full rounded-md border border-black/15 px-3 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">Comment closes</span>
            <input
              name="comment_window_closes"
              defaultValue={card.comment_window_closes || ""}
              className="mt-1 min-h-11 w-full rounded-md border border-black/15 px-3 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">Attend</span>
            <textarea
              name="how_to_act_attend"
              defaultValue={card.how_to_act_attend || ""}
              rows={2}
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">Email</span>
            <textarea
              name="how_to_act_email"
              defaultValue={card.how_to_act_email || ""}
              rows={2}
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">Submit comment</span>
            <textarea
              name="how_to_act_submit_comment"
              defaultValue={card.how_to_act_submit_comment || ""}
              rows={2}
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="is_published" defaultChecked={Boolean(card.is_published)} />
            Published
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="is_featured" defaultChecked={Boolean(card.is_featured)} />
            Featured
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-black/55">Admin notes</span>
            <textarea
              name="admin_notes"
              defaultValue={card.admin_notes || ""}
              rows={2}
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 outline-none focus:border-civic focus:ring-2 focus:ring-civic/20"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="min-h-10 rounded-md bg-civic px-4 text-sm font-bold text-white transition hover:bg-[#1c4788]">
            Save card
          </button>
        </div>
      </form>
      <form action={deleteAction} className="mt-3">
        <input type="hidden" name="id" value={card.id} />
        <button className="min-h-10 rounded-md border border-clay/30 bg-clay/10 px-4 text-sm font-bold text-clay transition hover:bg-clay/15">
          Delete card
        </button>
      </form>
    </article>
  );
}
