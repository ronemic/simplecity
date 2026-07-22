"use client";

import { CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

type JurisdictionOption = {
  value: string;
  label: string;
};

type SubscribeStatus = "idle" | "success" | "error";

export function SubscribeForm({
  jurisdictions,
  initialJurisdiction,
  locale
}: {
  jurisdictions: JurisdictionOption[];
  initialJurisdiction?: string;
  locale: Locale;
}) {
  const initialSelections = useMemo(() => {
    const fallback = jurisdictions[0]?.value;
    const initial = jurisdictions.some((jurisdiction) => jurisdiction.value === initialJurisdiction)
      ? initialJurisdiction
      : fallback;

    return initial ? [initial] : [];
  }, [initialJurisdiction, jurisdictions]);
  const [email, setEmail] = useState("");
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<string[]>(initialSelections);
  const [status, setStatus] = useState<SubscribeStatus>("idle");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleJurisdiction(value: string) {
    setSelectedJurisdictions((current) => {
      if (current.includes(value)) {
        return current.length === 1 ? current : current.filter((item) => item !== value);
      }

      return [...current, value];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setStatus("idle");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/email/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          jurisdictions: selectedJurisdictions,
          company: String(formData.get("company") || "")
        })
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus("error");
        setMessage(
          locale === "en"
            ? result.error || t(locale, "subscribeFormFallbackError")
            : t(locale, "subscribeFormFallbackError")
        );
        return;
      }

      setStatus("success");
      setMessage(t(locale, "subscribeFormSuccess"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="quiet-card grid gap-6 p-5 sm:p-7" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <label className="text-sm font-bold text-ink" htmlFor="subscribe-email">
          {t(locale, "subscribeEmailAddress")}
        </label>
        <div className="relative">
          <Mail
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-civic"
          />
          <input
            id="subscribe-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input-control input-control--with-icon"
            placeholder={t(locale, "subscribeEmailPlaceholder")}
          />
        </div>
      </div>

      <input
        aria-hidden="true"
        autoComplete="off"
        className="hidden"
        name="company"
        tabIndex={-1}
        type="text"
      />

      <fieldset className="grid gap-3 border-t border-black/10 pt-5">
        <legend className="text-sm font-bold text-ink">
          {t(locale, "subscribeWeeklyDigestAreas")}
        </legend>
        <div className="grid border-y border-black/10 sm:grid-cols-2">
          {jurisdictions.map((jurisdiction) => {
            const checked = selectedJurisdictions.includes(jurisdiction.value);

            return (
              <label
                key={jurisdiction.value}
                className={`flex min-h-12 cursor-pointer items-center gap-3 border-b border-black/10 px-1 py-3 text-sm font-semibold transition last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:odd:border-r sm:odd:border-black/10 sm:odd:pr-4 sm:even:pl-4 ${
                  checked
                    ? "text-civic"
                    : "text-ink hover:bg-[#f7fbff]"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#2457a6]"
                  checked={checked}
                  onChange={() => toggleJurisdiction(jurisdiction.value)}
                />
                <span>{jurisdiction.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-5">
        <button className="action-primary w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <Send aria-hidden className="h-4 w-4" />
          )}
          {t(locale, "subscribe")}
        </button>
        <p className="border-t border-black/10 pt-5 text-sm font-medium leading-6 text-black/60">
          {t(locale, "subscribeAlreadySubscribedHelp")}
        </p>
      </div>

      {message ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-bold ${
            status === "success"
              ? "border-[#9fc6b2] bg-[#f1fbf4] text-[#24613c]"
              : "border-[#e5b6b3] bg-[#fff1f0] text-[#9f2a20]"
          }`}
          role="status"
        >
          <span className="inline-flex items-start gap-2">
            {status === "success" ? <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4" /> : null}
            {message}
          </span>
        </div>
      ) : null}
    </form>
  );
}
