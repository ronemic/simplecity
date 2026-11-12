"use client";

import { CheckCircle2, ChevronDown, Loader2, Mail, Search, Send, X, XCircle } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

type JurisdictionOption = {
  value: string;
  label: string;
  parentCountyValue?: string;
  kind?: "school-district";
};

type SubscribeStatus = "idle" | "success" | "error";

// The subscribe API answers in English (lib/email/subscriptions.ts and
// app/api/email/subscribe/route.ts). Known messages are translated here; any
// other error falls back to the generic message.
const spanishSubscribeErrors: Record<string, string> = {
  "Enter a valid email address.": "Escribe un correo electrónico válido.",
  "Choose at least one valid city or county.": "Elige al menos una ciudad o condado válido.",
  "Choose at least one city or county.": "Elige al menos una ciudad o condado.",
  "A confirmation email was sent recently. Please wait before trying again.":
    "Ya enviamos un correo de confirmación hace poco. Espera un momento antes de intentarlo de nuevo.",
  "Too many requests. Please try again later.":
    "Demasiadas solicitudes. Inténtalo de nuevo más tarde.",
  "We could not start that subscription. Please try again in a moment.":
    "No pudimos iniciar la suscripción. Inténtalo de nuevo en un momento."
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type CountyGroup = {
  county: JurisdictionOption;
  cities: JurisdictionOption[];
  districts: JurisdictionOption[];
};

/**
 * Builds the picker from the jurisdiction config so new cities, counties and
 * districts show up without touching this form: anything with children is a
 * county card, everything else without a parent is a standalone option.
 */
function groupJurisdictions(jurisdictions: JurisdictionOption[]) {
  const values = new Set(jurisdictions.map((jurisdiction) => jurisdiction.value));
  const parentValues = new Set(
    jurisdictions.map((jurisdiction) => jurisdiction.parentCountyValue).filter(Boolean)
  );
  const counties: CountyGroup[] = jurisdictions
    .filter((jurisdiction) => !jurisdiction.parentCountyValue && parentValues.has(jurisdiction.value))
    .map((county) => {
      const children = jurisdictions.filter(
        (jurisdiction) => jurisdiction.parentCountyValue === county.value
      );
      return {
        county,
        cities: children.filter((child) => child.kind !== "school-district"),
        districts: children.filter((child) => child.kind === "school-district")
      };
    });
  const standalone = jurisdictions.filter(
    (jurisdiction) =>
      (!jurisdiction.parentCountyValue && !parentValues.has(jurisdiction.value)) ||
      (jurisdiction.parentCountyValue && !values.has(jurisdiction.parentCountyValue))
  );

  return { counties, standalone };
}

function AreaOption({
  checked,
  label,
  hint,
  onToggle
}: {
  checked: boolean;
  label: string;
  hint?: string;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold ring-1 transition ${
        checked
          ? "bg-civic/10 text-civic ring-civic/35"
          : "bg-white text-ink ring-black/[0.08] hover:bg-[#f8fbff] hover:ring-civic/25"
      }`}
    >
      <input
        checked={checked}
        className="h-4 w-4 shrink-0 accent-[#2457a6]"
        onChange={onToggle}
        type="checkbox"
      />
      <span className="grid">
        <span>{label}</span>
        {hint ? <span className="text-xs font-semibold text-black/55">{hint}</span> : null}
      </span>
    </label>
  );
}

function subscribeErrorMessage(locale: Locale, error: string | undefined) {
  if (locale === "en") return error || t(locale, "subscribeFormFallbackError");
  return (error && spanishSubscribeErrors[error]) || t(locale, "subscribeFormFallbackError");
}

export function SubscribeForm({
  jurisdictions,
  initialJurisdiction,
  locale,
  compact = false
}: {
  jurisdictions: JurisdictionOption[];
  initialJurisdiction?: string;
  locale: Locale;
  compact?: boolean;
}) {
  const initialSelections = useMemo(() => {
    if (compact) return jurisdictions.map((jurisdiction) => jurisdiction.value);
    const fallback = jurisdictions[0]?.value;
    const initial = jurisdictions.some((jurisdiction) => jurisdiction.value === initialJurisdiction)
      ? initialJurisdiction
      : fallback;

    return initial ? [initial] : [];
  }, [compact, initialJurisdiction, jurisdictions]);
  const [email, setEmail] = useState("");
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<string[]>(initialSelections);
  const [status, setStatus] = useState<SubscribeStatus>("idle");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedCounties, setExpandedCounties] = useState<Set<string>>(
    () =>
      new Set(
        jurisdictions
          .filter((jurisdiction) => initialSelections.includes(jurisdiction.value))
          .map((jurisdiction) => jurisdiction.parentCountyValue || jurisdiction.value)
      )
  );
  const { counties, standalone } = useMemo(
    () => groupJurisdictions(jurisdictions),
    [jurisdictions]
  );
  const labelByValue = useMemo(
    () => new Map(jurisdictions.map((jurisdiction) => [jurisdiction.value, jurisdiction.label])),
    [jurisdictions]
  );
  const normalizedQuery = normalizeSearch(query);
  const searching = normalizedQuery.length > 0;
  const matches = (option: JurisdictionOption) =>
    !searching || normalizeSearch(option.label).includes(normalizedQuery);
  const visibleStandalone = standalone.filter(matches);
  const visibleCounties = counties
    .map((group) => {
      // A county name match shows everything in that county.
      const countyMatches = matches(group.county);
      const pick = (options: JurisdictionOption[]) =>
        countyMatches ? options : options.filter(matches);
      return {
        ...group,
        showCounty: countyMatches,
        visibleCities: pick(group.cities),
        visibleDistricts: pick(group.districts)
      };
    })
    .filter(
      (group) =>
        group.showCounty || group.visibleCities.length > 0 || group.visibleDistricts.length > 0
    );
  const nothingMatches = searching && visibleStandalone.length === 0 && visibleCounties.length === 0;

  function setMany(values: string[], selected: boolean) {
    setSelectedJurisdictions((current) =>
      selected
        ? [...current, ...values.filter((value) => !current.includes(value))]
        : current.filter((value) => !values.includes(value))
    );
  }

  function toggleCountyOpen(value: string) {
    setExpandedCounties((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

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
        setMessage(subscribeErrorMessage(locale, result.error));
        return;
      }

      setStatus("success");
      setMessage(
        selectedJurisdictions.length === 0
          ? t(locale, "subscribeFormUnsubscribeSuccess")
          : t(locale, "subscribeFormSuccess")
      );
    } catch {
      setStatus("error");
      setMessage(t(locale, "subscribeFormFallbackError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (compact) {
    return (
      <form className="redesign-briefing-form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="redesign-briefing-email">{t(locale, "subscribeEmailAddress")}</label>
        <input id="redesign-briefing-email" name="email" type="email" autoComplete="email" required
          value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        <input aria-hidden="true" autoComplete="off" className="hidden" name="company" tabIndex={-1} type="text" />
        <button className="redesign-button" disabled={isSubmitting || !selectedJurisdictions.length} type="submit">{t(locale, "subscribe")}</button>
        {message ? <p className="redesign-briefing-message" role="status">{message}</p> : null}
      </form>
    );
  }

  return (
    <form className="rd-subscribe-form rd-rule-panel quiet-card grid gap-5 p-5 sm:p-6" onSubmit={handleSubmit}>
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

      <fieldset className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <legend className="float-left text-sm font-black text-ink">
            {t(locale, "subscribeWeeklyDigestAreas")}
          </legend>
          <span className="text-sm font-bold text-black/60" aria-live="polite">
            {selectedJurisdictions.length} {t(locale, "subscribeSelected")}
          </span>
        </div>

        <div className="rd-subscribe-selected flex min-h-11 flex-wrap items-center gap-2 rounded-lg bg-[#f6f8fa] px-3 py-2">
          <span className="sr-only">{t(locale, "subscribeYourAreas")}</span>
          {selectedJurisdictions.length === 0 ? (
            <span className="text-sm font-semibold text-black/60">
              {t(locale, "subscribeNoneSelected")}
            </span>
          ) : (
            <>
              {selectedJurisdictions.map((value) => (
                <button
                  className="rd-subscribe-chip inline-flex items-center gap-1.5 rounded-full bg-white py-1 pl-3 pr-2 text-sm font-bold text-civic ring-1 ring-civic/30 transition hover:bg-civic/10"
                  key={value}
                  onClick={() => toggleJurisdiction(value)}
                  type="button"
                >
                  {labelByValue.get(value) || value}
                  <X aria-hidden className="h-3.5 w-3.5" />
                  <span className="sr-only">{t(locale, "subscribeRemoveArea")}</span>
                </button>
              ))}
              <button
                className="ml-auto text-sm font-bold text-black/60 underline-offset-2 hover:text-ink hover:underline"
                onClick={() => setSelectedJurisdictions([])}
                type="button"
              >
                {t(locale, "subscribeClearAll")}
              </button>
            </>
          )}
        </div>

        <div className="relative">
          <label className="sr-only" htmlFor="subscribe-area-search">
            {t(locale, "subscribeSearchAreas")}
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/45"
          />
          <input
            autoComplete="off"
            className="input-control input-control--with-icon"
            id="subscribe-area-search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter in the search box should not submit the subscription.
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder={t(locale, "subscribeSearchPlaceholder")}
            type="search"
            value={query}
          />
        </div>

        {nothingMatches ? (
          <p className="rounded-lg border border-dashed border-black/15 px-4 py-6 text-center text-sm font-semibold text-black/60">
            {t(locale, "subscribeNoMatches")}
          </p>
        ) : (
          <div className="rd-subscribe-list grid gap-2.5">
            {visibleStandalone.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {visibleStandalone.map((option) => (
                  <AreaOption
                    checked={selectedJurisdictions.includes(option.value)}
                    key={option.value}
                    label={option.label}
                    onToggle={() => toggleJurisdiction(option.value)}
                  />
                ))}
              </div>
            ) : null}

            {visibleCounties.map((group) => {
              const allValues = [
                group.county.value,
                ...group.cities.map((option) => option.value),
                ...group.districts.map((option) => option.value)
              ];
              const selectedCount = allValues.filter((value) =>
                selectedJurisdictions.includes(value)
              ).length;
              const allSelected = selectedCount === allValues.length;
              const open = searching || expandedCounties.has(group.county.value);
              const panelId = `subscribe-county-${group.county.value}`;

              return (
                <section
                  className={`rd-subscribe-county rounded-lg border bg-white ${
                    selectedCount > 0 ? "border-civic/35" : "border-black/[0.09]"
                  }`}
                  key={group.county.value}
                >
                  <div className="flex items-center gap-2 pr-2.5">
                    <button
                      aria-controls={panelId}
                      aria-expanded={open}
                      className="flex min-h-12 flex-1 items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left"
                      disabled={searching}
                      onClick={() => toggleCountyOpen(group.county.value)}
                      type="button"
                    >
                      <ChevronDown
                        aria-hidden
                        className={`h-4 w-4 shrink-0 text-black/50 transition-transform ${
                          open ? "" : "-rotate-90"
                        }`}
                      />
                      <span className="text-[15px] font-black text-ink">{group.county.label}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          selectedCount > 0 ? "bg-civic/10 text-civic" : "bg-black/[0.05] text-black/55"
                        }`}
                      >
                        {selectedCount > 0
                          ? `${selectedCount}/${allValues.length} ${t(locale, "subscribeSelected")}`
                          : `${allValues.length} ${t(locale, "subscribeAreas")}`}
                      </span>
                    </button>
                    <button
                      className="shrink-0 rounded-md px-2.5 py-1.5 text-sm font-bold text-civic hover:bg-civic/10"
                      onClick={() => setMany(allValues, !allSelected)}
                      type="button"
                    >
                      {allSelected ? t(locale, "subscribeClear") : t(locale, "subscribeSelectAll")}
                    </button>
                  </div>

                  {open ? (
                    <div className="grid gap-4 border-t border-black/[0.07] px-3.5 pb-4 pt-3.5" id={panelId}>
                      {group.showCounty ? (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          <AreaOption
                            checked={selectedJurisdictions.includes(group.county.value)}
                            hint={t(locale, "subscribeCountyGovernment")}
                            label={group.county.label}
                            onToggle={() => toggleJurisdiction(group.county.value)}
                          />
                        </div>
                      ) : null}
                      {[
                        { key: "cities", label: t(locale, "subscribeCities"), options: group.visibleCities },
                        {
                          key: "districts",
                          label: t(locale, "subscribeSchoolDistricts"),
                          options: group.visibleDistricts
                        }
                      ]
                        .filter((section) => section.options.length > 0)
                        .map((section) => (
                          <div
                            aria-labelledby={`${panelId}-${section.key}`}
                            className="grid gap-2"
                            key={section.key}
                            role="group"
                          >
                            <h3
                              className="text-xs font-black uppercase tracking-[0.05em] text-black/55"
                              id={`${panelId}-${section.key}`}
                            >
                              {section.label}
                            </h3>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {section.options.map((option) => (
                                <AreaOption
                                  checked={selectedJurisdictions.includes(option.value)}
                                  key={option.value}
                                  label={option.label}
                                  onToggle={() => toggleJurisdiction(option.value)}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
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
