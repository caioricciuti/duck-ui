import { describe, it, expect } from "vitest";
import { sessionPhase } from "../sessionPhase";

describe("sessionPhase", () => {
  it("is idle before anything starts and while a start is in flight", () => {
    expect(sessionPhase({ role: null, status: "idle" })).toBe("idle");
    expect(sessionPhase({ role: "host", status: "connecting" })).toBe("idle");
  });

  it("is waiting while either side still has a code to pass on", () => {
    expect(sessionPhase({ role: "host", status: "awaiting-guest" })).toBe("waiting");
    expect(sessionPhase({ role: "guest", status: "awaiting-host" })).toBe("waiting");
  });

  it("is connected once the peers are", () => {
    expect(sessionPhase({ role: "guest", status: "connected" })).toBe("connected");
  });

  it("is dropped when a session someone was part of fails or disconnects", () => {
    expect(sessionPhase({ role: "host", status: "disconnected" })).toBe("dropped");
    expect(sessionPhase({ role: "guest", status: "failed" })).toBe("dropped");
  });

  it("does not call a disconnect without a role a drop", () => {
    expect(sessionPhase({ role: null, status: "disconnected" })).toBe("idle");
  });
});
