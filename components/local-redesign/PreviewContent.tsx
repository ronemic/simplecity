import { ArrowRight, ArrowUpRight, Search } from "lucide-react";
import Image from "next/image";
import Link, { SiteForm } from "@/components/SiteNavigation";
import { CardShareActions } from "@/components/CardShareActions";
import { FollowButton } from "@/components/FollowButton";
import { SubscribeForm } from "@/components/SubscribeForm";
import {
  getJurisdictionDisplayLabel, getPublicJurisdictionOptions, toPublicJurisdictionSlug,
  type JurisdictionSelection
} from "@/lib/config/jurisdictions";
import { ALL_CATEGORIES, CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import { publicEmailJurisdictionOptions } from "@/lib/email/subscriptions";
import { categoryShortLabel, t, type Locale } from "@/lib/i18n";
import type { MeetingRow, SummaryCardRow } from "@/lib/types";
import { cardSharePath } from "@/lib/utils/cardShare";
import { publicAgendaTitle } from "@/lib/utils/civicPriority";
import { hasCommentOptionInfo } from "@/lib/utils/commentDeadline";
import { civicCalendarDay, formatCompactDisplayDate, hasDisplayableMeetingTime, isUpcomingMeetingDate, meetingClockTime } from "@/lib/utils/date";
import { displayMeetingTitle } from "@/lib/utils/meetingDisplay";
import { normalizeSummaryPoints } from "@/lib/utils/summaryPoints";

export const donationUrl = "https://hcb.hackclub.com/donations/start/simplecity";

export function previewHref(path: string, options: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function previewTopicLabel(locale: Locale, category: CategoryName) {
  if (locale === "en" && category === "City Services") return "Public Services";
  if (locale === "en" && category === "Business & Development") return "Business";
  return categoryShortLabel(locale, category);
}

export function PreviewLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link className="redesign-link" href={href}>{children}<ArrowRight size={15} aria-hidden /></Link>;
}

export function PreviewSearch({ locale, jurisdiction, search, action = "/decisions", category }: {
  locale: Locale; jurisdiction: JurisdictionSelection; search?: string; action?: string; category?: string;
}) {
  const spanish = locale === "es";
  const options = getPublicJurisdictionOptions();
  const meetingSearch = action === "/meetings";
  return (
<SiteForm className="redesign-search" action={action}>
      <input type="hidden" name="lang" value={locale} />
      {category ? <input type="hidden" name="category" value={category} /> : null}
      <label className="redesign-search-input">
        <span className="sr-only">{meetingSearch ? t(locale, "searchMeetings") : t(locale, "decisions")}</span>
        <Search size={19} aria-hidden />
        <input key={search} name="q" type="search" defaultValue={search} placeholder={meetingSearch
          ? t(locale, "searchMeetings")
          : spanish ? 'Busca decisiones, p. ej. "vivienda"' : 'Search decisions, e.g. "housing"'} />
      </label>
      <label>
        <span className="sr-only">{spanish ? "Ciudad o condado" : "City or county"}</span>
        <select key={jurisdiction} name="jurisdiction" defaultValue={toPublicJurisdictionSlug(jurisdiction)}>
          <option value="all">{spanish ? "Todas las ciudades y condados" : "All cities & counties"}</option>
          {options.filter((option) => option.slug !== "all").map((option) => (
            <option key={option.slug} value={option.slug}>{getJurisdictionDisplayLabel(option.slug, locale)}</option>
          ))}
        </select>
      </label>
      <button className="redesign-button" type="submit">{spanish ? "Buscar" : "Search"}</button>
    </SiteForm>
  );
}

export function PreviewSectionTitle({ title, note }: { title: string; note?: string }) {
  return <div className="redesign-section-title"><h2>{title}</h2>{note ? <p>{note}</p> : null}</div>;
}

export function PreviewDecisionList({ cards, locale, jurisdiction, featured = false }: {
  cards: SummaryCardRow[]; locale: Locale; jurisdiction: JurisdictionSelection; featured?: boolean;
}) {
  const spanish = locale === "es";
  if (!cards.length) return <p className="redesign-empty">{t(locale, "noMatchingDecisions")}</p>;
  return (
    <div className="redesign-decisions">
      {cards.map((card, index) => {
        const title = publicAgendaTitle(card);
        const topic = ALL_CATEGORIES.find((category) => card.category_tags?.includes(category));
        const meeting = card.meetings;
        const source = card.source_url || meeting?.source_url;
        const detailHref = cardSharePath(card.id);
        const date = meeting ? formatCompactDisplayDate(meeting.date_text, meeting.meeting_datetime, locale) : null;
        const points = normalizeSummaryPoints(card.what_is_happening_points?.length ? card.what_is_happening_points : card.what_is_happening);
        const area = card.jurisdiction_slug || meeting?.jurisdiction_slug;
        const areaName = area ? getJurisdictionDisplayLabel(area, locale) : card.jurisdiction_name;
        const hasComment = meeting && isUpcomingMeetingDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text)
          && hasCommentOptionInfo({ closes: card.comment_window_closes, actionTexts: [card.how_to_act_submit_comment, card.how_to_act_email] });

        return (
          <article className={`redesign-decision${featured && index === 0 ? " redesign-decision-featured" : ""}`} key={card.id}>
            {topic ? <Link className="redesign-eyebrow" href={previewHref("/decisions", { category: CATEGORY_DEFINITIONS[topic].slug, jurisdiction: toPublicJurisdictionSlug(jurisdiction) })}>{previewTopicLabel(locale, topic)}</Link> : null}
            <h3><Link href={detailHref}>{title}</Link></h3>
            <div className="redesign-meta">
              {areaName ? <strong>{areaName}</strong> : null}
              {meeting ? <span>{displayMeetingTitle(meeting, "", locale)}</span> : null}
              {date ? <span>{date}</span> : null}
              {hasComment ? <span className="redesign-badge">{spanish ? "Opciones para comentar" : "Comment options"}</span> : null}
            </div>
            <details className="redesign-summary">
              <summary>{spanish ? "Leer resumen" : "Read summary"}</summary>
              <div className="redesign-summary-content">
                {points.length > 0 ? <ul>{points.map((point, index) => <li key={index}>{point}</li>)}</ul> : null}
                {card.why_it_matters ? <p>{card.why_it_matters}</p> : null}
                <PreviewLink href={detailHref}>{spanish ? "Ver decisión completa" : "View full decision"}</PreviewLink>
              </div>
            </details>
            <div className="redesign-row-actions">
              <FollowButton cardId={card.id} title={title} locale={locale} />
              <CardShareActions cardId={card.id} compact locale={locale} />
              {source ? <a href={source} target="_blank" rel="noreferrer">{spanish ? "Fuente oficial" : "Official source"} <ArrowUpRight size={14} aria-hidden /></a> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function previewMeetings(meetings: MeetingRow[]) {
  const upcoming = meetings.filter((meeting) => meeting.status !== "Cancelled"
    && isUpcomingMeetingDate(meeting.date_text, meeting.meeting_datetime, meeting.time_text));
  return upcoming.sort((left, right) => (left.meeting_datetime || civicCalendarDay(left.date_text) || "").localeCompare(right.meeting_datetime || civicCalendarDay(right.date_text) || ""));
}

export function PreviewMeetingList({ meetings, cards = [], locale, limit }: {
  meetings: MeetingRow[]; cards?: SummaryCardRow[]; locale: Locale; limit?: number;
}) {
  const grouped = new Map<string, MeetingRow[]>();
  for (const meeting of meetings) {
    const day = civicCalendarDay(meeting.date_text, meeting.meeting_datetime) || "";
    const group = grouped.get(day) || [];
    group.push(meeting);
    grouped.set(day, group);
  }
  if (grouped.size === 0) return <p className="redesign-empty">{locale === "es" ? "No hay reuniones para mostrar." : "No meetings to show."}</p>;
  const meetingCards = new Map(cards.map((card) => [card.meeting_id || card.meetings?.id, card]));
  return Array.from(grouped.entries()).slice(0, limit ? 1 : undefined).map(([day, group]) => (
    <section className="redesign-meeting-group" key={day}>
      <h3>{day ? new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : locale === "es" ? "Fecha no indicada" : "Date not listed"} <span>· {group.length} {locale === "es" ? (group.length === 1 ? "reunión" : "reuniones") : (group.length === 1 ? "meeting" : "meetings")}</span></h3>
      {group.slice(0, limit).map((meeting) => {
        const card = meetingCards.get(meeting.id);
        const href = previewHref(`/meetings/${encodeURIComponent(meeting.id)}`, {
          jurisdiction: meeting.jurisdiction_slug || undefined
        });
        return (
          <article className="redesign-meeting" key={meeting.id}>
            <span className="redesign-meeting-time">{hasDisplayableMeetingTime(meeting.date_text, meeting.meeting_datetime, meeting.time_text) ? meetingClockTime(meeting.meeting_datetime, locale) || meeting.time_text || "—" : "—"}</span>
            <div>
              <h4><Link href={href}>{displayMeetingTitle(meeting, meeting.title, locale)}</Link></h4>
              <p>{meeting.jurisdiction_slug ? getJurisdictionDisplayLabel(meeting.jurisdiction_slug, locale) : meeting.jurisdiction_name}</p>
              {card ? <Link className="redesign-link" href={cardSharePath(card.id)}>{publicAgendaTitle(card)}<ArrowUpRight size={14} aria-hidden /></Link> : null}
            </div>
          </article>
        );
      })}
    </section>
  ));
}

export function PreviewTopics({ categories, jurisdiction, locale, cards, home = false }: {
  categories: readonly CategoryName[]; jurisdiction: JurisdictionSelection; locale: Locale; cards?: SummaryCardRow[]; home?: boolean;
}) {
  const spanish = locale === "es";
  const Heading = home ? "h2" : "h1";
  return (
    <section className={home ? "redesign-topics-band" : undefined}>
      <div className="redesign-shell redesign-section">
        <p className="redesign-eyebrow">{spanish ? "Explorar por tema" : "Browse by topic"}</p>
        <Heading className="redesign-topic-heading">{spanish ? "Encuentra decisiones por su impacto cotidiano" : "Find decisions by everyday impact"}</Heading>
        <ul className="redesign-topics">
          {categories.map((category) => {
            const { icon: Icon, slug } = CATEGORY_DEFINITIONS[category];
            const count = cards?.filter((card) => card.category_tags?.includes(category)).length || 0;
            return (
              <li key={category}>
                <Link href={previewHref("/decisions", { category: slug, jurisdiction: toPublicJurisdictionSlug(jurisdiction) })}>
                  <span className="redesign-topic-icon"><Icon size={20} aria-hidden /></span>
                  <span><strong>{previewTopicLabel(locale, category)}</strong><small>{count
                    ? spanish ? `${count} ${count === 1 ? "decisión destacada" : "decisiones destacadas"}` : `${count} featured ${count === 1 ? "decision" : "decisions"}`
                    : spanish ? "Ver decisiones" : "Browse decisions"}</small></span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function PreviewTeam({ locale, home = false }: { locale: Locale; home?: boolean }) {
  const spanish = locale === "es";
  return (
    <section className="redesign-team">
      <Image src="/images/simplecity-team.webp" alt={spanish ? "Ruiwen, Patrick y Samuel" : "Ruiwen, Patrick and Samuel"} width={576} height={360} />
      <div>
        <p className="redesign-eyebrow">{spanish ? "Conoce al equipo" : "Meet the team"}</p>
        <h2>{spanish ? "Creado por tres estudiantes del Área de la Bahía" : "Built by three Bay Area students"}</h2>
        <p>{spanish ? "Somos Ruiwen, Patrick y Samuel, el equipo detrás de SimpleCity." : "We’re Ruiwen, Patrick, and Samuel, the team behind SimpleCity."}</p>
        {home ? <PreviewLink href="/about">{spanish ? "Nuestra historia" : "Our story"}</PreviewLink> : null}
      </div>
    </section>
  );
}

export function PreviewBriefing({ locale, support = false }: { locale: Locale; support?: boolean }) {
  const spanish = locale === "es";
  const jurisdictions = publicEmailJurisdictionOptions(locale);
  return (
    <section id="subscribe" className="redesign-briefing">
      <PreviewSectionTitle title={spanish ? "Boletín semanal" : "Weekly briefing"} />
      <p>{spanish ? "Próximas votaciones y fechas límite para comentarios, una vez por semana." : "Upcoming votes and comment deadlines, once a week."}</p>
      <SubscribeForm jurisdictions={jurisdictions} locale={locale} compact />
      {support ? (
        <div className="redesign-support">
          <h3>{spanish ? "Mantén abierto el registro cívico." : "Keep the civic record open."}</h3>
          <p>{spanish ? "Gratis para todos. Las donaciones ayudan a llegar a nuevas comunidades." : "Free for everyone. Tax-deductible donations fund new communities."}</p>
          <a href={donationUrl} target="_blank" rel="noreferrer">{spanish ? "Apoya a SimpleCity" : "Support SimpleCity"} <ArrowRight size={15} aria-hidden /></a>
        </div>
      ) : null}
    </section>
  );
}
