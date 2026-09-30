import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Editing a connection used to change memory only, so the edit was gone after
 * a reload. It also replaced the record with whatever the form produced,
 * which always says environment "APP" and carries only its scope's fields.
 */

const updateConnectionRepo = vi.hoisted(() => vi.fn());

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
}));

vi.mock("@/services/persistence/repositories/connectionRepository", () => ({
  saveConnection: vi.fn(),
  deleteConnection: vi.fn(),
  updateConnection: updateConnectionRepo,
}));

import { toast } from "svelte-sonner";
import { closeSession } from "@/services/engine";
import { createConnectionSlice } from "../connectionSlice";
import type { ConnectionProvider } from "../../types";

const KEY = { type: "secret" } as unknown as CryptoKey;

const external: ConnectionProvider = {
  environment: "APP",
  id: "c1",
  name: "Warehouse",
  scope: "External",
  host: "http://localhost:9999",
  port: 9999,
  user: "duck",
  password: "hunter2",
  authMode: "password",
};

const setup = (
  connections: ConnectionProvider[],
  extra: { currentProfileId?: string | null; encryptionKey?: CryptoKey | null } = {}
) => {
  let state: Record<string, unknown> = {
    currentProfileId: "p1",
    encryptionKey: KEY,
    ...extra,
  };
  const get = () => state as never;
  const set = (partial: unknown) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...(next as object) };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slice = createConnectionSlice(set as any, get as any, undefined as any);
  state = { ...slice, ...state, connectionList: { connections } };
  return {
    slice,
    connections: () => (state.connectionList as { connections: ConnectionProvider[] }).connections,
  };
};

describe("updateConnection", () => {
  beforeEach(() => {
    updateConnectionRepo.mockReset().mockResolvedValue(undefined);
    vi.mocked(toast.error).mockClear();
  });

  it("persists the edit with its credentials", async () => {
    const { slice, connections } = setup([external]);

    await slice.updateConnection({ ...external, name: "Renamed", password: "new-secret" });

    expect(connections()[0].name).toBe("Renamed");
    expect(updateConnectionRepo).toHaveBeenCalledTimes(1);
    const [profileId, id, input, key] = updateConnectionRepo.mock.calls[0];
    expect(profileId).toBe("p1");
    expect(id).toBe("c1");
    expect(key).toBe(KEY);
    expect(input).toMatchObject({
      name: "Renamed",
      scope: "External",
      environment: "APP",
      config: { host: "http://localhost:9999", port: 9999, user: "duck", authMode: "password" },
      credentials: { password: "new-secret" },
    });
  });

  it("keeps the environment the form cannot edit", async () => {
    const { slice, connections } = setup([{ ...external, environment: "ENV" }]);

    // What the form produces: always "APP".
    await slice.updateConnection({ ...external, environment: "APP", name: "Renamed" });

    expect(connections()[0].environment).toBe("ENV");
    expect(updateConnectionRepo.mock.calls[0][2].environment).toBe("ENV");
  });

  it("keeps fields the OPFS form does not carry", async () => {
    const opfs: ConnectionProvider = {
      environment: "APP",
      id: "o1",
      name: "Local file",
      scope: "OPFS",
      path: "sales.db",
      apiKey: "kept",
    };
    const { slice, connections } = setup([opfs]);

    await slice.updateConnection({
      environment: "APP",
      id: "o1",
      name: "Sales",
      scope: "OPFS",
      path: "sales.db",
    });

    expect(connections()[0]).toEqual({ ...opfs, name: "Sales" });
    expect(updateConnectionRepo.mock.calls[0][2].credentials).toEqual({ apiKey: "kept" });
  });

  it("does not carry server fields into a connection switched to OPFS", async () => {
    const { slice, connections } = setup([external]);

    await slice.updateConnection({
      environment: "APP",
      id: "c1",
      name: "Warehouse",
      scope: "OPFS",
      path: "w.db",
    });

    expect(connections()[0].host).toBeUndefined();
    expect(connections()[0].password).toBeUndefined();
    expect(updateConnectionRepo.mock.calls[0][2].credentials).toBeNull();
  });

  it("leaves stored credentials alone when there is no key to encrypt with", async () => {
    const { slice } = setup([external], { encryptionKey: null });
    await slice.updateConnection({ ...external, name: "Renamed" });
    expect(updateConnectionRepo.mock.calls[0][2].credentials).toBeUndefined();
  });

  it("reports a failed save and keeps the edit in memory", async () => {
    updateConnectionRepo.mockRejectedValue(new Error("storage locked"));
    const { slice, connections } = setup([external]);

    await slice.updateConnection({ ...external, name: "Renamed" });

    expect(connections()[0].name).toBe("Renamed");
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("ignores an unknown connection", async () => {
    const { slice, connections } = setup([external]);
    await slice.updateConnection({ ...external, id: "nope" });
    expect(connections()).toEqual([external]);
    expect(updateConnectionRepo).not.toHaveBeenCalled();
  });

  it("reopens the session when the edited connection is the active one", async () => {
    const setCurrentConnection = vi.fn().mockResolvedValue(undefined);
    const harness = setupActive(external, setCurrentConnection);
    await harness.slice.updateConnection({ ...external, host: "http://localhost:1234" });

    expect(closeSession).toHaveBeenCalledWith("c1");
    expect(setCurrentConnection).toHaveBeenCalledWith("c1");
  });

  it("leaves the session alone when another connection is active", async () => {
    const setCurrentConnection = vi.fn().mockResolvedValue(undefined);
    const harness = setupActive({ ...external, id: "other" }, setCurrentConnection, [external]);
    await harness.slice.updateConnection({ ...external, name: "Renamed" });

    expect(setCurrentConnection).not.toHaveBeenCalled();
  });
});

function setupActive(
  active: ConnectionProvider,
  setCurrentConnection: ReturnType<typeof vi.fn>,
  connections: ConnectionProvider[] = [active]
) {
  vi.mocked(closeSession).mockReset().mockResolvedValue(undefined);
  let state: Record<string, unknown> = {};
  const get = () => state as never;
  const set = (partial: unknown) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...(next as object) };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slice = createConnectionSlice(set as any, get as any, undefined as any);
  state = {
    ...slice,
    currentProfileId: "p1",
    encryptionKey: KEY,
    connectionList: { connections },
    currentConnection: { id: active.id },
    setCurrentConnection,
  };
  return { slice };
}
