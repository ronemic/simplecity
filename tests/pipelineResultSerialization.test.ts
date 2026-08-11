import assert from "node:assert/strict";
import test from "node:test";
import { serializePipelineResult } from "@/lib/pipelineResultSerialization";

test("pipeline result files omit bulky source text but retain useful metadata", () => {
  const serialized = serializePipelineResult({
    status: "success",
    meetings: [
      {
        title: "City Council",
        llmInputText: "full AI input",
        htmlAgendaText: "full HTML agenda",
        detailText: "full detail page",
        publicCommentsInputText: "full submissions",
        documents: [
          {
            url: "https://example.gov/agenda.pdf",
            bytes: 150_000_000,
            extractionCharacterCount: 900_000,
            extractedText: "full extracted PDF"
          }
        ]
      }
    ]
  });

  const parsed = JSON.parse(serialized) as {
    status: string;
    meetings: Array<Record<string, unknown> & {
      documents: Array<Record<string, unknown>>;
    }>;
  };

  assert.equal(parsed.status, "success");
  assert.equal(parsed.meetings[0].title, "City Council");
  assert.equal(parsed.meetings[0].llmInputText, undefined);
  assert.equal(parsed.meetings[0].htmlAgendaText, undefined);
  assert.equal(parsed.meetings[0].detailText, undefined);
  assert.equal(parsed.meetings[0].publicCommentsInputText, undefined);
  assert.deepEqual(parsed.meetings[0].documents[0], {
    url: "https://example.gov/agenda.pdf",
    bytes: 150_000_000,
    extractionCharacterCount: 900_000
  });
});
