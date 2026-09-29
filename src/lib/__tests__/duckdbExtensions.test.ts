import { describe, it, expect } from "vitest";
import {
  buildExtensionSql,
  isUnavailableExtensionError,
  isValidExtensionName,
  parseExtensionRows,
} from "../duckdbExtensions";

describe("parseExtensionRows", () => {
  it("normalises Arrow booleans and JSON-transport strings", () => {
    expect(
      parseExtensionRows([
        { extension_name: "json", loaded: true, installed: true, description: "JSON" },
        { extension_name: "spatial", loaded: "false", installed: "true", description: null },
        { extension_name: null, loaded: true, installed: true },
      ])
    ).toEqual([
      { name: "json", loaded: true, installed: true, description: "JSON" },
      { name: "spatial", loaded: false, installed: true, description: "" },
    ]);
  });
});

describe("buildExtensionSql", () => {
  it("builds INSTALL and LOAD statements", () => {
    expect(buildExtensionSql("install", "spatial")).toBe("INSTALL spatial");
    expect(buildExtensionSql("load", "h3")).toBe("LOAD h3");
  });

  it("refuses names that are not plain identifiers", () => {
    expect(isValidExtensionName("sqlite_scanner")).toBe(true);
    expect(isValidExtensionName("x; DROP TABLE t")).toBe(false);
    expect(() => buildExtensionSql("load", "a b")).toThrow();
  });
});

describe("isUnavailableExtensionError", () => {
  it("recognises missing-binary errors", () => {
    expect(isUnavailableExtensionError("HTTP 404 fetching extension")).toBe(true);
    expect(isUnavailableExtensionError("Extension 'postgres_scanner' not found")).toBe(true);
  });

  it("does not flag unrelated failures", () => {
    expect(isUnavailableExtensionError("NetworkError when attempting to fetch resource")).toBe(
      false
    );
    expect(isUnavailableExtensionError("HTTP 4040 bytes")).toBe(false);
  });
});
