export type HighlightSegment = {
  text: string;
  isMatch: boolean;
};

export function splitHighlightMatches(text: string, query: string): HighlightSegment[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, isMatch: false }];

  const haystack = text.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const matchIndex = haystack.indexOf(needle, cursor);
    if (matchIndex === -1) break;

    if (matchIndex > cursor) {
      segments.push({ text: text.slice(cursor, matchIndex), isMatch: false });
    }
    segments.push({
      text: text.slice(matchIndex, matchIndex + needle.length),
      isMatch: true
    });
    cursor = matchIndex + needle.length;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isMatch: false });
  }

  return segments.length > 0 ? segments : [{ text, isMatch: false }];
}

export function getHighlightExcerpt(text: string | null | undefined, query: string, maxLength = 180) {
  const content = (text || "").trim().replace(/\s+/g, " ");
  const needle = query.trim().toLowerCase();
  if (!content || !needle) return null;

  const matchIndex = content.toLowerCase().indexOf(needle);
  if (matchIndex === -1) return null;
  if (content.length <= maxLength) return content;

  const contextBefore = Math.max(0, Math.floor((maxLength - needle.length) * 0.4));
  let start = Math.max(0, matchIndex - contextBefore);
  let end = Math.min(content.length, start + maxLength);

  if (end === content.length) start = Math.max(0, end - maxLength);
  if (start > 0) {
    const nextSpace = content.indexOf(" ", start);
    if (nextSpace !== -1 && nextSpace < matchIndex) start = nextSpace + 1;
  }
  if (end < content.length) {
    const previousSpace = content.lastIndexOf(" ", end);
    if (previousSpace > matchIndex + needle.length) end = previousSpace;
  }

  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}
