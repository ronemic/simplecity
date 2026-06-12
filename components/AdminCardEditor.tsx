"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES } from "@/lib/constants";
import type { SummaryCardRow } from "@/lib/types";

function listFromCommaText(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buttonLabel(base: string, loading: boolean, loadingLabel: string) {
  return loading ? loadingLabel : base;
}

export function AdminCardEditor({ card }: { card: SummaryCardRow }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const cardJurisdictionSlug = card.jurisdiction_slug || card.meetings?.jurisdiction_slug || "foster-city";

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || deleting) return;

    setSaving(true);
    setMessage("");

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/admin/cards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: card.id,
          jurisdiction: cardJurisdictionSlug,
          agenda_item: String(formData.get("agenda_item") || ""),
          what_is_happening: String(formData.get("what_is_happening") || ""),
          why_it_matters: String(formData.get("why_it_matters") || ""),
          who_it_affects: listFromCommaText(formData.get("who_it_affects")),
          category_tags: formData.getAll("category_tags").map(String),
          status: String(formData.get("status") || ""),
          comment_window_opens: String(formData.get("comment_window_opens") || ""),
          comment_window_closes: String(formData.get("comment_window_closes") || ""),
          how_to_act_attend: String(formData.get("how_to_act_attend") || ""),
          how_to_act_email: String(formData.get("how_to_act_email") || ""),
          how_to_act_submit_comment: String(formData.get("how_to_act_submit_comment") || ""),
          source_url: String(formData.get("source_url") || ""),
          is_published: formData.get("is_published") === "on",
          is_featured: formData.get("is_featured") === "on",
          admin_notes: String(formData.get("admin_notes") || "")
        })
      });

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(body.error || "Failed to save card.");
        return;
      }

      router.refresh();
      setMessage("Card saved.");
    } catch {
      setMessage("Unable to save card.");
    } finally {
      setSaving(false);
    }
  }

  async function submitDelete() {
    if (saving || deleting) return;

    const confirmed = window.confirm("Delete this card?");
    if (!confirmed) return;

    setDeleting(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/cards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, jurisdiction: cardJurisdictionSlug })
      });

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(body.error || "Failed to delete card.");
        return;
      }

      router.refresh();
    } catch {
      setMessage("Unable to delete card.");
    } finally {
      setDeleting(false);
    }
  }

  const jurisdictionLabel =
    card.jurisdiction_slug === "san-mateo-city" || card.meetings?.jurisdiction_slug === "san-mateo-city"
      ? "San Mateo"
      : card.jurisdiction_slug === "santa-clara-county" ||
          card.meetings?.jurisdiction_slug === "santa-clara-county"
        ? "Santa Clara County"
        : card.jurisdiction_name || "Foster City";

  return (
    <article className="quiet-card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-civic/15 bg-[#eef5ff] px-2.5 py-1 text-xs font-bold text-[#1646b8]">
          {jurisdictionLabel}
        </span>
        <span className="text-xs font-semibold text-black/55">
          {card.meetings?.title || "Meeting not linked"}
        </span>
      </div>
      <form className="space-y-4" onSubmit={submitUpdate}>
        <input type="hidden" name="id" value={card.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-bold uppercase text-black/70">Agenda item</span>
            <input name="agenda_item" defaultValue={card.agenda_item || ""} className="input-control" />
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
            <input name="status" defaultValue={card.status || ""} className="input-control" />
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
            <input name="source_url" defaultValue={card.source_url || ""} className="input-control" />
          </label>
          <fieldset className="md:col-span-2">
            <legend className="text-xs font-bold uppercase text-black/70">Categories</legend>
            <div className="mt-2 flex flex-wrap gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-2">
              {CATEGORIES.map((category) => (
                <label
                  key={category}
                  className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-sm"
                >
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
          <button type="submit" disabled={saving || deleting} className="action-primary">
            {buttonLabel("Save card", saving, "Saving card")}
          </button>
        </div>
      </form>
      {message ? <p className="mt-3 rounded-lg bg-black/5 p-3 text-sm text-black/75">{message}</p> : null}
      <div className="mt-3">
        <button
          type="button"
          onClick={submitDelete}
          disabled={saving || deleting}
          className="action-secondary border-clay/20 bg-clay/10 px-4 text-clay hover:bg-clay/20"
        >
          {buttonLabel("Delete card", deleting, "Deleting card")}
        </button>
      </div>
    </article>
  );
}
