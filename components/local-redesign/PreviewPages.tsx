import { ArrowUpRight } from "lucide-react";
import Link from "@/components/SiteNavigation";
import { Suspense } from "react";
import { FollowingList } from "@/components/FollowingList";
import {
  donationUrl, PreviewBriefing, PreviewDecisionList, previewHref, PreviewLink, PreviewMeetingList,
  previewMeetings, PreviewSearch, PreviewSectionTitle, PreviewTeam, PreviewTopics, previewTopicLabel
} from "@/components/local-redesign/PreviewContent";
import { PreviewBrand } from "@/components/local-redesign/PreviewHeader";
import { getPublicJurisdictionOptions, toPublicJurisdictionSlug, type JurisdictionSelection } from "@/lib/config/jurisdictions";
import { CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import { getHomepageContent, getMeetings, getPublicStats, type DecisionCardPageResult } from "@/lib/db/queries";
import { t, type Locale } from "@/lib/i18n";
import type { MeetingRow } from "@/lib/types";

export function PreviewPageTitle({ title, description }: { title: string; description?: string }) {
  return <div className="redesign-page-title"><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>;
}

async function PreviewHomeFeed({ locale, jurisdiction, categories, search }: {
  locale: Locale; jurisdiction: JurisdictionSelection; categories: readonly CategoryName[]; search: string;
}) {
  const [content, meetings] = await Promise.allSettled([
    getHomepageContent({ jurisdiction, locale, search }),
    getMeetings({ jurisdiction, locale })
  ]);
  const spanish = locale === "es";
  const cards = content.status === "fulfilled" ? content.value.cards.slice(0, 3) : [];
  const upcoming = meetings.status === "fulfilled" ? previewMeetings(meetings.value) : [];
  const filters = { jurisdiction: toPublicJurisdictionSlug(jurisdiction) };

  return (
    <>
      <div className="redesign-shell redesign-columns redesign-home-feed">
        <section>
          <PreviewSectionTitle title={search ? t(locale, "searchResults") : spanish ? t(locale, "topPublicDecisions") : "Top Public Decisions"} note={spanish ? "Próximas votaciones primero" : "Upcoming votes first"} />
          {content.status === "fulfilled" ? <PreviewDecisionList cards={cards} jurisdiction={jurisdiction} locale={locale} featured /> : (
            <p className="redesign-empty">{spanish ? "No se pudieron cargar las decisiones." : "Decisions could not be loaded."}</p>
          )}
          <PreviewLink href={previewHref("/decisions", { ...filters, q: search })}>{t(locale, "viewAllDecisions")}</PreviewLink>
        </section>
        <section>
          <PreviewSectionTitle title={t(locale, "meetings")} />
          <PreviewMeetingList meetings={upcoming} cards={content.status === "fulfilled" ? content.value.meetingCards : []} locale={locale} limit={3} />
          <PreviewLink href={previewHref("/meetings", filters)}>{t(locale, "viewAllMeetings")}</PreviewLink>
        </section>
      </div>
      <PreviewTopics categories={categories} jurisdiction={jurisdiction} locale={locale} cards={cards} home />
    </>
  );
}

export function PreviewHome({ locale, jurisdiction, categories, search }: {
  locale: Locale; jurisdiction: JurisdictionSelection; categories: readonly CategoryName[]; search: string;
}) {
  const spanish = locale === "es";
  return (
    <>
      <section className="redesign-shell redesign-hero">
        <p className="redesign-eyebrow">{spanish ? "Al servicio del Área de la Bahía" : "Serving the Bay Area"}</p>
        <PreviewPageTitle
          title={spanish ? "Lo que está decidiendo tu gobierno local." : "What your local government is deciding."}
          description={spanish ? "Resúmenes claros de próximas votaciones y reuniones públicas, con enlaces a sus fuentes." : "Plain-language, source-linked summaries of upcoming votes and public meetings."}
        />
        <PreviewSearch locale={locale} jurisdiction={jurisdiction} search={search} />
      </section>
      <Suspense fallback={<div className="redesign-shell redesign-home-feed" aria-busy="true"><PreviewSectionTitle title={t(locale, "topPublicDecisions")} /><p className="redesign-empty">{t(locale, "loading")}…</p></div>}>
        <PreviewHomeFeed locale={locale} jurisdiction={jurisdiction} categories={categories} search={search} />
      </Suspense>
      <div className="redesign-shell redesign-columns redesign-section">
        <PreviewTeam locale={locale} home />
        <PreviewBriefing locale={locale} support />
      </div>
    </>
  );
}

export function PreviewDecisions({ locale, jurisdiction, search, result, categories, category }: {
  locale: Locale; jurisdiction: JurisdictionSelection; search: string; result: DecisionCardPageResult;
  categories: readonly CategoryName[]; category?: CategoryName;
}) {
  const spanish = locale === "es";
  const filters = { jurisdiction: toPublicJurisdictionSlug(jurisdiction), q: search };
  const slug = category ? CATEGORY_DEFINITIONS[category].slug : undefined;
  const from = (result.page - 1) * result.pageSize + 1;
  const to = from + result.cards.length - 1;
  const count = result.cards.length ? `${from}–${to} ${spanish ? "de" : "of"} ${result.totalCount.toLocaleString(locale)}` : "0";

  return (
    <div className="redesign-shell redesign-section">
      <PreviewPageTitle title={spanish ? "Todas las decisiones" : "All decisions"} description={spanish ? "Cada decisión que seguimos, con su fuente oficial a un clic." : "Every decision we track, with the official source one click away."} />
      <PreviewSearch locale={locale} jurisdiction={jurisdiction} search={search} category={slug} />
      <nav className="redesign-filters" aria-label={t(locale, "topics")}>
        <Link href={previewHref("/decisions", filters)} aria-current={!category ? "page" : undefined}>{spanish ? "Todos los temas" : "All topics"}</Link>
        {categories.map((item) => (
          <Link key={item} href={previewHref("/decisions", { ...filters, category: CATEGORY_DEFINITIONS[item].slug })} aria-current={category === item ? "page" : undefined}>{previewTopicLabel(locale, item)}</Link>
        ))}
      </nav>
      <section className="redesign-list-width redesign-list-section">
        <PreviewSectionTitle title={t(locale, "decisions")} note={`${count} ${spanish ? "mostradas" : "shown"}`} />
        <PreviewDecisionList cards={result.cards} locale={locale} jurisdiction={jurisdiction} />
        {result.pageCount > 1 ? (
          <nav className="redesign-list-links" aria-label={spanish ? "Paginación" : "Pagination"}>
            {result.page > 1 ? <Link className="redesign-link" href={previewHref("/decisions", { ...filters, category: slug, page: String(result.page - 1) })}>{spanish ? "Anterior" : "Previous"}</Link> : null}
            {result.page < result.pageCount ? <PreviewLink href={previewHref("/decisions", { ...filters, category: slug, page: String(result.page + 1) })}>{spanish ? "Siguiente" : "Next"}</PreviewLink> : null}
          </nav>
        ) : null}
        <div className="redesign-list-links">
          <PreviewLink href={previewHref("/decisions", { ...filters, category: slug, view: "map" })}>{spanish ? "Ver mapa" : "View map"}</PreviewLink>
          <PreviewLink href={previewHref("/decisions", { ...filters, category: slug, view: "full" })}>{spanish ? "Más filtros" : "More filters"}</PreviewLink>
        </div>
      </section>
    </div>
  );
}

export function PreviewMeetings({ locale, jurisdiction, search, meetings, page }: {
  locale: Locale; jurisdiction: JurisdictionSelection; search: string; meetings: MeetingRow[]; page: number;
}) {
  const spanish = locale === "es";
  const ordered = search ? meetings : previewMeetings(meetings);
  const pageSize = 24;
  const pageCount = Math.ceil(ordered.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount, 1));
  const displayed = ordered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filters = { jurisdiction: toPublicJurisdictionSlug(jurisdiction), q: search };
  return (
    <div className="redesign-shell redesign-section">
      <PreviewPageTitle title={spanish ? "Todas las reuniones" : "All meetings"} description={spanish ? "Reuniones públicas de las ciudades, condados y distritos que seguimos." : "Public meetings across the cities, counties and districts we follow."} />
      <PreviewSearch locale={locale} jurisdiction={jurisdiction} search={search} action="/meetings" />
      <section className="redesign-list-width redesign-list-section">
        <PreviewSectionTitle title={t(locale, "meetings")} note={`${displayed.length} ${spanish ? "mostradas" : "shown"}`} />
        <PreviewMeetingList meetings={displayed} locale={locale} />
        {pageCount > 1 ? (
          <nav className="redesign-list-links" aria-label={spanish ? "Paginación" : "Pagination"}>
            {currentPage > 1 ? <Link className="redesign-link" href={previewHref("/meetings", { ...filters, page: String(currentPage - 1) })}>{spanish ? "Anterior" : "Previous"}</Link> : null}
            {currentPage < pageCount ? <PreviewLink href={previewHref("/meetings", { ...filters, page: String(currentPage + 1) })}>{spanish ? "Siguiente" : "Next"}</PreviewLink> : null}
          </nav>
        ) : null}
        <div className="redesign-list-links"><PreviewLink href={previewHref("/meetings", { ...filters, view: "calendar" })}>{spanish ? "Ver calendario" : "View calendar"}</PreviewLink></div>
      </section>
    </div>
  );
}

export function PreviewFollowing({ locale }: { locale: Locale }) {
  return (
    <div className="redesign-shell redesign-section redesign-following">
      <PreviewPageTitle title={t(locale, "following")} description={locale === "es" ? "Las decisiones que sigues se guardan en este navegador." : "Decisions you follow are saved in this browser."} />
      <div className="redesign-list-width redesign-following-list"><FollowingList locale={locale} redesign /></div>
    </div>
  );
}

export function PreviewAboutIntro({ locale }: { locale: Locale }) {
  const spanish = locale === "es";
  return (
    <>
      <PreviewPageTitle title={spanish ? "Acerca de SimpleCity" : "About SimpleCity"} />
      <div className="redesign-columns redesign-about-grid">
        <div>
          <p>{spanish ? "SimpleCity convierte agendas de concejos municipales, condados y distritos escolares en resúmenes breves y claros, con enlaces al registro oficial." : "SimpleCity turns city council, county board and school district agendas into short, plain-language summaries — each one linked to the official record."}</p>
          <p>{spanish ? "Somos un proyecto estudiantil independiente. Revisa siempre la fuente original antes de tomar decisiones formales." : "We’re an independent, student-led project. We are not a government website, so always check the original source before making formal decisions."}</p>
          <PreviewTeam locale={locale} />
          <blockquote>
            {spanish ? "“El gobierno local da forma a nuestras calles, alquileres y escuelas. Seguirlo no debería requerir un título en derecho.”" : "“Local government shapes our streets, rents and schools — it shouldn’t take a law degree to follow along.”"}
            <cite>— Ruiwen, Patrick &amp; Samuel</cite>
          </blockquote>
        </div>
        <PreviewBriefing locale={locale} />
      </div>
    </>
  );
}

async function PreviewStats({ locale }: { locale: Locale }) {
  const spanish = locale === "es";
  const stats = await getPublicStats().catch(() => null);
  const areas = getPublicJurisdictionOptions().filter(({ slug }) => slug !== "all");
  const counties = areas.filter(({ slug }) => slug.endsWith("-county")).length;
  const cities = areas.filter(({ slug, kind }) => !slug.endsWith("-county") && kind !== "school-district").length;
  const numbers = [
    [stats?.publishedCards?.toLocaleString(locale) ?? "—", spanish ? "decisiones publicadas" : "published decisions"],
    [counties, spanish ? "condados" : "counties"],
    [cities, spanish ? "ciudades" : "cities"],
    ["100%", spanish ? "con fuentes" : "source-linked"]
  ];
  return (
    <dl className="redesign-stats">
      {numbers.map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

export function PreviewFooter({ locale }: { locale: Locale }) {
  const spanish = locale === "es";
  return (
    <footer className="redesign-footer">
      <div className="redesign-shell redesign-footer-numbers">
        <Suspense fallback={<div className="redesign-stats-placeholder" aria-hidden />}><PreviewStats locale={locale} /></Suspense>
        <Link className="redesign-link" href="/about#news">{spanish ? "Lee sobre SimpleCity en las noticias" : "Read about SimpleCity in the news"}<ArrowUpRight size={15} aria-hidden /></Link>
      </div>
      <div className="redesign-footer-border">
        <div className="redesign-shell redesign-footer-grid">
          <div>
            <PreviewBrand />
            <p>{spanish ? "Una plataforma estudiantil independiente. Revisa siempre la fuente original antes de tomar decisiones formales." : "An independent, student-led platform — not an official government website. Always review the original source before making formal decisions."}</p>
          </div>
          <div><h2>{spanish ? "Explorar" : "Explore"}</h2>
            {(["decisions", "meetings", "topics", "following"] as const).map((key) => <Link key={key} href={`/${key}`}>{t(locale, key)}</Link>)}
          </div>
          <div><h2>{spanish ? "Participa" : "Get involved"}</h2>
            <Link href="/subscribe">{t(locale, "subscribe")}</Link>
            <a href={donationUrl} target="_blank" rel="noreferrer">{spanish ? "Apoya a SimpleCity" : "Support SimpleCity"}</a>
            <a href="mailto:simplecityadmin@gmail.com">{t(locale, "contact")}</a>
          </div>
          <div><h2>{t(locale, "about")}</h2>
            <Link href="/about">{t(locale, "about")}</Link>
            <Link href="/privacy">{spanish ? "Privacidad" : "Privacy"}</Link>
            <Link href="/cookies">{spanish ? "Configuración de cookies" : "Cookie settings"}</Link>
          </div>
        </div>
        <p className="redesign-shell redesign-footer-sponsor">{spanish ? "Con el patrocinio fiscal de Hack Club, una organización sin fines de lucro 501(c)(3)." : "Fiscally sponsored by Hack Club, a 501(c)(3) nonprofit"}</p>
      </div>
    </footer>
  );
}
