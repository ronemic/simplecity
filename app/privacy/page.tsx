import type { Metadata } from "next";
import Link from "next/link";
import { localizedSeoUrls, seoLocale } from "@/lib/seo";

const CONTACT_EMAIL = "simplecityadmin@gmail.com";

export async function generateMetadata({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const locale = seoLocale((await searchParams).lang);
  const title = locale === "es" ? "Política de privacidad | SimpleCity" : "Privacy Policy | SimpleCity";
  const description =
    locale === "es"
      ? "Cómo SimpleCity recopila, usa y protege información."
      : "How SimpleCity collects, uses, and protects information.";
  const urls = localizedSeoUrls("/privacy", locale);

  return {
    title,
    description,
    alternates: { canonical: urls.canonical, languages: urls.languages }
  };
}

export default async function PrivacyPage({
  searchParams
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const locale = seoLocale((await searchParams).lang);
  const es = locale === "es";

  return (
    <div className="section-shell py-8 sm:py-10">
      <div className="max-w-4xl">
        <p className="label-eyebrow !text-brand">
          {es ? "Privacidad en SimpleCity" : "Privacy at SimpleCity"}
        </p>
        <h1 className="page-title mt-2">{es ? "Política de privacidad" : "Privacy Policy"}</h1>
        <p className="mt-3 text-sm font-semibold text-quiet">
          {es ? "Vigente desde el 8 de agosto de 2026" : "Effective August 8, 2026"}
        </p>
        <p className="page-copy mt-5">
          {es
            ? "SimpleCity es una plataforma independiente dirigida por estudiantes que ayuda al público a entender reuniones y decisiones del gobierno local. Esta política explica la información que usamos al operar el sitio y los resúmenes por email."
            : "SimpleCity is an independent, student-led platform that helps the public understand local-government meetings and decisions. This policy explains the information we use to operate the site and email digests."}
        </p>

        <div className="mt-8 grid gap-5">
          <PolicySection title={es ? "Información que recopilamos" : "Information we collect"}>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                {es
                  ? "Suscripciones por email: tu dirección, las áreas seleccionadas, estado de confirmación, historial de entregas y registros de cancelación."
                  : "Email subscriptions: your address, selected areas, confirmation status, delivery history, and unsubscribe records."}
              </li>
              <li>
                {es
                  ? "Preferencias del sitio: idioma, jurisdicción y vista de reuniones guardados mediante cookies y almacenamiento local."
                  : "Site preferences: language, jurisdiction, and meeting view saved with cookies and local storage."}
              </li>
              <li>
                {es
                  ? "Datos técnicos y de uso: Google Analytics recopila información como páginas visitadas, sesiones, tipo de dispositivo, navegador y ubicación aproximada, y usa identificadores como la cookie _ga."
                  : "Technical and usage data: Google Analytics collects information such as visited pages, sessions, device type, browser, and approximate location, and uses identifiers such as the _ga cookie."}
              </li>
              <li>
                {es
                  ? "Seguridad: usamos versiones criptográficamente codificadas de direcciones IP y emails para limitar solicitudes abusivas. Los proveedores de alojamiento también pueden mantener registros técnicos."
                  : "Security: we use cryptographically encoded versions of IP addresses and emails to limit abusive requests. Hosting providers may also maintain technical logs."}
              </li>
            </ul>
          </PolicySection>

          <PolicySection title={es ? "Cómo usamos la información" : "How we use information"}>
            <p>
              {es
                ? "Usamos la información para enviar y administrar los resúmenes solicitados, recordar tus preferencias, entender el uso general del sitio, mejorar SimpleCity, solucionar errores y proteger el servicio. No vendemos información personal ni la usamos para mostrar publicidad dirigida."
                : "We use information to send and manage requested digests, remember your preferences, understand overall site use, improve SimpleCity, troubleshoot problems, and protect the service. We do not sell personal information or use it to show targeted advertising."}
            </p>
          </PolicySection>

          <PolicySection
            title={
              es
                ? "Piloto de interés del Condado de Santa Bárbara"
                : "Santa Barbara County interest pilot"
            }
          >
            <p>
              {es
                ? "En las tarjetas del Condado de Santa Bárbara, puedes marcar “Me interesa” sin crear una cuenta ni proporcionar un email. Tu navegador guarda un token aleatorio y una lista local de tus intereses. Para cada tarjeta, nuestro servidor transforma ese token en un código unidireccional diferente. La base de datos guarda el código específico de la tarjeta, pero no el token original, tu identidad, tu email ni tu dirección IP sin codificar."
                : "On Santa Barbara County cards, you can select “I’m interested” without creating an account or providing an email. Your browser saves a random token and a local list of your interests. For each card, our server transforms that token into a different one-way code. The database stores the card-specific code, but not the original token, your identity, your email, or your raw IP address."}
            </p>
            <p className="mt-3">
              {es
                ? "SimpleCity puede proporcionar al Condado de Santa Bárbara totales agregados por tarjeta. Esos totales son señales anónimas de navegadores, no residentes verificados, y no son votos, encuestas representativas ni comentarios públicos oficiales. Usamos límites de solicitudes codificados y podemos revisar actividad inusual para reducir la manipulación."
                : "SimpleCity may provide Santa Barbara County with aggregate totals for each card. Those totals are anonymous browser signals, not verified residents, and are not votes, representative polling, or official public comments. We use encoded request limits and may review unusual activity to reduce manipulation."}
            </p>
            <p className="mt-3">
              {es
                ? "Puedes retirar una señal desmarcando una tarjeta o usando “Retirar todos” en Mis intereses. Borrar directamente los datos del navegador elimina tu lista local, pero puede impedir que SimpleCity reconozca y retire una señal enviada anteriormente. Conservamos las señales mientras sean necesarias para operar y evaluar el piloto."
                : "You can withdraw a signal by unselecting a card or using “Withdraw all” in My interests. Directly clearing browser data removes your local list, but may prevent SimpleCity from recognizing and withdrawing a previously submitted signal. We retain signals while needed to operate and evaluate the pilot."}
            </p>
          </PolicySection>

          <PolicySection title={es ? "Proveedores y divulgación" : "Providers and disclosure"}>
            <p>
              {es
                ? "Compartimos información solo cuando es necesario con proveedores que ayudan a operar SimpleCity, incluidos Supabase para almacenamiento de datos, Resend para entrega de emails, Google Analytics para medición y nuestros proveedores de alojamiento. También podemos divulgar información si la ley lo exige o para proteger la seguridad del servicio."
                : "We share information only as needed with providers that help operate SimpleCity, including Supabase for data storage, Resend for email delivery, Google Analytics for measurement, and our hosting providers. We may also disclose information when legally required or to protect the service’s security."}
            </p>
          </PolicySection>

          <PolicySection title={es ? "Retención y tus opciones" : "Retention and your choices"}>
            <p>
              {es
                ? "Conservamos registros de suscripción y entrega mientras sean necesarios para operar los resúmenes, mantener las preferencias y prevenir abusos. Cuando cancelas, marcamos la dirección como cancelada para detener futuros envíos. Puedes pedir que eliminemos tus datos escribiéndonos. Puedes borrar las preferencias guardadas desde la página de Configuración de cookies y administrar otras cookies desde tu navegador."
                : "We retain subscription and delivery records while needed to operate digests, maintain preferences, and prevent abuse. When you unsubscribe, we mark the address unsubscribed so future sends stop. You may ask us to delete your data by emailing us. You can clear saved preferences from Cookie Settings and manage other cookies through your browser."}
            </p>
            <p className="mt-3">
              <Link className="action-link" href={`/cookies?lang=${locale}`}>
                {es ? "Abrir Configuración de cookies" : "Open Cookie Settings"}
              </Link>
            </p>
          </PolicySection>

          <PolicySection title={es ? "Contacto y cambios" : "Contact and changes"}>
            <p>
              {es
                ? "Podemos actualizar esta política a medida que cambie SimpleCity. Publicaremos aquí la versión revisada y cambiaremos la fecha de vigencia. Para preguntas, solicitudes de acceso o eliminación, contáctanos en "
                : "We may update this policy as SimpleCity changes. We will post the revised version here and update the effective date. For questions, access requests, or deletion requests, contact us at "}
              <a className="font-semibold text-brand underline decoration-brand/25 underline-offset-4 transition-colors hover:decoration-brand" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </PolicySection>
        </div>
      </div>
    </div>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="quiet-card p-5 sm:p-6">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-3 text-sm font-semibold leading-7 text-slate sm:text-base">{children}</div>
    </section>
  );
}
