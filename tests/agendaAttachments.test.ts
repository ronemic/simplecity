import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  associatePdfLinksWithAgendaItems,
  extractAgendaPdfPages,
  MENLO_PARK_ATTACHMENT_MAX_ITEMS,
  normalizeMenloParkAttachmentUrl,
  selectAgendaItemAttachments,
  selectAllAgendaItemAttachments,
  type AgendaPdfPage,
  type DiscoveredAgendaItem
} from "@/lib/scraper/agendaAttachments";
import {
  appendAgendaItemAttachmentContext,
  MAX_CHARS_FOR_LLM
} from "@/lib/scraper/prepareLlmInput";
import { KNOWN_JURISDICTION_SLUGS } from "@/lib/config/jurisdictions";
import type { PrimeGovDocument, PrimeGovMeeting } from "@/lib/types";

function text(str: string, x: number, y: number) {
  return { str, transform: [1, 0, 0, 1, x, y] };
}

function link(url: string, y: number) {
  return { url, rect: [300, y - 5, 420, y + 5], subtype: "Link" };
}

test("associates official PDF annotations with same-page Menlo Park agenda items", () => {
  const page: AgendaPdfPage = {
    pageNumber: 2,
    textItems: [
      text("H.", 40, 700),
      text("Presentations", 90, 700),
      text("H", 40, 650),
      text("1.", 48, 650),
      text("Complete Streets work plan report", 90, 650),
      text("(Staff Report #26-101-CC)", 300, 630),
      text("H2.", 40, 580),
      text("Caltrain update", 90, 580),
      text("(Attachment)", 300, 560),
      text("(Staff Report #26-102-CC)", 300, 540),
      text("I.", 40, 500),
      text("Consent Calendar", 90, 500),
      text("(Attachment)", 300, 480),
      text("I", 40, 460),
      text("3.", 48, 460),
      text("Public Utility Easement adjacent to 100 Terminal", 90, 460),
      text("Ave. (Staff Report #26-115-CC)", 90, 445),
      text("J.", 40, 400),
      text("Public Hearing", 90, 400)
    ],
    links: [
      link(
        "https://www.menlopark.gov/files/sharedassets/public/2026/h1-complete-streets.pdf",
        630
      ),
      link(
        "https://www.menlopark.gov/files/sharedassets/public/2026/h2-presentation.pdf",
        560
      ),
      link(
        "https://www.menlopark.gov/files/sharedassets/public/2026/h2-staff-report.pdf",
        540
      ),
      link(
        "https://www.menlopark.gov/files/sharedassets/public/2026/unmatched.pdf",
        480
      ),
      link(
        "https://www.menlopark.gov/files/sharedassets/public/2026/i3-terminal-easement.pdf",
        449
      ),
      link("https://zoom.us/j/123", 650)
    ]
  };

  const items = associatePdfLinksWithAgendaItems(page);

  assert.deepEqual(
    items.map((item) => item.agendaNumber),
    ["H1", "H2", "I3"]
  );
  assert.equal(items[0].title, "Complete Streets work plan report");
  assert.equal(items[1].links.length, 2);
  assert.doesNotMatch(items[1].rowText, /Consent Calendar/);
  assert.match(items[2].rowText, /Ave\./);

  const selected = selectAgendaItemAttachments(items);
  assert.equal(
    selected.find((item) => item.agendaNumber === "H2")?.selectedLink.url.endsWith(
      "h2-staff-report.pdf"
    ),
    true
  );
});

test("filters attachment URLs to official Menlo Park shared PDF assets", () => {
  assert.equal(
    normalizeMenloParkAttachmentUrl(
      "https://www.menlopark.gov/files/sharedassets/public/item.pdf#page=2"
    ),
    "https://www.menlopark.gov/files/sharedassets/public/item.pdf"
  );
  assert.equal(
    normalizeMenloParkAttachmentUrl(
      "https://cdn.menlopark.gov/files/sharedassets/public/item.PDF"
    ),
    "https://cdn.menlopark.gov/files/sharedassets/public/item.PDF"
  );
  assert.equal(normalizeMenloParkAttachmentUrl("http://www.menlopark.gov/files/sharedassets/item.pdf"), null);
  assert.equal(normalizeMenloParkAttachmentUrl("https://example.com/files/sharedassets/item.pdf"), null);
  assert.equal(normalizeMenloParkAttachmentUrl("https://www.menlopark.gov/subscribe"), null);
});

test("selects no more than twelve unique item attachments", () => {
  const items: DiscoveredAgendaItem[] = Array.from(
    { length: MENLO_PARK_ATTACHMENT_MAX_ITEMS + 4 },
    (_, index) => ({
      agendaNumber: `I${index + 1}`,
      title: `Item ${index + 1}`,
      rowText: `I${index + 1}. Item ${index + 1}`,
      pageNumber: 1,
      links: [
        {
          label: "Attachment",
          url: `https://www.menlopark.gov/files/sharedassets/public/i${index + 1}.pdf`
        }
      ]
    })
  );

  assert.equal(selectAgendaItemAttachments(items).length, MENLO_PARK_ATTACHMENT_MAX_ITEMS);
});

test("keeps every unique attachment for each selected agenda item", () => {
  const selected = selectAllAgendaItemAttachments([
    {
      agendaNumber: "H1",
      title: "Housing",
      rowText: "H1 Housing",
      pageNumber: 1,
      links: [
        { label: "Staff Report", url: "https://www.menlopark.gov/files/sharedassets/h1.pdf" },
        { label: "Exhibit A", url: "https://www.menlopark.gov/files/sharedassets/h1-a.pdf" }
      ]
    },
    {
      agendaNumber: "H1",
      title: "Housing",
      rowText: "H1 Housing",
      pageNumber: 2,
      links: [
        { label: "Exhibit B", url: "https://www.menlopark.gov/files/sharedassets/h1-b.pdf" }
      ]
    }
  ]);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].links.length, 3);
});

test("does not cap all-link Menlo Park discovery at the legacy twelve-item prompt limit", () => {
  const items = Array.from({ length: MENLO_PARK_ATTACHMENT_MAX_ITEMS + 4 }, (_, index) => ({
    agendaNumber: `H${index + 1}`,
    title: `Housing ${index + 1}`,
    rowText: `H${index + 1} Housing ${index + 1}`,
    pageNumber: 1,
    links: [{
      label: "Staff Report",
      url: `https://www.menlopark.gov/files/sharedassets/h${index + 1}.pdf`
    }]
  }));

  assert.equal(selectAllAgendaItemAttachments(items).length, items.length);
});

function meetingWithAttachments(
  documents: PrimeGovDocument[],
  jurisdictionSlug = "menlo-park"
): PrimeGovMeeting {
  return {
    externalId: "menlo-test-meeting",
    jurisdictionSlug,
    section: "Upcoming Meetings",
    title: "City Council",
    dateText: "July 14, 2026",
    meetingType: "City Council",
    rowText: "City Council July 14, 2026",
    hasHtmlAgenda: false,
    hasPdf: true,
    documents,
    items: documents.map((document, index) => ({
      externalId: `item-${index + 1}`,
      fileNumber: null,
      agendaNumber: `H${index + 1}`,
      itemType: null,
      title: `Presentation ${index + 1}`,
      action: null,
      result: null,
      sourceUrl: "https://www.menlopark.gov/files/sharedassets/public/agenda.pdf",
      rowText: `H${index + 1}. Presentation ${index + 1}`,
      attachments: [document]
    }))
  };
}

test("enriches associated attachments for every configured jurisdiction", async () => {
  for (const jurisdictionSlug of KNOWN_JURISDICTION_SLUGS) {
    const document: PrimeGovDocument = {
      type: "Attachment",
      label: `${jurisdictionSlug} supporting document`,
      url: `https://${jurisdictionSlug}.example/item-attachment.pdf`,
      extractedText: `${jurisdictionSlug} item-specific supporting evidence. `.repeat(20),
      agendaItemNumber: "H1"
    };

    const result = await appendAgendaItemAttachmentContext(
      meetingWithAttachments([document], jurisdictionSlug),
      "Base agenda text."
    );

    assert.equal(result.included, 1, jurisdictionSlug);
    assert.match(result.text, new RegExp(`${jurisdictionSlug} item-specific supporting evidence`));
  }
});

test("appends readable attachment text beneath only its named agenda item", async () => {
  const firstText = "Complete Streets details and project schedule. ".repeat(80);
  const secondText = "Caltrain service update and ridership context. ".repeat(80);
  const documents: PrimeGovDocument[] = [
    {
      type: "Attachment",
      label: "Staff Report #1",
      url: "https://www.menlopark.gov/files/sharedassets/public/h1.pdf",
      extractedText: firstText,
      isAgendaItemAttachment: true,
      agendaItemNumber: "H1"
    },
    {
      type: "Attachment",
      label: "Presentation",
      url: "https://www.menlopark.gov/files/sharedassets/public/h2.pdf",
      extractedText: secondText,
      isAgendaItemAttachment: true,
      agendaItemNumber: "H2"
    }
  ];

  const result = await appendAgendaItemAttachmentContext(
    meetingWithAttachments(documents),
    "Base agenda text remains first."
  );

  assert.equal(result.included, 2);
  assert.ok(result.text.startsWith("Base agenda text remains first."));
  assert.ok(result.text.length <= MAX_CHARS_FOR_LLM);
  const firstBlock = result.text.slice(
    result.text.indexOf("Agenda item H1"),
    result.text.indexOf("Agenda item H2")
  );
  const secondBlock = result.text.slice(result.text.indexOf("Agenda item H2"));
  assert.match(firstBlock, /Complete Streets details/);
  assert.doesNotMatch(firstBlock, /Caltrain service update/);
  assert.match(secondBlock, /Caltrain service update/);
});

test("keeps a shared supporting document associated with each named agenda item", async () => {
  const sharedDocument: PrimeGovDocument = {
    type: "Staff Report",
    label: "Shared Capital Program Staff Report",
    url: "https://city.example/shared-capital-program.pdf",
    extractedText: "The shared report contains separate evidence for both capital program items. ".repeat(12)
  };
  const meeting = meetingWithAttachments([sharedDocument], "san-mateo-county");
  meeting.items!.push({
    ...meeting.items![0],
    externalId: "item-2",
    agendaNumber: "H2",
    title: "Presentation 2",
    rowText: "H2. Presentation 2",
    attachments: [sharedDocument]
  });

  const result = await appendAgendaItemAttachmentContext(meeting, "Base agenda text.");

  assert.equal(result.included, 2);
  assert.equal(result.text.match(/Source URL: https:\/\/city\.example\/shared-capital-program\.pdf/g)?.length, 2);
  assert.match(result.text, /Agenda item H1/);
  assert.match(result.text, /Agenda item H2/);
});

test("does not displace a base agenda that already fills the LLM budget", async () => {
  const document: PrimeGovDocument = {
    type: "Attachment",
    label: "Staff Report",
    url: "https://www.menlopark.gov/files/sharedassets/public/h1.pdf",
    extractedText: "Supplemental context. ".repeat(100),
    isAgendaItemAttachment: true,
    agendaItemNumber: "H1"
  };
  const baseText = "A".repeat(MAX_CHARS_FOR_LLM - 200);
  const result = await appendAgendaItemAttachmentContext(
    meetingWithAttachments([document]),
    baseText
  );

  assert.equal(result.included, 0);
  assert.equal(result.text, baseText);
});

test("falls back to the next ranked attachment when a staff report has no usable text", async () => {
  const unreadableStaffReport: PrimeGovDocument = {
    type: "Staff Report",
    label: "Staff Report",
    url: "https://city.example/staff-report.pdf",
    extractedText: "Scanned",
    agendaItemNumber: "H1"
  };
  const readableExhibit: PrimeGovDocument = {
    type: "Exhibit",
    label: "Project Scope Exhibit",
    url: "https://city.example/project-scope.pdf",
    extractedText: "The project scope includes item-specific schedule and funding details. ".repeat(12),
    agendaItemNumber: "H1"
  };

  const meeting = meetingWithAttachments([unreadableStaffReport]);
  meeting.documents.push(readableExhibit);
  meeting.items![0].attachments = [readableExhibit, unreadableStaffReport];

  const result = await appendAgendaItemAttachmentContext(meeting, "Base agenda text.");

  assert.equal(result.included, 1);
  assert.match(result.text, /Linked document: Project Scope Exhibit/);
  assert.match(result.text, /item-specific schedule and funding details/);
  assert.doesNotMatch(result.text, /Linked document: Staff Report/);
});

test("malformed PDFs fail attachment discovery without producing page data", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "simplecity-pdf-"));
  const file = path.join(directory, "invalid.pdf");
  await fs.writeFile(file, "not a PDF");

  await assert.rejects(() => extractAgendaPdfPages(file));
});
