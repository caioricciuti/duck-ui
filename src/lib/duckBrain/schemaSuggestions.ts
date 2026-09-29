import type { DatabaseInfo } from "@/store";

export interface SchemaSuggestion {
  type: "table" | "column";
  name: string;
  fullPath: string;
  tableName?: string;
  columnType?: string;
  rowCount?: number;
}

/**
 * Builds suggestions from database schema
 */
export function buildSchemaSuggestions(
  databases: DatabaseInfo[],
  filter: string = ""
): SchemaSuggestion[] {
  const suggestions: SchemaSuggestion[] = [];
  const lowerFilter = filter.toLowerCase();

  // Check if filter contains a dot (table.column)
  const dotIndex = filter.indexOf(".");
  const tableFilter = dotIndex > 0 ? filter.slice(0, dotIndex).toLowerCase() : null;
  const columnFilter = dotIndex > 0 ? filter.slice(dotIndex + 1).toLowerCase() : null;

  for (const db of databases) {
    for (const table of db.tables) {
      const tableName = db.name === "memory" ? table.name : `${db.name}.${table.name}`;

      // If filtering for columns of a specific table
      if (tableFilter) {
        if (table.name.toLowerCase() === tableFilter || tableName.toLowerCase() === tableFilter) {
          // Show columns for this table
          for (const col of table.columns) {
            if (!columnFilter || col.name.toLowerCase().startsWith(columnFilter)) {
              suggestions.push({
                type: "column",
                name: col.name,
                fullPath: `${table.name}.${col.name}`,
                tableName: table.name,
                columnType: col.type,
              });
            }
          }
        }
      } else {
        // Show tables matching filter
        if (!lowerFilter || table.name.toLowerCase().startsWith(lowerFilter)) {
          suggestions.push({
            type: "table",
            name: table.name,
            fullPath: tableName,
            rowCount: table.rowCount,
          });
        }
      }
    }
  }

  // Sort: tables first, then columns, alphabetically
  return suggestions
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "table" ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 10); // Limit to 10 suggestions
}
