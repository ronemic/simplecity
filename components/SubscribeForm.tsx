"use client";

import { CheckCircle2, Loader2, Mail, Send, XCircle } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

type JurisdictionOption = {
  value: string;
  label: string;
  parentCountyValue?: string;
  kind?: "school-district";
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
  const jurisdictionGroups = [
    {
      id: "regional",
      label: t(locale, "subscribeRegionalCoverage"),
      jurisdictions: jurisdictions.filter((jurisdiction) => !jurisdiction.parentCountyValue),
      columns: "sm:grid-cols-3 md:grid-cols-1"
    },
    {
      id: "san-mateo-cities",
      label: t(locale, "subscribeSanMateoCountyCities"),
      jurisdictions: jurisdictions.filter(
        (jurisdiction) => jurisdiction.parentCountyValue === "san-mateo-county"
      ),
      columns: "sm:grid-cols-2"
    },
    {
      id: "santa-clara-cities",
      label: t(locale, "subscribeSantaClaraCountyCities"),
      jurisdictions: jurisdictions.filter(
        (jurisdiction) =>
          jurisdiction.parentCountyValue === "santa-clara-county" &&
          jurisdiction.kind !== "school-district"
      ),
      columns: "sm:grid-cols-2 md:grid-cols-1"
    },
    {
      id: "school-districts",
      label: t(locale, "subscribeSchoolDistricts"),
      jurisdictions: jurisdictions.filter(
        (jurisdiction) => jurisdiction.kind === "school-district"
      ),
      columns: "sm:grid-cols-2 md:grid-cols-1"
    }
  ].filter((group) => group.jurisdictions.length > 0);

  function toggleJurisdiction(value: string) {
    setSelectedJurisdictions((current) => {
      if (current.includes(value)) {
        return current.filter((item) => item !== value);
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
        action?: "subscribe" | "unsubscribe";
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
      setMessage(
        selectedJurisdictions.length === 0
          ? t(locale, "subscribeFormUnsubscribeSuccess")
          : t(locale, "subscribeFormSuccess")
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="quiet-card grid gap-5 p-5 sm:p-6" onSubmit={handleSubmit}>
      <div className="grid gap-2.5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-2">
            <label className="text-sm font-black text-ink" htmlFor="subscribe-email">
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
          <button
            className="action-primary min-w-44 shrink-0"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            ) : (
              selectedJurisdictions.length === 0 ? (
                <XCircle aria-hidden className="h-4 w-4" />
              ) : (
                <Send aria-hidden className="h-4 w-4" />
              )
            )}
            {selectedJurisdictions.length === 0
              ? t(locale, "unsubscribe")
              : t(locale, "subscribe")}
          </button>
        </div>
        <p className="text-sm font-semibold leading-6 text-black/60">
          {selectedJurisdictions.length === 0
            ? t(locale, "subscribeFormUnsubscribeHelp")
            : t(locale, "subscribeAlreadySubscribedHelp")}
        </p>
      </div>

      <input
        aria-hidden="true"
        autoComplete="off"
        className="hidden"
        name="company"
        tabIndex={-1}
        type="text"
      />

      <fieldset className="grid gap-3">
        <legend className="text-sm font-black text-ink">
          {t(locale, "subscribeWeeklyDigestAreas")}
        </legend>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[0.78fr_1.3fr_0.92fr_1fr]">
          {jurisdictionGroups.map((group) => (
            <div
              aria-labelledby={`${group.id}-label`}
              className="rounded-lg bg-black/[0.025] p-3.5"
              key={group.id}
              role="group"
            >
              <h2
                className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.05em] text-black/60"
                id={`${group.id}-label`}
              >
                <span aria-hidden className="h-4 w-1 rounded-full bg-civic" />
                {group.label}
              </h2>
              <div className={`grid gap-2 ${group.columns}`}>
                {group.jurisdictions.map((jurisdiction) => {
                  const checked = selectedJurisdictions.includes(jurisdiction.value);

                  return (
                    <label
                      key={jurisdiction.value}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold shadow-[0_1px_2px_rgba(23,23,23,0.04)] ring-1 transition ${
                        checked
                          ? "bg-civic/10 text-civic ring-civic/35"
                          : "bg-white text-ink ring-black/[0.08] hover:bg-[#f8fbff] hover:ring-civic/25"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-[#2457a6]"
                        checked={checked}
                        onChange={() => toggleJurisdiction(jurisdiction.value)}
                      />
                      <span>{jurisdiction.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

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
