import { describe, it, expect } from "vitest";
import { groupsDigits } from "./column-types";

describe("groupsDigits", () => {
  it("groups quantities", () => {
    expect(groupsDigits("population", "BIGINT")).toBe(true);
    expect(groupsDigits("total", "Int32")).toBe(true);
    expect(groupsDigits("idle_seconds", "INTEGER")).toBe(true);
  });

  it("leaves integer ids, years and postal codes alone", () => {
    for (const name of [
      "id",
      "ID",
      "user_id",
      "userId",
      "OrderID",
      "year",
      "year_built",
      "zip",
      "postcode",
    ]) {
      expect(groupsDigits(name, "BIGINT")).toBe(false);
    }
    expect(groupsDigits("id", "Int64")).toBe(false);
    expect(groupsDigits("fiscal year", "SMALLINT")).toBe(false);
  });

  it("only applies the name rule to integers", () => {
    expect(groupsDigits("year", "DOUBLE")).toBe(true);
    expect(groupsDigits("id", "Decimal[18e+2]")).toBe(true);
    expect(groupsDigits("id", "DECIMAL(18,2)")).toBe(true);
  });
});
