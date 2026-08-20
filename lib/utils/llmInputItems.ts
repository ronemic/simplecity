import { agendaItemSimilarity } from "@/lib/utils/agendaItemIdentity";

/**
 * The meeting's stored `llm_input_text` is the exact text the summary model saw,
 * laid out as one block per agenda item by `formatAgendaItemContexts`. Auditing a
 * card against the block it was generated from is the only way to tell an
 * invented detail apart from one the auditor simply failed to retrieve.
 */
export type LlmInputItemBlock = {
  sourceItemId: string | null;
  agendaNumber: string | null;
  officialTitle: string | null;
  itemContext: string | null;
  text: string;
  /**
   * The meeting-level input is assembled under a global character budget, so
   * blocks get trimmed when a meeting has many items. The per-batch input the
   * summary model actually receives is assembled with no budget, so only an
   * untrimmed block is byte-identical to what the model saw -- and only then can
   * a detail missing from it be called invented.
   */
  isComplete: boolean;
};

const BLOCK_SEPARATOR = /\n\n(?=Source item ID: )/;
const ITEMS_HEADING = "Current meeting agenda items (use each block only for its named item):";
const MIN_TITLE_SIMILARITY = 0.6;

function field(block: string, label: string) {
  const match = block.match(
    new RegExp(`^${label}:[ \\t]*([\\s\\S]*?)(?=\\n[A-Z][A-Za-z -]*:|$)`, "m")
  );
  const value = match?.[1]?.replace(/\s+/g, " ").trim() || "";
  if (!value || value === "Not available" || value === "Not listed in the source document.") {
    return null;
  }
  return value;
}

export function parseLlmInputItemBlocks(llmInputText: string | null | undefined) {
  const text = String(llmInputText || "");
  if (!text.includes("Source item ID: ")) return [];

  return text
    .split(BLOCK_SEPARATOR)
    .filter((block) => block.startsWith("Source item ID: "))
    .map((block): LlmInputItemBlock => ({
      sourceItemId: field(block, "Source item ID"),
      agendaNumber: block.match(/^Agenda item[ \t]+(.+)$/m)?.[1]?.trim() || null,
      officialTitle: field(block, "Official title"),
      itemContext: field(block, "Item context"),
      text: block.trim(),
      // The trailing "Official source:" line is the last field emitted, so it
      // survives only when the block was not trimmed to fit the budget.
      isComplete: /\nOfficial source: \S/.test(block)
    }));
}

/**
 * Prefers the stored source item id, which is what the pipeline itself keys
 * cards to. Title similarity is the fallback because published card titles are
 * rewritten in plain language and rarely match the official title verbatim.
 */
export function findLlmInputBlockForCard(
  blocks: LlmInputItemBlock[],
  card: { sourceItemId?: string | null; agendaItem?: string | null }
) {
  if (blocks.length === 0) return null;

  const sourceItemId = card.sourceItemId?.trim();
  if (sourceItemId) {
    const exact = blocks.find((block) => block.sourceItemId === sourceItemId);
    if (exact) return exact;
  }

  const title = card.agendaItem?.trim();
  if (!title) return null;

  let best: { block: LlmInputItemBlock; score: number } | null = null;
  for (const block of blocks) {
    const candidate = block.officialTitle || block.itemContext;
    if (!candidate) continue;
    const score = Math.max(
      agendaItemSimilarity(title, candidate),
      block.itemContext ? agendaItemSimilarity(title, block.itemContext.slice(0, 600)) : 0
    );
    if (!best || score > best.score) best = { block, score };
  }

  return best && best.score >= MIN_TITLE_SIMILARITY ? best.block : null;
}

/**
 * The participation and attendance text that precedes the item blocks. Cards
 * draw their how-to-act and comment-window fields from here, so an auditor that
 * sees only one item block will wrongly call those details invented.
 */
export function parseMeetingWideContext(llmInputText: string | null | undefined) {
  const text = String(llmInputText || "");
  const headingIndex = text.indexOf(ITEMS_HEADING);
  const head = headingIndex >= 0 ? text.slice(0, headingIndex) : text;
  return head.replace(/\s+/g, " ").trim() || null;
}
