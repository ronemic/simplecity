import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SubscribeForm } from "@/components/SubscribeForm";
import {
  JURISDICTION_PREFERENCE_COOKIE,
  normalizeJurisdictionSelection
} from "@/lib/config/jurisdictions";
import { publicEmailJurisdictionOptions } from "@/lib/email/subscriptions";
import { LOCALE_COOKIE, normalizeLocale, t, type Locale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  return {
    title: `${t(locale, "subscribe")} | SimpleCity`,
    description: t(locale, "subscribePageDescription")
  };
}

function statusMessage(status: string | undefined, locale: Locale) {
  if (status === "confirmed") {
    return {
      title: t(locale, "subscribeConfirmedTitle"),
      body: t(locale, "subscribeConfirmedBody"),
      className: "border-[#9fc6b2] bg-[#f1fbf4] text-[#24613c]"
    };
  }

  if (status === "unsubscribed") {
    return {
      title: t(locale, "subscribeUnsubscribedTitle"),
      body: t(locale, "subscribeUnsubscribedBody"),
      className: "border-[#e5b6b3] bg-[#fff1f0] text-[#9f2a20]"
    };
  }

  if (status === "invalid" || status === "invalid-unsubscribe") {
    return {
      title: t(locale, "subscribeInvalidTitle"),
      body: t(locale, "subscribeInvalidBody"),
      className: "border-[#e7ba6a] bg-[#fff7e8] text-[#7a4808]"
    };
  }

  if (status === "error") {
    return {
      title: t(locale, "subscribeErrorTitle"),
      body: t(locale, "subscribeErrorBody"),
      className: "border-[#e5b6b3] bg-[#fff1f0] text-[#9f2a20]"
    };
  }

  return null;
}

export default async function SubscribePage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);
  const initialJurisdiction = normalizeJurisdictionSelection(
    cookieStore.get(JURISDICTION_PREFERENCE_COOKIE)?.value
  );
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const message = statusMessage(params.status, locale);

  return (
    <div className="section-shell grid gap-8 py-10 lg:grid-cols-[0.78fr_1fr] lg:items-start">
      <div className="max-w-2xl">
        <p className="label-eyebrow text-civic">{t(locale, "subscribeEyebrow")}</p>
        <h1 className="page-title mt-2">{t(locale, "subscribePageTitle")}</h1>
        <p className="page-copy mt-4 text-base">{t(locale, "subscribePageDescription")}</p>

        {message ? (
          <div className={`mt-6 rounded-lg border px-4 py-3 ${message.className}`}>
            <h2 className="text-base font-black">{message.title}</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-current/80">{message.body}</p>
          </div>
        ) : null}
      </div>

      <SubscribeForm
        initialJurisdiction={initialJurisdiction}
        jurisdictions={publicEmailJurisdictionOptions()}
        locale={locale}
      />
    </div>
  );
}
