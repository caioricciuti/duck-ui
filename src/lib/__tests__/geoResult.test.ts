import { describe, it, expect } from "vitest";
import { findGeometryColumns, resultToGeoJson } from "../geoResult";

describe("findGeometryColumns", () => {
  it("picks GEOMETRY columns by DuckDB type", () => {
    expect(
      findGeometryColumns({
        columns: ["id", "geom", "name", "shape"],
        columnTypes: ["INTEGER", "GEOMETRY", "VARCHAR", "GEOMETRY('OGC:CRS84')"],
      })
    ).toEqual(["geom", "shape"]);
  });

  it("returns nothing when no column is spatial", () => {
    expect(findGeometryColumns({ columns: ["a"], columnTypes: ["VARCHAR"] })).toEqual([]);
  });
});

describe("resultToGeoJson", () => {
  it("builds features with the other columns as properties", () => {
    const { collection, skipped, bounds } = resultToGeoJson(
      [
        { id: 1, name: "a", big: 10n, geom: "POINT (10 20)" },
        { id: 2, name: "b", big: 11n, geom: "LINESTRING (-5 -5, 0 30)" },
      ],
      "geom"
    );
    expect(skipped).toBe(0);
    expect(collection.features).toHaveLength(2);
    expect(collection.features[0]).toEqual({
      type: "Feature",
      id: 0,
      geometry: { type: "Point", coordinates: [10, 20] },
      properties: { id: 1, name: "a", big: "10" },
    });
    expect(bounds).toEqual([-5, -5, 10, 30]);
  });

  it("ignores NULL geometries and counts undrawable ones", () => {
    const { collection, skipped } = resultToGeoJson(
      [
        { geom: null },
        { geom: "GEOMETRY (2.0 MB)" },
        { geom: "POINT EMPTY" },
        { geom: "POINT (500000 4649776)" }, // projected, not lon/lat
        { geom: "POINT (1 1)" },
      ],
      "geom"
    );
    expect(collection.features).toHaveLength(1);
    expect(skipped).toBe(3);
  });

  it("flattens nested values into strings", () => {
    const { collection } = resultToGeoJson(
      [{ geom: "POINT (0 0)", tags: { a: 1n }, at: new Date("2024-01-02T00:00:00Z") }],
      "geom"
    );
    expect(collection.features[0].properties).toEqual({
      tags: '{"a":"1"}',
      at: "2024-01-02T00:00:00.000Z",
    });
  });

  it("reports null bounds for an empty result", () => {
    expect(resultToGeoJson([], "geom").bounds).toBeNull();
  });
});
