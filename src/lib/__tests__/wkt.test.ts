import { describe, it, expect } from "vitest";
import { forEachPosition, parseWkt } from "../wkt";

describe("parseWkt", () => {
  it("parses POINT", () => {
    expect(parseWkt("POINT (1 2)")).toEqual({ type: "Point", coordinates: [1, 2] });
    expect(parseWkt("point(-1.5 2e3)")).toEqual({ type: "Point", coordinates: [-1.5, 2000] });
  });

  it("parses LINESTRING", () => {
    expect(parseWkt("LINESTRING (0 0, 1 1, 2 0.5)")).toEqual({
      type: "LineString",
      coordinates: [
        [0, 0],
        [1, 1],
        [2, 0.5],
      ],
    });
  });

  it("parses POLYGON with a hole", () => {
    expect(parseWkt("POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0), (2 2, 3 2, 3 3, 2 2))")).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [2, 2],
          [3, 2],
          [3, 3],
          [2, 2],
        ],
      ],
    });
  });

  it("parses MULTIPOINT in both the bare and parenthesised forms", () => {
    const expected = {
      type: "MultiPoint",
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    };
    expect(parseWkt("MULTIPOINT (1 2, 3 4)")).toEqual(expected);
    expect(parseWkt("MULTIPOINT ((1 2), (3 4))")).toEqual(expected);
  });

  it("parses MULTILINESTRING and MULTIPOLYGON", () => {
    expect(parseWkt("MULTILINESTRING ((0 0, 1 1), (2 2, 3 3))")).toEqual({
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
        [
          [2, 2],
          [3, 3],
        ],
      ],
    });
    const mp = parseWkt("MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))");
    expect(mp?.type).toBe("MultiPolygon");
    if (mp?.type !== "MultiPolygon") throw new Error("unreachable");
    expect(mp.coordinates).toHaveLength(2);
    expect(mp.coordinates[1][0][2]).toEqual([6, 6]);
  });

  it("parses GEOMETRYCOLLECTION, including nested collections", () => {
    expect(
      parseWkt(
        "GEOMETRYCOLLECTION (POINT (1 2), LINESTRING (0 0, 1 1), GEOMETRYCOLLECTION (POINT (3 4)))"
      )
    ).toEqual({
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [1, 2] },
        {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        { type: "GeometryCollection", geometries: [{ type: "Point", coordinates: [3, 4] }] },
      ],
    });
  });

  it("keeps Z, drops M", () => {
    expect(parseWkt("POINT Z (1 2 3)")).toEqual({ type: "Point", coordinates: [1, 2, 3] });
    expect(parseWkt("POINT M (1 2 9)")).toEqual({ type: "Point", coordinates: [1, 2] });
    expect(parseWkt("POINT ZM (1 2 3 9)")).toEqual({ type: "Point", coordinates: [1, 2, 3] });
    expect(parseWkt("POINTZM (1 2 3 9)")).toEqual({ type: "Point", coordinates: [1, 2, 3] });
    expect(parseWkt("LINESTRING M (0 0 5, 1 1 6)")).toEqual({
      type: "LineString",
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    });
  });

  it("accepts an EWKT SRID prefix", () => {
    expect(parseWkt("SRID=4326;POINT (1 2)")).toEqual({ type: "Point", coordinates: [1, 2] });
  });

  it("returns null for EMPTY geometries", () => {
    expect(parseWkt("POINT EMPTY")).toBeNull();
    expect(parseWkt("POLYGON EMPTY")).toBeNull();
    expect(parseWkt("GEOMETRYCOLLECTION EMPTY")).toBeNull();
  });

  it("drops EMPTY members of a collection", () => {
    expect(parseWkt("GEOMETRYCOLLECTION (POINT EMPTY, POINT (1 2))")).toEqual({
      type: "GeometryCollection",
      geometries: [{ type: "Point", coordinates: [1, 2] }],
    });
  });

  it("returns null for invalid input instead of throwing", () => {
    expect(parseWkt("")).toBeNull();
    expect(parseWkt("GEOMETRY (12.3 KB)")).toBeNull();
    expect(parseWkt("POINT (1)")).toBeNull();
    expect(parseWkt("POINT (1 2")).toBeNull();
    expect(parseWkt("POINT (1 2) trailing")).toBeNull();
    expect(parseWkt("CIRCLE (0 0, 5)")).toBeNull();
  });

  it("reads the Z variants the grid's WKB decoder prints", () => {
    expect(parseWkt("POLYGON Z ((0 0 1, 1 0 1, 1 1 1, 0 0 1))")?.type).toBe("Polygon");
    expect(parseWkt("MULTIPOINT Z (1 2 3, 4 5 6)")).toEqual({
      type: "MultiPoint",
      coordinates: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });
  });
});

describe("forEachPosition", () => {
  it("visits every coordinate, recursing into collections", () => {
    const geometry = parseWkt(
      "GEOMETRYCOLLECTION (POINT (1 2), MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0))))"
    );
    const seen: number[][] = [];
    if (geometry) forEachPosition(geometry, (p) => seen.push(p));
    expect(seen).toEqual([
      [1, 2],
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]);
  });
});
