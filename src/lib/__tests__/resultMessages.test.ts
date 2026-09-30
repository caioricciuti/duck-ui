import { describe, it, expect } from "vitest";
import { formatQueryTime, zeroRowsMessage } from "../resultMessages";

describe("formatQueryTime", () => {
  it("uses milliseconds under a second", () => {
    expect(formatQueryTime(12.4)).toBe("12 ms");
    expect(formatQueryTime(0)).toBe("0 ms");
  });

  it("uses seconds from one second up", () => {
    expect(formatQueryTime(1000)).toBe("1.00 s");
    expect(formatQueryTime(1254)).toBe("1.25 s");
  });
});

describe("zeroRowsMessage", () => {
  it("includes the engine time when known", () => {
    expect(zeroRowsMessage(12)).toBe("Query ran fine, 0 rows returned (took 12 ms).");
  });

  it("omits the time for results restored from persistence", () => {
    expect(zeroRowsMessage()).toBe("Query ran fine, 0 rows returned.");
  });
});
