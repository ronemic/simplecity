import assert from "node:assert/strict";
import test from "node:test";
import { isSectionTitle } from "../lib/scraper/agendaItemContext";

// CivicClerk builds agenda items from whatever the portal marks as a list
// subheader. Unlike the PDF-extraction path, nothing upstream has already
// rejected section headings, so normalizeFilesPage applies isSectionTitle
// itself. Los Altos and Los Altos Hills publish only numbered items today —
// this guards the case where a portal starts emitting bare section headings.

test("bare section headings would be rejected as CivicClerk agenda items", () => {
  const sectionHeadings = [
    "Consent Calendar",
    "Public Hearings",
    "New Business",
    "Old Business",
    "Presentations",
    "Study Session",
    "Written Communications",
    "Adjournment"
  ];

  for (const heading of sectionHeadings) {
    assert.equal(isSectionTitle(heading), true, `expected section heading: ${heading}`);
  }
});

test("real Los Altos and Los Altos Hills headings are kept", () => {
  // Verified live against losaltosca / losaltoshillsca CivicClerk portals.
  const realHeadings = [
    "1. Approval of Meeting Minutes - Special and Regular Meeting of June 23, 2026",
    "3. Adoption of Resolution - Agreement with ADP Workforce Now",
    "12. Receive Report - Draft General Plan Vision and Guiding Principles",
    "2. D23-0009 and TM23-0002 – Octane First Street, LLC - 349 First Street",
    "A. Resolution to Authorize the City Manager to Submit Payment to the Santa Clara County Office of the Sheriff",
    "B. Receive Update On Negotiations Of The Law Enforcement Agreement",
    "07-14-2026 Written Public Comments"
  ];

  for (const heading of realHeadings) {
    assert.equal(isSectionTitle(heading), false, `expected kept: ${heading}`);
  }
});
