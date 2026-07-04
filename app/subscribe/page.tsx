import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SubscribeForm } from "@/components/SubscribeForm";
import {
  JURISDICTION_PREFERENCE_COOKIE,
  normalizeJurisdictionSelection
} from "@/lib/config/jurisdictions";
import { publicEmailJurisdictionOptions } from "@/lib/email/subscriptions";

export const metadata: Metadata = {
  title: "Subscribe | SimpleCity",
  description: "Get weekly SimpleCity email digests for local public meeting decisions."
};

function statusMessage(status: string | undefined) {
  if (status === "confirmed") {
    return {
      title: "Your email updates are confirmed",
      body: "Weekly digests will use your latest selected areas when new SimpleCity cards are published.",
      className: "border-[#9fc6b2] bg-[#f1fbf4] text-[#24613c]"
    };
  }

  if (status === "unsubscribed") {
    return {
      title: "You are unsubscribed",
      body: "You will no longer receive SimpleCity email digests.",
      className: "border-[#e5b6b3] bg-[#fff1f0] text-[#9f2a20]"
    };
  }

  if (status === "invalid" || status === "invalid-unsubscribe") {
    return {
      title: "That link is expired or already used",
      body: "If you already confirmed, you are all set. Submit the form again only if you need a fresh confirmation email.",
      className: "border-[#e7ba6a] bg-[#fff7e8] text-[#7a4808]"
    };
  }

  if (status === "error") {
    return {
      title: "Something went wrong",
      body: "Please try again in a moment.",
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
  const message = statusMessage(params.status);

  return (
    <div className="section-shell grid gap-8 py-10 lg:grid-cols-[0.78fr_1fr] lg:items-start">
      <div className="max-w-2xl">
        <p className="label-eyebrow text-civic">Email updates</p>
        <h1 className="page-title mt-2">Get new SimpleCity posts by email.</h1>
        <p className="page-copy mt-4 text-base">
          Choose the cities and counties you care about. We will send a weekly digest when new public-meeting cards are published.
        </p>

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
      />
    </div>
  );
}
