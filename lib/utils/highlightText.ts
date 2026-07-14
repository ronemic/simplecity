export type HighlightSegment = {
  text: string;
  isMatch: boolean;
};

type HighlightRange = {
  start: number;
  end: number;
};

function exactHighlightRanges(text: string, needle: string) {
  const ranges: HighlightRange[] = [];
  const haystack = text.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const matchIndex = haystack.indexOf(needle, cursor);
    if (matchIndex === -1) break;
    ranges.push({ start: matchIndex, end: matchIndex + needle.length });
    cursor = matchIndex + needle.length;
  }

  return ranges;
}

function comparableText(value: string) {
  const characters: string[] = [];
  const sourceIndexes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const normalizedCharacters = value[index]
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]/gu);

    if (!normalizedCharacters) {
      if (characters.at(-1) === " ") continue;
      characters.push(" ");
      sourceIndexes.push(index);
      continue;
    }

    for (const character of normalizedCharacters) {
      characters.push(character);
      sourceIndexes.push(index);
    }
  }

  return { text: characters.join(""), sourceIndexes };
}

function normalizedHighlightRanges(text: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [] as HighlightRange[];

  const exactRanges = exactHighlightRanges(text, needle);
  if (exactRanges.length > 0) return exactRanges;

  const comparableHaystack = comparableText(text);
  const comparableNeedle = comparableText(needle).text.trim();
  if (!comparableNeedle) return [] as HighlightRange[];

  const ranges: HighlightRange[] = [];
  let cursor = 0;

  while (cursor < comparableHaystack.text.length) {
    const matchIndex = comparableHaystack.text.indexOf(comparableNeedle, cursor);
    if (matchIndex === -1) break;

    const sourceStart = comparableHaystack.sourceIndexes[matchIndex];
    const sourceEnd = comparableHaystack.sourceIndexes[matchIndex + comparableNeedle.length - 1] + 1;
    ranges.push({ start: sourceStart, end: sourceEnd });
    cursor = matchIndex + comparableNeedle.length;
  }

  return ranges;
}

export function splitHighlightMatches(text: string, query: string): HighlightSegment[] {
  const ranges = normalizedHighlightRanges(text, query);
  if (ranges.length === 0) return [{ text, isMatch: false }];

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), isMatch: false });
    }
    segments.push({
      text: text.slice(range.start, range.end),
      isMatch: true
    });
    cursor = range.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isMatch: false });
  }

  return segments.length > 0 ? segments : [{ text, isMatch: false }];
}

export function getHighlightExcerpt(text: string | null | undefined, query: string, maxLength = 180) {
  const content = (text || "").trim().replace(/\s+/g, " ");
  if (!content || !query.trim()) return null;

  const match = normalizedHighlightRanges(content, query)[0];
  if (!match) return null;
  if (content.length <= maxLength) return content;

  const matchLength = match.end - match.start;
  const contextBefore = Math.max(0, Math.floor((maxLength - matchLength) * 0.4));
  let start = Math.max(0, match.start - contextBefore);
  let end = Math.min(content.length, start + maxLength);

  if (end === content.length) start = Math.max(0, end - maxLength);
  if (start > 0) {
    const nextSpace = content.indexOf(" ", start);
    if (nextSpace !== -1 && nextSpace < match.start) start = nextSpace + 1;
  }
  if (end < content.length) {
    const previousSpace = content.lastIndexOf(" ", end);
    if (previousSpace > match.end) end = previousSpace;
  }

  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}
