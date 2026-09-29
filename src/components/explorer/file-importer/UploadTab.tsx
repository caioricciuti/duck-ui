import React from "react";
import { Upload, Loader2, X } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE } from "./constants";
import { UploadErrorAlertList } from "./ErrorAlerts";
import FileDetails from "./FileDetails";
import { formatFileSize } from "./helpers";
import type { ImportMode, UploadError } from "./types";
import type { LocalFileImport } from "./useLocalFileImport";

interface UploadTabProps extends LocalFileImport {
  importMode: ImportMode;
  setImportMode: (mode: ImportMode) => void;
  errors: UploadError[];
}

/** "Upload Files" tab: drop zone, per-file settings and the import button. */
const UploadTab: React.FC<UploadTabProps> = ({
  importMode,
  setImportMode,
  errors,
  files,
  tableNames,
  setTableNames,
  isUploading,
  importStates,
  csvOptions,
  setCsvOptions,
  isDragActive,
  fileInputRef,
  hasFilesToImport,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  handleFileInputChange,
  handleFileUpload,
  handleCancelUpload,
  removeFile,
  retryFileUpload,
}) => {
  return (
    <TabsContent value="upload" className="space-y-4 mt-4">
      <CardContent className="space-y-4 p-0">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer",
            "transition-colors duration-200 min-h-[200px] flex flex-col items-center justify-center",
            isDragActive
              ? "border-primary bg-primary/10"
              : "border-gray-300 hover:border-primary hover:bg-primary/10"
          )}
        >
          <Input
            type="file"
            multiple
            hidden
            ref={fileInputRef}
            accept={Object.values(ACCEPTED_FILE_TYPES).flat().join(",")}
            onChange={handleFileInputChange}
          />
          <Upload
            className={cn(
              "w-12 h-12 mb-4 mt-4",
              isDragActive ? "text-accent" : "text-muted-foreground"
            )}
          />
          {isDragActive ? (
            <p className="text-blue-500 font-medium">Drop the files here ...</p>
          ) : (
            <>
              <div className="space-y-2">
                <p className="font-medium">Drag & drop files here, or</p>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  Select Files
                </Button>
                <p className="text-sm text-gray-500">
                  Supported formats: CSV, JSON, Parquet, Arrow and DuckDB
                </p>
                <p className="text-xs text-gray-400">
                  Maximum file size: {formatFileSize(MAX_FILE_SIZE)}
                </p>
              </div>
            </>
          )}
        </div>

        {hasFilesToImport && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-lg">Files to Import</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Mode:</span>
                <div className="flex rounded-md border">
                  <Button
                    variant={importMode === "table" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-r-none h-7 text-xs"
                    onClick={() => setImportMode("table")}
                  >
                    Import (Table)
                  </Button>
                  <Button
                    variant={importMode === "view" ? "default" : "ghost"}
                    size="sm"
                    className="rounded-l-none h-7 text-xs"
                    onClick={() => setImportMode("view")}
                  >
                    Link (View)
                  </Button>
                </div>
              </div>
            </div>
            {importMode === "view" && (
              <p className="text-xs text-muted-foreground">
                Views reference the original file without copying data. Queries re-read the file
                each time, using less memory but may be slower.
              </p>
            )}
            <div className="space-y-3">
              {files.map((file) => {
                const fileType = file.name.split(".").pop()?.toLowerCase();
                const isCsvFile = fileType === "csv";

                return (
                  <FileDetails
                    key={file.name}
                    file={file}
                    tableName={tableNames[file.name] || ""}
                    onTableNameChange={(name) =>
                      setTableNames((prev) => ({
                        ...prev,
                        [file.name]: name,
                      }))
                    }
                    status={
                      importStates[file.name] || {
                        fileName: file.name,
                        status: "pending",
                      }
                    }
                    csvOptions={isCsvFile ? csvOptions[file.name] : undefined}
                    onCsvOptionsChange={
                      isCsvFile
                        ? (options) =>
                            setCsvOptions((prev) => ({
                              ...prev,
                              [file.name]: options,
                            }))
                        : undefined
                    }
                    onRemove={() => removeFile(file.name)}
                    onRetry={() => retryFileUpload(file.name)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {errors.length > 0 && <UploadErrorAlertList errors={errors} />}

        {hasFilesToImport && (
          <div className="flex gap-2">
            <Button onClick={handleFileUpload} disabled={isUploading} className="flex-1">
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing Files...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import {files.length} {files.length === 1 ? "File" : "Files"}
                </>
              )}
            </Button>

            {isUploading && (
              <Button
                variant="destructive"
                onClick={handleCancelUpload}
                className="whitespace-nowrap"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </TabsContent>
  );
};

export default UploadTab;
