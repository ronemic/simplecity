import type { AgendaItem } from "@/lib/types";

export function uniqueSourceItemIds(items: AgendaItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const id = String(item.externalId || "").trim();
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }

  return new Set(
    Array.from(counts.entries()).flatMap(([id, count]) => count === 1 ? [id] : [])
  );
}
