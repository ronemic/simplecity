import assert from "node:assert/strict";
import test from "node:test";
import { classifyLegistarLink } from "@/lib/sources/legistar";

test("classifies Mountain View Legistar document labels by visible text first", () => {
  assert.equal(
    classifyLegistarLink(
      "Accessible Agenda",
      "https://mountainview.legistar.com/View.ashx?M=A&ID=1&GUID=abc"
    ),
    "Accessible Agenda"
  );
  assert.equal(
    classifyLegistarLink(
      "Agenda Packet",
      "https://mountainview.legistar.com/View.ashx?M=A&ID=1&GUID=abc"
    ),
    "Agenda Packet"
  );
  assert.equal(
    classifyLegistarLink(
      "Meeting Cancellation Notice",
      "https://mountainview.legistar.com/View.ashx?M=A&ID=1&GUID=abc"
    ),
    "Notice of Cancellation"
  );
  assert.equal(
    classifyLegistarLink(
      "",
      "https://mountainview.legistar.com/View.ashx?M=A&ID=1&GUID=abc"
    ),
    "Document"
  );
});
