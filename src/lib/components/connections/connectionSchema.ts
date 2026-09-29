import * as z from "zod";
import type { ConnectionProvider } from "@/store/types";

const scopeEnum = z.enum(["External", "OPFS"]);
const nameSchema = z
  .string()
  .min(2, { message: "Connection name must be at least 2 characters." })
  .max(30, { message: "Connection name must not exceed 30 characters." });

const opfsSchema = z.object({
  name: nameSchema,
  scope: z.literal(scopeEnum.enum.OPFS),
  path: z.string().min(1, { message: "Path is required." }),
});

const externalSchema = z.object({
  name: nameSchema,
  scope: z.literal(scopeEnum.enum.External),
  host: z.string().url({ message: "Host must be a valid URL." }),
  port: z
    .string()
    .refine((val) => !isNaN(parseInt(val, 10)) || val === "", {
      message: "Port must be a number.",
    })
    .optional(),
  database: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  authMode: z.enum(["none", "password", "api_key"]).optional(),
  apiKey: z.string().optional(),
});

export const connectionSchema = z.discriminatedUnion("scope", [opfsSchema, externalSchema]);

export type ConnectionFormValues = z.infer<typeof connectionSchema>;
export type ConnectionFormScope = z.infer<typeof scopeEnum>;
export type ConnectionAuthMode = "none" | "password" | "api_key";

/** Every field the form can show, as the strings the inputs hold. */
export interface ConnectionDraft {
  name: string;
  scope: ConnectionFormScope;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  authMode: ConnectionAuthMode;
  apiKey: string;
  path: string;
}

export type ConnectionField = keyof ConnectionDraft;
export type ConnectionErrors = Partial<Record<ConnectionField, string>>;

export const defaultConnectionDraft = (): ConnectionDraft => ({
  name: "Local DuckDB",
  scope: "External",
  host: "http://localhost:9999",
  port: "",
  database: "",
  user: "",
  password: "",
  authMode: "none",
  apiKey: "",
  path: "",
});

export const draftFromValues = (values: ConnectionFormValues): ConnectionDraft => {
  const base = { ...defaultConnectionDraft(), name: values.name, scope: values.scope };
  if (values.scope === "OPFS") return { ...base, host: "", path: values.path };
  return {
    ...base,
    host: values.host,
    port: values.port ?? "",
    database: values.database ?? "",
    user: values.user ?? "",
    password: values.password ?? "",
    authMode: values.authMode ?? "none",
    apiKey: values.apiKey ?? "",
  };
};

/** Form values for editing a stored connection. Only APP connections reach this. */
export const valuesFromConnection = (connection: ConnectionProvider): ConnectionFormValues => {
  if (connection.scope === "OPFS") {
    return { name: connection.name, scope: "OPFS", path: connection.path || "" };
  }
  return {
    name: connection.name,
    scope: "External",
    host: connection.host || "",
    port: connection.port?.toString() || "",
    database: connection.database,
    user: connection.user,
    password: connection.password,
    authMode: connection.authMode,
    apiKey: connection.apiKey,
  };
};

export type ConnectionValidation =
  { ok: true; values: ConnectionFormValues } | { ok: false; errors: ConnectionErrors };

/** Validates only the fields of the chosen scope, the way the discriminated union expects. */
export const validateConnectionDraft = (draft: ConnectionDraft): ConnectionValidation => {
  const candidate =
    draft.scope === "OPFS"
      ? { name: draft.name, scope: draft.scope, path: draft.path }
      : {
          name: draft.name,
          scope: draft.scope,
          host: draft.host,
          port: draft.port,
          database: draft.database,
          user: draft.user,
          password: draft.password,
          authMode: draft.authMode,
          apiKey: draft.apiKey,
        };

  const result = connectionSchema.safeParse(candidate);
  if (result.success) return { ok: true, values: result.data };

  const errors: ConnectionErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    // First message per field wins, matching what the old form displayed.
    if (typeof field === "string" && !(field in errors)) {
      errors[field as ConnectionField] = issue.message;
    }
  }
  return { ok: false, errors };
};

/** The store record for a validated form. */
export const toConnectionProvider = (
  values: ConnectionFormValues,
  id: string
): ConnectionProvider => ({
  ...values,
  id,
  port: values.scope === "External" && values.port ? parseInt(values.port, 10) : undefined,
  environment: "APP",
});
