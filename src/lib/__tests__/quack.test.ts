import { describe, it, expect } from "vitest";
import {
  normalizeQuackHost,
  quackAttachStatements,
  quackDetachStatements,
  validateQuackAttachment,
} from "../quack";

describe("normalizeQuackHost", () => {
  it.each([
    ["localhost", "localhost"],
    ["  quack:localhost:9494 ", "localhost:9494"],
    ["http://db.example.com:8443/", "db.example.com:8443"],
    ["https://db.example.com", "db.example.com"],
  ])("%s becomes %s", (input, expected) => {
    expect(normalizeQuackHost(input)).toBe(expected);
  });
});

describe("validateQuackAttachment", () => {
  const valid = { alias: "remote", host: "localhost:9494", token: "secret" };

  it("accepts a well-formed attachment", () => {
    expect(validateQuackAttachment(valid, ["memory"], [])).toBeNull();
  });

  it.each([
    [{ ...valid, alias: "1remote" }, /Name/],
    [{ ...valid, alias: "re mote" }, /Name/],
    [{ ...valid, alias: "Memory" }, /already exists/],
    [{ ...valid, alias: "System" }, /already exists/],
    [{ ...valid, host: "local host" }, /Host/],
    [{ ...valid, host: "localhost:99999" }, /Port/],
    [{ ...valid, host: "evil'; DROP TABLE x; --" }, /Host/],
    [{ ...valid, token: "abc" }, /Token/],
  ])("refuses %o", (input, expected) => {
    expect(validateQuackAttachment(input, ["memory"], [])).toMatch(expected);
  });

  it("refuses a catalog name in use, ignoring case", () => {
    expect(validateQuackAttachment(valid, ["REMOTE"], [])).toMatch(/already exists/);
  });

  it("refuses a second attachment to the same host", () => {
    const existing = [{ alias: "first", host: "LOCALHOST:9494" }];
    expect(validateQuackAttachment(valid, [], existing)).toMatch(/already attached as "first"/);
  });

  it("accepts a bracketed IPv6 host", () => {
    expect(validateQuackAttachment({ ...valid, host: "[::1]:9494" }, [], [])).toBeNull();
  });
});

describe("quackAttachStatements", () => {
  const statements = quackAttachStatements({ alias: 're"mote', host: "localhost" }, "it's-secret");

  it("keeps the token out of ATTACH", () => {
    const attach = statements.find((s) => s.startsWith("ATTACH"));
    expect(attach).toBe(`ATTACH 'quack:localhost' AS "re""mote"`);
    expect(attach).not.toContain("secret");
  });

  it("puts the token in a temporary secret scoped to the host, escaped", () => {
    const secret = statements.find((s) => s.includes("SECRET"));
    expect(secret).toBe(
      `CREATE OR REPLACE TEMPORARY SECRET "duckui_quack_re""mote" (TYPE quack, TOKEN 'it''s-secret', SCOPE 'quack:localhost')`
    );
  });

  it("loads the extension before using it", () => {
    expect(statements.slice(0, 2)).toEqual(["INSTALL quack", "LOAD quack"]);
  });
});

describe("quackDetachStatements", () => {
  it("detaches and drops the secret, tolerating either being gone", () => {
    expect(quackDetachStatements("remote")).toEqual([
      `DETACH DATABASE IF EXISTS "remote"`,
      `DROP TEMPORARY SECRET IF EXISTS "duckui_quack_remote"`,
    ]);
  });
});
