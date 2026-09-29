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
  fallbackGet: vi.fn(async (_store: string, id: string) => rows.get(id) ?? null),
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
  updateConnection,
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

describe("connectionRepository updateConnection", () => {
  let key: CryptoKey;

  beforeEach(async () => {
    rows.clear();
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
  });

  const stored = () => rows.get("conn-1") as { encrypted_credentials: string | null };

  it("rewrites the stored row in place", async () => {
    const saved = await saveConnection("p1", { ...input, id: "conn-1", environment: "ENV" }, key);

    await updateConnection(
      "p1",
      "conn-1",
      { name: "Renamed", scope: "External", config: { host: "http://db:9999" } },
      key
    );

    const loaded = await getConnections("p1", key);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      id: "conn-1",
      name: "Renamed",
      config: { host: "http://db:9999" },
      // Not part of the update, so it keeps what was stored.
      environment: "ENV",
      created_at: saved.created_at,
    });
  });

  it("encrypts replaced credentials", async () => {
    await saveConnection("p1", { ...input, id: "conn-1", credentials: { password: "old" } }, key);

    await updateConnection(
      "p1",
      "conn-1",
      { ...input, credentials: { password: "new-secret" } },
      key
    );

    expect(stored().encrypted_credentials).toEqual(expect.any(String));
    expect(stored().encrypted_credentials).not.toContain("new-secret");
    expect((await getConnections("p1", key))[0].credentials).toEqual({ password: "new-secret" });
  });

  it("keeps stored credentials when the update does not carry any", async () => {
    await saveConnection("p1", { ...input, id: "conn-1", credentials: { apiKey: "k" } }, key);
    await updateConnection("p1", "conn-1", { ...input, name: "Renamed" }, key);
    expect((await getConnections("p1", key))[0].credentials).toEqual({ apiKey: "k" });
  });

  it("removes credentials when told to", async () => {
    await saveConnection("p1", { ...input, id: "conn-1", credentials: { apiKey: "k" } }, key);
    await updateConnection("p1", "conn-1", { ...input, credentials: null }, key);
    expect(stored().encrypted_credentials).toBeNull();
  });

  it("stores a connection that was never saved", async () => {
    await updateConnection("p1", "conn-1", { ...input, name: "Late" }, key);
    expect(await getConnections("p1", key)).toMatchObject([{ id: "conn-1", name: "Late" }]);
  });
});
