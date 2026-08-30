"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { DecisionMapPoint } from "@/lib/types";

type DecisionMapGroup = {
  latitude: number;
  longitude: number;
  locationLabel: string;
  points: DecisionMapPoint[];
};

function groupMapPoints(points: DecisionMapPoint[]) {
  const groups = new Map<string, DecisionMapGroup>();
  for (const point of points) {
    const key = `${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`;
    const group = groups.get(key);
    if (group) group.points.push(point);
    else {
      groups.set(key, {
        latitude: point.latitude,
        longitude: point.longitude,
        locationLabel: point.locationLabel,
        points: [point]
      });
    }
  }
  return [...groups.values()];
}

export function DecisionMapCanvas({
  points,
  apiKey,
  locale
}: {
  points: DecisionMapPoint[];
  apiKey: string;
  locale: "en" | "es";
}) {
  const container = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupMapPoints(points), [points]);
  const initialGroups = useRef(groups);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [selected, setSelected] = useState<DecisionMapGroup | null>(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!container.current || initialGroups.current.length === 0) return;

    const mapContainer = container.current;
    const firstGroup = initialGroups.current[0];

    const map = new maplibregl.Map({
      container: mapContainer,
      style: {
        version: 8,
        sources: {
          "maptiler-streets": {
            type: "raster",
            tiles: [
              `https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}`
            ],
            tileSize: 256,
            attribution: "© MapTiler © OpenStreetMap contributors"
          }
        },
        layers: [{ id: "maptiler-streets", type: "raster", source: "maptiler-streets" }]
      },
      center: [firstGroup.longitude, firstGroup.latitude],
      zoom: 10,
      attributionControl: false,
      cooperativeGestures: true
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '<a href="https://maplibre.org/" target="_blank">MapLibre</a>'
      }),
      "bottom-right"
    );
    const attribution = mapContainer.querySelector<HTMLDetailsElement>(
      ".maplibregl-ctrl-attrib"
    );
    attribution?.classList.remove("maplibregl-compact-show");
    attribution?.removeAttribute("open");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("error", () => setMapError(true));

    map.on("load", () => {
      const bounds = new maplibregl.LngLatBounds();
      for (const group of initialGroups.current) {
        bounds.extend([group.longitude, group.latitude]);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 52, maxZoom: 15, duration: 0 });
      }
    });

    return () => {
      markersRef.current = [];
      mapRef.current = null;
      map.remove();
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current) marker.remove();

    const markers = groups.map((group) => {
      const count = group.points.length;
      const markerOptions: maplibregl.MarkerOptions = count === 1
        ? { color: "#d3533d", scale: 0.8 }
        : { element: document.createElement("button") };
      const marker = new maplibregl.Marker(markerOptions)
        .setLngLat([group.longitude, group.latitude])
        .addTo(map);
      const element = marker.getElement();
      if (count > 1) {
        element.textContent = String(count);
        element.style.width = "2.25rem";
        element.style.height = "2.25rem";
        element.style.borderRadius = "9999px";
        element.style.border = "2px solid white";
        element.style.background = "#1746a2";
        element.style.color = "white";
        element.style.fontWeight = "800";
        element.style.boxShadow = "0 2px 6px rgb(0 0 0 / 0.25)";
        element.style.cursor = "pointer";
      }
      element.setAttribute("role", "button");
      element.setAttribute("tabindex", "0");
      element.setAttribute(
        "aria-label",
        count === 1
          ? group.points[0].title
          : `${count} decisions at ${group.locationLabel}`
      );
      const selectPoint = () => setSelected(group);
      element.addEventListener("click", selectPoint);
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectPoint();
        }
      });
      return marker;
    });

    markersRef.current = markers;
    setSelected((current) => {
      if (!current) return null;
      return groups.find(
        (group) =>
          group.latitude === current.latitude && group.longitude === current.longitude
      ) || null;
    });

    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [groups, locale]);

  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm">
      <div ref={container} className="h-[28rem] w-full sm:h-[34rem]" aria-label={locale === "es" ? "Mapa de decisiones" : "Map of decisions"} />
      {mapError ? (
        <p className="border-t border-black/10 px-4 py-3 text-sm font-semibold text-clay">
          {locale === "es" ? "Algunas partes del mapa no pudieron cargarse." : "Some map content could not be loaded."}
        </p>
      ) : null}
      {selected ? (
        <article className="border-t border-black/10 p-4" aria-live="polite">
          <p className="text-sm text-black/65">{selected.locationLabel}</p>
          {selected.points.length === 1 ? (
            <>
              <p className="mt-2 text-xs font-black uppercase tracking-wide text-civic">
                {selected.points[0].jurisdiction}
                {selected.points[0].category ? ` · ${selected.points[0].category}` : ""}
              </p>
              <h4 className="mt-1 text-base font-black text-ink">{selected.points[0].title}</h4>
              <Link href={selected.points[0].href} className="action-link mt-2 inline-flex !px-0">
                {locale === "es" ? "Ver decisión" : "View decision"}
              </Link>
            </>
          ) : (
            <>
              <h4 className="mt-2 text-base font-black text-ink">
                {locale === "es"
                  ? `${selected.points.length} decisiones en esta ubicación`
                  : `${selected.points.length} decisions at this location`}
              </h4>
              <ul className="mt-2 divide-y divide-black/10">
                {selected.points.map((point) => (
                  <li key={point.id} className="py-2">
                    <Link href={point.href} className="font-bold text-civic hover:underline">
                      {point.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>
      ) : null}
    </div>
  );
}
