import assert from "node:assert/strict";
import test from "node:test";
import { stripRunningPageLines } from "@/lib/scraper/ocr";

const footer = (page: number) =>
  `Minutes are DRAFT and will be approved at the Board meeting on September 14, 2026 ${page}`;

test("running page footers and page numbers are removed from OCR'd minutes", () => {
  // Real shape from los-altos-school-district scanned minutes.
  const pages = [
    `Regular Meeting of the Board of Trustees\nMotion made by: Stella Kam\nMotion seconded by: Bryan Johnson\n${footer(1)}`,
    `Voting results: Unanimously approved\nYes: Vaishali Sirkay, Brandon Stroy\n\nE. CONSENT CALENDAR\n${footer(2)}`,
    `Voting results: Unanimously approved\nYes: Vaishali Sirkay, Brandon Stroy\n\nG. COMMUNITY COMMENTS\n${footer(3)}\n4`
  ];
  const stripped = stripRunningPageLines(pages).join("\n");

  assert.ok(!/Minutes are DRAFT/.test(stripped));
  assert.ok(!/^4$/m.test(stripped));
  // Repeated body lines are not page furniture.
  assert.equal(stripped.match(/Voting results: Unanimously approved/g)?.length, 2);
  assert.ok(stripped.includes("Motion seconded by: Bryan Johnson"));
});

test("short documents keep lines that merely repeat on two pages", () => {
  const pages = ["Board of Trustees\nItem one approved", "Board of Trustees\nItem two approved"];
  assert.deepEqual(stripRunningPageLines(pages), pages);
});
