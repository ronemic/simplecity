import assert from "node:assert/strict";
import test from "node:test";
import {
  findLlmInputBlockForCard,
  parseLlmInputItemBlocks,
  parseMeetingWideContext
} from "@/lib/utils/llmInputItems";

// Shape produced by formatAgendaItemContexts, as stored in meetings.llm_input_text.
const INPUT = [
  "Current agenda and meeting-wide participation context:",
  "",
  "CITY OF FOSTER CITY ... public comment instructions ...",
  "",
  "Current meeting agenda items (use each block only for its named item):",
  "",
  [
    "Source item ID: city-council-item-3",
    "Agenda item 3",
    "Official title: PUBLIC",
    "Agenda section: ROLL CALL",
    "Recommended action: Not listed in the source document.",
    "Item context: Agenda section: ROLL CALL. 3 PUBLIC Members of the public wishing to address the Council may do so.",
    "Official source: https://example.gov/item3"
  ].join("\n"),
  "",
  [
    "Source item ID: city-council-item-7",
    "Agenda item 7A",
    "Official title: Amendment No. 2 to the agreement with Thermal Mechanical Inc. for citywide HVAC repair",
    "Agenda section: CONSENT CALENDAR",
    "Recommended action: Authorize the Mayor to execute the amendment.",
    "Item context: Staff recommends a $50,000 amendment with total annual spending not to exceed $200,000.",
    "Linked supporting-report context: The project is categorically exempt from CEQA.",
    "Official source: https://example.gov/item7"
  ].join("\n")
].join("\n");

test("agenda item blocks are parsed out of the stored model input", () => {
  const blocks = parseLlmInputItemBlocks(INPUT);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].sourceItemId, "city-council-item-3");
  assert.equal(blocks[0].agendaNumber, "3");
  assert.equal(blocks[1].sourceItemId, "city-council-item-7");
  assert.equal(blocks[1].agendaNumber, "7A");
  assert.match(String(blocks[1].officialTitle), /Thermal Mechanical/);
  assert.match(String(blocks[1].itemContext), /not to exceed \$200,000/);
  // The block must carry its linked report text, or grounded details read as invented.
  assert.match(blocks[1].text, /categorically exempt from CEQA/);
});

test("text without item blocks yields nothing rather than guessing", () => {
  assert.deepEqual(parseLlmInputItemBlocks("just some agenda prose"), []);
  assert.deepEqual(parseLlmInputItemBlocks(null), []);
});

test("a card is scoped by its stored source item id", () => {
  const blocks = parseLlmInputItemBlocks(INPUT);
  const found = findLlmInputBlockForCard(blocks, {
    sourceItemId: "city-council-item-7",
    agendaItem: "Approve $50,000 HVAC contract amendment"
  });
  assert.equal(found?.sourceItemId, "city-council-item-7");
});

test("a card without a source item id falls back to title similarity", () => {
  const blocks = parseLlmInputItemBlocks(INPUT);
  const found = findLlmInputBlockForCard(blocks, {
    sourceItemId: null,
    agendaItem: "Amendment No. 2 to the agreement with Thermal Mechanical Inc. for citywide HVAC repair"
  });
  assert.equal(found?.sourceItemId, "city-council-item-7");
});

test("an unrelated card matches no block instead of the nearest one", () => {
  const blocks = parseLlmInputItemBlocks(INPUT);
  assert.equal(
    findLlmInputBlockForCard(blocks, {
      sourceItemId: "not-in-this-meeting",
      agendaItem: "Rezone the Gilead campus for biotechnology uses"
    }),
    null
  );
});

test("a block trimmed by the meeting-level budget is marked incomplete", () => {
  const blocks = parseLlmInputItemBlocks(INPUT);
  // Both fixture blocks end with their Official source line.
  assert.deepEqual(blocks.map((block) => block.isComplete), [true, true]);

  const trimmed = INPUT.slice(0, INPUT.indexOf("Linked supporting-report context"));
  const trimmedBlocks = parseLlmInputItemBlocks(trimmed);
  assert.equal(trimmedBlocks[trimmedBlocks.length - 1].isComplete, false);
});

test("meeting-wide participation context is separated from the item blocks", () => {
  const context = parseMeetingWideContext(INPUT);
  assert.match(String(context), /public comment instructions/);
  // It must not bleed item text in, or per-item grounding becomes meaningless.
  assert.ok(!String(context).includes("Thermal Mechanical"));
  assert.equal(parseMeetingWideContext(null), null);
});
