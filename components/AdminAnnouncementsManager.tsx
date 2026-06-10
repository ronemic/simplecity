"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AnnouncementRow } from "@/lib/types";

function toAnnouncementPayload(formData: FormData) {
  const jurisdiction = String(formData.get("jurisdiction") || "all");

  return {
    title: String(formData.get("title") || ""),
    body: String(formData.get("body") || ""),
    type: String(formData.get("type") || "info"),
    jurisdiction,
    jurisdiction_slug: jurisdiction === "all" ? null : jurisdiction,
    starts_at: String(formData.get("starts_at") || "") || null,
    ends_at: String(formData.get("ends_at") || "") || null,
    is_published: formData.get("is_published") === "on"
  };
}

function AnnouncementEditor({
  announcement,
  mode,
  selectedJurisdiction
}: {
  announcement?: AnnouncementRow;
  mode: "create" | "update";
  selectedJurisdiction: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage("");

    try {
      const formData = new FormData(event.currentTarget);
      const payload = toAnnouncementPayload(formData);
      const response = await fetch("/api/admin/announcements", {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(mode === "update" ? { id: announcement?.id } : {}),
          ...(mode === "update"
            ? {
                target_jurisdiction:
                  announcement?.source_jurisdiction_slug ||
                  announcement?.jurisdiction_slug ||
                  selectedJurisdiction
              }
            : {}),
          ...payload
        })
      });

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(body.error || "Failed to save announcement.");
        return;
      }

      router.refresh();
      setMessage(mode === "create" ? "Announcement created." : "Announcement saved.");
    } catch {
      setMessage("Unable to save announcement.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="quiet-card space-y-4 p-5 sm:p-6">
      {announcement?.id ? <input type="hidden" name="id" value={announcement.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1 md:col-span-2">
          <span className="text-xs font-bold uppercase text-black/70">Title</span>
          <input name="title" required defaultValue={announcement?.title || ""} className="input-control" />
        </label>
        <label className="block space-y-1 md:col-span-2">
          <span className="text-xs font-bold uppercase text-black/70">Body</span>
          <textarea
            name="body"
            required
            rows={3}
            defaultValue={announcement?.body || ""}
            className="input-control input-control--textarea"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase text-black/70">Type</span>
          <select name="type" defaultValue={announcement?.type || "info"} className="input-control">
            <option value="info">Info</option>
            <option value="alert">Alert</option>
            <option value="event">Event</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase text-black/70">Jurisdiction</span>
          <select
            name="jurisdiction"
            defaultValue={announcement ? announcement.jurisdiction_slug || "all" : selectedJurisdiction}
            className="input-control"
          >
            <option value="all">All</option>
            <option value="foster-city">Foster City</option>
            <option value="san-mateo-city">San Mateo</option>
          </select>
        </label>
        <label className="flex items-end gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-3 text-sm font-semibold">
          <input type="checkbox" name="is_published" defaultChecked={Boolean(announcement?.is_published ?? true)} />
          Published
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase text-black/70">Starts at</span>
          <input type="datetime-local" name="starts_at" defaultValue={announcement?.starts_at ? String(announcement.starts_at).slice(0, 16) : ""} className="input-control" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase text-black/70">Ends at</span>
          <input type="datetime-local" name="ends_at" defaultValue={announcement?.ends_at ? String(announcement.ends_at).slice(0, 16) : ""} className="input-control" />
        </label>
      </div>
      <button type="submit" disabled={loading} className="action-primary">
        {loading ? (mode === "create" ? "Creating announcement" : "Saving announcement") : mode === "create" ? "Create announcement" : "Save announcement"}
      </button>
      {message ? <p className="rounded-lg bg-black/5 p-3 text-sm text-black/75">{message}</p> : null}
    </form>
  );
}

function AnnouncementDeleteButton({
  id,
  targetJurisdiction
}: {
  id: string;
  targetJurisdiction: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function onDelete() {
    if (loading) return;
    const confirmed = window.confirm("Delete this announcement?");
    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/announcements", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, target_jurisdiction: targetJurisdiction })
      });

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(body.error || "Failed to delete announcement.");
        return;
      }

      router.refresh();
    } catch {
      setMessage("Unable to delete announcement.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onDelete}
        disabled={loading}
        className="action-secondary border-clay/20 bg-clay/10 px-4 text-clay hover:bg-clay/20"
      >
        {loading ? "Deleting announcement" : "Delete announcement"}
      </button>
      {message ? <p className="rounded-lg bg-black/5 p-3 text-sm text-black/75">{message}</p> : null}
    </div>
  );
}

export function AdminAnnouncementsManager({
  announcements,
  selectedJurisdiction
}: {
  announcements: AnnouncementRow[];
  selectedJurisdiction: string;
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-2xl font-bold text-ink">Create announcement</h2>
        <AnnouncementEditor mode="create" selectedJurisdiction={selectedJurisdiction} />
      </section>

      <section>
        <h2 className="mb-3 text-2xl font-bold text-ink">Existing announcements</h2>
        <div className="grid gap-4">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="space-y-3">
              <AnnouncementEditor
                announcement={announcement}
                mode="update"
                selectedJurisdiction={selectedJurisdiction}
              />
              <AnnouncementDeleteButton
                id={String(announcement.id)}
                targetJurisdiction={
                  announcement.source_jurisdiction_slug ||
                  announcement.jurisdiction_slug ||
                  selectedJurisdiction
                }
              />
            </div>
          ))}
          {announcements.length === 0 ? (
            <div className="quiet-card p-8 text-center">
              <h3 className="text-lg font-semibold text-ink">No announcements yet</h3>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
