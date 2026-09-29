import { describe, it, expect, vi, beforeEach } from "vitest";

const rows = new Map<string, unknown>();

vi.mock("../systemDb", () => ({
  isUsingOpfs: () => false,
  getSystemConnection: () => {
    throw new Error("not used by the fallback path");
  },
  sqlQuote: (value: string) => `'${value}'`,
}));

vi.mock("../fallback", () => ({
  fallbackGetAll: vi.fn(async () => [...rows.values()]),
  fallbackPut: vi.fn(async (_store: string, row: { id: string }) => {
    rows.set(row.id, row);
  }),
  fallbackDelete: vi.fn(async (_store: string, id: string) => {
    rows.delete(id);
  }),
}));

import {
  deleteConnection,
  getConnections,
  saveConnection,
} from "../repositories/connectionRepository";

const input = {
  name: "Local DuckDB",
  scope: "External",
  config: { host: "http://localhost:9999" },
};

describe("connectionRepository ids", () => {
  beforeEach(() => rows.clear());

  it("stores the record under the id of the in-memory connection", async () => {
    const saved = await saveConnection("p1", { ...input, id: "conn-1" }, null);
    expect(saved.id).toBe("conn-1");

    const [loaded] = await getConnections("p1", null);
    expect(loaded.id).toBe("conn-1");
  });

  it("deletes a connection added in the same session by its in-memory id", async () => {
    await saveConnection("p1", { ...input, id: "conn-1" }, null);
    await deleteConnection("conn-1");
    expect(await getConnections("p1", null)).toEqual([]);
  });

  it("still generates an id when none is given", async () => {
    const saved = await saveConnection("p1", input, null);
    expect(saved.id).toMatch(/\S+/);
    expect((await getConnections("p1", null))[0].id).toBe(saved.id);
  });
});
