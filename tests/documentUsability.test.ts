import assert from "node:assert/strict";
import test from "node:test";
import { isUsableOfficialSourceText } from "@/lib/scraper/documentUsability";

test("rejects Incapsula block pages as official source text", () => {
  assert.equal(
    isUsableOfficialSourceText(
      "Request unsuccessful. Incapsula incident ID: 396000330191921606-200584713734981742"
    ),
    false
  );
});

test("portal meeting availability is metadata rather than official agenda text", () => {
  assert.equal(isUsableOfficialSourceText("County assessment appeals board navigation. The meeting is not available."), false);
  assert.equal(isUsableOfficialSourceText("The proposed library contract is available for public review at the clerk's office."), true);
});
