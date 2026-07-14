"use client";

import { type FormEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListboxSelect } from "@/components/ListboxSelect";

type StatusOption = {
  value: string;
  label: string;
};

export function MeetingsFilterForm({
  search,
  status,
  view,
  month,
  date,
  jurisdiction,
  searchPlaceholder,
  statusLabel,
  statusOptions,
  filterLabel
}: {
  search: string;
  status: string;
  view: "calendar" | "list";
  month?: string;
  date?: string;
  jurisdiction?: string;
  searchPlaceholder: string;
  statusLabel: string;
  statusOptions: StatusOption[];
  filterLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();

    for (const [name, value] of formData.entries()) {
      const normalizedValue = String(value).trim();
      if (normalizedValue) params.set(name, normalizedValue);
    }

    const query = params.toString();
    startTransition(() => {
      router.push(`/meetings${query ? `?${query}` : ""}`, { scroll: false });
    });
  }

  return (
    <form
      className="quiet-card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_180px_auto] sm:p-5"
      onSubmit={handleSubmit}
      aria-busy={isPending}
    >
      <input
        type="hidden"
        name="view"
        data-form-sync="view"
        defaultValue={view}
        disabled={view === "calendar"}
      />
      <input
        type="hidden"
        name="month"
        data-form-sync="month"
        defaultValue={month || ""}
        disabled={!month}
      />
      <input
        type="hidden"
        name="date"
        data-form-sync="date"
        defaultValue={date || ""}
        disabled={!date}
      />
      <input
        type="hidden"
        name="jurisdiction"
        defaultValue={jurisdiction || ""}
        disabled={!jurisdiction}
      />
      <input
        name="q"
        defaultValue={search}
        placeholder={searchPlaceholder}
        className="input-control"
      />
      <ListboxSelect
        name="status"
        label={statusLabel}
        value={status}
        options={statusOptions}
      />
      <button className="action-primary" disabled={isPending}>
        {filterLabel}
      </button>
    </form>
  );
}
