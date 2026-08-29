import assert from "node:assert/strict";
import test from "node:test";
import {
  getJurisdictionDisplayLabel,
  getJurisdictionLabel
} from "../lib/config/jurisdictions";
import {
  formatCompactDisplayDate,
  formatDisplayDate,
  formatPacificTimestamp
} from "../lib/utils/date";

test("a Spanish reader gets Spanish month names and clock format", () => {
  assert.equal(formatDisplayDate("June 13, 2026", "2026-06-13T07:00:00.000Z"), "Jun 13, 2026");
  assert.equal(
    formatDisplayDate("June 13, 2026", "2026-06-13T07:00:00.000Z", null, "es"),
    "13 jun 2026"
  );
  assert.match(formatDisplayDate("June 13, 2026", "2026-06-13T17:00:00.000Z", null, "es"), /10:00/);
  assert.equal(
    formatCompactDisplayDate("June 13, 2026", "2026-06-13T07:00:00.000Z", "es"),
    "13 jun"
  );
  assert.match(formatPacificTimestamp("2026-06-13T17:00:00.000Z", "es") || "", /jun.*PT$/);
});

test("a missing date reads as missing in the reader's language", () => {
  assert.equal(formatDisplayDate(null, null), "Date not listed");
  assert.equal(formatDisplayDate(null, null, null, "es"), "Fecha no indicada");
  assert.equal(formatCompactDisplayDate(null, null, "es"), "Fecha no indicada");
});

test("only the translatable part of a jurisdiction name is translated", () => {
  assert.equal(getJurisdictionDisplayLabel("san-mateo-county"), "San Mateo County");
  assert.equal(getJurisdictionDisplayLabel("san-mateo-county", "es"), "Condado de San Mateo");
  assert.equal(getJurisdictionDisplayLabel("santa-barbara-county", "es"), "Condado de Santa Bárbara");
  assert.equal(
    getJurisdictionDisplayLabel("los-altos-school-district", "es"),
    "Distrito Escolar de Los Altos"
  );
  assert.equal(getJurisdictionDisplayLabel("all", "es"), "Todos");

  // City names are proper nouns and stay put, including the public "san-mateo" alias.
  assert.equal(getJurisdictionDisplayLabel("menlo-park", "es"), "Menlo Park");
  assert.equal(getJurisdictionDisplayLabel("san-mateo", "es"), "San Mateo");
});

test("the page-level jurisdiction label tracks the same translations", () => {
  // Headings, page titles, and the picker must not disagree with each other.
  assert.equal(getJurisdictionLabel("san-mateo-county", "es"), "Condado de San Mateo");
  assert.equal(getJurisdictionLabel("san-mateo-county"), "San Mateo County");
  assert.equal(getJurisdictionLabel("all", "es"), "Todos");
  assert.equal(getJurisdictionLabel("mountain-view", "es"), "Mountain View");
});
