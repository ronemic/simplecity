import assert from "node:assert/strict";
import test from "node:test";
import { getCommentDeadlineInfo, hasCommentOptionInfo } from "@/lib/utils/commentDeadline";

test("Spanish missing source text is not treated as a comment deadline", () => {
  const info = getCommentDeadlineInfo({
    closes: "No indicado en el documento fuente.",
    actionTexts: ["No indicado en el documento fuente."]
  });

  assert.equal(info, null);
});

test("Spanish not-applicable text is not treated as a comment option", () => {
  assert.equal(
    hasCommentOptionInfo({
      closes: "No indicado en el documento fuente.",
      actionTexts: ["No aplica."]
    }),
    false
  );
});
