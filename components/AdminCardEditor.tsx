import { CATEGORIES } from "@/lib/constants";
import type { SummaryCardRow } from "@/lib/types";
import { FormActionButton } from "./FormActionButton";

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
    <article className="quiet-card p-5 sm:p-6">
      <form action={updateAction} className="space-y-4">
        <input type="hidden" name="id" value={card.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-bold uppercase text-black/70">Agenda item</span>
            <input
              name="agenda_item"
              defaultValue={card.agenda_item || ""}
              className="input-control"
            />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-bold uppercase text-black/70">What is happening</span>
            <textarea
              name="what_is_happening"
              defaultValue={card.what_is_happening || ""}
              rows={3}
              className="input-control input-control--textarea"
            />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-bold uppercase text-black/70">Why it matters</span>
            <textarea
              name="why_it_matters"
              defaultValue={card.why_it_matters || ""}
              rows={3}
              className="input-control input-control--textarea"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-black/70">Status</span>
            <input
              name="status"
              defaultValue={card.status || ""}
              className="input-control"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-black/70">Who it affects</span>
            <input
              name="who_it_affects"
              defaultValue={(card.who_it_affects || []).join(", ")}
              className="input-control"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-black/70">Source URL</span>
            <input
              name="source_url"
              defaultValue={card.source_url || ""}
              className="input-control"
            />
          </label>
          <fieldset className="md:col-span-2">
            <legend className="text-xs font-bold uppercase text-black/70">Categories</legend>
            <div className="mt-2 flex flex-wrap gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-2">
              {CATEGORIES.map((category) => (
                <label key={category} className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-sm">
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
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-black/70">Comment opens</span>
            <input
              name="comment_window_opens"
              defaultValue={card.comment_window_opens || ""}
              className="input-control"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-black/70">Comment closes</span>
            <input
              name="comment_window_closes"
              defaultValue={card.comment_window_closes || ""}
              className="input-control"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-black/70">Attend</span>
            <textarea
              name="how_to_act_attend"
              defaultValue={card.how_to_act_attend || ""}
              rows={2}
              className="input-control input-control--textarea"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-black/70">Email</span>
            <textarea
              name="how_to_act_email"
              defaultValue={card.how_to_act_email || ""}
              rows={2}
              className="input-control input-control--textarea"
            />
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-bold uppercase text-black/70">Submit comment</span>
            <textarea
              name="how_to_act_submit_comment"
              defaultValue={card.how_to_act_submit_comment || ""}
              rows={2}
              className="input-control input-control--textarea"
            />
          </label>
          <label className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-sm font-semibold">
            <input type="checkbox" name="is_published" defaultChecked={Boolean(card.is_published)} />
            Published
          </label>
          <label className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-sm font-semibold">
            <input type="checkbox" name="is_featured" defaultChecked={Boolean(card.is_featured)} />
            Featured
          </label>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-bold uppercase text-black/70">Admin notes</span>
            <textarea
              name="admin_notes"
              defaultValue={card.admin_notes || ""}
              rows={2}
              className="input-control input-control--textarea"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <FormActionButton className="action-primary" pendingLabel="Saving card">
            Save card
          </FormActionButton>
        </div>
      </form>
      <form action={deleteAction} className="mt-3">
        <input type="hidden" name="id" value={card.id} />
        <FormActionButton
          className="action-secondary border-clay/20 bg-clay/10 px-4 text-clay hover:bg-clay/20"
          pendingLabel="Deleting card"
        >
          Delete card
        </FormActionButton>
      </form>
    </article>
  );
}
