import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Adding an OPFS connection makes it active, but the explorer used to keep
 * the previous catalog until the next query ran, because the add path did
 * not refetch the schema the way a switch does.
 */

vi.mock("svelte-sonner", () => ({
  toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { openSession, toConnectionDefinition } = vi.hoisted(() => ({
  openSession: vi.fn(),
  toConnectionDefinition: vi.fn(),
}));

vi.mock("@/services/engine", () => ({
  asLocalDuckSession: vi.fn().mockReturnValue(null),
  closeSession: vi.fn(),
  getSession: vi.fn(),
  listSessions: vi.fn().mockReturnValue([]),
  openSession,
  testConnection: vi.fn(),
  toConnectionDefinition,
  toCredentialMaterial: vi.fn().mockReturnValue({}),
  WASM_CONNECTION_ID: "WASM",
}));

vi.mock("@/services/persistence/repositories/connectionRepository", () => ({
  saveConnection: vi.fn().mockResolvedValue(undefined),
  deleteConnection: vi.fn(),
  updateConnection: vi.fn(),
}));

import { createConnectionSlice } from "../connectionSlice";
import type { ConnectionProvider } from "../../types";

const opfs: ConnectionProvider = {
  environment: "APP",
  id: "o1",
  name: "Local file",
  scope: "OPFS",
  path: "sales.db",
};

const setup = () => {
  const fetchDatabasesAndTablesInfo = vi.fn().mockResolvedValue(undefined);
  let state: Record<string, unknown> = { currentProfileId: null, fetchDatabasesAndTablesInfo };
  const get = () => state as never;
  const set = (partial: unknown) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...(next as object) };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slice = createConnectionSlice(set as any, get as any, undefined as any);
  state = { ...slice, ...state, connectionList: { connections: [] } };
  return { slice, fetchDatabasesAndTablesInfo, state: () => state };
};

describe("addConnection, OPFS", () => {
  beforeEach(() => {
    toConnectionDefinition.mockReturnValue({
      id: "o1",
      config: { kind: "opfs", path: "sales.db" },
    });
    openSession.mockResolvedValue({ kind: "opfs", connectionId: "o1" });
  });

  it("refetches the catalog once the new database is active", async () => {
    const { slice, fetchDatabasesAndTablesInfo, state } = setup();
    await slice.addConnection(opfs);

    expect((state().currentConnection as { id: string }).id).toBe("o1");
    expect(fetchDatabasesAndTablesInfo).toHaveBeenCalledTimes(1);
  });

  it("still adds the connection when the catalog fetch fails", async () => {
    const { slice, fetchDatabasesAndTablesInfo, state } = setup();
    fetchDatabasesAndTablesInfo.mockRejectedValue(new Error("offline"));
    await slice.addConnection(opfs);

    const list = (state().connectionList as { connections: ConnectionProvider[] }).connections;
    expect(list.map((c) => c.id)).toEqual(["o1"]);
  });
});
