import assert from "node:assert/strict";
import test from "node:test";
import { areLikelySameAgendaItem } from "../lib/utils/agendaItemIdentity";

const duplicatePairs = [
  ["Canopy informational presentation", "Receive Canopy informational presentation"],
  ["Recology informational presentation", "Receive Recology informational presentation"],
  ["General Capital Improvement Program (CIP) project updates", "Get general CIP project updates"],
  ["Draft PWTC Work Plan framework presentation", "Review Draft PWTC Work Plan framework"],
  ["Award design services contract for EPASD CIP 1.1 & 1.2", "Award contract for EPASD design services CIP 1.1 & 1.2"],
  ["Draft Workplan for EPASD Advisory Committee", "Ad Hoc Committee Draft Workplan discussion"]
] as const;

for (const [older, newer] of duplicatePairs) {
  test(`recognizes reworded agenda item: ${older}`, () => {
    assert.equal(areLikelySameAgendaItem(older, newer), true);
  });
}

test("does not merge minutes from different dates", () => {
  assert.equal(
    areLikelySameAgendaItem(
      "Approve April 27, 2026 Planning Commission minutes",
      "Approve May 11, 2026 Planning Commission minutes"
    ),
    false
  );
});

test("does not merge presentations from different organizations", () => {
  assert.equal(
    areLikelySameAgendaItem(
      "Receive Canopy informational presentation",
      "Receive Recology informational presentation"
    ),
    false
  );
});

test("does not merge distinct contracts with similar wording", () => {
  assert.equal(
    areLikelySameAgendaItem(
      "Approve park maintenance contract",
      "Approve library maintenance contract"
    ),
    false
  );
  assert.equal(
    areLikelySameAgendaItem(
      "Approve housing consultant contract",
      "Approve transportation consultant contract"
    ),
    false
  );
});

test("does not merge projects with different agenda numbers", () => {
  assert.equal(
    areLikelySameAgendaItem(
      "Award design contract for sewer project 1.1",
      "Award design contract for sewer project 1.2"
    ),
    false
  );
});
