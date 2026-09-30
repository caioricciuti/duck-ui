import { describe, expect, it } from "vitest";
import { formatFileSize, getErrorSuggestion, tableNameSchema } from "../helpers";

describe("formatFileSize", () => {
  it("formats zero", () => {
    expect(formatFileSize(0)).toBe("0 Bytes");
  });

  it("picks the largest whole unit and trims trailing zeros", () => {
    expect(formatFileSize(512)).toBe("512 Bytes");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe("3 GB");
  });
});

describe("getErrorSuggestion", () => {
  it("returns null for unrecognised errors", () => {
    expect(getErrorSuggestion("something odd happened")).toBeNull();
  });

  it("matches case-insensitively", () => {
    expect(getErrorSuggestion("CORS blocked")).toMatch(/internet connection/);
  });

  it("maps known error families to suggestions", () => {
    expect(getErrorSuggestion("Invalid CSV input")).toMatch(/corrupted/);
    expect(getErrorSuggestion("Parser error: syntax")).toMatch(/Data parsing failed/);
    expect(getErrorSuggestion("could not convert type")).toMatch(/Column type detection/);
    expect(getErrorSuggestion("HTTP 403")).toMatch(/Access denied/);
    expect(getErrorSuggestion("HTTP 404")).toMatch(/not found/);
    expect(getErrorSuggestion("out of memory")).toMatch(/too large/);
    expect(getErrorSuggestion("Table foo already exists")).toMatch(/already exists/);
  });

  it("checks network errors before auth errors", () => {
    expect(getErrorSuggestion("fetch failed with 401")).toMatch(/internet connection/);
  });
});

describe("tableNameSchema", () => {
  it("accepts letters, numbers and underscores", () => {
    expect(tableNameSchema.safeParse("my_table_1").success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(tableNameSchema.parse("  orders  ")).toBe("orders");
  });

  it("rejects empty and invalid names with the UI messages", () => {
    const empty = tableNameSchema.safeParse("   ");
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0].message).toBe("Table name cannot be empty");

    const bad = tableNameSchema.safeParse("my-table");
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toBe(
      "Table name can only contain letters, numbers, and underscores"
    );
  });
});
