import React from "react";
import { Loader2, Link2, Code, Table } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ErrorAlertList } from "./ErrorAlerts";
import type { ImportMode, UploadError } from "./types";

interface QueryTabProps {
  importMode: ImportMode;
  setImportMode: (mode: ImportMode) => void;
  errors: UploadError[];
  queryInput: string;
  setQueryInput: (value: string) => void;
  queryTableName: string;
  setQueryTableName: (value: string) => void;
  isQueryImporting: boolean;
  handleQueryImport: () => void;
}

/** "From Query" tab: materialize a SQL query result as a table or view. */
const QueryTab: React.FC<QueryTabProps> = ({
  importMode,
  setImportMode,
  errors,
  queryInput,
  setQueryInput,
  queryTableName,
  setQueryTableName,
  isQueryImporting,
  handleQueryImport,
}) => {
  return (
    <TabsContent value="query" className="space-y-4 mt-4">
      <CardContent className="space-y-4 p-0">
        <div className="space-y-4">
          <div>
            <h3 className="font-medium text-lg mb-4">Import from Query Result</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Execute a SQL query and create a table from the result. Use DuckDB functions like
              read_csv, read_json, read_parquet, or query existing tables.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="query-input">SQL Query</Label>
            <Textarea
              id="query-input"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="SELECT * FROM read_csv('https://example.com/data.csv')"
              disabled={isQueryImporting}
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Enter any SELECT query. The result will be saved to a new table.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="query-table-name">Name</Label>
            <Input
              id="query-table-name"
              value={queryTableName}
              onChange={(e) => setQueryTableName(e.target.value)}
              placeholder="my_table"
              disabled={isQueryImporting}
            />
          </div>

          <div className="space-y-2">
            <Label>Save As</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                variant={importMode === "table" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setImportMode("table")}
                disabled={isQueryImporting}
              >
                <Table className="h-4 w-4 mr-1.5" />
                Table
              </Button>
              <Button
                type="button"
                variant={importMode === "view" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setImportMode("view")}
                disabled={isQueryImporting}
              >
                <Link2 className="h-4 w-4 mr-1.5" />
                View
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {importMode === "view"
                ? "View re-runs query each time (always fresh)"
                : "Table stores result (faster queries)"}
            </p>
          </div>

          {/* Examples */}
          <div className="rounded-lg border p-4 bg-muted/50">
            <h4 className="font-medium text-sm mb-2">Example Queries:</h4>
            <div className="space-y-2 text-xs font-mono">
              <p className="text-muted-foreground">
                <span className="text-foreground">• Import from URL:</span>
                <br />
                <code className="block ml-4 mt-1">
                  SELECT * FROM read_csv('https://example.com/data.csv')
                </code>
              </p>
              <p className="text-muted-foreground">
                <span className="text-foreground">• Filter data:</span>
                <br />
                <code className="block ml-4 mt-1">
                  SELECT * FROM read_json('data.json') WHERE age &gt; 21
                </code>
              </p>
              <p className="text-muted-foreground">
                <span className="text-foreground">• Join tables:</span>
                <br />
                <code className="block ml-4 mt-1">
                  SELECT a.*, b.name FROM table1 a JOIN table2 b ON a.id = b.id
                </code>
              </p>
            </div>
          </div>

          {errors.length > 0 && <ErrorAlertList errors={errors} />}

          <Button onClick={handleQueryImport} disabled={isQueryImporting} className="w-full">
            {isQueryImporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Executing Query...
              </>
            ) : (
              <>
                <Code className="w-4 h-4 mr-2" />
                Execute and Import
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </TabsContent>
  );
};

export default QueryTab;
