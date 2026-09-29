import React from "react";
import { Loader2, ArrowLeft, Check } from "lucide-react";
import type { QueryResult } from "@/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DuckUITable from "@/components/table/DuckUItable";
import { PREVIEW_ROW_LIMIT } from "./constants";
import { ErrorAlertList } from "./ErrorAlerts";
import SchemaEditor, { type SchemaEditorProps } from "./SchemaEditor";
import type { UploadError } from "./types";

interface PreviewPanelProps extends SchemaEditorProps {
  previewData: QueryResult;
  previewFileName: string;
  previewTableName: string;
  isUrlImporting: boolean;
  errors: UploadError[];
  handleBackFromPreview: () => void;
  handleImportFromPreview: () => void;
}

/** Preview of a URL source before importing it, with optional schema edits. */
const PreviewPanel: React.FC<PreviewPanelProps> = ({
  previewData,
  previewFileName,
  previewTableName,
  isUrlImporting,
  errors,
  handleBackFromPreview,
  handleImportFromPreview,
  schemaColumns,
  isSchemaCustomizing,
  setIsSchemaCustomizing,
  handleToggleColumn,
  handleRenameColumn,
  handleChangeColumnType,
}) => {
  return (
    <div className="space-y-4">
      {/* Header with file info and navigation */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">
                Preview:{" "}
                {previewFileName.length > 50 ? `...${previewFileName.slice(-47)}` : previewFileName}
              </h3>
              <p className="text-sm text-muted-foreground">
                Table Name: <span className="font-mono">{previewTableName}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Showing first {PREVIEW_ROW_LIMIT} rows • {previewData.rowCount} total rows
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleBackFromPreview}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Table */}
      <Card>
        <CardContent className="p-4">
          <DuckUITable data={previewData.data} initialPageSize={20} tableHeight="400px" />
        </CardContent>
      </Card>

      {/* Schema Customization */}
      <SchemaEditor
        schemaColumns={schemaColumns}
        isSchemaCustomizing={isSchemaCustomizing}
        setIsSchemaCustomizing={setIsSchemaCustomizing}
        handleToggleColumn={handleToggleColumn}
        handleRenameColumn={handleRenameColumn}
        handleChangeColumnType={handleChangeColumnType}
      />

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={handleBackFromPreview}>
          Cancel
        </Button>
        <Button onClick={handleImportFromPreview} disabled={isUrlImporting}>
          {isUrlImporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Import Table
            </>
          )}
        </Button>
      </div>

      {/* Errors */}
      {errors.length > 0 && <ErrorAlertList errors={errors} />}
    </div>
  );
};

export default PreviewPanel;
