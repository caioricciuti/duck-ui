/**
 * Turns a query result with a GEOMETRY column into GeoJSON for the map view.
 * Pure — no map library here, so it stays out of the lazy map chunk's way and
 * can be unit tested.
 */
import type { QueryResult } from "@/store/types";
import { forEachPosition, parseWkt, type Geometry } from "./wkt";

export type FeatureProperties = Record<string, string | number | boolean | null>;

export interface GeoFeature {
  type: "Feature";
  id: number;
  geometry: Geometry;
  properties: FeatureProperties;
}

export interface GeoFeatureCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}

export interface GeoConversion {
  collection: GeoFeatureCollection;
  /** Non-null cells that could not be drawn (unparseable, oversized, empty). */
  skipped: number;
  /** [minLon, minLat, maxLon, maxLat], or null when nothing was drawable. */
  bounds: [number, number, number, number] | null;
}

/** Column names whose DuckDB type is GEOMETRY (bare or parameterised). */
export const findGeometryColumns = (result: Pick<QueryResult, "columns" | "columnTypes">) =>
  result.columns.filter((_, i) => /^GEOMETRY\b/i.test(result.columnTypes[i] ?? ""));

/** Map features only carry flat scalar properties; everything else is shown as text. */
const toProperty = (value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return String(value);
  }
};

/** Coordinates outside lon/lat range mean a projected CRS the basemap can't place. */
const isLonLat = ([x, y]: number[]) =>
  Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90;

export const resultToGeoJson = (
  rows: Record<string, unknown>[],
  geometryColumn: string
): GeoConversion => {
  const features: GeoFeature[] = [];
  let skipped = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  rows.forEach((row, index) => {
    const raw = row[geometryColumn];
    if (raw === null || raw === undefined) return;
    const geometry = typeof raw === "string" ? parseWkt(raw) : null;
    if (!geometry) {
      skipped++;
      return;
    }

    let valid = true;
    forEachPosition(geometry, (p) => {
      if (!isLonLat(p)) valid = false;
    });
    if (!valid) {
      skipped++;
      return;
    }
    forEachPosition(geometry, ([x, y]) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    });

    const properties: FeatureProperties = {};
    for (const [key, value] of Object.entries(row)) {
      if (key !== geometryColumn) properties[key] = toProperty(value);
    }
    features.push({ type: "Feature", id: index, geometry, properties });
  });

  return {
    collection: { type: "FeatureCollection", features },
    skipped,
    bounds: features.length ? [minX, minY, maxX, maxY] : null,
  };
};
