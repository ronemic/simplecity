import type { Metadata } from "next";
import {
  ExternalLink,
  FileSearch,
  Landmark,
  Layers3,
  Link as LinkIcon,
  Newspaper,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { getPublicStats } from "@/lib/db/queries";
import { getRequestLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "About SimpleCity | Plain-English local government decisions",
  description: "Learn how SimpleCity turns official Bay Area public meeting agendas into source-linked, plain-English civic decision summaries.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About SimpleCity",
    description: "Official local government agendas, translated into source-linked plain-English summaries.",
    type: "website",
    url: "/about",
    siteName: "SimpleCity"
  }
};

export const revalidate = 300;

const FEATURE_ARTICLE_URL =
  "https://www.losaltosonline.com/news/using-ai-students-create-website-that-summarizes-local-government-agendas/article_63d31ed4-6317-434e-a77b-1c8f38d5d1a6.html";

function formatStat(value: number, locale: "en" | "es") {
  return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US").format(value);
}

export default async function AboutPage() {
  const locale = await getRequestLocale();
  const stats = await getPublicStats();

  const statItems = [
    {
      icon: WalletCards,
      label: locale === "es" ? "Puntos de agenda" : "Agenda items",
      value: stats.agendaItemsAnalyzed,
      detail: locale === "es" ? "Puntos de agenda analizados" : "Agenda items analyzed"
    },
    {
      icon: Layers3,
      label: locale === "es" ? "Reuniones analizadas" : "Meetings analyzed",
      value: stats.meetingsAnalyzed,
      detail: locale === "es" ? "Reuniones oficiales analizadas" : "Official meetings analyzed"
    },
    {
      icon: Landmark,
      label: locale === "es" ? "Jurisdicciones" : "Jurisdictions",
      value: stats.jurisdictionsSupported,
      detail: locale === "es" ? "Jurisdicciones locales compatibles" : "Local jurisdictions supported"
    },
    {
      icon: LinkIcon,
      label: locale === "es" ? "Transparencia" : "Transparency",
      valueText: "100%",
      detail: locale === "es" ? "Con enlaces a fuentes" : "Source-linked"
    }
  ];

  return (
    <div className="section-shell py-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="max-w-3xl">
          <p className="label-eyebrow !text-civic">
            {locale === "es" ? "Acerca de SimpleCity" : "About SimpleCity"}
          </p>
          <h1 className="page-title mt-2 !font-bold sm:!text-[2.5rem]">
            {locale === "es"
              ? "Acceso en lenguaje claro a decisiones locales"
              : "Plain-English access to local decisions"}
          </h1>
          <p className="page-copy mt-4">
            {locale === "es"
              ? "SimpleCity ayuda a residentes a entender agendas de reuniones del gobierno local sin tener que descifrar lenguaje gubernamental ni revisar paquetes o avisos extensos."
              : "SimpleCity helps residents understand local government meeting agendas without needing to decode government language or dig through long agenda packets and notices."}
          </p>
          <section className="mt-10">
            <p className="label-eyebrow !text-civic">
              {locale === "es" ? "Por qué construimos SimpleCity" : "Why we built SimpleCity"}
            </p>
            <div className="mt-4 space-y-4">
              <p className="page-copy">
                {locale === "es"
                  ? "Somos Ruiwen, Patrick y Samuel, un equipo de tres estudiantes de secundaria del Área de la Bahía que queríamos entender qué estaban discutiendo nuestros gobiernos locales, pero encontramos agendas difíciles de leer y a menudo enterradas en paquetes, avisos o portales extensos."
                  : "We are Ruiwen, Patrick, and Samuel, a team of three local Bay Area high school students who wanted to understand what our local governments were discussing, but found meeting agendas difficult to read and often buried in long packets, notices, or portals."}
              </p>
              <p className="page-copy">
                {locale === "es"
                  ? "Construimos SimpleCity para que las decisiones locales sean más fáciles de entender y para que los registros oficiales sigan siendo fáciles de encontrar por transparencia."
                  : "We built SimpleCity to make local decisions easier to understand while ensuring that official records remain easily accessible for transparency."}
              </p>
              <p className="page-copy">
                {locale === "es"
                  ? "Nuestro objetivo no es reemplazar los registros oficiales, sino ayudar a residentes a descubrirlos y entenderlos para mantenerse informados sobre su comunidad y participar cuando sea necesario."
                  : "Our goal is not to replace official records, but rather to help residents discover and understand them, helping them stay informed about their community and take action when needed."}
              </p>
            </div>
          </section>
        </div>

        <section className="lg:pt-6">
          <p className="label-eyebrow !text-civic">
            {locale === "es" ? "SimpleCity en números" : "SimpleCity by the numbers"}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {statItems.map((item) => (
              <div key={item.label} className="quiet-card p-3 sm:p-4">
                <div className="flex items-center justify-between gap-4">
                  <item.icon aria-hidden className="h-5 w-5 text-civic" />
                  <p className="label-eyebrow text-black/50">{item.label}</p>
                </div>
                <p className="mt-3 text-2xl font-black leading-none text-ink">
                  {"valueText" in item ? item.valueText : formatStat(item.value, locale)}
                </p>
                <p className="mt-1.5 text-sm font-semibold leading-5 text-black/65">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-5 max-w-5xl">
        <div className="flex items-center gap-2.5 text-civic">
          <Newspaper aria-hidden className="h-5 w-5" />
          <p className="label-eyebrow !text-civic">
            {locale === "es" ? "En las noticias" : "In the news"}
          </p>
        </div>

        <div className="quiet-card mt-2 overflow-hidden">
          <div className="grid sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div className="flex items-center gap-3 border-b border-black/10 px-4 py-2.5 sm:block sm:border-b-0 sm:border-r sm:px-5 sm:py-3">
              <span className="icon-tile-sm">
                <Landmark aria-hidden className="h-5 w-5" />
              </span>
              <div className="sm:mt-1.5">
                <p className="text-base font-bold leading-6 text-ink">Los Altos Town Crier</p>
                <div aria-hidden className="mt-1.5 hidden h-0.5 w-8 rounded-full bg-civic sm:block" />
              </div>
            </div>

            <div className="px-4 py-2.5 sm:px-5 sm:py-3">
              <p className="inline-flex rounded-full bg-civic/10 px-2.5 text-xs font-bold uppercase leading-5 text-civic">
                {locale === "es" ? "Cobertura destacada" : "Featured coverage"}
              </p>
              <h2 className="mt-1 max-w-2xl text-lg font-semibold leading-6 text-ink">
                {locale === "es"
                  ? "Estudiantes usan IA para crear un sitio web que resume las agendas de gobiernos locales"
                  : "Using AI, students create website that summarizes local government agendas"}
              </h2>
              <div className="mt-1.5 flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-5 text-black/65">
                  {locale === "es"
                    ? "Cobertura local sobre el equipo estudiantil detrás de SimpleCity."
                    : "Local coverage of the student team behind SimpleCity."}
                </p>
                <a
                  href={FEATURE_ARTICLE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="action-secondary-xs shrink-0"
                >
                  {locale === "es" ? "Leer artículo" : "Read article"}
                  <ExternalLink aria-hidden className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <p className="label-eyebrow !text-civic">
          {locale === "es" ? "Cómo funciona SimpleCity" : "How SimpleCity works"}
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: FileSearch,
              title: locale === "es" ? "Documentos oficiales primero" : "Official documents first",
              body:
                locale === "es"
                  ? "El proceso de recopilación lee portales oficiales de agendas y reuniones y conserva cada URL de fuente oficial."
                  : "The collection pipeline reads official agenda and meeting portals and preserves each official source URL."
            },
            {
              icon: ShieldCheck,
              title: locale === "es" ? "Resúmenes cuidadosos" : "Careful summaries",
              body:
                locale === "es"
                  ? "Las tarjetas se generan con IA a partir del texto extraído de la agenda y se validan antes de aparecer en la app."
                  : "Cards are AI-generated from extracted agenda text and validated before they appear in the app."
            },
            {
              icon: LinkIcon,
              title: locale === "es" ? "Las fuentes siguen visibles" : "Sources stay visible",
              body:
                locale === "es"
                  ? "Cada tarjeta pública y página de reunión enlaza a la agenda, paquete o aviso original."
                  : "Every public card and meeting page links back to the original agenda, packet, or notice."
            },
            {
              icon: Landmark,
              title:
                locale === "es"
                  ? "Los registros oficiales son la fuente principal"
                  : "Official records stay primary",
              body:
                locale === "es"
                  ? "SimpleCity es una capa de lectura, no un reemplazo de registros oficiales, avisos legales, informes del personal ni instrucciones formales de la agencia."
                  : "SimpleCity is a reading layer, not a replacement for official records, legal notices, staff reports, or formal agency instructions."
            }
          ].map((item) => (
            <section key={item.title} className="quiet-card p-6">
              <span className="icon-tile-sm">
                <item.icon aria-hidden className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-lg font-bold text-ink">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-black/75">{item.body}</p>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
