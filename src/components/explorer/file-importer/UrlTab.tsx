import React from "react";
import { Loader2, Link as LinkIcon, Link2, Eye, Table } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import { ErrorAlertList } from "./ErrorAlerts";
import type { ImportMode, UploadError } from "./types";

interface UrlTabProps {
  importMode: ImportMode;
  setImportMode: (mode: ImportMode) => void;
  errors: UploadError[];
  urlInput: string;
  setUrlInput: (value: string) => void;
  urlTableName: string;
  setUrlTableName: (value: string) => void;
  isUrlImporting: boolean;
  isPreviewing: boolean;
  handlePreview: () => void;
  handleUrlImport: () => void;
}

/** "From URL" tab: import or preview a remote CSV/JSON/Parquet file. */
const UrlTab: React.FC<UrlTabProps> = ({
  importMode,
  setImportMode,
  errors,
  urlInput,
  setUrlInput,
  urlTableName,
  setUrlTableName,
  isUrlImporting,
  isPreviewing,
  handlePreview,
  handleUrlImport,
}) => {
  return (
    <TabsContent value="url" className="space-y-4 mt-4">
      <CardContent className="space-y-4 p-0">
        <div className="space-y-4">
          <div>
            <h3 className="font-medium text-lg mb-4">Import from URL</h3>
            <p className="text-sm text-muted-foreground mb-4">
              DuckDB can directly read files from HTTP/HTTPS URLs. Supports CSV, JSON, and Parquet
              files.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="url-input">File URL</Label>
            <Input
              id="url-input"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/data.csv"
              disabled={isUrlImporting || isPreviewing}
            />
            <p className="text-xs text-muted-foreground">
              Enter a direct URL to a CSV, JSON, or Parquet file
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="url-table-name">Name</Label>
            <Input
              id="url-table-name"
              value={urlTableName}
              onChange={(e) => setUrlTableName(e.target.value)}
              placeholder="my_table"
              disabled={isUrlImporting || isPreviewing}
            />
          </div>

          <div className="space-y-2">
            <Label>Import Mode</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                variant={importMode === "table" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setImportMode("table")}
                disabled={isUrlImporting || isPreviewing}
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
                disabled={isUrlImporting || isPreviewing}
              >
                <Link2 className="h-4 w-4 mr-1.5" />
                View
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {importMode === "view"
                ? "View references URL directly (fresh data, less memory)"
                : "Table copies data into DuckDB (faster queries)"}
            </p>
          </div>

          {errors.length > 0 && <ErrorAlertList errors={errors} />}

          <div className="flex gap-2">
            <Button
              onClick={handlePreview}
              disabled={isUrlImporting || isPreviewing}
              variant="outline"
              className="flex-1"
            >
              {isPreviewing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading Preview...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </>
              )}
            </Button>
            <Button
              onClick={handleUrlImport}
              disabled={isUrlImporting || isPreviewing}
              className="flex-1"
            >
              {isUrlImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Import Directly
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </TabsContent>
  );
};

export default UrlTab;
