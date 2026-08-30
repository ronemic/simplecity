"use client";

import Link from "next/link";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as maplibregl from "maplibre-gl";
import type { DecisionMapPoint } from "@/lib/types";

// Bundled chunks resolve MapLibre's own worker URL to a path that does not
// exist, which leaves vector tiles and clustering blank. The worker is copied
// into public/ by scripts/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const SOURCE_ID = "decision-points";
const CLUSTER_HALO_LAYER = "decision-cluster-halo";
const CLUSTER_LAYER = "decision-clusters";
const CLUSTER_COUNT_LAYER = "decision-cluster-count";
const POINT_LAYER = "decision-point";
const FIT_PADDING = 56;
const FIT_MAX_ZOOM = 14;

// Locations share one colour. Outcomes at a single address are usually a mix
// (10 awaiting + 1 approved + 1 other, say), and collapsing that into one
// swatch claimed more than the data supports.
const POINT_COLOR = "#d3533d";
const PIN_IMAGE = "decision-pin";
const PIN_SELECTED_IMAGE = "decision-pin-selected";
// Logical pin geometry. The tip sits on the bottom edge so `icon-anchor:
// "bottom"` lands it exactly on the coordinate, and the head centre is
// PIN_HEIGHT - PIN_HEAD_Y above that — which is where the count has to sit.
const PIN_WIDTH = 26;
const PIN_HEIGHT = 34;
const PIN_HEAD_Y = 13;
const PIN_HEAD_RADIUS = 11;
const PIN_COUNT_SIZE = 11;
const PIN_COUNT_OFFSET = -(PIN_HEIGHT - PIN_HEAD_Y) / PIN_COUNT_SIZE;

// Drawn rather than loaded: an ImageData is synchronous, so the symbol layer
// can be added in the same tick and never renders against a missing image.
function drawPin(stroke: string, strokeWidth: number, ratio = 2) {
  const canvas = document.createElement("canvas");
  canvas.width = PIN_WIDTH * ratio;
  canvas.height = PIN_HEIGHT * ratio;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.scale(ratio, ratio);

  const tipY = PIN_HEIGHT - strokeWidth / 2;
  // Where the sides meet the head tangentially, measured from straight down.
  const spread = Math.acos(PIN_HEAD_RADIUS / (tipY - PIN_HEAD_Y));
  context.beginPath();
  context.arc(
    PIN_WIDTH / 2,
    PIN_HEAD_Y,
    PIN_HEAD_RADIUS,
    Math.PI / 2 - spread,
    Math.PI / 2 + spread,
    true
  );
  context.lineTo(PIN_WIDTH / 2, tipY);
  context.closePath();

  context.fillStyle = POINT_COLOR;
  context.fill();
  context.lineWidth = strokeWidth;
  context.strokeStyle = stroke;
  context.lineJoin = "round";
  context.stroke();

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function addPinImages(map: maplibregl.Map) {
  const pins: Array<[string, string, number]> = [
    [PIN_IMAGE, "#ffffff", 2],
    [PIN_SELECTED_IMAGE, "#171717", 2.5]
  ];
  for (const [id, stroke, width] of pins) {
    if (map.hasImage(id)) continue;
    const image = drawPin(stroke, width);
    if (image) map.addImage(id, image, { pixelRatio: 2 });
  }
}

type DecisionMapGroup = {
  key: string;
  latitude: number;
  longitude: number;
  locationLabel: string;
  points: DecisionMapPoint[];
};

function groupMapPoints(points: DecisionMapPoint[]): DecisionMapGroup[] {
  const groups = new Map<string, DecisionMapGroup>();
  for (const point of points) {
    const key = `${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`;
    const group = groups.get(key);
    if (group) group.points.push(point);
    else {
      groups.set(key, {
        key,
        latitude: point.latitude,
        longitude: point.longitude,
        locationLabel: point.locationLabel,
        points: [point]
      });
    }
  }
  return [...groups.values()];
}

function toFeatureCollection(
  groups: DecisionMapGroup[]
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: groups.map((group) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [group.longitude, group.latitude] },
      properties: {
        groupKey: group.key,
        count: group.points.length
      }
    }))
  };
}

function boundsFor(groups: DecisionMapGroup[]) {
  const bounds = new maplibregl.LngLatBounds();
  for (const group of groups) bounds.extend([group.longitude, group.latitude]);
  return bounds.isEmpty() ? null : bounds;
}

export function DecisionMapCanvas({
  points,
  apiKey,
  locale,
  fullscreenControls
}: {
  points: DecisionMapPoint[];
  apiKey: string;
  locale: "en" | "es";
  // Search, topic and timeframe controls. Expanded, the map hides the page they
  // normally live on, so they travel into the overlay with it.
  fullscreenControls?: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => groupMapPoints(points), [points]);
  const initialGroups = useRef(groups);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  // Once the reader has driven the camera themselves, a filter change must not
  // yank them back to the full extent.
  const movedRef = useRef(false);
  const styleLoadedRef = useRef(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [ready, setReady] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mapError, setMapError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const selected = useMemo(
    () => groups.find((group) => group.key === selectedKey) || null,
    [groups, selectedKey]
  );

  const markMoved = useCallback(() => {
    movedRef.current = true;
    setHasMoved(true);
  }, []);

  const resetView = useCallback(() => {
    const map = mapRef.current;
    const bounds = boundsFor(groups);
    if (!map || !bounds) return;
    movedRef.current = false;
    setHasMoved(false);
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, duration: 500 });
  }, [groups]);

  const focusGroup = useCallback((group: DecisionMapGroup) => {
    setSelectedKey(group.key);
    const map = mapRef.current;
    if (!map) return;
    markMoved();
    map.easeTo({
      center: [group.longitude, group.latitude],
      zoom: Math.max(map.getZoom(), 15),
      duration: 500
    });
  }, [markMoved]);

  useEffect(() => {
    if (!container.current || initialGroups.current.length === 0) return;

    let removed = false;
    const map = new maplibregl.Map({
      container: container.current,
      // A muted data-visualisation basemap keeps the markers legible against
      // it; the vector style also stays sharp on high-density screens.
      style: `https://api.maptiler.com/maps/dataviz/style.json?key=${encodeURIComponent(apiKey)}`,
      bounds: boundsFor(initialGroups.current) || undefined,
      fitBoundsOptions: { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM },
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
    const attribution = container.current.querySelector<HTMLDetailsElement>(
      ".maplibregl-ctrl-attrib"
    );
    attribution?.classList.remove("maplibregl-compact-show");
    attribution?.removeAttribute("open");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // Only a style that never loads leaves the reader with nothing to look at.
    // Individual tile, glyph and sprite failures are transient and recoverable,
    // and a vector style makes far more of those requests than a raster one.
    map.on("error", () => {
      if (!styleLoadedRef.current) setMapError(true);
    });
    map.on("dragstart", markMoved);
    map.on("zoomstart", (event) => {
      if (event.originalEvent) markMoved();
    });

    map.on("load", () => {
      styleLoadedRef.current = true;
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: toFeatureCollection(initialGroups.current),
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 14,
        // Cluster badges count decisions, not addresses, so they reconcile with
        // the decision total shown above the map.
        clusterProperties: { decisions: ["+", ["get", "count"]] }
      });

      addPinImages(map);

      map.addLayer({
        id: POINT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": PIN_IMAGE,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          // Only a location holding more than one decision needs a number.
          "text-field": [
            "case",
            [">", ["get", "count"], 1],
            ["to-string", ["get", "count"]],
            ""
          ],
          "text-font": ["Noto Sans Bold"],
          "text-size": PIN_COUNT_SIZE,
          "text-offset": [0, PIN_COUNT_OFFSET],
          "text-allow-overlap": true,
          "text-ignore-placement": true
        },
        paint: { "text-color": "#ffffff" }
      });

      // Clusters and multi-decision locations both carry a number, so the halo
      // backs up the colour difference in saying which one you are looking at.
      map.addLayer({
        id: CLUSTER_HALO_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#12365f",
          "circle-opacity": 0.16,
          "circle-radius": ["step", ["get", "decisions"], 22, 5, 27, 15, 33, 40, 40]
        }
      });

      map.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#12365f",
          "circle-radius": ["step", ["get", "decisions"], 15, 5, 19, 15, 24, 40, 30],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff"
        }
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["to-string", ["get", "decisions"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["step", ["get", "decisions"], 11, 15, 12, 40, 13],
          "text-allow-overlap": true,
          "text-ignore-placement": true
        },
        paint: { "text-color": "#ffffff" }
      });

      map.on("click", CLUSTER_LAYER, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id;
        if (typeof clusterId !== "number") return;
        const source = map.getSource(SOURCE_ID);
        if (!(source instanceof maplibregl.GeoJSONSource)) return;
        const center = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        markMoved();
        source
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => {
            if (removed) return;
            map.easeTo({ center, zoom, duration: 500 });
          })
          .catch(() => {
            if (!removed) map.easeTo({ center, zoom: map.getZoom() + 2, duration: 500 });
          });
      });

      map.on("click", POINT_LAYER, (event) => {
        const groupKey = event.features?.[0]?.properties?.groupKey;
        if (typeof groupKey === "string") setSelectedKey(groupKey);
      });

      map.on("click", (event) => {
        const hits = map.queryRenderedFeatures(event.point, {
          layers: [CLUSTER_LAYER, POINT_LAYER]
        });
        if (hits.length === 0) setSelectedKey(null);
      });

      for (const layer of [CLUSTER_LAYER, POINT_LAYER]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      if (!removed) setReady(true);
    });

    return () => {
      removed = true;
      mapRef.current = null;
      styleLoadedRef.current = false;
      setReady(false);
      map.remove();
    };
  }, [apiKey, markMoved]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource(SOURCE_ID);
    if (!(source instanceof maplibregl.GeoJSONSource)) return;
    source.setData(toFeatureCollection(groups));
    const bounds = boundsFor(groups);
    if (!bounds) return;
    // Panning is respected while the reader can still see results. Once a
    // filter change moves every result off screen, staying put would just show
    // empty streets next to a "95 decisions" count, so refit regardless.
    const viewport = map.getBounds();
    const anyVisible = groups.some((group) =>
      viewport.contains([group.longitude, group.latitude])
    );
    if (movedRef.current && anyVisible) return;
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, duration: 400 });
    movedRef.current = false;
    setHasMoved(false);
  }, [groups, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer(POINT_LAYER)) return;
    map.setLayoutProperty(POINT_LAYER, "icon-image", selectedKey
      ? ["case", ["==", ["get", "groupKey"], selectedKey], PIN_SELECTED_IMAGE, PIN_IMAGE]
      : PIN_IMAGE);
  }, [ready, selectedKey]);

  // Keyed on the selection itself, not the resolved group, so a background
  // data refresh does not pull focus back to an already-open card.
  useEffect(() => {
    if (!selectedKey) return;
    cardRef.current?.focus({ preventScroll: true });
  }, [selectedKey]);

  // Escape peels one layer at a time: the open card first, then fullscreen.
  useEffect(() => {
    if (!selectedKey && !isFullscreen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selectedKey) setSelectedKey(null);
      else setIsFullscreen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isFullscreen, selectedKey]);

  // The expanded map covers the page, so the canvas has to be remeasured and
  // the page behind it must not scroll away underneath.
  // Held in a ref so resizing runs on the fullscreen toggle alone, not on every
  // filter change that produces a new resetView.
  const resetViewRef = useRef(resetView);
  useEffect(() => {
    resetViewRef.current = resetView;
  }, [resetView]);

  useEffect(() => {
    mapRef.current?.resize();
    // A much taller viewport makes the old camera a poor fit, so a reader who
    // has not taken the camera over gets the full extent refitted for them.
    if (!movedRef.current) resetViewRef.current();
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("has-fullscreen-overlay");
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("has-fullscreen-overlay");
    };
  }, [isFullscreen]);

  // Opening or closing the search and filter panels hands height to the map.
  useEffect(() => {
    mapRef.current?.resize();
  }, [fullscreenControls]);

  // Requiring a modifier to zoom protects the page scroll; filling the screen
  // there is no page scroll left to protect.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (isFullscreen) map.cooperativeGestures.disable();
    else map.cooperativeGestures.enable();
  }, [isFullscreen, ready]);

  const keyboardGroups = useMemo(
    () => [...groups].sort((a, b) => b.points.length - a.points.length),
    [groups]
  );

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[60] flex flex-col bg-white"
          : "overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm"
      }
    >
      {isFullscreen && fullscreenControls ? (
        <div className="max-h-[45vh] shrink-0 overflow-y-auto border-b border-black/10 bg-white px-4 py-2">
          {fullscreenControls}
        </div>
      ) : null}
      <div className={isFullscreen ? "relative min-h-0 flex-1" : "relative"}>
        <div
          ref={container}
          className={isFullscreen ? "h-full w-full" : "h-[28rem] w-full sm:h-[34rem]"}
          aria-hidden
        />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFullscreen((current) => !current)}
            aria-pressed={isFullscreen}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white/95 px-3 py-2 text-xs font-black text-ink shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic"
          >
            {isFullscreen ? (
              <Minimize2 aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 aria-hidden className="h-3.5 w-3.5" />
            )}
            {isFullscreen
              ? locale === "es" ? "Salir de pantalla completa" : "Exit full screen"
              : locale === "es" ? "Pantalla completa" : "Full screen"}
          </button>
          {hasMoved ? (
            <button
              type="button"
              onClick={resetView}
              className="rounded-lg border border-black/10 bg-white/95 px-3 py-2 text-xs font-black text-ink shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic"
            >
              {locale === "es" ? "Restablecer vista" : "Reset view"}
            </button>
          ) : null}
        </div>
        {selected ? (
          <article
            ref={cardRef}
            tabIndex={-1}
            aria-live="polite"
            className="border-t border-black/10 p-4 focus:outline-none sm:absolute sm:bottom-3 sm:left-3 sm:max-h-[calc(100%-1.5rem)] sm:w-80 sm:overflow-y-auto sm:rounded-xl sm:border sm:border-black/10 sm:bg-white/95 sm:shadow-lg sm:backdrop-blur"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-black/65">{selected.locationLabel}</p>
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                aria-label={locale === "es" ? "Cerrar detalles" : "Close details"}
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-black/45 transition hover:bg-black/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
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
      {/* The map draws to a canvas, so the same locations are exposed here as
          ordinary buttons. Collapsed, so it costs keyboard users one tab stop
          rather than one per location, and revealed on focus so a sighted
          keyboard user can see where focus has landed. */}
      <details className="sr-only focus-within:not-sr-only focus-within:block focus-within:max-h-64 focus-within:overflow-y-auto focus-within:border-t focus-within:border-black/10 focus-within:p-4 focus-within:text-sm">
        <summary className="cursor-pointer font-bold text-ink">
          {locale === "es"
            ? `Ubicaciones en el mapa (${keyboardGroups.length})`
            : `Locations on the map (${keyboardGroups.length})`}
        </summary>
        <ul className="mt-2 divide-y divide-black/10">
          {keyboardGroups.map((group) => (
            <li key={group.key}>
              <button
                type="button"
                onClick={() => focusGroup(group)}
                className="w-full py-2 text-left font-semibold text-civic hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic"
              >
                {group.points.length === 1
                  ? `${group.points[0].title} — ${group.locationLabel}`
                  : locale === "es"
                    ? `${group.points.length} decisiones en ${group.locationLabel}`
                    : `${group.points.length} decisions at ${group.locationLabel}`}
              </button>
            </li>
          ))}
        </ul>
      </details>
      {mapError ? (
        <p className="border-t border-black/10 px-4 py-3 text-sm font-semibold text-clay">
          {locale === "es" ? "Algunas partes del mapa no pudieron cargarse." : "Some map content could not be loaded."}
        </p>
      ) : null}
    </div>
  );
}
