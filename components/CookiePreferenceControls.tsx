"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { JURISDICTION_PREFERENCE_COOKIE } from "@/lib/config/jurisdictions";
import {
  MEETING_VIEW_PREFERENCE_COOKIE,
  MEETING_VIEW_STORAGE_KEY
} from "@/lib/config/meetingView";
import { LOCALE_COOKIE, LOCALE_STORAGE_KEY, type Locale } from "@/lib/i18n";

const JURISDICTION_STORAGE_KEY = "simplecity.jurisdiction";

export function CookiePreferenceControls({ locale }: { locale: Locale }) {
  const [cleared, setCleared] = useState(false);

  function clearPreferences() {
    for (const cookieName of [
      LOCALE_COOKIE,
      JURISDICTION_PREFERENCE_COOKIE,
      MEETING_VIEW_PREFERENCE_COOKIE
    ]) {
      document.cookie = `${cookieName}=; path=/; max-age=0; samesite=lax`;
    }

    try {
      for (const storageKey of [
        LOCALE_STORAGE_KEY,
        JURISDICTION_STORAGE_KEY,
        MEETING_VIEW_STORAGE_KEY
      ]) {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Some browsers can block local storage. Cookie removal still succeeds.
    }

    setCleared(true);
  }

  return (
    <div className="quiet-card p-5 sm:p-6">
      <h2 className="text-xl font-black text-ink">
        {locale === "es" ? "Preferencias de SimpleCity" : "SimpleCity preferences"}
      </h2>
      <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-black/65">
        {locale === "es"
          ? "Puedes borrar el idioma, la jurisdicción y la vista de reuniones guardados en este dispositivo. SimpleCity volverá a usar sus valores predeterminados. Esto no desactiva Google Analytics."
          : "You can clear the language, jurisdiction, and meeting-view choices saved on this device. SimpleCity will return to its defaults. This does not disable Google Analytics."}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="action-secondary" onClick={clearPreferences} type="button">
          <RotateCcw aria-hidden className="h-4 w-4" />
          {locale === "es" ? "Borrar preferencias" : "Clear preferences"}
        </button>
        {cleared ? (
          <span className="inline-flex items-center gap-2 text-sm font-bold text-[#24613c]" role="status">
            <CheckCircle2 aria-hidden className="h-4 w-4" />
            {locale === "es" ? "Preferencias borradas" : "Preferences cleared"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
