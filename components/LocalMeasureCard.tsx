"use client";

import { FileText, Landmark, MessageSquare, Receipt, ScrollText } from "lucide-react";
import { BallotMeasureCard } from "@/components/BallotMeasureCard";
import type { Locale } from "@/lib/i18n";
import type { LocalMeasure } from "@/lib/elections/local2026";

const KINDS = {
  tax: { icon: Receipt, en: "Tax", es: "Impuesto" },
  bond: { icon: Landmark, en: "Bond", es: "Bono" },
  charter: { icon: ScrollText, en: "Charter amendment", es: "Enmienda a los estatutos" },
  ordinance: { icon: FileText, en: "Ordinance", es: "Ordenanza" },
  initiative: { icon: FileText, en: "Citizen initiative", es: "Iniciativa ciudadana" },
  advisory: { icon: MessageSquare, en: "Advisory vote", es: "Voto consultivo" }
} as const;

const SCOPES = {
  city: { en: "City measure", es: "Medida de la ciudad" },
  county: { en: "County measure", es: "Medida del condado" },
  regional: { en: "Regional measure", es: "Medida regional" },
  school: { en: "School or college measure", es: "Medida escolar o universitaria" },
  special: { en: "Special district measure", es: "Medida de distrito especial" }
} as const;

const THRESHOLDS = {
  majority: { en: "Passes with a majority", es: "Se aprueba por mayoría" },
  "fifty-five": { en: "Needs 55% to pass", es: "Necesita el 55 % para aprobarse" },
  "two-thirds": { en: "Needs two-thirds to pass", es: "Necesita dos tercios para aprobarse" }
} as const;

function placementDate(date: string, locale: Locale) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale === "es" ? "es-US" : "en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  });
}

export function LocalMeasureCard({
  measure,
  placementHref,
  placeLabel,
  locale
}: {
  measure: LocalMeasure;
  /** Set only when the placement decision card still resolves. */
  placementHref?: string;
  /** The covered place this view is for, used in the partial-coverage note. */
  placeLabel?: string;
  locale: Locale;
}) {
  const es = locale === "es";
  const kind = KINDS[measure.kind];
  // San Francisco calls its local measures propositions; everywhere else they are measures.
  const prefix = measure.appearsIn.includes("san-francisco")
    ? es ? "Propuesta" : "Prop"
    : es ? "Medida" : "Measure";
  const eyebrow = [SCOPES[measure.scope][locale], measure.body[locale]];
  if (measure.placedBy === "petition") {
    eyebrow.push(es ? "Incluida por firmas de una petición" : "Placed by petition signatures");
  }
  const placement =
    placementHref && measure.placement
      ? {
          href: placementHref,
          label:
            measure.placedBy === "petition"
              ? es
                ? `${measure.placement.body.es}: acción del ${placementDate(measure.placement.date, locale)}`
                : `${measure.placement.body.en} action, ${placementDate(measure.placement.date, locale)}`
              : es
                ? `${measure.placement.body.es}: voto del ${placementDate(measure.placement.date, locale)}`
                : `${measure.placement.body.en} vote, ${placementDate(measure.placement.date, locale)}`
        }
      : undefined;

  return (
    <BallotMeasureCard
      anchorId={`measure-${measure.id}`}
      eyebrow={eyebrow}
      heading={
        measure.letter
          ? `${prefix} ${measure.letter}: ${measure.title[locale]}`
          : measure.title[locale]
      }
      summary={measure.summary[locale]}
      yes={measure.yes[locale]}
      no={measure.no[locale]}
      cost={measure.cost?.[locale]}
      debate={measure.debate?.[locale]}
      threshold={THRESHOLDS[measure.threshold][locale]}
      scopeNote={
        measure.allAddresses
          ? undefined
          : es
            ? `Solo en algunas boletas${placeLabel ? ` de ${placeLabel}` : ""}. Revise su boleta de muestra.`
            : `Only on some ballots${placeLabel ? ` in ${placeLabel}` : ""}. Check your sample ballot.`
      }
      topic={{ icon: kind.icon, label: kind[locale] }}
      officialUrl={measure.officialUrl}
      officialLabel={es ? "Fuente oficial" : "Official source"}
      placement={placement}
      locale={locale}
    />
  );
}
