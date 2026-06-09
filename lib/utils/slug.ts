export function cleanText(text = "") {
  return text.replace(/\s+/g, " ").trim();
}

export function slugify(text = "") {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function externalMeetingId(dateText: string | null | undefined, title: string, firstSourceUrl?: string | null) {
  return slugify([dateText || "no-date", title, firstSourceUrl || "no-source"].join(" "));
}
