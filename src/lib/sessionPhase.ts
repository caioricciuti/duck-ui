import type { SessionProjection } from "@/store/types";

/**
 * A live session as the interface talks about it. `dropped` is a link that
 * died after a session was up, or a start that failed: manual signaling
 * cannot re-pair on its own, so it is a state of its own and not "idle".
 */
export type SessionPhase = "idle" | "waiting" | "connected" | "dropped";

export function sessionPhase(session: Pick<SessionProjection, "role" | "status">): SessionPhase {
  if (session.role !== null && (session.status === "disconnected" || session.status === "failed")) {
    return "dropped";
  }
  if (session.status === "connected") return "connected";
  if (session.status === "awaiting-guest" || session.status === "awaiting-host") return "waiting";
  return "idle";
}
