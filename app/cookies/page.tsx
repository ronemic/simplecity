import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { CookiePreferenceControls } from "@/components/CookiePreferenceControls";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const locale = seoLocale((await searchParams).lang);
  const title = locale === "es" ? "Configuración de cookies | SimpleCity" : "Cookie Settings | SimpleCity";
  const description =
    locale === "es"
      ? "Información y controles para las cookies y preferencias de SimpleCity."
      : "Information and controls for SimpleCity cookies and saved preferences.";
  const urls = localizedSeoUrls("/cookies", locale);

  return {
    title,
    description,
    alternates: { canonical: urls.canonical, languages: urls.languages }
  };
}

export default async function CookiesPage({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const locale = seoLocale((await searchParams).lang);
  const es = locale === "es";

  return (
    <div className="section-shell py-8 sm:py-10">
      <div className="max-w-4xl">
        <p className="label-eyebrow !text-civic">{es ? "Controles del navegador" : "Browser controls"}</p>
        <h1 className="page-title mt-2">{es ? "Configuración de cookies" : "Cookie Settings"}</h1>
        <p className="page-copy mt-4">
          {es
            ? "SimpleCity usa cookies y almacenamiento local para recordar tus preferencias y Google Analytics para entender cómo se usa el sitio. No usamos cookies publicitarias."
            : "SimpleCity uses cookies and local storage to remember your preferences and Google Analytics to understand how the site is used. We do not use advertising cookies."}
        </p>

        <div className="mt-8 grid gap-5">
          <CookiePreferenceControls locale={locale} />

          <section className="quiet-card overflow-hidden">
            <div className="grid gap-px bg-black/10 sm:grid-cols-2 lg:grid-cols-4">
              <CookieType
                title={es ? "Preferencias" : "Preferences"}
                detail={
                  es
                    ? "Idioma, jurisdicción y vista de reuniones. Se guardan hasta un año o hasta que las borres."
                    : "Language, jurisdiction, and meeting view. Saved for up to one year or until you clear them."
                }
                examples="simplecity_locale, simplecity.jurisdiction, simplecity.meeting-view"
              />
              <CookieType
                title={es ? "Analítica" : "Analytics"}
                detail={
                  es
                    ? "Google Analytics mide visitas, sesiones y uso general. Permanece habilitado en SimpleCity."
                    : "Google Analytics measures visits, sessions, and overall usage. It remains enabled on SimpleCity."
                }
                examples="_ga, _ga_*"
              />
              <CookieType
                title={es ? "Intereses de Santa Bárbara" : "Santa Barbara interests"}
                detail={
                  es
                    ? "Un token aleatorio y tu lista de intereses se guardan en este navegador. Usa “Retirar todos” en Mis intereses antes de borrar los datos del navegador."
                    : "A random token and your interest list are saved in this browser. Use “Withdraw all” in My interests before clearing browser data."
                }
                examples="simplecity.santa-barbara.*"
              />
              <CookieType
                title={es ? "Seguridad y administración" : "Security and administration"}
                detail={
                  es
                    ? "Las áreas administrativas protegidas usan cookies de sesión y seguridad que no se usan para publicidad."
                    : "Protected administrative areas use session and security cookies that are not used for advertising."
                }
                examples={es ? "Solo cuando es necesario" : "Only when needed"}
              />
            </div>
          </section>

          <section className="quiet-card p-5 sm:p-6">
            <h2 className="text-xl font-black text-ink">
              {es ? "Administrar cookies de analítica" : "Managing analytics cookies"}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-black/65">
              {es
                ? "Puedes bloquear o borrar cookies, incluida la analítica, desde la configuración de privacidad de tu navegador. Google también ofrece un complemento para impedir que Google Analytics mida tus visitas. Bloquear cookies de preferencias puede hacer que SimpleCity no recuerde tus selecciones."
                : "You can block or delete cookies, including analytics cookies, from your browser’s privacy settings. Google also offers an add-on that prevents Google Analytics from measuring your visits. Blocking preference cookies may prevent SimpleCity from remembering your selections."}
            </p>
            <a
              className="action-secondary mt-4 inline-flex"
              href="https://tools.google.com/dlpage/gaoptout"
              rel="noreferrer"
              target="_blank"
            >
              {es ? "Complemento de exclusión de Google Analytics" : "Google Analytics opt-out add-on"}
              <ExternalLink aria-hidden className="h-4 w-4" />
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}

function CookieType({ title, detail, examples }: { title: string; detail: string; examples: string }) {
  return (
    <article className="bg-white p-5 sm:p-6">
      <h2 className="text-lg font-black text-ink">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-black/65">{detail}</p>
      <p className="mt-3 break-words font-mono text-xs font-bold text-civic">{examples}</p>
    </article>
  );
}
