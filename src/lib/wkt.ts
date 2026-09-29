/**
 * WKT → GeoJSON, for the map view of GEOMETRY results.
 *
 * The grid already renders GEOMETRY cells as the WKT DuckDB itself prints
 * (see services/duckdb/cellDecoders.ts), so the map reads that text rather
 * than decoding WKB a second time. Covers the seven OGC types, Z / M / ZM
 * variants (M is dropped — GeoJSON has no slot for it), EMPTY, and an EWKT
 * `SRID=…;` prefix. Anything else parses to null instead of throwing.
 */

export type Position = number[];

export type Geometry =
  | { type: "Point"; coordinates: Position }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPoint"; coordinates: Position[] }
  | { type: "MultiLineString"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] }
  | { type: "GeometryCollection"; geometries: Geometry[] };

const TYPE_NAMES: Record<string, Geometry["type"]> = {
  POINT: "Point",
  LINESTRING: "LineString",
  POLYGON: "Polygon",
  MULTIPOINT: "MultiPoint",
  MULTILINESTRING: "MultiLineString",
  MULTIPOLYGON: "MultiPolygon",
  GEOMETRYCOLLECTION: "GeometryCollection",
};

class WktParser {
  private pos = 0;

  constructor(private readonly text: string) {}

  private skipSpace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++;
  }

  private peek(): string {
    this.skipSpace();
    return this.text[this.pos] ?? "";
  }

  private expect(char: string): void {
    if (this.peek() !== char) throw new Error(`Expected "${char}" at ${this.pos}`);
    this.pos++;
  }

  /** Consumes `char` if it is next; reports whether it did. */
  private accept(char: string): boolean {
    if (this.peek() !== char) return false;
    this.pos++;
    return true;
  }

  private word(): string {
    this.skipSpace();
    const match = /^[A-Za-z]+/.exec(this.text.slice(this.pos));
    if (!match) return "";
    this.pos += match[0].length;
    return match[0].toUpperCase();
  }

  /** Peeks for EMPTY without consuming anything else. */
  private acceptEmpty(): boolean {
    const start = this.pos;
    if (this.word() === "EMPTY") return true;
    this.pos = start;
    return false;
  }

  private number(): number {
    this.skipSpace();
    const match = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(this.text.slice(this.pos));
    if (!match) throw new Error(`Expected a number at ${this.pos}`);
    this.pos += match[0].length;
    return Number(match[0]);
  }

  /** One coordinate tuple. `hasM` marks the last ordinate as a measure to drop. */
  private position(hasM: boolean): Position {
    const values: number[] = [];
    while (/[-+.\d]/.test(this.peek())) values.push(this.number());
    if (values.length < 2) throw new Error(`Expected a coordinate at ${this.pos}`);
    if (hasM) values.pop();
    return values.slice(0, 3);
  }

  /** `(x y, x y, …)`. MULTIPOINT may also wrap each point in its own parens. */
  private positionList(hasM: boolean): Position[] {
    if (this.acceptEmpty()) return [];
    this.expect("(");
    const out: Position[] = [];
    do {
      if (this.accept("(")) {
        out.push(this.position(hasM));
        this.expect(")");
      } else if (!this.acceptEmpty()) {
        out.push(this.position(hasM));
      }
    } while (this.accept(","));
    this.expect(")");
    return out;
  }

  private nested<T>(inner: () => T): T[] {
    if (this.acceptEmpty()) return [];
    this.expect("(");
    const out: T[] = [];
    do out.push(inner());
    while (this.accept(","));
    this.expect(")");
    return out;
  }

  geometry(): Geometry | null {
    let name = this.word();
    // Dimension tag: "POINT Z", "POINT ZM", or glued on as in "POINTZ".
    let tag = "";
    const glued = /^([A-Z]+?)(ZM|Z|M)$/.exec(name);
    if (!TYPE_NAMES[name] && glued && TYPE_NAMES[glued[1]]) {
      name = glued[1];
      tag = glued[2];
    }
    const type = TYPE_NAMES[name];
    if (!type) throw new Error(`Unknown geometry type "${name}"`);

    if (!tag) {
      const start = this.pos;
      tag = this.word();
      if (tag !== "Z" && tag !== "M" && tag !== "ZM") {
        tag = "";
        this.pos = start;
      }
    }
    const hasM = tag === "M" || tag === "ZM";

    switch (type) {
      case "Point": {
        if (this.acceptEmpty()) return null;
        this.expect("(");
        const coordinates = this.position(hasM);
        this.expect(")");
        return { type, coordinates };
      }
      case "LineString":
      case "MultiPoint": {
        const coordinates = this.positionList(hasM);
        return coordinates.length ? { type, coordinates } : null;
      }
      case "Polygon":
      case "MultiLineString": {
        const coordinates = this.nested(() => this.positionList(hasM));
        return coordinates.length ? { type, coordinates } : null;
      }
      case "MultiPolygon": {
        const coordinates = this.nested(() => this.nested(() => this.positionList(hasM)));
        return coordinates.length ? { type, coordinates } : null;
      }
      case "GeometryCollection": {
        const geometries = this.nested(() => this.geometry()).filter(
          (g): g is Geometry => g !== null
        );
        return geometries.length ? { type, geometries } : null;
      }
    }
  }

  parse(): Geometry | null {
    // EWKT: "SRID=4326;POINT (…)". The map assumes lon/lat regardless.
    const srid = /^\s*SRID=\d+;/i.exec(this.text);
    if (srid) this.pos = srid[0].length;
    const result = this.geometry();
    this.skipSpace();
    if (this.pos !== this.text.length) throw new Error(`Unexpected input at ${this.pos}`);
    return result;
  }
}

/**
 * Parses one WKT string. Returns null for EMPTY geometries and for anything
 * that isn't valid WKT (including the "GEOMETRY (12.3 KB)" placeholder the
 * grid shows for oversized values).
 */
export const parseWkt = (text: string): Geometry | null => {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return new WktParser(text).parse();
  } catch {
    return null;
  }
};

/** Visits every coordinate of a geometry, recursing into collections. */
export const forEachPosition = (geometry: Geometry, visit: (p: Position) => void): void => {
  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number") visit(value as Position);
    else value.forEach(walk);
  };
  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((g) => forEachPosition(g, visit));
  } else {
    walk(geometry.coordinates);
  }
};
