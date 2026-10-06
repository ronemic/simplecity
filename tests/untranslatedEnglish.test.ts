import assert from "node:assert/strict";
import test from "node:test";
import {
  looksUntranslatedEnglish,
  untranslatedEnglishCardFields
} from "@/lib/i18n/untranslatedEnglish";
import {
  officialSourceFallbackExplanation,
  officialSourceFallbackReason
} from "@/lib/utils/summaryFallback";

test("flags Spanish fields that were left in English", () => {
  assert.equal(
    looksUntranslatedEnglish(
      "The board approved the appointment of Manisha Davesar to the San Mateo County Arts Commission."
    ),
    true
  );
  assert.equal(looksUntranslatedEnglish("5:00 p.m. on the day prior to the meeting"), true);
  // Legacy fallback cards quote the English agenda text inside Spanish copy.
  assert.equal(
    looksUntranslatedEnglish(
      "La agenda oficial incluye “Approve delegation of authority to the County Executive, or designee, to negotiate the agreement”"
    ),
    true
  );
});

test("does not flag Spanish that preserves English proper names", () => {
  assert.equal(
    looksUntranslatedEnglish(
      "La Junta aprobó el nombramiento de Jade Howard a la Board of Supervisors for the County of San Mateo."
    ),
    false
  );
  assert.equal(
    looksUntranslatedEnglish("Reconocimiento de Calificación 4.0 para Hillsdale High School"),
    false
  );
  assert.equal(looksUntranslatedEnglish("Friends of the Library"), false);
});

test("reports English fields in both stored and LLM card translation shapes", () => {
  assert.deepEqual(
    untranslatedEnglishCardFields({
      agendaItem: "Nombrar a Manisha Davesar a la Comisión de Artes",
      whatIsHappening: ["The board approved the appointment for a term ending June 30, 2029."],
      status: "Passed",
      commentWindow: { opens: "No indicado en el documento fuente.", closes: "until 4 p.m. the day of the meeting" }
    }),
    ["whatIsHappening", "commentWindow.closes"]
  );
  assert.deepEqual(
    untranslatedEnglishCardFields({
      agenda_item: "Aprobar el contrato de mantenimiento del parque",
      why_it_matters: "El contrato afecta el mantenimiento de los parques de la ciudad."
    }),
    []
  );
});

test("Spanish fallback explanations are recognized as fallback cards", () => {
  for (const reason of ["validation_failed", "generation_failed", "summary_omitted", "legacy"] as const) {
    assert.equal(officialSourceFallbackReason(officialSourceFallbackExplanation(reason, "es")), reason);
    assert.equal(officialSourceFallbackReason(officialSourceFallbackExplanation(reason, "en")), reason);
  }
});
