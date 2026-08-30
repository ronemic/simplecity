"use client";

import dynamic from "next/dynamic";
import { Loader2, MapPin } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { DecisionMapPoint } from "@/lib/types";
import { normalizeDecisionMapTimeframe, type DecisionMapTimeframe } from "@/lib/maps/timeframe";

const pointCache = new Map<string, DecisionMapPoint[]>();
const MAX_CACHED_POINT_QUERIES = 30;

function cachePoints(key: string, points: DecisionMapPoint[]) {
  pointCache.delete(key);
  pointCache.set(key, points);
  if (pointCache.size > MAX_CACHED_POINT_QUERIES) {
    const oldestKey = pointCache.keys().next().value;
    if (oldestKey) pointCache.delete(oldestKey);
  }
}

const DecisionMapCanvas = dynamic(
  () => import("@/components/DecisionMapCanvas").then((module) => module.DecisionMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[28rem] items-center justify-center rounded-xl bg-black/[0.03]">
        <Loader2 aria-hidden className="h-6 w-6 animate-spin text-civic" />
      </div>
    )
  }
);

export function DecisionMapPanel({ query, locale }: { query: string; locale: "en" | "es" }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [points, setPoints] = useState<DecisionMapPoint[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [mapStarted, setMapStarted] = useState(false);
  const [settledRequestUrl, setSettledRequestUrl] = useState<string | null>(null);
  const [failedRequestUrl, setFailedRequestUrl] = useState<string | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY || "";
  const timeframe = normalizeDecisionMapTimeframe(searchParams.get("mapRange"));
  const requestParams = new URLSearchParams(query);
  requestParams.set("lang", locale);
  const requestUrl = `/api/decisions/map?${requestParams.toString()}`;
  const error = failedRequestUrl === requestUrl;
  const loading = !hasLoaded && !error;
  const refreshing = hasLoaded && settledRequestUrl !== requestUrl;

  function changeTimeframe(nextTimeframe: DecisionMapTimeframe) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextTimeframe === "12m") params.delete("mapRange");
    else params.set("mapRange", nextTimeframe);
    params.delete("page");
    router.replace(`${pathname}${params.size > 0 ? `?${params.toString()}` : ""}`, {
      scroll: false
    });
  }

  useEffect(() => {
    if (!apiKey) return;
    const controller = new AbortController();
    const cached = pointCache.get(requestUrl);
    const request = cached
      ? Promise.resolve(cached)
      : fetch(requestUrl, { signal: controller.signal }).then(async (response) => {
          if (!response.ok) throw new Error("Map data request failed");
          const body = await response.json() as { points?: DecisionMapPoint[] };
          return body.points || [];
        });

    request
      .then((nextPoints) => {
        if (controller.signal.aborted) return;
        cachePoints(requestUrl, nextPoints);
        setPoints(nextPoints);
        setHasLoaded(true);
        if (nextPoints.length > 0) setMapStarted(true);
        setFailedRequestUrl(null);
        setSettledRequestUrl(requestUrl);
      })
      .catch((fetchError: unknown) => {
        if (!(fetchError instanceof DOMException && fetchError.name === "AbortError")) {
          setFailedRequestUrl(requestUrl);
          setSettledRequestUrl(requestUrl);
        }
      });

    return () => controller.abort();
  }, [apiKey, requestUrl]);

  if (!apiKey) {
    return (
      <div className="quiet-card p-8 text-center">
        <MapPin aria-hidden className="mx-auto h-7 w-7 text-civic" />
        <h3 className="mt-3 text-lg font-black text-ink">
          {locale === "es" ? "El mapa aún no está configurado" : "Map configuration is not available yet"}
        </h3>
      </div>
    );
  }

  if (loading && !hasLoaded) {
    return (
      <div className="quiet-card flex min-h-[28rem] items-center justify-center" aria-live="polite">
        <Loader2 aria-hidden className="h-6 w-6 animate-spin text-civic" />
        <span className="sr-only">{locale === "es" ? "Cargando mapa" : "Loading map"}</span>
      </div>
    );
  }

  if (error && !hasLoaded) {
    return (
      <div className="quiet-card p-8 text-center text-sm font-semibold text-black/65">
        {locale === "es" ? "No se pudo cargar el mapa." : "The map could not be loaded."}
      </div>
    );
  }

  if (!mapStarted && points.length === 0) {
    return (
      <div className="quiet-card p-8 text-center">
        <MapPin aria-hidden className="mx-auto h-7 w-7 text-black/35" />
        <h3 className="mt-3 text-lg font-black text-ink">
          {locale === "es" ? "No hay ubicaciones verificadas" : "No verified locations for these decisions"}
        </h3>
        <p className="mt-2 text-sm text-black/60">
          {locale === "es"
            ? "Las decisiones sin una dirección precisa permanecen disponibles en la lista."
            : "Decisions without a precise address remain available in the list."}
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="decision-map-heading" aria-busy={refreshing}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 id="decision-map-heading" className="text-sm font-black text-ink">
          {locale === "es" ? "Decisiones con ubicación verificada" : "Decisions with verified locations"}
        </h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-bold text-black/60">
            <span>{locale === "es" ? "Período" : "Timeframe"}</span>
            <select
              value={timeframe}
              onChange={(event) => changeTimeframe(event.target.value as DecisionMapTimeframe)}
              className="min-h-9 rounded-lg border border-black/15 bg-white px-2 text-xs font-bold text-ink"
            >
              <option value="3m">{locale === "es" ? "3 meses" : "3 months"}</option>
              <option value="12m">{locale === "es" ? "12 meses" : "12 months"}</option>
              <option value="all">{locale === "es" ? "Todo el historial" : "All history"}</option>
            </select>
          </label>
          <p className="text-xs font-semibold text-black/50">
            {refreshing ? (
              <Loader2 aria-hidden className="inline h-3.5 w-3.5 animate-spin" />
            ) : locale === "es" ? `${points.length} decisiones` : `${points.length} decisions`}
          </p>
        </div>
      </div>
      {points.length === 0 ? (
        <p className="mb-3 rounded-lg bg-black/[0.035] px-3 py-2 text-sm font-semibold text-black/60">
          {locale === "es"
            ? "No hay ubicaciones verificadas para estos filtros."
            : "No verified locations match these filters."}
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 rounded-lg bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
          {locale === "es"
            ? "No se pudieron actualizar los puntos del mapa; se conservan los resultados anteriores."
            : "The map points could not be refreshed; the previous results remain visible."}
        </p>
      ) : null}
      <DecisionMapCanvas points={points} apiKey={apiKey} locale={locale} />
      <p className="mt-2 text-xs leading-5 text-black/50">
        {locale === "es"
          ? "El mapa solo incluye decisiones vinculadas a una dirección explícita en una fuente oficial."
          : "The map only includes decisions tied to an explicit address in an official source."}
      </p>
    </section>
  );
}
