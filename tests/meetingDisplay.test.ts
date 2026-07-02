import assert from "node:assert/strict";
import test from "node:test";
import { displayDocumentLabel, displayDocumentType } from "@/lib/utils/documentDisplay";
import { displayMeetingText, displayMeetingTitle, displayMeetingType } from "@/lib/utils/meetingDisplay";

test("meeting labels strip repetitive not applicable text and recover the body name", () => {
  const noisy =
    "BOARD OF SUPERVISORS 500 County Center Chambers, 1st Fl. SPECIAL MEETING OF THE BOARD OF SUPERVISORS https://smcgov.zoom.us/j/86130548317 Not applicable Not applicable Not applicable";

  assert.equal(displayMeetingTitle({ title: noisy, meeting_type: noisy }), "Board of Supervisors");
  assert.equal(displayMeetingType({ title: noisy, meeting_type: noisy }), "Board of Supervisors");
});

test("meeting label helper falls back cleanly when the label is only noise", () => {
  assert.equal(displayMeetingText("Not applicable Not applicable"), "Not listed");
});

test("meeting labels translate known civic bodies in Spanish", () => {
  assert.equal(
    displayMeetingTitle(
      {
        title: "Government Audit and Oversight Committee",
        meeting_type: "Government Audit and Oversight Committee"
      },
      "Reunión no indicada",
      "es"
    ),
    "Comité de Auditoría y Supervisión Gubernamental"
  );
  assert.equal(
    displayMeetingType(
      {
        title: "Budget and Finance Committee",
        meeting_type: "Budget and Appropriations Committee"
      },
      "Tipo de reunión no indicado",
      "es"
    ),
    "Comité de Presupuesto y Apropiaciones"
  );
});

test("document labels translate official document names in Spanish", () => {
  assert.equal(displayDocumentType({ type: "Captions", label: "Transcript" }, "es"), "Subtítulos");
  assert.equal(displayDocumentLabel({ type: "Captions", label: "Transcript" }, "es"), "Transcripción");
  assert.equal(displayDocumentType({ type: "media", label: "video" }, "es"), "Grabación");
  assert.equal(displayDocumentLabel({ type: "media", label: "video" }, "es"), "Video");
  assert.equal(displayDocumentLabel({ type: "media", label: "Download" }, "es"), "Descarga");
});
