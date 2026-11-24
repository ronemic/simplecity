import type { JurisdictionConfig } from "@/lib/config/jurisdictions";
import type {
  DecisionLocationMethod,
  DecisionLocationPrecision,
  DecisionLocationStatus
} from "@/lib/types";

// Named arterials -- El Camino Real, Broadway, The Alameda -- are still missing
// here, and items on them go unpinned. Adding them changes which match comes
// first on pages that mention several streets, which silently moved an existing
// pin when it was tried, so it needs its own change and its own verification.
const STREET_SUFFIX =
  "(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Highway|Hwy|Place|Pl|Circle|Cir|Terrace|Ter|Parkway|Pkwy)";
// At least one word must name the street. With none, ordinals that PDFs split
// apart -- "1 st", "3 rd" -- read as a house number plus suffix, and the
// geocoder returns whatever street in the region has that number.
const ADDRESS_BODY =
  `\\d{1,6}(?:-\\d{1,6})?\\s+(?:[A-Z0-9][A-Za-z0-9.'’/-]*\\s+){1,7}${STREET_SUFFIX}`;
// A house number never continues a comma-grouped amount: "$68,400 contingency
// for Otay Avenue" is not 400 on any street.
const STREET_ADDRESS_PATTERN = new RegExp(`(?<!\\d,)\\b${ADDRESS_BODY}\\b`, "gi");
const WHOLE_ADDRESS_PATTERN = new RegExp(`^${ADDRESS_BODY}$`, "i");

/**
 * Item types whose body routinely names addresses that the decision is not
 * about: payment registers list a vendor address per line, minutes recap every
 * site the body discussed, and adjournment or salary boilerplate carries the
 * city-hall letterhead. Picking any one of those addresses tells a reader the
 * city acted on that property, so these items get no pin at all.
 */
const NON_SITE_ITEM_PATTERN =
  /\b(?:warrants?\s+of\s+demands?|registers?\s+of\s+demands?|check\s+register|warrant\s+register|accounts?\s+payable|cash\s+disbursements?|disbursements?\s+report|list\s+of\s+(?:claims|demands|warrants)|claims?\s+register|payroll\s+register|salary\s+schedule|meeting\s+minutes|minutes\s+(?:of|for|from)\b|adjournment)\b/i;

type Bounds = readonly [west: number, south: number, east: number, north: number];

const REGION_BOUNDS: Record<string, Bounds> = {
  "north-san-mateo": [-122.62, 37.1, -122.05, 37.75],
  "south-san-mateo": [-122.62, 37.1, -122.05, 37.75],
  "san-francisco": [-122.53, 37.69, -122.34, 37.84],
  "santa-clara": [-122.3, 36.85, -121.15, 37.55],
  "santa-barbara": [-120.75, 33.8, -119.25, 35.2]
};

export type DecisionLocationCandidate = {
  address: string;
  evidence: string;
  precision: DecisionLocationPrecision;
};

export type StoredDecisionLocation = {
  location_label: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  location_precision: DecisionLocationPrecision | null;
  location_confidence: number | null;
  location_method: DecisionLocationMethod | null;
  location_status: DecisionLocationStatus;
  location_source_text: string | null;
  location_updated_at: string;
};

type GeocodingFeature = {
  center?: unknown;
  place_name?: unknown;
  relevance?: unknown;
  address?: unknown;
  text?: unknown;
};

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function evidenceExcerpt(text: string, start: number, length: number) {
  const from = Math.max(0, start - 100);
  const to = Math.min(text.length, start + length + 140);
  return compact(text.slice(from, to));
}

/**
 * The official agenda title when the formatted item context is available, and
 * otherwise the whole text -- which older cards store as the bare title. Body
 * prose is deliberately excluded so an incidental "minutes" or "warrant" inside
 * a real project report cannot suppress its location.
 */
function itemTitle(text: string) {
  return text.match(/^Official title:\s*(.+)$/m)?.[1] ?? text;
}

function isNonSiteItem(text: string) {
  return NON_SITE_ITEM_PATTERN.test(itemTitle(text));
}

/**
 * Agenda rows run the item's own number -- and sometimes a dotted sub-number --
 * straight into the address that follows, as in "Agenda section: PUBLIC
 * HEARING. 2 1471 E. 3rd Ave". Those leading digits are not part of the
 * address, and `addressNumber` would go on to compare them against the
 * geocoder's real house number and reject every one of these items.
 *
 * Only a number that directly abuts the house number is dropped. Reaching any
 * further would step over intervening words, and that is precisely where the
 * addresses a decision is not about live -- staff-report letterhead ("Page 1 of
 * 4 City of Redwood City 1017 Middlefield Road"), meeting venues ("09:00 AM
 * District Office ... 201 Covington Road") and rows of an appeals table ("24 Y
 * 24.2346 2610 ORCHARD PARKWAY") all take that shape.
 *
 * The result has to be a whole address in its own right, so a street with no
 * house number ("13 19th Avenue" -> "19th Avenue") is left alone rather than
 * pinned at a street centroid while claiming address precision.
 */
const ABUTTING_INDEX_PREFIX = /^\d{1,6}(?:\.\d{1,3})*\.?\s+(?=\d)/;

function withoutAgendaPrefix(address: string) {
  let trimmed = address;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = trimmed.replace(ABUTTING_INDEX_PREFIX, "");
    if (next === trimmed) break;
    trimmed = next;
  }
  return trimmed !== address && WHOLE_ADDRESS_PATTERN.test(trimmed) ? trimmed : address;
}

/** The item's own number, from the "Agenda item N" line of the formatted context. */
function agendaItemNumber(text: string) {
  return text.match(/^Agenda item (\d{1,4})\b/m)?.[1] || null;
}

/**
 * Agenda scrapes sometimes run an item's context on into the next item -- "24
 * Tracking Survey Results ... DOWNLOAD PUBLIC HEARING ... 25. New Multi-Family
 * Residential Development ... at 220 W. 20th Avenue" -- and the next item's
 * address then pins the survey presentation at that housing site. The context
 * is cut where the next numbered item ("25." for item 24) begins, through the
 * end of that line, so later labelled lines still count.
 */
function withoutFollowingItems(text: string) {
  const itemNumber = agendaItemNumber(text);
  const contextStart = text.search(/^Item context:/m);
  if (!itemNumber || contextStart < 0) return text;

  const nextNumber = String(Number(itemNumber) + 1);
  const nextItem = new RegExp(`(?<![\\d$.,])\\b${nextNumber}\\.\\s`, "g");
  nextItem.lastIndex = contextStart;
  const boundary = nextItem.exec(text);
  if (!boundary) return text;

  const lineEnd = text.indexOf("\n", boundary.index);
  return text.slice(0, boundary.index) + (lineEnd < 0 ? "" : text.slice(lineEnd));
}

/**
 * The item number heads the item's own context -- "Agenda section: OLD
 * BUSINESS. 23 Humboldt Street Bike Lanes" -- and reads as house number 23. A
 * number that equals the item's own number and directly follows the section
 * label is that index, not an address. Without the "Agenda item N" line there
 * is nothing to compare against, so older source text is left as it was.
 */
function isAgendaItemIndex(
  address: string,
  match: RegExpMatchArray,
  text: string,
  itemNumber: string | null
) {
  // Checked after `withoutAgendaPrefix`, so "15 445 S. B Street" (item 15)
  // is judged by its real house number, 445.
  if (!itemNumber || addressNumber(address) !== itemNumber) return false;
  const before = text.slice(Math.max(0, (match.index || 0) - 160), match.index || 0);
  return /(?:Agenda section:[^\n]*[.:]|Item context:)\s*$/i.test(before);
}

export function extractStreetAddressCandidate(
  sourceText: string | null | undefined
): DecisionLocationCandidate | null {
  const raw = String(sourceText || "");
  if (isNonSiteItem(raw)) return null;
  const text = withoutFollowingItems(raw);
  const itemNumber = agendaItemNumber(text);
  STREET_ADDRESS_PATTERN.lastIndex = 0;

  // Skipping a match hands the card to the next one in the text, which is
  // routinely the staff-report letterhead, so the bar for skipping is high.
  // A junk match that merely looks like an address -- a fiscal-year span such
  // as "2026-2027 Road Maintenance" -- is left to fail geocoding on its own
  // rather than filtered out here.
  for (const match of text.matchAll(STREET_ADDRESS_PATTERN)) {
    const address = withoutAgendaPrefix(compact(match[0]).replace(/[.,;:]+$/, ""));
    if (isAgendaItemIndex(address, match, text, itemNumber)) continue;
    const start = match.index || 0;
    const nearby = text.slice(Math.max(0, start - 90), start).toLowerCase();

    // Participation and correspondence addresses identify where a meeting is
    // held or where comments are sent, not where the decision applies.
    if (/\b(?:meeting|hearing|chambers?|room|mail|email|submit|comment|attend)\b/.test(nearby)) {
      continue;
    }

    return {
      address,
      evidence: evidenceExcerpt(text, start, match[0].length),
      precision: "street_address"
    };
  }

  return null;
}

function addressNumber(value: string) {
  return value.match(/^\s*(\d{1,6})\b/)?.[1] || null;
}

const STREET_WORD_ALIASES: Record<string, string> = {
  st: "street",
  ave: "avenue",
  av: "avenue",
  rd: "road",
  blvd: "boulevard",
  dr: "drive",
  ln: "lane",
  ct: "court",
  hwy: "highway",
  pl: "place",
  cir: "circle",
  ter: "terrace",
  pkwy: "parkway"
};
const DIRECTIONS = new Set(["n", "s", "e", "w", "north", "south", "east", "west"]);
const ORDINAL_WORDS: Record<string, string> = {
  first: "1st",
  second: "2nd",
  third: "3rd",
  fourth: "4th",
  fifth: "5th",
  sixth: "6th",
  seventh: "7th",
  eighth: "8th",
  ninth: "9th",
  tenth: "10th",
  eleventh: "11th",
  twelfth: "12th"
};

/**
 * The street a "123 Main St."-style address names, with its house number,
 * compass prefix and punctuation dropped, its suffix spelled out and its
 * ordinal in digits, so "220 W. 20th Ave" and "220 W 20th Avenue" -- or "349
 * First Street" and "349 1st Street" -- compare equal.
 */
function streetKey(address: string) {
  return address
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/^\s*\d{1,6}(?:-\d{1,6})?\s+/, "")
    .split(/\s+/)
    .filter((word) => word && !DIRECTIONS.has(word))
    .map((word) => ORDINAL_WORDS[word] || STREET_WORD_ALIASES[word] || word)
    .join(" ");
}

/**
 * The geocoder's first label part has to be the street the source named. The
 * region box is wide and the house-number check alone let "23 Humboldt Street,
 * San Mateo" resolve to 23 Humboldt Court in Pacifica. The city is not
 * compared: the geocoder labels unincorporated land by its county seat (a
 * Santa Maria water sale on Patterson Road reads "Santa Barbara"), and those
 * pins are correct.
 *
 * The address pattern can run past the street ("10320 Rolly Road for the
 * Rolly Road"), so the source may continue after the label's street. It may
 * not start elsewhere: "6 that conveyance of easements at 920 Thompson Street"
 * is not 6 Thompson Street.
 */
export function labelMatchesAddress(label: string | null | undefined, address: string) {
  const street = streetKey(String(label || "").split(",")[0] || "");
  const expected = streetKey(address);
  if (!street || !expected) return false;
  return expected === street || expected.startsWith(`${street} `);
}

function withinBounds(longitude: number, latitude: number, bounds: Bounds) {
  return (
    longitude >= bounds[0] &&
    longitude <= bounds[2] &&
    latitude >= bounds[1] &&
    latitude <= bounds[3]
  );
}

function finiteCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function clearedDecisionLocation() {
  return emptyLocation("no_candidate");
}

function emptyLocation(status: Exclude<DecisionLocationStatus, "verified">): StoredDecisionLocation {
  return {
    location_label: null,
    location_latitude: null,
    location_longitude: null,
    location_precision: null,
    location_confidence: null,
    location_method: null,
    location_status: status,
    location_source_text: null,
    location_updated_at: new Date().toISOString()
  };
}

export async function geocodeDecisionAddress(
  candidate: DecisionLocationCandidate,
  jurisdiction: JurisdictionConfig,
  options: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<StoredDecisionLocation | null> {
  const apiKey = options.apiKey || process.env.MAPTILER_GEOCODING_API_KEY;
  if (!apiKey) return null;

  const bounds = REGION_BOUNDS[jurisdiction.regionSlug];
  if (!bounds) return emptyLocation("geocode_failed");

  // A range like "922-980 S. Claremont Street" names a frontage rather than one
  // door and the geocoder resolves none of them, while the low number is a real
  // address on that block. `addressNumber` already keys the house-number check
  // below to that same low number, so the query and the check agree.
  const geocodableAddress = candidate.address.replace(/^(\d{1,6})-\d{1,6}(?=\s)/, "$1");
  const query = `${geocodableAddress}, ${jurisdiction.name}, California`;
  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("country", "us");
  url.searchParams.set("bbox", bounds.join(","));
  url.searchParams.set("limit", "5");
  url.searchParams.set("autocomplete", "false");

  try {
    const response = await (options.fetchImpl || fetch)(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return emptyLocation("geocode_failed");

    const body = (await response.json()) as { features?: GeocodingFeature[] };
    const expectedNumber = addressNumber(candidate.address);
    const feature = (body.features || []).find((entry) => {
      if (!Array.isArray(entry.center) || entry.center.length < 2) return false;
      const longitude = finiteCoordinate(entry.center[0]);
      const latitude = finiteCoordinate(entry.center[1]);
      if (longitude === null || latitude === null || !withinBounds(longitude, latitude, bounds)) {
        return false;
      }
      const label = String(entry.place_name || "");
      if (!labelMatchesAddress(label, geocodableAddress)) return false;
      return !expectedNumber || addressNumber(label) === expectedNumber;
    });

    if (!feature || !Array.isArray(feature.center)) return emptyLocation("geocode_failed");
    const longitude = finiteCoordinate(feature.center[0]);
    const latitude = finiteCoordinate(feature.center[1]);
    if (longitude === null || latitude === null) return emptyLocation("geocode_failed");

    const relevance = finiteCoordinate(feature.relevance) ?? 0.8;
    if (relevance < 0.7) return emptyLocation("geocode_failed");

    return {
      location_label: compact(String(feature.place_name || query)),
      location_latitude: latitude,
      location_longitude: longitude,
      location_precision: candidate.precision,
      location_confidence: Math.min(1, Math.max(0, relevance)),
      location_method: "geocoded",
      location_status: "verified",
      location_source_text: candidate.evidence,
      location_updated_at: new Date().toISOString()
    };
  } catch {
    return emptyLocation("geocode_failed");
  }
}

export async function locateDecisionFromSource(
  sourceText: string | null | undefined,
  jurisdiction: JurisdictionConfig,
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {}
) {
  const candidate = extractStreetAddressCandidate(sourceText);
  if (!candidate) return emptyLocation("no_candidate");
  return geocodeDecisionAddress(candidate, jurisdiction, options);
}
