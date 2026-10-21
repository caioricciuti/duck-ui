import { sqlEscapeIdentifier, sqlEscapeString } from "@/lib/sqlSanitize";

/**
 * A remote DuckDB reached over Quack, DuckDB's own client-server protocol.
 *
 * Quack runs over plain HTTP, so the in-tab engine speaks it directly: the
 * remote database is ATTACHed as one more catalog next to the local ones, and
 * a query can join both. No proxy or engine driver of ours sits in between.
 */
export interface QuackAttachment {
  /** Catalog name the remote database is attached as. */
  alias: string;
  /** `host` or `host:port`, as written after `quack:`. */
  host: string;
}

/** Catalog names DuckDB reserves or the app already uses for itself. */
const RESERVED_ALIASES = new Set(["memory", "system", "temp", "main"]);

const ALIAS_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
/** A hostname or IPv4, or a bracketed IPv6, with an optional port. */
const HOST_PATTERN =
  /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;
/** quack_serve refuses shorter tokens. */
export const MIN_TOKEN_LENGTH = 4;

/** Accepts `quack:host`, `http://host:port/` and the like, and returns the bare `host[:port]`. */
export const normalizeQuackHost = (input: string): string =>
  input
    .trim()
    .replace(/^quack:/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

/**
 * Returns what is wrong with an attachment, or null when it can be attached.
 * `taken` holds catalog names already in use, compared case-insensitively
 * like DuckDB does. One attachment per host: tokens are looked up by host,
 * so a second one would make it ambiguous which token is sent.
 */
export function validateQuackAttachment(
  attachment: QuackAttachment & { token: string },
  taken: readonly string[],
  existing: readonly QuackAttachment[]
): string | null {
  const alias = attachment.alias.trim();
  if (!ALIAS_PATTERN.test(alias)) {
    return "Name: letters, digits and underscores, starting with a letter.";
  }
  const lower = alias.toLowerCase();
  if (RESERVED_ALIASES.has(lower) || taken.some((name) => name.toLowerCase() === lower)) {
    return `A database named "${alias}" already exists.`;
  }
  const host = normalizeQuackHost(attachment.host);
  if (!HOST_PATTERN.test(host)) return "Host: a name or address, with an optional :port.";
  const port = host.match(/:(\d+)$/)?.[1];
  if (port && (Number(port) < 1 || Number(port) > 65535)) return "Port must be 1 to 65535.";
  const sameHost = existing.find((a) => a.host.toLowerCase() === host.toLowerCase());
  if (sameHost) return `${host} is already attached as "${sameHost.alias}".`;
  if (attachment.token.length < MIN_TOKEN_LENGTH) {
    return `Token: at least ${MIN_TOKEN_LENGTH} characters.`;
  }
  return null;
}

/** Name of the secret that holds an attachment's token. */
const secretName = (alias: string): string => sqlEscapeIdentifier(`duckui_quack_${alias}`);

/**
 * The statements that attach a remote database, in order.
 *
 * The token goes into a secret scoped to the host, never into ATTACH: a
 * `TOKEN` option on ATTACH is listed in plain text by `duckdb_databases()`,
 * while `duckdb_secrets()` redacts it. These statements run on the engine
 * connection directly, so they never reach query history either.
 */
export function quackAttachStatements(attachment: QuackAttachment, token: string): string[] {
  const uri = `quack:${normalizeQuackHost(attachment.host)}`;
  return [
    "INSTALL quack",
    "LOAD quack",
    `CREATE OR REPLACE TEMPORARY SECRET ${secretName(attachment.alias)} (TYPE quack, TOKEN '${sqlEscapeString(token)}', SCOPE '${sqlEscapeString(uri)}')`,
    `ATTACH '${sqlEscapeString(uri)}' AS ${sqlEscapeIdentifier(attachment.alias)}`,
  ];
}

/** The statements that undo `quackAttachStatements`. Each may fail on its own. */
export function quackDetachStatements(alias: string): string[] {
  return [
    `DETACH DATABASE IF EXISTS ${sqlEscapeIdentifier(alias)}`,
    `DROP TEMPORARY SECRET IF EXISTS ${secretName(alias)}`,
  ];
}
