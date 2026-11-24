/**
 * Minutes laid out as an outline whose item numbers the general agenda parser
 * cannot read:
 *
 * - eScribe (Santa Maria) puts each number alone on its line -- "11.a.2" --
 *   with the title on the next line and every attachment listed as "1.Report
 *   - ...pdf" below it.
 * - Solvang and Los Altos Hills letter the items under a numbered section:
 *   "6. CONSENT ITEMS" then "a. Approve ...", or "5. CONSENT CALENDAR" then
 *   "A. Approval of ...". Agendas number those items "6.d" / "5.A".
 *
 * This only reads structure. Results are read by the caller.
 */

export type MinutesOutlineEntry = {
  /** "11.a.2", "6.d", "5.A", or a bare section/letter ("11", "A"). */
  number: string;
  title: string;
  /** The heading through the line before the next heading. */
  block: string;
  sectionNumber: string | null;
  sectionTitle: string | null;
  /** Section heading through the end of the section, for section-wide motions. */
  sectionText: string | null;
};

const BARE_NUMBER_LINE = /^\s*(\d{1,2}(?:\.[a-z0-9]{1,3}){0,3})\.?\s*$/i;
/**
 * "6. CONSENT ITEMS", "5. GC SECTION 53232.3(d) ..." -- the first word is
 * uppercase, so a numbered list in prose ("1. Continue negotiations") is not.
 */
const NUMBERED_SECTION_LINE = /^\s*(\d{1,2})\s*\.\s*([A-Z][A-Z'’&/-]{1,}\b.*)$/;
/**
 * "a. Approve ...", "A. Approval of ...", and "A.Resolution ..." without the
 * space -- but not "U.S. Highway", whose letter is followed by another.
 */
const LETTERED_ITEM_LINE = /^\s*([A-Za-z])\.(?:\s+|(?=[A-Z][a-z]))(\S.{2,})$/;
/** "8B. Discussion ..." -- an item taken out of order, with its section. */
const SECTIONED_LETTER_LINE = /^\s*(\d{1,2})([A-Z])\.\s+(\S.{2,})$/;
const MIN_BARE_NUMBER_HEADINGS = 3;
const MAX_TITLE_LINES = 3;

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function bareNumberOutline(lines: string[]): MinutesOutlineEntry[] {
  const headings = lines.flatMap((line, index) => {
    const number = line.match(BARE_NUMBER_LINE)?.[1];
    return number ? [{ index, number }] : [];
  });
  // Page numbers also stand alone on their lines ("1", "2", "3" above a
  // "Reducewaste.org" footer). eScribe's outline has sub-items ("11.a.2").
  if (
    headings.length < MIN_BARE_NUMBER_HEADINGS ||
    headings.filter((heading) => heading.number.includes(".")).length < MIN_BARE_NUMBER_HEADINGS
  ) {
    return [];
  }

  const entries = headings.map((heading, position) => {
    const end = headings[position + 1]?.index ?? lines.length;
    const body = lines.slice(heading.index + 1, end);
    const title = compact(body.find((line) => line.trim()) || "");
    return {
      number: heading.number,
      title,
      block: lines.slice(heading.index, end).join("\n").trim(),
      start: heading.index,
      end
    };
  });

  return entries.map((entry) => {
    const sectionNumber = entry.number.split(".")[0];
    const section = entries.find((candidate) => candidate.number === sectionNumber);
    const sectionEnd = entries.find(
      (candidate) => candidate.start > entry.start && candidate.number.split(".")[0] !== sectionNumber
    )?.start ?? lines.length;
    return {
      number: entry.number,
      title: entry.title,
      block: entry.block,
      sectionNumber: section ? sectionNumber : null,
      sectionTitle: section?.title || null,
      sectionText: section ? lines.slice(section.start, sectionEnd).join("\n").trim() : null
    };
  });
}

function letteredOutline(lines: string[]): MinutesOutlineEntry[] {
  type Heading = { index: number; number: string; title: string; isSection: boolean; section: string | null };
  const headings: Heading[] = [];
  let section: { number: string; title: string } | null = null;
  for (const [index, line] of lines.entries()) {
    const sectionMatch = line.match(NUMBERED_SECTION_LINE);
    if (sectionMatch) {
      section = { number: sectionMatch[1], title: compact(sectionMatch[2]) };
      headings.push({ index, number: section.number, title: section.title, isSection: true, section: section.number });
      continue;
    }
    const outOfOrder = line.match(SECTIONED_LETTER_LINE);
    if (outOfOrder) {
      headings.push({
        index,
        number: `${outOfOrder[1]}.${outOfOrder[2]}`,
        title: compact(outOfOrder[3]),
        isSection: false,
        section: outOfOrder[1]
      });
      continue;
    }
    const item = line.match(LETTERED_ITEM_LINE);
    if (item) {
      headings.push({
        index,
        number: section ? `${section.number}.${item[1]}` : item[1],
        title: compact(item[2]),
        isSection: false,
        section: section?.number ?? null
      });
    }
  }
  if (!headings.some((heading) => !heading.isSection)) return [];
  // A section heading the pattern missed folds its items into the previous
  // section -- into the consent calendar, with its vote. Sections run in
  // sequence, so a gap ("7." then "13.") means one was missed.
  const sectionNumbers = headings.filter((heading) => heading.isSection).map((heading) => Number(heading.number));
  if (sectionNumbers.some((number, index) => index > 0 && number !== sectionNumbers[index - 1] + 1)) {
    return [];
  }
  // Los Altos School District letters its sections and numbers the items
  // ("F. CONSENT CALENDAR", then "1."). Lettered headings ahead of the first
  // numbered section mean the letters are the sections.
  const firstSection = headings.findIndex((heading) => heading.isSection);
  if (firstSection > 1 && headings.slice(0, firstSection).every((heading) => heading.section === null)) {
    return [];
  }

  const sectionTitles = new Map(
    headings.filter((heading) => heading.isSection).map((heading) => [heading.number, heading.title])
  );
  return headings.map((heading, position) => {
    const end = headings[position + 1]?.index ?? lines.length;
    // Titles wrap: keep following lines until one ends a sentence.
    const titleLines = [heading.title];
    for (let index = heading.index + 1; index < end && titleLines.length < MAX_TITLE_LINES; index += 1) {
      if (/[.:]$/.test(titleLines.at(-1) || "") || !lines[index].trim()) break;
      titleLines.push(compact(lines[index]));
    }
    const sectionHeading = heading.section === null
      ? undefined
      : headings.find((candidate) => candidate.isSection && candidate.number === heading.section);
    const sectionEnd = sectionHeading
      ? headings.find((candidate) => candidate.isSection && candidate.index > sectionHeading.index)?.index ?? lines.length
      : null;
    return {
      number: heading.number,
      title: compact(titleLines.join(" ")),
      block: lines.slice(heading.index, end).join("\n").trim(),
      sectionNumber: heading.section,
      sectionTitle: heading.section === null ? null : sectionTitles.get(heading.section) || null,
      sectionText: sectionHeading && sectionEnd !== null
        ? lines.slice(sectionHeading.index, sectionEnd).join("\n").trim()
        : null
    };
  });
}

export function parseMinutesOutline(text: string): MinutesOutlineEntry[] {
  const lines = text.split("\n");
  const bare = bareNumberOutline(lines);
  return bare.length > 0 ? bare : letteredOutline(lines);
}
