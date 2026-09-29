/**
 * Map view for results with a GEOMETRY column.
 *
 * maplibre-gl (~1 MB) is imported on first use only, so it never enters the
 * main bundle. The basemap is OpenStreetMap's raster tiles — no API key — and
 * is optional: offline, or when tiles fail before any has loaded, the map
 * drops to a plain background and still draws the data.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { AlertTriangle, Loader2, MapPinOff } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/components/theme/theme-provider";
import { resultToGeoJson, type FeatureProperties } from "@/lib/geoResult";
import type { QueryResult } from "@/store/types";

const SOURCE_ID = "result";
const BASEMAP_ID = "basemap";
const ACCENT = "#D99B43";

/** Tile host. Covered by the existing CSP (img-src/connect-src allow https:). */
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

type MapLibre = typeof import("maplibre-gl");

let maplibrePromise: Promise<MapLibre> | null = null;

/** Loads maplibre, its worker and its stylesheet once, on first map render. */
const loadMapLibre = (): Promise<MapLibre> => {
  maplibrePromise ??= Promise.all([
    import("maplibre-gl"),
    // Bundled by Vite as a standalone worker file; maplibre's own lookup
    // (relative to import.meta.url) doesn't survive bundling.
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ])
    .then(([lib, worker]) => {
      lib.setWorkerUrl(worker.default);
      return lib;
    })
    .catch((error: unknown) => {
      maplibrePromise = null; // let a later render retry (e.g. chunk fetch failed offline)
      throw error;
    });
  return maplibrePromise;
};

const isDarkMode = (theme: string) =>
  theme === "dark" || (theme === "system" && document.documentElement.classList.contains("dark"));

const buildStyle = (dark: boolean, withBasemap: boolean): StyleSpecification => ({
  version: 8,
  sources: withBasemap
    ? {
        [BASEMAP_ID]: {
          type: "raster",
          tiles: [OSM_TILES],
          tileSize: 256,
          maxzoom: 19,
          attribution: OSM_ATTRIBUTION,
        },
      }
    : {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": dark ? "#1a1a1a" : "#f4f4f5" },
    },
    ...(withBasemap
      ? [
          {
            id: BASEMAP_ID,
            type: "raster" as const,
            source: BASEMAP_ID,
            // Dim the light OSM style in dark mode instead of loading a second tileset.
            paint: dark
              ? { "raster-brightness-max": 0.55, "raster-saturation": -0.6 }
              : { "raster-saturation": -0.2 },
          },
        ]
      : []),
  ],
});

/** Popup body built from DOM nodes, never HTML strings — values are user data. */
const buildPopup = (properties: FeatureProperties): HTMLElement => {
  const table = document.createElement("table");
  table.className = "text-xs";
  for (const [key, value] of Object.entries(properties).slice(0, 20)) {
    const row = table.insertRow();
    const k = row.insertCell();
    k.textContent = key;
    k.className = "pr-2 font-medium align-top text-neutral-500";
    const v = row.insertCell();
    v.textContent = value === null ? "NULL" : String(value);
    v.className = "break-all text-neutral-900";
  }
  return table;
};

interface GeoMapViewProps {
  result: QueryResult;
  geometryColumns: string[];
}

export default function GeoMapView({ result, geometryColumns }: GeoMapViewProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [selectedColumn, setSelectedColumn] = useState(geometryColumns[0]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [basemapOff, setBasemapOff] = useState(false);

  const column = geometryColumns.includes(selectedColumn) ? selectedColumn : geometryColumns[0];
  const conversion = useMemo(() => resultToGeoJson(result.data, column), [result.data, column]);
  const dark = isDarkMode(theme);

  // Create the map once per theme; data updates go through setData below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const withBasemap = typeof navigator === "undefined" || navigator.onLine !== false;

    loadMapLibre()
      .then((maplibre) => {
        if (cancelled) return;
        const map = new maplibre.Map({
          container,
          style: buildStyle(dark, withBasemap),
          center: [0, 20],
          zoom: 1,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

        let tileLoaded = false;
        map.on("sourcedata", (e) => {
          if (e.sourceId === BASEMAP_ID && e.tile) tileLoaded = true;
        });
        map.on("error", (e) => {
          const sourceId = (e as { sourceId?: string }).sourceId;
          // A basemap that never produced a tile is unreachable (offline,
          // blocked host): fall back to the plain background.
          if (sourceId === BASEMAP_ID && !tileLoaded && map.getLayer(BASEMAP_ID)) {
            map.setLayoutProperty(BASEMAP_ID, "visibility", "none");
            setBasemapOff(true);
          }
        });
        if (!withBasemap) setBasemapOff(true);

        map.on("load", () => {
          map.addSource(SOURCE_ID, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: "result-fill",
            type: "fill",
            source: SOURCE_ID,
            filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
            paint: { "fill-color": ACCENT, "fill-opacity": 0.3 },
          });
          map.addLayer({
            id: "result-line",
            type: "line",
            source: SOURCE_ID,
            filter: ["!", ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]]],
            paint: { "line-color": ACCENT, "line-width": 1.5 },
          });
          map.addLayer({
            id: "result-point",
            type: "circle",
            source: SOURCE_ID,
            filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
            paint: {
              "circle-color": ACCENT,
              "circle-radius": 4,
              "circle-stroke-color": dark ? "#1a1a1a" : "#ffffff",
              "circle-stroke-width": 1,
            },
          });

          for (const layer of ["result-fill", "result-line", "result-point"]) {
            map.on("click", layer, (e) => {
              const feature = e.features?.[0];
              if (!feature) return;
              new maplibre.Popup({ maxWidth: "320px" })
                .setLngLat(e.lngLat)
                .setDOMContent(buildPopup(feature.properties as FeatureProperties))
                .addTo(map);
            });
            map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
            map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
          }
          setMapReady(true);
        });

        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(container);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMapError(error instanceof Error ? error.message : "Failed to load the map");
        }
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
      setBasemapOff(false);
    };
  }, [dark]);

  // Push data and frame it whenever the result or chosen column changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource<GeoJSONSource>(SOURCE_ID);
    // Our GeoJSON types are structurally identical to maplibre's.
    source?.setData(conversion.collection as Parameters<GeoJSONSource["setData"]>[0]);
    const b = conversion.bounds;
    if (b) {
      if (b[0] === b[2] && b[1] === b[3]) {
        map.jumpTo({ center: [b[0], b[1]], zoom: 12 });
      } else {
        map.fitBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding: 40, maxZoom: 16, duration: 0 }
        );
      }
    }
  }, [conversion, mapReady]);

  const featureCount = conversion.collection.features.length;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-1.5 border-b text-xs text-muted-foreground">
        {geometryColumns.length > 1 ? (
          <Select value={column} onValueChange={setSelectedColumn}>
            <SelectTrigger className="h-7 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {geometryColumns.map((name) => (
                <SelectItem key={name} value={name} className="text-xs">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="font-mono">{column}</span>
        )}
        <span>
          {featureCount.toLocaleString()} {featureCount === 1 ? "feature" : "features"}
        </span>
        {conversion.skipped > 0 && (
          <span
            className="flex items-center gap-1 text-amber-600 dark:text-amber-400"
            title="Rows whose geometry couldn't be parsed, was too large to decode, or isn't in lon/lat (try ST_Transform to EPSG:4326)"
          >
            <AlertTriangle className="h-3 w-3" />
            {conversion.skipped.toLocaleString()} not drawn
          </span>
        )}
        {result.truncated && <span>· first {result.rowCount.toLocaleString()} rows</span>}
        {basemapOff && <span className="ml-auto">Basemap unavailable — offline view</span>}
      </div>
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="absolute inset-0" />
        {!mapReady && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading map…
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <MapPinOff className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm">The map couldn't be displayed.</p>
            <p className="text-xs text-muted-foreground max-w-md">{mapError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
