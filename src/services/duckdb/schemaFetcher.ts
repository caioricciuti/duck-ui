import * as duckdb from "@duckdb/duckdb-wasm";
import { sqlEscapeString, qualifyTable } from "@/lib/sqlSanitize";
import type { ColumnInfo, TableInfo, DatabaseInfo } from "@/store/types";

/**
 * Fetches databases, schemas, and tables using the WASM connection.
 *
 * Tables are enumerated per (schema, table) pair — attached .duckdb files can
 * carry any number of schemas (#3), so filtering by catalog alone and assuming
 * "main" hides or breaks everything outside the default schema. A failure on
 * one table (weird types, permissions, a view over a dropped table) degrades
 * that table instead of sinking the whole explorer.
 */
export const fetchWasmDatabases = async (
  connection: duckdb.AsyncDuckDBConnection
): Promise<DatabaseInfo[]> => {
  const dbListResult = await connection.query(`PRAGMA database_list`);
  return Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbListResult.toArray().map(async (db: any) => {
      const dbName = db.name.toString();
      if (String(db.file ?? "").startsWith("quack:")) {
        return { name: dbName, tables: await fetchQuackTables(connection, dbName) };
      }
      const tablesResult = await connection.query(
        `SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_catalog = '${sqlEscapeString(dbName)}'
         ORDER BY table_schema, table_name`
      );
      const tables: TableInfo[] = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tablesResult.toArray().map(async (tbl: any) => {
          const schemaName = tbl.table_schema.toString();
          const tableName = tbl.table_name.toString();
          const qualified = qualifyTable(dbName, schemaName, tableName);
          try {
            const columnsResult = await connection.query(`DESCRIBE ${qualified}`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const columns: ColumnInfo[] = columnsResult.toArray().map((col: any) => ({
              name: col.column_name.toString(),
              type: col.column_type.toString(),
              nullable: col.null === "YES",
            }));
            const countResult = await connection.query(
              `SELECT COUNT(*) as count FROM ${qualified}`
            );
            // Named access — Arrow StructRows have no numeric index, and the
            // count arrives as a BigInt.
            const countValue = Number(countResult.toArray()[0]?.count ?? 0);
            return {
              name: tableName,
              schema: schemaName,
              columns,
              rowCount: countValue,
              createdAt: new Date().toISOString(),
            };
          } catch (error) {
            console.error(`Failed to introspect ${qualified}:`, error);
            return {
              name: tableName,
              schema: schemaName,
              columns: [],
              rowCount: 0,
              createdAt: new Date().toISOString(),
            };
          }
        })
      );
      return { name: dbName, tables };
    })
  );
};

/**
 * Tables of a database attached over Quack.
 *
 * A Quack catalog resolves tables lazily, so the local metadata views list
 * none of them. The server is asked instead, in two round trips for the whole
 * catalog rather than a DESCRIBE and a COUNT per table, each of which would
 * cross the network. Row counts are DuckDB's estimate, exact for a table
 * without deletes. A server that cannot answer leaves the catalog empty
 * instead of sinking the explorer.
 */
const fetchQuackTables = async (
  connection: duckdb.AsyncDuckDBConnection,
  dbName: string
): Promise<TableInfo[]> => {
  const remote = (sql: string) =>
    connection.query(
      `SELECT * FROM quack_query_by_name('${sqlEscapeString(dbName)}', '${sqlEscapeString(sql)}')`
    );
  try {
    const tablesResult = await remote(
      `SELECT t.table_schema, t.table_name, coalesce(d.estimated_size, 0) AS row_count
       FROM information_schema.tables t
       LEFT JOIN duckdb_tables() d
         ON d.database_name = t.table_catalog AND d.schema_name = t.table_schema AND d.table_name = t.table_name
       WHERE t.table_catalog = current_database()
       ORDER BY t.table_schema, t.table_name`
    );
    const columnsResult = await remote(
      `SELECT table_schema, table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_catalog = current_database()
       ORDER BY table_schema, table_name, ordinal_position`
    );
    const columnsByTable = new Map<string, ColumnInfo[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const col of columnsResult.toArray() as any[]) {
      const key = `${col.table_schema}\u0000${col.table_name}`;
      const list = columnsByTable.get(key) ?? [];
      list.push({
        name: String(col.column_name),
        type: String(col.data_type),
        nullable: col.is_nullable === "YES",
      });
      columnsByTable.set(key, list);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (tablesResult.toArray() as any[]).map((tbl) => ({
      name: String(tbl.table_name),
      schema: String(tbl.table_schema),
      columns: columnsByTable.get(`${tbl.table_schema}\u0000${tbl.table_name}`) ?? [],
      rowCount: Number(tbl.row_count ?? 0),
      createdAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error(`Failed to introspect Quack database ${dbName}:`, error);
    return [];
  }
};
