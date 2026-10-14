"use client";

import { HeartPulse, House, Landmark, Receipt, Vote } from "lucide-react";
import { BallotMeasureCard } from "@/components/BallotMeasureCard";
import type { Locale } from "@/lib/i18n";
import { officialPropositionUrl, type Proposition } from "@/lib/elections/california2026";

const GROUP_ICONS = {
  housing: House,
  taxes: Receipt,
  voting: Vote,
  health: HeartPulse
} as const;

export function PropositionCard({
  prop,
  groupId,
  groupLabel,
  locale
}: {
  prop: Proposition;
  groupId: keyof typeof GROUP_ICONS;
  groupLabel: string;
  locale: Locale;
}) {
  const es = locale === "es";
  const origin =
    prop.origin === "legislature"
      ? es ? "Incluida por la Legislatura" : "Placed by the Legislature"
      : es ? "Incluida por firmas de una petición" : "Placed by petition signatures";

  return (
    <BallotMeasureCard
      anchorId={`prop-${prop.number}`}
      eyebrow={[es ? "Propuesta estatal" : "Statewide proposition", "California", origin]}
      heading={`${es ? "Propuesta" : "Prop"} ${prop.number}: ${prop.title[locale]}`}
      summary={prop.summary[locale]}
      yes={prop.yes[locale]}
      no={prop.no[locale]}
      cost={prop.cost[locale]}
      debate={prop.debate?.[locale]}
      topic={{ icon: GROUP_ICONS[groupId] || Landmark, label: groupLabel }}
      officialUrl={officialPropositionUrl(prop.number, locale)}
      officialLabel={es ? "Guía oficial" : "Official guide"}
      locale={locale}
    />
  );
}
