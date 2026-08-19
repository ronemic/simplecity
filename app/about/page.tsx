import type { Metadata } from "next";
import Image from "next/image";
import {
  ExternalLink,
  FileSearch,
  Landmark,
  Link as LinkIcon,
  Newspaper,
  ShieldCheck
} from "lucide-react";
import { getRequestLocale } from "@/lib/i18n/server";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const locale = seoLocale((await searchParams).lang);
  const title =
    locale === "es"
      ? "Acerca de SimpleCity | Decisiones locales fáciles de entender"
      : "About SimpleCity | Easy-to-understand local decisions";
  const description =
    locale === "es"
      ? "Descubre cómo SimpleCity ayuda a residentes a seguir decisiones, votaciones, opciones de participación y resultados oficiales del Área de la Bahía."
      : "Learn how SimpleCity helps residents follow Bay Area decisions, upcoming votes, participation options, and official outcomes.";
  const urls = localizedSeoUrls("/about", locale);

  return {
    title,
    description,
    alternates: { canonical: urls.canonical, languages: urls.languages },
    openGraph: { title, description, type: "website", url: urls.canonical, siteName: "SimpleCity" },
    twitter: { card: "summary", title, description }
  };
}

export const revalidate = 300;

const FEATURE_ARTICLE_URL =
  "https://www.losaltosonline.com/news/using-ai-students-create-website-that-summarizes-local-government-agendas/article_63d31ed4-6317-434e-a77b-1c8f38d5d1a6.html";
const FEATURE_IMAGE_URL =
  "https://bloximages.newyork1.vip.townnews.com/losaltosonline.com/content/tncms/assets/v3/editorial/e/b2/eb267b69-9b78-4c8c-b5e0-0882d6aa24c7/6a5a8dac111ef.image.jpg?resize=2008%2C669";
const DONATION_URL = "https://hcb.hackclub.com/donations/start/simplecity";
const CONTACT_EMAIL = "simplecityadmin@gmail.com";

export default async function AboutPage() {
  const locale = await getRequestLocale();

  return (
    <div className="section-shell py-10">
      <div>
          <p className="label-eyebrow !text-civic">
            {locale === "es" ? "Acerca de SimpleCity" : "About SimpleCity"}
          </p>
          <h1 className="page-title mt-2">
            {locale === "es"
              ? "Acceso en lenguaje claro a decisiones locales"
              : "Easy-to-understand local decisions"}
          </h1>
          <p className="page-copy mt-4 !max-w-none">
            {locale === "es"
              ? "SimpleCity ayuda a residentes a entender agendas de reuniones del gobierno local sin tener que descifrar lenguaje gubernamental ni revisar paquetes o avisos extensos."
              : "SimpleCity helps residents understand what local governments are deciding, why it matters, when they can participate, and what happens afterward."}
          </p>
          <section className="mt-10">
            <p className="label-eyebrow !text-civic">
              {locale === "es" ? "Por qué construimos SimpleCity" : "Why we built SimpleCity"}
            </p>
            <div className="mt-4 space-y-4">
              <p className="page-copy !max-w-none">
                {locale === "es"
                  ? "Somos Ruiwen, Patrick y Samuel, un equipo de tres estudiantes de secundaria del Área de la Bahía que queríamos entender qué estaban discutiendo nuestros gobiernos locales, pero encontramos agendas difíciles de leer y a menudo enterradas en paquetes, avisos o portales extensos."
                  : "We are Ruiwen, Patrick, and Samuel, a team of three local Bay Area high school students who wanted to understand what our local governments were discussing, but found meeting agendas difficult to read and often buried in long packets, notices, or portals."}
              </p>
              <p className="page-copy !max-w-none">
                {locale === "es"
                  ? "Construimos SimpleCity para que las decisiones locales sean más fáciles de entender y para que los registros oficiales sigan siendo fáciles de encontrar por transparencia. Nuestro objetivo no es reemplazar los registros oficiales, sino ayudar a residentes a descubrirlos y entenderlos para mantenerse informados sobre su comunidad y participar cuando sea necesario."
                  : "We built SimpleCity to make local decisions easier to understand while ensuring that official records remain easily accessible for transparency. Our goal is not to replace official records, but rather to help residents discover and understand them, helping them stay informed about their community and take action when needed."}
              </p>
            </div>
            <p className="mt-5 text-sm font-semibold text-black/70">
              {locale === "es"
                ? "¿Tienes una pregunta, corrección o idea? Contáctanos en"
                : "Have a question, correction, or idea? Contact us at"}{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-bold text-civic underline decoration-civic/30 underline-offset-4 hover:decoration-civic"
              >
                {CONTACT_EMAIL}
              </a>
            </p>

            <p className="mt-4 flex items-start gap-2 text-sm font-semibold leading-6 text-black/60">
              <ShieldCheck aria-hidden className="mt-1 h-4 w-4 shrink-0 text-civic" />
              <span>
                {locale === "es"
                  ? "SimpleCity cuenta con el patrocinio fiscal de Hack Club, una organización sin fines de lucro 501(c)(3)."
                  : "SimpleCity is fiscally sponsored by Hack Club, a 501(c)(3) nonprofit."}{" "}
                <a
                  href={DONATION_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-civic underline decoration-civic/30 underline-offset-4 hover:decoration-civic"
                >
                  {locale === "es" ? "Apoya a SimpleCity" : "Support SimpleCity"}
                  <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                </a>
              </span>
            </p>
          </section>
      </div>

      <section className="mt-10">
        <p className="label-eyebrow !text-civic">
          {locale === "es" ? "En las noticias" : "In the news"}
        </p>

        <article className="quiet-card mt-4 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)_auto] sm:items-center">
            <a
              href={FEATURE_ARTICLE_URL}
              target="_blank"
              rel="noreferrer"
              aria-label={locale === "es" ? "Leer la cobertura de Los Altos Town Crier" : "Read the Los Altos Town Crier coverage"}
              className="block overflow-hidden rounded-lg border border-black/10 bg-black/[0.02]"
            >
              <Image
                src={FEATURE_IMAGE_URL}
                width={2008}
                height={669}
                sizes="(max-width: 639px) calc(100vw - 4.5rem), 220px"
                alt={locale === "es"
                  ? "Ruiwen, Patrick y Samuel, el equipo estudiantil detrás de SimpleCity"
                  : "Ruiwen, Patrick, and Samuel, the student team behind SimpleCity"}
                className="h-auto w-full"
              />
            </a>
            <div className="min-w-0">
              <p className="label-eyebrow !text-civic flex items-center gap-2">
                <Newspaper aria-hidden className="h-4 w-4" />
                {locale === "es" ? "Cobertura destacada" : "Featured coverage"}
              </p>
              <h2 className="mt-1 text-lg font-bold leading-7 text-ink sm:text-xl">
                {locale === "es"
                  ? "Estudiantes usan IA para crear un sitio web que resume las agendas de gobiernos locales"
                  : "Using AI, students create website that summarizes local government agendas"}
              </h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-black/60">
                Los Altos Town Crier
                <span aria-hidden className="mx-2 text-black/25">·</span>
                {locale === "es"
                  ? "Cobertura local sobre el equipo estudiantil detrás de SimpleCity"
                  : "Local coverage of the student team behind SimpleCity"}
              </p>
            </div>
            <a
              href={FEATURE_ARTICLE_URL}
              target="_blank"
              rel="noreferrer"
              className="action-secondary-sm w-fit shrink-0"
            >
              {locale === "es" ? "Leer artículo" : "Read article"}
              <ExternalLink aria-hidden className="h-4 w-4" />
            </a>
          </div>
        </article>
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
                  ? "Los registros oficiales permanecen"
                  : "Official records stay",
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
