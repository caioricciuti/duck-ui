import { describe, it, expect, vi } from "vitest";

/**
 * Saved connections vanished on every reload: `loadProfile` put them in the
 * list, then the engine's `initialize` replaced the list with WASM and the
 * ENV connection. Both now merge by id, whichever runs second.
 */

vi.mock("svelte-sonner", () => ({
  toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/engine", () => ({
  asLocalDuckSession: vi.fn(),
  closeSession: vi.fn(),
  getSession: vi.fn(),
  listSessions: vi.fn().mockReturnValue([]),
  openSession: vi.fn(),
  testConnection: vi.fn(),
  toConnectionDefinition: vi.fn(),
  toCredentialMaterial: vi.fn(),
  WASM_CONNECTION_ID: "WASM",
}));

vi.mock("@/services/persistence/repositories/connectionRepository", () => ({
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
  updateConnection: vi.fn(),
}));

import { isBuiltInConnection, mergeConnections } from "../connectionSlice";
import type { ConnectionProvider } from "../../types";

const wasm: ConnectionProvider = { environment: "APP", id: "WASM", name: "WASM", scope: "WASM" };
const env: ConnectionProvider = { environment: "ENV", id: "prod", name: "prod", scope: "External" };
const saved: ConnectionProvider = {
  environment: "APP",
  id: "c1",
  name: "Warehouse",
  scope: "External",
  host: "https://duck.example.com",
};
const peer: ConnectionProvider = { environment: "SESSION", id: "s1", name: "Ana", scope: "Peer" };

describe("mergeConnections", () => {
  it("keeps the first list's order and appends what is new", () => {
    expect(mergeConnections([wasm, env], [saved])).toEqual([wasm, env, saved]);
    expect(mergeConnections([saved], [wasm, env])).toEqual([saved, wasm, env]);
  });

  it("drops an incoming connection whose id is already there", () => {
    const stale = { ...saved, name: "Old name" };
    expect(mergeConnections([saved], [stale, env])).toEqual([saved, env]);
  });
});

describe("isBuiltInConnection", () => {
  it("is true for WASM, ENV and session peers, false for a profile's own rows", () => {
    expect(isBuiltInConnection(wasm)).toBe(true);
    expect(isBuiltInConnection(env)).toBe(true);
    expect(isBuiltInConnection(peer)).toBe(true);
    expect(isBuiltInConnection(saved)).toBe(false);
  });
});
