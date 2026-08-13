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
